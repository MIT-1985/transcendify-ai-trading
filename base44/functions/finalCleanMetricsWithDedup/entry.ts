import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 1: Fetch all ledger and trade records
    const allLedger = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const allTrades = await base44.asServiceRole.entities.VerifiedTrade.list();

    // Step 2: Deduplicate OXXOrderLedger by unique fill key
    const seenFillKeys = new Set();
    const uniqueLedger = [];
    const duplicateLedger = [];

    // Sort by timestamp desc to keep newest
    const sortedLedger = [...allLedger].sort((a, b) => 
      new Date(b.timestamp || b.updated_date).getTime() - new Date(a.timestamp || a.updated_date).getTime()
    );

    for (const record of sortedLedger) {
      // Only include verified, non-excluded records
      if (record.verified !== false && !record.duplicate && !record.excludedFromPnL && !record.stale_unmatched_buy) {
        // Unique key: exchange + ordId + instId + side + fillTime (or created_date)
        const fillKey = `OKX:${record.ordId}:${record.instId}:${record.side}:${record.timestamp || record.created_date}`;
        
        if (!seenFillKeys.has(fillKey)) {
          seenFillKeys.add(fillKey);
          uniqueLedger.push(record);
        } else {
          duplicateLedger.push(record);
        }
      }
    }

    // Step 3: Deduplicate VerifiedTrade and filter suspects
    const seenTradeKeys = new Set();
    const uniqueTrades = [];
    const duplicateTrades = [];
    const suspectTrades = [];
    let invalidTradeCount = 0;

    // Sort by sellTime desc to keep newest
    const sortedTrades = [...allTrades].sort((a, b) => 
      new Date(b.sellTime || b.updated_date).getTime() - new Date(a.sellTime || a.updated_date).getTime()
    );

    for (const trade of sortedTrades) {
      // Skip excluded or invalid records
      if (trade.excludedFromPnL || trade.invalid) {
        invalidTradeCount++;
        continue;
      }

      // Check for suspect trades
      const pnlPct = parseFloat(trade.realizedPnLPct || 0);
      const absPnlPct = Math.abs(pnlPct);
      const hasNegativeHold = (trade.holdingMs || 0) < 0;
      const sameOrderIds = trade.buyOrdId && trade.sellOrdId && trade.buyOrdId === trade.sellOrdId;
      const missingQty = !trade.buyQty || !trade.sellQty;
      
      if (absPnlPct > 5 || hasNegativeHold || sameOrderIds || missingQty) {
        suspectTrades.push(trade);
        continue;
      }

      // Verified, non-suspect trade
      if (trade.verified !== false && !trade.suspect_pnl) {
        const key = `${trade.buyOrdId}+${trade.sellOrdId}`;
        if (!seenTradeKeys.has(key)) {
          seenTradeKeys.add(key);
          uniqueTrades.push(trade);
        } else {
          duplicateTrades.push(trade);
        }
      }
    }

    // Step 4: Calculate clean metrics from unique data
    const cleanNetPnL = uniqueTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const cleanFees = uniqueTrades.reduce((sum, t) => sum + ((t.buyFee || 0) + (t.sellFee || 0)), 0);
    const cleanWins = uniqueTrades.filter(t => t.realizedPnL > 0).length;
    const cleanLosses = uniqueTrades.filter(t => t.realizedPnL < 0).length;
    const cleanWinRate = uniqueTrades.length > 0 ? (cleanWins / uniqueTrades.length * 100).toFixed(2) : 0;

    // Step 5: Get latest unique records
    const latestUniqueOrders = uniqueLedger.slice(0, 10);
    const latestUniqueTrades = uniqueTrades.slice(0, 10);

    // Step 6: Construct response with suspect/invalid trade counts
    return Response.json({
      success: true,
      unique_counts: {
        unique_orders: uniqueLedger.length,
        duplicate_orders: duplicateLedger.length,
        unique_trades: uniqueTrades.length,
        duplicate_trades: duplicateTrades.length,
        suspect_trades: suspectTrades.length,
        invalid_trades: invalidTradeCount
      },
      clean_metrics: {
        orders_count: uniqueLedger.length,
        closed_trades_count: uniqueTrades.length,
        net_pnl: parseFloat(cleanNetPnL.toFixed(4)),
        fees: parseFloat(cleanFees.toFixed(4)),
        win_rate: parseFloat(cleanWinRate),
        wins: cleanWins,
        losses: cleanLosses,
        latest_orders: latestUniqueOrders.map(o => ({
          instId: o.instId,
          side: o.side,
          avgPx: parseFloat(o.avgPx || 0),
          accFillSz: parseFloat(o.accFillSz || 0),
          fee: parseFloat(o.fee || 0),
          timestamp: o.timestamp
        })),
        latest_trades: latestUniqueTrades.map(t => ({
          instId: t.instId,
          buyPrice: parseFloat(t.buyPrice || 0),
          sellPrice: parseFloat(t.sellPrice || 0),
          realizedPnL: parseFloat(t.realizedPnL || 0),
          realizedPnLPct: parseFloat(t.realizedPnLPct || 0),
          buyTime: t.buyTime,
          sellTime: t.sellTime
        }))
      },
      total_counts: {
        all_ledger: allLedger.length,
        all_trades: allTrades.length,
        unique_ledger: uniqueLedger.length,
        unique_trades: uniqueTrades.length,
        duplicate_ledger: duplicateLedger.length,
        duplicate_trades: duplicateTrades.length,
        suspect_trades: suspectTrades.length,
        invalid_trades: invalidTradeCount
      },
      trading_status: {
        okxDataLive: true,
        tradingPaused: true,
        killSwitchActive: true,
        status: 'PAUSED_KILL_SWITCH'
      }
    });
  } catch (error) {
    console.error('[finalCleanMetricsWithDedup] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});