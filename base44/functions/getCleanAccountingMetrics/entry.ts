import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all OXXOrderLedger and VerifiedTrade records
    const ledgerRecords = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const tradeRecords = await base44.asServiceRole.entities.VerifiedTrade.list();

    // CATEGORY 1: OKX CLEAN REAL TRADES
    const cleanTrades = tradeRecords.filter(t => {
      // Must be OKX real trades (not legacy, not SIM)
      if (t.robotId === 'legacy') return false;
      if (t.status === 'sim') return false;
      
      // Must not be marked as excluded
      if (t.excludedFromPnL === true) return false;
      if (t.stale_unmatched_buy === true) return false;
      if (t.duplicate === true) return false;
      
      // Must not be suspect
      if (t.suspect_pnl === true) return false;
      if (t.invalid === true) return false;
      
      // Must have valid order IDs
      if (!t.buyOrdId || !t.sellOrdId) return false;
      if (t.buyOrdId === t.sellOrdId) return false;
      
      // Must have valid holding time
      if (t.holdingMs < 0) return false;
      
      // Must be verified
      if (t.verified === false) return false;
      
      return true;
    });

    // Calculate clean P&L metrics
    const cleanNetPnL = cleanTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const cleanFees = cleanTrades.reduce((sum, t) => sum + ((t.buyFee || 0) + (t.sellFee || 0)), 0);
    const cleanWins = cleanTrades.filter(t => t.realizedPnL > 0).length;
    const cleanLosses = cleanTrades.filter(t => t.realizedPnL < 0).length;
    const cleanWinRate = cleanTrades.length > 0 ? (cleanWins / cleanTrades.length * 100).toFixed(2) : 0;

    // CATEGORY 2: LEGACY / SUSPECT TRADES
    const legacyTrades = tradeRecords.filter(t => t.robotId === 'legacy');
    const suspectTrades = tradeRecords.filter(t => t.suspect_pnl === true || t.invalid === true);
    const invalidTrades = tradeRecords.filter(t => t.invalid === true);
    const negativeDurationTrades = tradeRecords.filter(t => t.holdingMs < 0);
    const missingOrderIdTrades = tradeRecords.filter(t => !t.buyOrdId || !t.sellOrdId);
    const simTrades = tradeRecords.filter(t => t.status === 'sim');

    // CATEGORY 3: STALE LEDGER RECORDS
    const staleLedgerRecords = ledgerRecords.filter(t => t.stale_unmatched_buy === true || t.excludedFromPnL === true);
    const duplicateLedgerRecords = ledgerRecords.filter(t => t.duplicate === true);
    const excludedLedgerRecords = ledgerRecords.filter(t => t.excludedFromActivePositions === true);

    // Get latest clean records for display
    const latestCleanTrades = cleanTrades.slice(0, 5);
    const latestCleanLedger = ledgerRecords
      .filter(l => !l.excludedFromPnL && !l.stale_unmatched_buy && !l.duplicate)
      .slice(0, 5);

    return Response.json({
      success: true,
      clean_metrics: {
        orders_count: latestCleanLedger.length,
        closed_trades_count: cleanTrades.length,
        net_pnl: parseFloat(cleanNetPnL.toFixed(4)),
        fees: parseFloat(cleanFees.toFixed(4)),
        win_rate: parseFloat(cleanWinRate),
        wins: cleanWins,
        losses: cleanLosses,
        latest_trades: latestCleanTrades,
        latest_orders: latestCleanLedger
      },
      excluded_data: {
        legacy_trades_count: legacyTrades.length,
        suspect_trades_count: suspectTrades.length,
        invalid_trades_count: invalidTrades.length,
        negative_duration_count: negativeDurationTrades.length,
        missing_order_id_count: missingOrderIdTrades.length,
        sim_trades_count: simTrades.length,
        stale_ledger_records_count: staleLedgerRecords.length,
        duplicate_ledger_records_count: duplicateLedgerRecords.length,
        excluded_ledger_records_count: excludedLedgerRecords.length
      },
      total_counts: {
        all_ledger_records: ledgerRecords.length,
        all_verified_trades: tradeRecords.length
      }
    });
  } catch (error) {
    console.error('[getCleanAccountingMetrics] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});