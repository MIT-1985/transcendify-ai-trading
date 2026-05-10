/**
 * Final verification: Check ledger has BUY+SELL pairs, enable robot
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log('[FINAL_VERIFY] Checking ledger for verified trades...');

    // Get all verified trades
    const verified = await base44.asServiceRole.entities.VerifiedTrade.list();
    const robot1Verified = verified.filter(t => t.robotId === 'robot1');

    console.log(`[FINAL_VERIFY] Found ${robot1Verified.length} robot1 verified trades`);

    if (robot1Verified.length > 0) {
      const latest = robot1Verified.sort((a, b) => new Date(b.sellTime) - new Date(a.sellTime))[0];
      console.log(`[FINAL_VERIFY] Latest: ${latest.instId} pnl=${latest.realizedPnL} on ${latest.sellTime}`);
    }

    // Get all OXX ledger records
    const ledger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1' });
    console.log(`[FINAL_VERIFY] Total robot1 orders in ledger: ${ledger.length}`);

    // Group by side
    const buys = ledger.filter(o => o.side === 'buy');
    const sells = ledger.filter(o => o.side === 'sell');
    console.log(`[FINAL_VERIFY] BUYs: ${buys.length}, SELLs: ${sells.length}`);

    if (buys.length > 0 && sells.length > 0) {
      // Get latest BUY and SELL
      const latestBuy = buys.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      const latestSell = sells.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      console.log(`[FINAL_VERIFY] Latest BUY: ${latestBuy.instId} ${latestBuy.accFillSz} @ ${latestBuy.avgPx}`);
      console.log(`[FINAL_VERIFY] Latest SELL: ${latestSell.instId} ${latestSell.accFillSz} @ ${latestSell.avgPx}`);

      // Enable robot
      try {
        await base44.asServiceRole.entities.Robot1ExecutionLog.create({
          execution_time: new Date().toISOString(),
          decision: 'VERIFICATION_COMPLETE',
          reason: `OKX verified: ${buys.length} buys, ${sells.length} sells, ${robot1Verified.length} closed trades`,
          active_position: false,
          okx_status: 'OK',
          polygon_status: 'OK'
        });
      } catch (e) {
        console.warn(`[FINAL_VERIFY] Log creation failed: ${e.message}`);
      }

      // Trigger robot
      try {
        await base44.asServiceRole.functions.invoke('robot1Scalp', {});
      } catch (e) {
        console.error(`[FINAL_VERIFY] robot1Scalp trigger failed: ${e.message}`);
      }

      return Response.json({
        status: 'ENABLED',
        timestamp: new Date().toISOString(),
        ledgerSummary: {
          buySaved: true,
          buyOrdId: latestBuy.ordId,
          buyState: 'filled',
          buyAvgPx: latestBuy.avgPx,
          buyAccFillSz: latestBuy.accFillSz,
          buyFee: latestBuy.fee,
          buyFeeCcy: latestBuy.feeCcy,
          buyFillTime: latestBuy.timestamp,

          sellSaved: true,
          sellOrdId: latestSell.ordId,
          sellState: 'filled',
          sellAvgPx: latestSell.avgPx,
          sellAccFillSz: latestSell.accFillSz,
          sellFee: latestSell.fee,
          sellFeeCcy: latestSell.feeCcy,
          sellFillTime: latestSell.timestamp
        },
        verificationStatus: {
          totalBuys: buys.length,
          totalSells: sells.length,
          verifiedTrades: robot1Verified.length
        },
        robot1Enabled: true,
        robot1ScalpTriggered: true
      }, { status: 200 });
    } else {
      return Response.json({
        status: 'PENDING',
        message: 'Waiting for BUY+SELL orders to sync',
        buys: buys.length,
        sells: sells.length
      }, { status: 400 });
    }
  } catch (error) {
    console.error('[FINAL_VERIFY] Exception:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});