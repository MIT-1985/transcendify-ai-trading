import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Debug function to show exact entity counts and latest records
 * Step 1: Check real entity names and counts
 * Step 2: Show exact latest records
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[debugEntity] Checking entities...');

    // Query raw entities - NO FILTERS
    const allOXXOrders = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const allVerifiedTrades = await base44.asServiceRole.entities.VerifiedTrade.list();

    console.log('[debugEntity] OXXOrderLedger total: ' + allOXXOrders.length);
    console.log('[debugEntity] VerifiedTrade total: ' + allVerifiedTrades.length);

    // Analyze OXXOrderLedger
    const oxxStats = {
      total: allOXXOrders.length,
      verified: allOXXOrders.filter(o => o.verified === true).length,
      notVerified: allOXXOrders.filter(o => o.verified !== true).length,
      duplicate: allOXXOrders.filter(o => o.duplicate === true).length,
      excludedFromPnL: allOXXOrders.filter(o => o.excludedFromPnL === true).length,
      staleUnmatched: allOXXOrders.filter(o => o.stale_unmatched_buy === true).length,
      buy: allOXXOrders.filter(o => o.side === 'buy').length,
      sell: allOXXOrders.filter(o => o.side === 'sell').length
    };

    // Analyze VerifiedTrade
    const verifiedStats = {
      total: allVerifiedTrades.length,
      closed: allVerifiedTrades.filter(t => t.status === 'closed').length,
      archived: allVerifiedTrades.filter(t => t.status === 'archived').length,
      suspectPnL: allVerifiedTrades.filter(t => t.suspect_pnl === true).length,
      excludedFromPnL: allVerifiedTrades.filter(t => t.excludedFromPnL === true).length
    };

    // Latest 5 OXX orders
    const latestOXX = allOXXOrders
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
      .map(o => ({
        ordId: o.ordId,
        pair: o.instId,
        side: o.side,
        price: parseFloat(o.avgPx).toFixed(2),
        qty: parseFloat(o.accFillSz).toFixed(6),
        verified: o.verified,
        duplicate: o.duplicate,
        timestamp: new Date(o.timestamp).toLocaleString()
      }));

    // Latest 5 verified trades
    const latestVerified = allVerifiedTrades
      .sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime())
      .slice(0, 5)
      .map(t => ({
        buyOrdId: t.buyOrdId,
        sellOrdId: t.sellOrdId,
        pair: t.instId,
        buyPrice: parseFloat(t.buyPrice).toFixed(2),
        sellPrice: parseFloat(t.sellPrice).toFixed(2),
        realizedPnL: parseFloat(t.realizedPnL).toFixed(4),
        status: t.status,
        sellTime: new Date(t.sellTime).toLocaleString()
      }));

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),

      oxxOrderLedger: {
        found: allOXXOrders.length > 0,
        totalCount: allOXXOrders.length,
        stats: oxxStats,
        latest5: latestOXX
      },

      verifiedTrade: {
        found: allVerifiedTrades.length > 0,
        totalCount: allVerifiedTrades.length,
        stats: verifiedStats,
        latest5: latestVerified
      },

      analysis: {
        oxxOrdersWithoutDuplicate: allOXXOrders.filter(o => !o.duplicate).length,
        oxxOrdersNotExcludedFromPnL: allOXXOrders.filter(o => !o.excludedFromPnL).length,
        oxxOrdersClean: allOXXOrders.filter(o => o.verified && !o.duplicate && !o.excludedFromPnL).length,
        verifiedTradesClean: allVerifiedTrades.filter(t => t.status === 'closed' && !t.suspect_pnl && !t.excludedFromPnL).length
      }
    });

  } catch (error) {
    console.error('[debugEntity] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});