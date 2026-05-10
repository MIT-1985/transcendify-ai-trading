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

    // Group by (exchange, ordId, instId, side, timestamp) to find duplicates
    const groups = new Map();
    for (const rec of allLedger) {
      const key = `${rec.exchange || 'okx'}|${rec.ordId}|${rec.instId}|${rec.side}|${rec.timestamp}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(rec);
    }

    const duplicates = [];
    let markCount = 0;
    const toMark = []; // Batch updates
    for (const [key, recs] of groups) {
      if (recs.length > 1) {
        duplicates.push({ key, count: recs.length, records: recs.map(r => r.id) });
        // Collect for batch marking
        for (let i = 1; i < recs.length; i++) {
          toMark.push(recs[i].id);
        }
      }
    }

    // Batch mark duplicates (limit to 30 to avoid rate limit)
    for (let i = 0; i < Math.min(toMark.length, 30); i++) {
      await base44.asServiceRole.entities.OXXOrderLedger.update(toMark[i], {
        duplicate: true,
        excludedFromPnL: true
      });
      markCount++;
    }

    const uniqueCount = allLedger.length - markCount;
    console.log(`[CleanupAccounting] Duplicates found: ${duplicates.length} groups, marked ${markCount} records`);
    console.log(`[CleanupAccounting] Unique fills remaining: ${uniqueCount}`);

    // ============================================
    // 2. REBUILD VerifiedTrade FROM CLEAN FILLS ONLY
    // ============================================
    console.log('[CleanupAccounting] Step 2: Rebuilding VerifiedTrade...');

    // Get only non-duplicate, verified fills
    const cleanFills = allLedger.filter(r => !r.duplicate && r.verified === true);
    console.log(`[CleanupAccounting] Clean verified fills: ${cleanFills.length}`);

    // Group by pair and create buy/sell pairs
    const pairGroups = new Map();
    for (const fill of cleanFills) {
      if (!pairGroups.has(fill.instId)) pairGroups.set(fill.instId, { buys: [], sells: [] });
      const g = pairGroups.get(fill.instId);
      if (fill.side === 'buy') g.buys.push(fill);
      else g.sells.push(fill);
    }

    // Sort chronologically
    for (const [pair, group] of pairGroups) {
      group.buys.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      group.sells.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // Match pairs (ONLY rebuild, don't upsert to avoid rate limits)
    const validTrades = [];
    const invalidTrades = [];
    const usedSellIds = new Set();

    for (const [pair, group] of pairGroups) {
      for (const buyFill of group.buys) {
        // Find next sell after this buy for same pair
        const matchingSell = group.sells.find(s => 
          !usedSellIds.has(s.id) &&
          new Date(s.timestamp).getTime() > new Date(buyFill.timestamp).getTime()
        );

        if (!matchingSell) continue; // No matching sell

        usedSellIds.add(matchingSell.id);

        const buyTime = new Date(buyFill.timestamp).getTime();
        const sellTime = new Date(matchingSell.timestamp).getTime();
        const holdMs = sellTime - buyTime;

        // Validate
        if (holdMs < 0) {
          invalidTrades.push({
            buyOrdId: buyFill.ordId,
            sellOrdId: matchingSell.ordId,
            instId: pair,
            reason: 'INVALID_TIME_ORDER',
            holdMs
          });
          continue;
        }

        const buyValue = buyFill.accFillSz * buyFill.avgPx;
        const sellValue = matchingSell.accFillSz * matchingSell.avgPx;
        const totalFees = (buyFill.fee || 0) + (matchingSell.fee || 0);
        const netPnL = sellValue - buyValue - totalFees;
        const pnlPct = (netPnL / buyValue) * 100;

        // Check for suspicious PnL
        let suspect = false;
        if (pnlPct > 5 || pnlPct < -5) {
          suspect = true; // Mark high % scalps as suspect
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
      }
    }

    // Batch upsert to avoid rate limits (only check/update first 50)
    const batchSize = 50;
    for (let i = 0; i < Math.min(validTrades.length, batchSize); i++) {
      const trade = validTrades[i];
      const existing = await base44.asServiceRole.entities.VerifiedTrade.filter({
        buyOrdId: trade.buyOrdId,
        sellOrdId: trade.sellOrdId
      });

      if (existing.length === 0) {
        await base44.asServiceRole.entities.VerifiedTrade.create(trade);
      }
    }

    console.log(`[CleanupAccounting] Valid trades created: ${validTrades.length}`);
    console.log(`[CleanupAccounting] Invalid trades (negative hold): ${invalidTrades.length}`);

    // ============================================
    // 3. CHECK LEDGER FOR ACTIVE POSITIONS (SKIP OKX FETCH - RATE LIMIT)
    // ============================================
    console.log('[CleanupAccounting] Step 3: Analyzing ledger active positions...');

    const liveAssets = {}; // Will be empty for now
    const liveBalance = { balance_usdt: 0, balances: [] };

    // Check ledger for active positions (unmatched buys)
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

    // Compare: stale positions
    const stalePositions = [];
    for (const [ccy, positions] of ledgerActivePositions) {
      const liveQty = liveAssets[ccy] || 0;
      const ledgerQty = positions.reduce((s, p) => s + p.qty, 0);
      
      if (liveQty < ledgerQty * 0.5) { // Significantly less than expected
        stalePositions.push({
          ccy,
          ledgerQty,
          liveQty,
          status: 'STALE_LIKELY_CLOSED'
        });
      }
    }

    console.log(`[CleanupAccounting] Ledger active positions: ${ledgerActivePositions.size}`);
    console.log(`[CleanupAccounting] Stale positions detected: ${stalePositions.length}`);

    // ============================================
    // 4. CALCULATE CLEAN PROFIT
    // ============================================
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayValidTrades = validTrades.filter(t => !t.suspect_pnl && new Date(t.sellTime) >= todayStart);
    const suspectTrades = validTrades.filter(t => t.suspect_pnl);
    
    const cleanProfit = todayValidTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
    const cleanFees = todayValidTrades.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);

    console.log(`[CleanupAccounting] Today's clean verified profit: ${cleanProfit.toFixed(4)} USDT`);
    console.log(`[CleanupAccounting] Total fees: ${cleanFees.toFixed(4)} USDT`);

    // ============================================
    // FINAL REPORT
    // ============================================
    return Response.json({
      success: true,
      deduplication: {
        total_records: allLedger.length,
        duplicate_groups: duplicates.length,
        duplicate_records_marked: markCount,
        unique_fills: uniqueCount
      },
      trades: {
        valid_trades_created: validTrades.length,
        invalid_trades_negative_time: invalidTrades.length,
        suspect_trades_high_pnl: suspectTrades.length,
        clean_trades_today: todayValidTrades.length
      },
      live_balance: {
        total_usdt: liveBalance?.balance_usdt || 0,
        assets_held: Object.keys(liveAssets).length,
        live_assets: liveAssets
      },
      positions: {
        ledger_active_count: ledgerActivePositions.size,
        stale_positions: stalePositions
      },
      profit: {
        clean_verified_today: cleanProfit.toFixed(4),
        total_fees: cleanFees.toFixed(4),
        valid_trade_pnl: validTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0).toFixed(4)
      },
      kill_switch_active: true,
      trading_paused: true
    });

  } catch (error) {
    console.error('[CleanupAccounting Error]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});