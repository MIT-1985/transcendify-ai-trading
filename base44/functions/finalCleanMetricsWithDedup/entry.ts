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

    // Step 2: Deduplicate OXXOrderLedger by ordId
    const seenOrderIds = new Set();
    const uniqueLedger = [];
    const duplicateLedger = [];

    // Sort by timestamp desc to keep newest
    const sortedLedger = [...allLedger].sort((a, b) => 
      new Date(b.timestamp || b.updated_date).getTime() - new Date(a.timestamp || a.updated_date).getTime()
    );

    for (const record of sortedLedger) {
      // Only include verified, non-excluded records
      if (record.verified !== false && !record.duplicate && !record.excludedFromPnL && !record.stale_unmatched_buy) {
        if (!seenOrderIds.has(record.ordId)) {
          seenOrderIds.add(record.ordId);
          uniqueLedger.push(record);
        } else {
          duplicateLedger.push(record);
        }
      }
    }

    // Step 3: Deduplicate VerifiedTrade by buyOrdId + sellOrdId
    const seenTradeKeys = new Set();
    const uniqueTrades = [];
    const duplicateTrades = [];

    // Sort by sellTime desc to keep newest
    const sortedTrades = [...allTrades].sort((a, b) => 
      new Date(b.sellTime || b.updated_date).getTime() - new Date(a.sellTime || a.updated_date).getTime()
    );

    for (const trade of sortedTrades) {
      // Only include verified, non-excluded, non-suspect records
      if (trade.verified !== false && !trade.excludedFromPnL && !trade.suspect_pnl && !trade.invalid) {
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

    // Step 6: Construct response
    return Response.json({
      success: true,
      okx_balance: {
        raw: null,
        mapped: {
          totalEquityUSDT: '0',
          freeUSDT: '0',
          frozenUSDT: '0',
          openOrdersCount: 0
        }
      },
      unique_counts: {
        unique_orders: uniqueLedger.length,
        duplicate_orders: duplicateLedger.length,
        unique_trades: uniqueTrades.length,
        duplicate_trades: duplicateTrades.length
      },
      clean_metrics: {
        orders_count: uniqueLedger.length,
        closed_trades_count: uniqueTrades.length,
        net_pnl: parseFloat(cleanNetPnL.toFixed(4)),
        fees: parseFloat(cleanFees.toFixed(4)),
        win_rate: parseFloat(cleanWinRate),
        wins: cleanWins,
        losses: cleanLosses,
        latest_orders: latestUniqueOrders,
        latest_trades: latestUniqueTrades
      },
      total_counts: {
        all_ledger: allLedger.length,
        all_trades: allTrades.length,
        unique_ledger: uniqueLedger.length,
        unique_trades: uniqueTrades.length,
        duplicate_ledger: duplicateLedger.length,
        duplicate_trades: duplicateTrades.length
      },
      trading_status: {
        kill_switch_active: true,
        trading_paused: true,
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