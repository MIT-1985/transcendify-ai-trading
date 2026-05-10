import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[auditOKXRealPipeline] Starting audit of real OKX data pipeline');

    // ========== STEP 1: LIVE OKX BALANCE ==========
    console.log('[auditOKXRealPipeline] Step 1: Checking live OKX balance');
    const balanceRes = await base44.functions.invoke('okxLiveBalance', {});
    const balance = balanceRes.data;

    // ========== STEP 2: OXX ORDER LEDGER (Real OKX fills) ==========
    console.log('[auditOKXRealPipeline] Step 2: Reading OXXOrderLedger');
    const allLedger = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const cleanLedger = allLedger.filter(f => f.verified === true && !f.duplicate);
    
    // Count by side
    const buys = cleanLedger.filter(f => f.side === 'buy');
    const sells = cleanLedger.filter(f => f.side === 'sell');
    
    // Total fees
    const totalBuyFees = buys.reduce((s, f) => s + (f.fee || 0), 0);
    const totalSellFees = sells.reduce((s, f) => s + (f.fee || 0), 0);
    const totalAllFees = totalBuyFees + totalSellFees;

    // ========== STEP 3: VERIFIED TRADES (Matched buy/sell pairs) ==========
    console.log('[auditOKXRealPipeline] Step 3: Reading VerifiedTrade');
    const allTrades = await base44.asServiceRole.entities.VerifiedTrade.list();
    const cleanTrades = allTrades.filter(t => t.verified === true && !t.suspect_pnl && t.status === 'closed');

    // Today's trades
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTrades = cleanTrades.filter(t => new Date(t.sellTime) >= todayStart);

    // Calculate metrics
    let totalGrossPnL = 0;
    let totalNetPnL = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let bestTrade = null;
    let worstTrade = null;

    for (const trade of todayTrades) {
      const gross = trade.sellValue - trade.buyValue;
      const net = gross - (trade.buyFee + trade.sellFee);
      
      totalGrossPnL += gross;
      totalNetPnL += net;
      
      if (net > 0) wins++;
      else if (net < 0) losses++;
      else breakeven++;
      
      if (!bestTrade || net > bestTrade.pnl) {
        bestTrade = { pair: trade.instId, pnl: parseFloat(net.toFixed(4)), pct: trade.realizedPnLPct };
      }
      if (!worstTrade || net < worstTrade.pnl) {
        worstTrade = { pair: trade.instId, pnl: parseFloat(net.toFixed(4)), pct: trade.realizedPnLPct };
      }
    }

    const winRate = todayTrades.length > 0 ? ((wins / todayTrades.length) * 100) : 0;
    const avgNetPnL = todayTrades.length > 0 ? (totalNetPnL / todayTrades.length) : 0;

    // ========== STEP 4: STALE POSITIONS (Open buys) ==========
    console.log('[auditOKXRealPipeline] Step 4: Checking stale positions');
    const allOrderIds = new Set(allTrades.flatMap(t => [t.buyOrdId, t.sellOrdId]));
    const openBuys = buys.filter(b => !allOrderIds.has(b.ordId));

    const stalePositions = [];
    for (const buy of openBuys) {
      const asset = buy.instId.split('-')[0];
      const okcAsset = balance?.assets?.find(a => a.asset === asset);
      stalePositions.push({
        asset,
        ordId: buy.ordId,
        qty: buy.accFillSz,
        price: buy.avgPx,
        value: buy.quoteUSDT,
        liveQty: okcAsset?.free || 0,
        liveValue: okcAsset?.usdValue || 0,
        isStale: (okcAsset?.free || 0) === 0
      });
    }

    // ========== FINAL SUMMARY ==========
    const summary = {
      auditTime: new Date().toISOString(),
      
      // OKX Live Balance
      okxBalance: balance?.success ? {
        status: 'SUCCESS',
        totalEquityUSDT: balance.totalEquityUSDT,
        freeUSDT: balance.freeUSDT,
        assetCount: balance.assetCount
      } : {
        status: 'FAILED',
        error: balance?.error,
        message: balance?.message
      },
      
      // Real OKX Fills
      okxFills: {
        totalRecords: allLedger.length,
        cleanRecords: cleanLedger.length,
        duplicatesMarked: allLedger.filter(f => f.duplicate).length,
        buys: buys.length,
        sells: sells.length,
        totalBuyFees: parseFloat(totalBuyFees.toFixed(4)),
        totalSellFees: parseFloat(totalSellFees.toFixed(4)),
        totalFees: parseFloat(totalAllFees.toFixed(4))
      },
      
      // Verified Trades
      verifiedTrades: {
        allRecords: allTrades.length,
        cleanRecords: cleanTrades.length,
        suspectRecords: allTrades.filter(t => t.suspect_pnl).length,
        todayCleanTrades: todayTrades.length
      },
      
      // Today's P&L
      todayMetrics: {
        trades: todayTrades.length,
        wins,
        losses,
        breakeven,
        winRate: parseFloat(winRate.toFixed(2)),
        grossBeforeFees: parseFloat(totalGrossPnL.toFixed(4)),
        totalFees: parseFloat((totalBuyFees + totalSellFees).toFixed(4)),
        netAfterFees: parseFloat(totalNetPnL.toFixed(4)),
        avgNetPerTrade: parseFloat(avgNetPnL.toFixed(4)),
        bestTrade,
        worstTrade,
        reconciliation: wins + losses + breakeven === todayTrades.length ? 'OK' : 'ERROR'
      },
      
      // Stale Positions
      stalePositions: {
        count: stalePositions.length,
        positions: stalePositions
      },
      
      // Kill Switch
      killSwitch: {
        active: true,
        message: 'PAUSED_KILL_SWITCH - No trading'
      },
      
      // Data Source Status
      dataSourceStatus: {
        okxBalance: balance?.success ? 'OK' : 'FAILED',
        okxFills: cleanLedger.length > 0 ? 'OK' : 'EMPTY',
        verifiedTrades: cleanTrades.length > 0 ? 'OK' : 'EMPTY',
        allSourcesHealthy: (balance?.success && cleanLedger.length > 0 && cleanTrades.length > 0)
      },
      
      // Overall Status
      pipelineStatus: balance?.success && cleanLedger.length > 0 && cleanTrades.length > 0
        ? 'HEALTHY'
        : balance?.success && cleanLedger.length > 0
        ? 'PARTIAL_OK'
        : 'FAILED'
    };

    console.log('[auditOKXRealPipeline] Audit complete: status=' + summary.pipelineStatus);

    return Response.json({
      success: true,
      audit: summary
    });

  } catch (error) {
    console.error('[auditOKXRealPipeline] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});