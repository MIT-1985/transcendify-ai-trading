import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = {
      timestamp: new Date().toISOString(),
      user_email: user.email,
      reconciliation: 'PENDING',
      errors: [],
      result: null
    };

    // ========== FIND THE OLD BUY AND RECOVERY SELL ==========
    const BUY_ORD_ID = '3554454595343458304';
    const RECOVERY_SELL_ORD_ID = '3554775784607686656';
    
    const ledger = await base44.asServiceRole.entities.OXXOrderLedger.filter(
      { ordId: { '$in': [BUY_ORD_ID, RECOVERY_SELL_ORD_ID] } }
    );

    if (ledger.length !== 2) {
      report.errors.push(`Expected 2 orders, found ${ledger.length}`);
      return Response.json({ ...report, reconciliation: 'FAILED' }, { status: 400 });
    }

    const buyOrder = ledger.find(o => o.ordId === BUY_ORD_ID);
    const sellOrder = ledger.find(o => o.ordId === RECOVERY_SELL_ORD_ID);

    if (!buyOrder || !sellOrder) {
      report.errors.push('Could not locate BUY or SELL order');
      return Response.json({ ...report, reconciliation: 'FAILED' }, { status: 400 });
    }

    // ========== CREATE VERIFIED TRADE RECORD ==========
    const verifiedTrade = {
      robotId: 'recovery_reconciliation',
      instId: buyOrder.instId,
      buyOrdId: buyOrder.ordId,
      sellOrdId: sellOrder.ordId,
      buyPrice: buyOrder.avgPx,
      buyQty: buyOrder.accFillSz,
      buyValue: buyOrder.quoteUSDT,
      buyFee: buyOrder.fee,
      sellPrice: sellOrder.avgPx,
      sellQty: sellOrder.accFillSz,
      sellValue: sellOrder.quoteUSDT,
      sellFee: sellOrder.fee,
      realizedPnL: (sellOrder.quoteUSDT - buyOrder.quoteUSDT - buyOrder.fee - sellOrder.fee),
      realizedPnLPct: ((sellOrder.quoteUSDT - buyOrder.quoteUSDT - buyOrder.fee - sellOrder.fee) / buyOrder.quoteUSDT * 100),
      buyTime: buyOrder.timestamp,
      sellTime: sellOrder.timestamp,
      holdingMs: new Date(sellOrder.timestamp).getTime() - new Date(buyOrder.timestamp).getTime(),
      status: 'closed'
    };

    try {
      const created = await base44.asServiceRole.entities.VerifiedTrade.create(verifiedTrade);
      report.result = {
        verified_trade_id: created.id,
        pair: buyOrder.instId,
        buy_qty: buyOrder.accFillSz,
        sell_qty: sellOrder.accFillSz,
        buy_price: buyOrder.avgPx,
        sell_price: sellOrder.avgPx,
        realized_pnl: verifiedTrade.realizedPnL.toFixed(4),
        realized_pnl_pct: verifiedTrade.realizedPnLPct.toFixed(3),
        holding_duration_ms: verifiedTrade.holdingMs,
        status: 'CLOSED_BY_RECOVERY'
      };
      report.reconciliation = 'SUCCESS';
    } catch (e) {
      report.errors.push(`Failed to create VerifiedTrade: ${e.message}`);
      report.reconciliation = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    console.log(`[RECONCILE] Legacy position ${BUY_ORD_ID} → ${RECOVERY_SELL_ORD_ID} marked CLOSED_BY_RECOVERY`);
    return Response.json(report, { status: 200 });

  } catch (error) {
    console.error('ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});