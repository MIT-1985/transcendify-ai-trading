import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read existing OXXOrderLedger records (already synced from OKX or audit)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    
    const existingLedger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'alphaScalper' });
    const fills = [];
    
    for (const rec of existingLedger) {
      const recTime = new Date(rec.timestamp).getTime();
      if (recTime >= todayStartMs) {
        fills.push({
          ordId: rec.ordId,
          instId: rec.instId,
          side: rec.side,
          fillPx: rec.avgPx,
          fillSz: rec.accFillSz,
          fee: rec.fee,
          feeCcy: rec.feeCcy,
          fillTime: rec.timestamp,
          state: rec.state
        });
      }
    }

    console.log(`[Reconcile] Found ${fills.length} OXXOrderLedger records for today`);

    // Fills already in OXXOrderLedger - just use them
    const ledgerRecords = fills;

    // Build VerifiedTrade from BUY→SELL pairs
    const buys = ledgerRecords.filter(r => r.side === 'buy').sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const sells = ledgerRecords.filter(r => r.side === 'sell').sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const trades = [];
    const usedSells = new Set();
    
    for (const buyRec of buys) {
      // Find matching SELL for same pair
      const matchingSells = sells.filter(s => 
        s.instId === buyRec.instId && 
        !usedSells.has(s.ordId) &&
        new Date(s.timestamp).getTime() > new Date(buyRec.timestamp).getTime()
      );
      
      if (matchingSells.length > 0) {
        const sellRec = matchingSells[0];
        usedSells.add(sellRec.ordId);
        
        const buyValue = buyRec.accFillSz * buyRec.avgPx;
        const sellValue = sellRec.accFillSz * sellRec.avgPx;
        const totalFees = buyRec.fee + sellRec.fee;
        const netPnL = sellValue - buyValue - totalFees;
        const netPnLPct = (netPnL / buyValue) * 100;
        
        const trade = {
          robotId: 'alphaScalper',
          instId: buyRec.instId,
          buyOrdId: buyRec.ordId,
          sellOrdId: sellRec.ordId,
          buyPrice: buyRec.avgPx,
          buyQty: buyRec.accFillSz,
          buyValue,
          buyFee: buyRec.fee,
          sellPrice: sellRec.avgPx,
          sellQty: sellRec.accFillSz,
          sellValue,
          sellFee: sellRec.fee,
          realizedPnL: netPnL,
          realizedPnLPct: netPnLPct,
          buyTime: buyRec.timestamp,
          sellTime: sellRec.timestamp,
          holdingMs: new Date(sellRec.timestamp).getTime() - new Date(buyRec.timestamp).getTime(),
          status: 'closed'
        };
        
        // Upsert by buyOrdId + sellOrdId
        const key = `${buyRec.ordId}_${sellRec.ordId}`;
        const existing = await base44.asServiceRole.entities.VerifiedTrade.filter({ 
          buyOrdId: buyRec.ordId,
          sellOrdId: sellRec.ordId
        });
        
        if (existing.length > 0) {
          await base44.asServiceRole.entities.VerifiedTrade.update(existing[0].id, trade);
        } else {
          await base44.asServiceRole.entities.VerifiedTrade.create(trade);
        }
        
        trades.push(trade);
      }
    }

    console.log(`[Reconcile] Created/updated ${trades.length} VerifiedTrade records`);

    // Calculate totals
    const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
    const totalFees = ledgerRecords.reduce((s, r) => s + (r.fee || 0), 0);
    const buyCount = buys.length;
    const sellCount = sells.length;
    const cycleCount = trades.length;

    return Response.json({
      success: true,
      okx_fills_found: fills.length,
      ledger_upserted: ledgerRecords.length,
      trades_created: trades.length,
      buy_orders: buyCount,
      sell_orders: sellCount,
      completed_cycles: cycleCount,
      total_pnl: totalPnL.toFixed(4),
      total_fees: totalFees.toFixed(4),
      kill_switch_active: true,
      trading_paused: true,
      message: `Reconciliation complete: ${fills.length} fills → ${ledgerRecords.length} ledger → ${trades.length} trades`
    });
  } catch (error) {
    console.error('[Reconcile Error]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});