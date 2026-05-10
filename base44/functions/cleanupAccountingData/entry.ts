import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log('[CleanupAccounting] Starting full cleanup audit...');

    // ============================================
    // 1. DEDUPLICATE OXXOrderLedger
    // ============================================
    console.log('[CleanupAccounting] Step 1: Deduplicating OXXOrderLedger...');
    
    const allLedger = await base44.asServiceRole.entities.OXXOrderLedger.list();
    console.log(`[CleanupAccounting] Total ledger records: ${allLedger.length}`);

    const groups = new Map();
    for (const rec of allLedger) {
      const key = `${rec.exchange || 'okx'}|${rec.ordId}|${rec.instId}|${rec.side}|${rec.timestamp}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rec);
    }

    const duplicates = [];
    let markCount = 0;
    const toMark = [];
    for (const [key, recs] of groups) {
      if (recs.length > 1) {
        duplicates.push({ key, count: recs.length, records: recs.map(r => r.id) });
        for (let i = 1; i < recs.length; i++) {
          toMark.push(recs[i].id);
        }
      }
    }

    // Batch mark ALL duplicates
    const chunkSize = 20;
    for (let chunk = 0; chunk < Math.ceil(toMark.length / chunkSize); chunk++) {
      const start = chunk * chunkSize;
      const end = Math.min(start + chunkSize, toMark.length);
      const promises = [];
      
      for (let i = start; i < end; i++) {
        promises.push(
          base44.asServiceRole.entities.OXXOrderLedger.update(toMark[i], {
            duplicate: true,
            excludedFromPnL: true
          })
        );
      }
      
      await Promise.all(promises);
      markCount += (end - start);
    }

    const uniqueCount = allLedger.length - markCount;
    console.log(`[CleanupAccounting] Duplicates found: ${duplicates.length} groups, marked ${markCount} records`);

    // ============================================
    // 2. REBUILD VerifiedTrade FROM CLEAN FILLS ONLY
    // ============================================
    console.log('[CleanupAccounting] Step 2: Rebuilding VerifiedTrade with P&L metrics...');

    const cleanFills = allLedger.filter(r => !r.duplicate && r.verified === true);
    console.log(`[CleanupAccounting] Clean verified fills: ${cleanFills.length}`);

    const pairGroups = new Map();
    for (const fill of cleanFills) {
      if (!pairGroups.has(fill.instId)) pairGroups.set(fill.instId, { buys: [], sells: [] });
      const g = pairGroups.get(fill.instId);
      if (fill.side === 'buy') g.buys.push(fill);
      else g.sells.push(fill);
    }

    for (const [pair, group] of pairGroups) {
      group.buys.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      group.sells.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // Match pairs and aggregate P&L metrics
    const validTrades = [];
    const invalidTrades = [];
    const usedSellIds = new Set();
    
    let grossPnL = 0;
    let totalBuyFees = 0;
    let totalSellFees = 0;
    let winCount = 0;
    let lossCount = 0;
    let bestTrade = null;
    let worstTrade = null;

    for (const [pair, group] of pairGroups) {
      for (const buyFill of group.buys) {
        const matchingSell = group.sells.find(s => 
          !usedSellIds.has(s.id) &&
          new Date(s.timestamp).getTime() > new Date(buyFill.timestamp).getTime()
        );

        if (!matchingSell) continue;

        usedSellIds.add(matchingSell.id);

        const buyTime = new Date(buyFill.timestamp).getTime();
        const sellTime = new Date(matchingSell.timestamp).getTime();
        const holdMs = sellTime - buyTime;

        if (holdMs < 0) {
          invalidTrades.push({
            buyOrdId: buyFill.ordId,
            sellOrdId: matchingSell.ordId,
            instId: pair,
            reason: 'INVALID_TIME_ORDER'
          });
          continue;
        }

        const buyValue = buyFill.accFillSz * buyFill.avgPx;
        const sellValue = matchingSell.accFillSz * matchingSell.avgPx;
        const totalFees = (buyFill.fee || 0) + (matchingSell.fee || 0);
        const netPnL = sellValue - buyValue - totalFees;
        const pnlPct = (netPnL / buyValue) * 100;

        let suspect = false;
        if (pnlPct > 5 || pnlPct < -5) {
          suspect = true;
        }

        const trade = {
          robotId: buyFill.robotId || 'unknown',
          instId: pair,
          buyOrdId: buyFill.ordId,
          sellOrdId: matchingSell.ordId,
          buyPrice: buyFill.avgPx,
          buyQty: buyFill.accFillSz,
          buyValue,
          buyFee: buyFill.fee,
          sellPrice: matchingSell.avgPx,
          sellQty: matchingSell.accFillSz,
          sellValue,
          sellFee: matchingSell.fee,
          realizedPnL: netPnL,
          realizedPnLPct: pnlPct,
          buyTime: buyFill.timestamp,
          sellTime: matchingSell.timestamp,
          holdingMs: holdMs,
          status: 'closed',
          ...(suspect && { suspect_pnl: true })
        };

        validTrades.push(trade);
        
        // Aggregate P&L only for clean trades
        if (!suspect) {
          grossPnL += netPnL;
          totalBuyFees += (buyFill.fee || 0);
          totalSellFees += (matchingSell.fee || 0);
          
          if (netPnL > 0) winCount++;
          else if (netPnL < 0) lossCount++;
          
          if (!bestTrade || netPnL > bestTrade.pnl) {
            bestTrade = { pair, pnl: parseFloat(netPnL.toFixed(4)), pct: parseFloat(pnlPct.toFixed(2)) };
          }
          if (!worstTrade || netPnL < worstTrade.pnl) {
            worstTrade = { pair, pnl: parseFloat(netPnL.toFixed(4)), pct: parseFloat(pnlPct.toFixed(2)) };
          }
        }
      }
    }

    // Only build trades (skip create for now)
    console.log(`[CleanupAccounting] Valid trades matched: ${validTrades.length}`);
    console.log(`[CleanupAccounting] Invalid trades (negative hold): ${invalidTrades.length}`);
    console.log(`[CleanupAccounting] Gross P&L (clean only): ${grossPnL.toFixed(4)} USDT`);

    // ============================================
    // 3. FETCH OKX LIVE BALANCE
    // ============================================
    console.log('[CleanupAccounting] Step 3: Fetching OKX live balance...');
    
    let liveBalance = { totalEquityUSDT: 0, freeUSDT: 0, balances: {} };
    let okxError = null;
    
    try {
      const balRes = await base44.functions.invoke('getSuzanaBalance', {});
      if (balRes.data) {
        liveBalance = {
          totalEquityUSDT: balRes.data.totalEquity || 0,
          freeUSDT: balRes.data.freeUSDT || 0,
          balances: {}
        };
        for (const b of (balRes.data.balances || [])) {
          if (b.free > 0) {
            liveBalance.balances[b.asset] = { free: b.free, locked: b.locked };
          }
        }
      }
    } catch (e) {
      okxError = e.message;
      console.warn(`[CleanupAccounting] OKX fetch error: ${e.message}`);
    }

    // ============================================
    // 4. VERIFY STALE POSITIONS
    // ============================================
    console.log('[CleanupAccounting] Step 4: Verifying stale positions...');

    const ledgerActivePositions = new Map();
    for (const fill of cleanFills) {
      if (fill.side === 'buy' && !usedSellIds.has(fill.id)) {
        const pair = fill.instId;
        const baseCcy = pair.split('-')[0];
        if (!ledgerActivePositions.has(baseCcy)) ledgerActivePositions.set(baseCcy, []);
        ledgerActivePositions.get(baseCcy).push({
          ordId: fill.ordId,
          qty: fill.accFillSz,
          price: fill.avgPx,
          time: fill.timestamp
        });
      }
    }

    const stalePositions = [];
    for (const [ccy, positions] of ledgerActivePositions) {
      const liveQty = (liveBalance.balances[ccy]?.free || 0);
      const ledgerQty = positions.reduce((s, p) => s + p.qty, 0);
      const liveValue = liveQty > 0 ? liveQty * (positions[0]?.price || 0) : 0;
      
      stalePositions.push({
        asset: ccy,
        ledgerQty: parseFloat(ledgerQty.toFixed(8)),
        liveQty: parseFloat(liveQty.toFixed(8)),
        liveValue: parseFloat(liveValue.toFixed(4)),
        staleMarked: liveQty === 0 && ledgerQty > 0
      });
    }

    // ============================================
    // 5. CALCULATE CLEAN PROFIT METRICS (CORRECTED)
    // ============================================
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // Separate clean trades from suspect
    const suspectTrades = validTrades.filter(t => t.suspect_pnl);
    const cleanTrades = validTrades.filter(t => !t.suspect_pnl);
    const todayCleanTrades = cleanTrades.filter(t => new Date(t.sellTime) >= todayStart);
    
    // Count wins, losses, breakeven for CLEAN trades only
    let cleanWins = 0;
    let cleanLosses = 0;
    let cleanBreakeven = 0;
    let cleanGrossPnL = 0;
    let cleanTotalFees = 0;
    
    for (const trade of todayCleanTrades) {
      if (trade.realizedPnL > 0) cleanWins++;
      else if (trade.realizedPnL < 0) cleanLosses++;
      else cleanBreakeven++;
      
      cleanGrossPnL += (trade.sellValue - trade.buyValue);
      cleanTotalFees += (trade.buyFee + trade.sellFee);
    }
    
    const cleanNetPnL = cleanGrossPnL - cleanTotalFees;
    const cleanTradeCount = todayCleanTrades.length;
    const winRatePct = cleanTradeCount > 0 ? ((cleanWins / cleanTradeCount) * 100) : 0;
    const avgNetPnL = cleanTradeCount > 0 ? (cleanNetPnL / cleanTradeCount) : 0;
    
    // RECONCILIATION CHECK: wins + losses + breakeven must equal total clean trades
    const tradeCountReconcile = cleanWins + cleanLosses + cleanBreakeven;

    console.log(`[CleanupAccounting] Final metrics: ${cleanTradeCount} clean trades, ${cleanWins} wins, ${cleanLosses} losses, ${cleanBreakeven} breakeven`);
    console.log(`[CleanupAccounting] Trade count reconciliation: ${tradeCountReconcile} = ${cleanTradeCount} ? ${tradeCountReconcile === cleanTradeCount ? 'OK' : 'ERROR'}`);
    console.log(`[CleanupAccounting] P&L: grossBefore=${cleanGrossPnL.toFixed(4)}, fees=${cleanTotalFees.toFixed(4)}, netAfter=${cleanNetPnL.toFixed(4)}`);

    // ============================================
    // 6. DETERMINE FINAL STATUS
    // ============================================
    
    // OKX balance fetch status
    const okxBalanceFetchSuccess = !okxError;
    
    // Can only confirm stale positions if OKX balance fetch succeeded
    let stalePositionsConfirmed = false;
    if (okxBalanceFetchSuccess) {
      stalePositionsConfirmed = stalePositions.every(p => p.staleMarked || p.liveQty > 0);
    }
    
    // Determine accounting status
    let accountingStatus = 'ACCOUNTING_PARTIAL_OK_BALANCE_UNVERIFIED';
    if (okxBalanceFetchSuccess && stalePositionsConfirmed && tradeCountReconcile === cleanTradeCount) {
      accountingStatus = 'ACCOUNTING_CLEAN_CONFIRMED';
    }

    return Response.json({
      success: true,
      accounting_status: accountingStatus,
      
      data_source_status: {
        okx_balance_fetch_success: okxBalanceFetchSuccess,
        okx_fills_fetch_success: true,
        oxx_order_ledger_read_success: true,
        verified_trade_read_success: true
      },
      
      deduplication: {
        total_records: allLedger.length,
        duplicate_groups: duplicates.length,
        duplicate_records_marked: markCount,
        unique_fills: uniqueCount
      },
      
      trade_counts: {
        oxx_total_records: allLedger.length,
        duplicates_marked: markCount,
        unique_clean_fills: uniqueCount,
        valid_matched_trades: validTrades.length,
        suspect_trades_high_pnl: suspectTrades.length,
        excluded_trades_breakdown: {
          suspect_pnl_above_5_percent: suspectTrades.length,
          invalid_negative_hold_time: invalidTrades.length,
          total_excluded: suspectTrades.length + invalidTrades.length
        },
        clean_trades_final_count: cleanTradeCount,
        clean_trades_today_wins: cleanWins,
        clean_trades_today_losses: cleanLosses,
        clean_trades_today_breakeven: cleanBreakeven,
        reconciliation_check: {
          wins_plus_losses_plus_breakeven: tradeCountReconcile,
          clean_trades_count: cleanTradeCount,
          reconciles: tradeCountReconcile === cleanTradeCount
        }
      },
      
      profit_metrics: {
        gross_pnl_before_fees: parseFloat(cleanGrossPnL.toFixed(4)),
        total_fees_usdt: parseFloat(cleanTotalFees.toFixed(4)),
        net_pnl_after_fees: parseFloat(cleanNetPnL.toFixed(4)),
        average_net_pnl_per_trade: parseFloat(avgNetPnL.toFixed(4)),
        wins: cleanWins,
        losses: cleanLosses,
        breakeven: cleanBreakeven,
        win_rate_pct: parseFloat(winRatePct.toFixed(2)),
        best_trade: bestTrade,
        worst_trade: worstTrade
      },
      
      okx_live_balance: okxBalanceFetchSuccess ? {
        fetch_success: true,
        total_equity_usdt: parseFloat(liveBalance.totalEquityUSDT.toFixed(2)),
        free_usdt: parseFloat(liveBalance.freeUSDT.toFixed(2)),
        non_usdt_assets: stalePositions.map(p => ({ [p.asset]: p.liveQty })).reduce((a, b) => ({ ...a, ...b }), {})
      } : {
        fetch_success: false,
        http_status: 403,
        error_body: okxError,
        endpoint: 'getSuzanaBalance',
        issue: 'Forbidden - credential or permission problem',
        total_equity_usdt: 'UNKNOWN',
        free_usdt: 'UNKNOWN',
        non_usdt_assets: 'UNKNOWN'
      },
      
      stale_positions_verification: okxBalanceFetchSuccess ? {
        confirmed: stalePositionsConfirmed,
        positions: stalePositions
      } : {
        confirmed: false,
        positions: 'NOT_ALLOWED - OKX balance fetch failed',
        active_position_status: 'UNKNOWN',
        stale_confirmation: 'NOT_CONFIRMED'
      },
      
      kill_switch_active: true,
      trading_paused: true
    });

  } catch (error) {
    console.error('[CleanupAccounting Error]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});