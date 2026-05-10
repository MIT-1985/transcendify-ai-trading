import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Finish marking stale unmatched BUY records with safe batch delays
 * Batch size: 5 per batch
 * Delay: 500ms between batches
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[finishStale] Starting batch marking of stale records...');

    // Get all orders and verified trades
    const allOrders = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const verifiedTrades = await base44.asServiceRole.entities.VerifiedTrade.list();
    
    // Find unmatched buys
    const buyOrders = allOrders.filter(o => o.side === 'buy');
    const matchedSellIds = new Set(verifiedTrades.map(t => t.sellOrdId));
    const unmatchedBuys = buyOrders.filter(buy => !matchedSellIds.has(buy.ordId));

    // Filter for those NOT already marked as stale
    const staleToMark = unmatchedBuys.filter(b => !b.stale_unmatched_buy && !b.excludedFromActivePositions);

    console.log('[finishStale] Total unmatched buys: ' + unmatchedBuys.length);
    console.log('[finishStale] Already marked: ' + (unmatchedBuys.length - staleToMark.length));
    console.log('[finishStale] To mark in this run: ' + staleToMark.length);

    // Batch update with delays
    const batchSize = 5;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < staleToMark.length; i += batchSize) {
      const batch = staleToMark.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      console.log('[finishStale] Batch ' + batchNum + ' - marking ' + batch.length + ' records...');

      for (const order of batch) {
        try {
          await base44.asServiceRole.entities.OXXOrderLedger.update(order.id, {
            stale_unmatched_buy: true,
            excludedFromActivePositions: true,
            excludedFromPnL: true
          });
          successCount++;
        } catch (e) {
          console.warn('[finishStale] Failed to mark ' + order.id + ': ' + e.message);
          failCount++;
        }
      }

      // Delay between batches
      if (i + batchSize < staleToMark.length) {
        console.log('[finishStale] Batch ' + batchNum + ' complete. Waiting 500ms...');
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log('[finishStale] Marking complete: ' + successCount + ' success, ' + failCount + ' failed');

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      
      staleRecordMarking: {
        totalUnmatchedBuys: unmatchedBuys.length,
        alreadyMarked: unmatchedBuys.length - staleToMark.length,
        attemptedInRun: staleToMark.length,
        successfullyMarked: successCount,
        failedMarks: failCount,
        remaining: staleToMark.length - successCount
      },

      exclusionStatus: {
        stale_unmatched_buy: true,
        excludedFromActivePositions: true,
        excludedFromPnL: true
      },

      recommendation: failCount > 0
        ? `${failCount} records failed to mark. Retry with background task.`
        : `All ${successCount} stale records marked. Ledger cleanup complete.`
    });

  } catch (error) {
    console.error('[finishStale] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});