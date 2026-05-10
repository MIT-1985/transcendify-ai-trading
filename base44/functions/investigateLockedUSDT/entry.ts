import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[investigateLocked] Analyzing locked USDT from database...');

    // Get all OXX order ledger records (ALL SIDES, ALL STATES)
    const allOrders = await base44.asServiceRole.entities.OXXOrderLedger.list();
    
    // Filter for USDT pairs and non-filled states
    const buyOrders = allOrders.filter(o => o.side === 'buy');
    const sellOrders = allOrders.filter(o => o.side === 'sell');
    
    // Find unmatched buy orders (potential open positions)
    const verifiedTrades = await base44.asServiceRole.entities.VerifiedTrade.list();
    const matchedSellIds = new Set(verifiedTrades.map(t => t.sellOrdId));
    
    const unmatchedBuys = buyOrders.filter(buy => !matchedSellIds.has(buy.ordId));
    
    console.log('[investigateLocked] Total buy orders: ' + buyOrders.length);
    console.log('[investigateLocked] Total sell orders: ' + sellOrders.length);
    console.log('[investigateLocked] Unmatched buy orders (open positions): ' + unmatchedBuys.length);

    // Calculate USDT locked by unmatched buys
    let lockedByOpenBuys = 0;
    const openBuysSummary = [];

    for (const buy of unmatchedBuys) {
      const lockedAmount = buy.quoteUSDT || (buy.accFillSz * buy.avgPx);
      lockedByOpenBuys += lockedAmount;
      
      openBuysSummary.push({
        ordId: buy.ordId,
        instId: buy.instId,
        side: 'buy',
        state: buy.state,
        qty: parseFloat(buy.accFillSz.toFixed(8)),
        avgPx: parseFloat(buy.avgPx.toFixed(2)),
        lockedUSDT: parseFloat(lockedAmount.toFixed(2)),
        timestamp: buy.timestamp,
        robotId: buy.robotId
      });
    }

    // Also check for any cancelled/pending orders
    const pendingOrCancelled = allOrders.filter(o => o.state !== 'filled');
    console.log('[investigateLocked] Pending/cancelled orders: ' + pendingOrCancelled.length);

    // Calculate by pair
    const lockedByPair = {};
    for (const buy of unmatchedBuys) {
      if (!lockedByPair[buy.instId]) {
        lockedByPair[buy.instId] = { count: 0, totalUSDT: 0, qty: 0 };
      }
      lockedByPair[buy.instId].count++;
      lockedByPair[buy.instId].totalUSDT += (buy.quoteUSDT || (buy.accFillSz * buy.avgPx));
      lockedByPair[buy.instId].qty += buy.accFillSz;
    }

    const pairAnalysis = Object.entries(lockedByPair).map(([pair, data]) => ({
      pair,
      openOrders: data.count,
      lockedQty: parseFloat(data.qty.toFixed(8)),
      lockedUSDT: parseFloat(data.totalUSDT.toFixed(2))
    }));

    return Response.json({
      success: true,
      analysis: {
        timestamp: new Date().toISOString(),
        
        summary: {
          totalBuyOrders: buyOrders.length,
          totalSellOrders: sellOrders.length,
          unmatchedBuyOrders: unmatchedBuys.length,
          matchedTrades: verifiedTrades.length,
          pendingOrCancelledOrders: pendingOrCancelled.length
        },

        lockedCapital: {
          estimatedLockedByUnmatchedBuys: parseFloat(lockedByOpenBuys.toFixed(2)),
          explanation: 'USDT value locked in open buy orders not yet matched with sells'
        },

        openPositions: {
          count: unmatchedBuys.length,
          byPair: pairAnalysis,
          details: openBuysSummary.slice(0, 50) // First 50
        },

        recommendation: unmatchedBuys.length > 0
          ? `Found ${unmatchedBuys.length} unmatched BUY orders locking ~${lockedByOpenBuys.toFixed(2)} USDT. These are open positions waiting for matching SELL orders to close trades.`
          : 'No unmatched open positions found.'
      }
    });

  } catch (error) {
    console.error('[investigateLocked] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});