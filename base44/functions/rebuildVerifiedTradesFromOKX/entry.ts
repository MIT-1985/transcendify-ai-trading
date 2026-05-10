import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[rebuildVerifiedTrades] Rebuilding from OXX ledger');

    // Fetch all verified fills from OXXOrderLedger (real OKX data only)
    const allFills = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const cleanFills = allFills.filter(f => f.verified === true && !f.duplicate);
    
    console.log('[rebuildVerifiedTrades] Found ' + cleanFills.length + ' clean verified fills');

    // Group by instId
    const pairGroups = new Map();
    for (const fill of cleanFills) {
      if (!pairGroups.has(fill.instId)) {
        pairGroups.set(fill.instId, { buys: [], sells: [] });
      }
      const g = pairGroups.get(fill.instId);
      if (fill.side === 'buy') g.buys.push(fill);
      else if (fill.side === 'sell') g.sells.push(fill);
    }

    // Sort chronologically
    for (const group of pairGroups.values()) {
      group.buys.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      group.sells.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // Match buy/sell pairs
    const validTrades = [];
    const usedSellIds = new Set();

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

        // Skip invalid hold times
        if (holdMs < 0) continue;

        const buyValue = buyFill.accFillSz * buyFill.avgPx;
        const sellValue = matchingSell.accFillSz * matchingSell.avgPx;
        const totalFees = (buyFill.fee || 0) + (matchingSell.fee || 0);
        const netPnL = sellValue - buyValue - totalFees;
        const pnlPct = (netPnL / buyValue) * 100;

        const trade = {
          robotId: buyFill.robotId || 'alphaScalper',
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
          realizedPnL: parseFloat(netPnL.toFixed(4)),
          realizedPnLPct: parseFloat(pnlPct.toFixed(2)),
          buyTime: buyFill.timestamp,
          sellTime: matchingSell.timestamp,
          holdingMs: holdMs,
          status: 'closed',
          verified: true,
          source: 'okx_real_trade'
        };

        validTrades.push(trade);
      }
    }

    console.log('[rebuildVerifiedTrades] Matched ' + validTrades.length + ' valid buy/sell pairs');

    // Get existing verified trades to avoid duplicates
    const existing = await base44.asServiceRole.entities.VerifiedTrade.list();
    const existingKeys = new Set();
    existing.forEach(t => {
      const key = `${t.buyOrdId}|${t.sellOrdId}|${t.instId}`;
      existingKeys.add(key);
    });

    // Upsert trades
    let createdCount = 0;
    let updatedCount = 0;

    for (const trade of validTrades) {
      const key = `${trade.buyOrdId}|${trade.sellOrdId}|${trade.instId}`;
      const ex = existing.find(t => 
        t.buyOrdId === trade.buyOrdId && 
        t.sellOrdId === trade.sellOrdId && 
        t.instId === trade.instId
      );

      if (ex) {
        await base44.asServiceRole.entities.VerifiedTrade.update(ex.id, trade);
        updatedCount++;
      } else {
        await base44.asServiceRole.entities.VerifiedTrade.create(trade);
        createdCount++;
      }
    }

    // Calculate metrics for clean trades only (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayCleanTrades = validTrades.filter(t => new Date(t.sellTime) >= todayStart);
    
    let cleanGrossPnL = 0;
    let cleanTotalFees = 0;
    let cleanWins = 0;
    let cleanLosses = 0;
    
    for (const trade of todayCleanTrades) {
      cleanGrossPnL += (trade.sellValue - trade.buyValue);
      cleanTotalFees += (trade.buyFee + trade.sellFee);
      
      if (trade.realizedPnL > 0) cleanWins++;
      else if (trade.realizedPnL < 0) cleanLosses++;
    }
    
    const cleanNetPnL = cleanGrossPnL - cleanTotalFees;
    const winRate = todayCleanTrades.length > 0 ? ((cleanWins / todayCleanTrades.length) * 100) : 0;

    console.log('[rebuildVerifiedTrades] Created=' + createdCount + ' Updated=' + updatedCount);
    console.log('[rebuildVerifiedTrades] Today: ' + todayCleanTrades.length + ' trades, ' + cleanWins + ' wins, netPnL=' + cleanNetPnL.toFixed(4));

    return Response.json({
      success: true,
      tradesCreated: createdCount,
      tradesUpdated: updatedCount,
      totalTrades: validTrades.length,
      todayCleanTrades: todayCleanTrades.length,
      cleanMetrics: {
        grossBeforeFees: parseFloat(cleanGrossPnL.toFixed(4)),
        totalFees: parseFloat(cleanTotalFees.toFixed(4)),
        netAfterFees: parseFloat(cleanNetPnL.toFixed(4)),
        wins: cleanWins,
        losses: cleanLosses,
        winRate: parseFloat(winRate.toFixed(2))
      },
      rebuiltAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[rebuildVerifiedTrades] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});