import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[TRADE_MATCHER] Starting verified trade calculation');

    // Read ONLY from OXXOrderLedger
    const ledger = await base44.asServiceRole.entities.OXXOrderLedger.list();

    if (ledger.length === 0) {
      return Response.json({ verified_trades: [], summary: { robot1: 0, legacy: 0 } });
    }

    // Get existing verified trades
    const existingTrades = await base44.asServiceRole.entities.VerifiedTrade.list();
    const existingPairs = new Set(existingTrades.map(t => `${t.buyOrdId}-${t.sellOrdId}`));

    // Group by robotId + instId
    const grouped = {};
    ledger.forEach(ord => {
      const key = `${ord.robotId}:${ord.instId}`;
      if (!grouped[key]) grouped[key] = { buys: [], sells: [] };
      if (ord.side === 'buy') grouped[key].buys.push(ord);
      else grouped[key].sells.push(ord);
    });

    const newTrades = [];

    // FIFO matching per robot+instId
    Object.entries(grouped).forEach(([key, { buys, sells }]) => {
      const [robotId, instId] = key.split(':');

      // Sort by timestamp for FIFO
      buys.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      sells.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Match pairs
      for (let i = 0; i < Math.min(buys.length, sells.length); i++) {
        const buy = buys[i];
        const sell = sells[i];
        const pairKey = `${buy.ordId}-${sell.ordId}`;

        // Skip if already exists
        if (existingPairs.has(pairKey)) continue;

        const buyValue = buy.accFillSz * buy.avgPx;
        const sellValue = sell.accFillSz * sell.avgPx;
        const totalFees = buy.fee + sell.fee;
        const realizedPnL = sellValue - buyValue - totalFees;
        const realizedPnLPct = (realizedPnL / (buyValue + buy.fee)) * 100;

        const trade = {
          robotId,
          instId,
          buyOrdId: buy.ordId,
          sellOrdId: sell.ordId,
          buyPrice: buy.avgPx,
          buyQty: buy.accFillSz,
          buyValue,
          buyFee: buy.fee,
          sellPrice: sell.avgPx,
          sellQty: sell.accFillSz,
          sellValue,
          sellFee: sell.fee,
          realizedPnL: parseFloat(realizedPnL.toFixed(4)),
          realizedPnLPct: parseFloat(realizedPnLPct.toFixed(2)),
          buyTime: buy.timestamp,
          sellTime: sell.timestamp,
          holdingMs: new Date(sell.timestamp).getTime() - new Date(buy.timestamp).getTime(),
          status: 'closed'
        };

        newTrades.push(trade);
      }
    });

    // Bulk create new verified trades
    if (newTrades.length > 0) {
      await base44.asServiceRole.entities.VerifiedTrade.bulkCreate(newTrades);
      console.log(`[TRADE_MATCHER] Created ${newTrades.length} verified trades`);
    }

    // Summary
    const all = [...existingTrades, ...newTrades];
    const robot1Sum = all
      .filter(t => t.robotId === 'robot1')
      .reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const legacySum = all
      .filter(t => t.robotId === 'legacy')
      .reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

    return Response.json({
      success: true,
      new_trades_created: newTrades.length,
      summary: {
        robot1_count: all.filter(t => t.robotId === 'robot1').length,
        robot1_pnl: parseFloat(robot1Sum.toFixed(2)),
        legacy_count: all.filter(t => t.robotId === 'legacy').length,
        legacy_pnl: parseFloat(legacySum.toFixed(2)),
        total_pnl: parseFloat((robot1Sum + legacySum).toFixed(2))
      }
    });
  } catch (error) {
    console.error('[TRADE_MATCHER] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});