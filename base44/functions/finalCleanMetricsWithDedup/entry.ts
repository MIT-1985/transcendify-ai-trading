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

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: DEDUPLICATE ORDERS by ordId + instId + side
    // For same ordId: keep the best record (verified, not dup/excluded, latest fill, has fee)
    // ─────────────────────────────────────────────────────────────────
    const ordIdMap = new Map(); // key → best candidate record

    for (const record of allLedger) {
      // Skip records that are marked excluded/stale
      if (record.stale_unmatched_buy) continue;

      const key = `${record.ordId}:${record.instId}:${record.side}`;
      if (!ordIdMap.has(key)) {
        ordIdMap.set(key, record);
      } else {
        const existing = ordIdMap.get(key);
        // Prefer: verified=true, no duplicate flag, no excludedFromPnL, has fee, newest timestamp
        const newScore = scoreOrderRecord(record);
        const existingScore = scoreOrderRecord(existing);
        if (newScore > existingScore) {
          ordIdMap.set(key, record);
        }
      }
    }

    // Now filter the winners to only truly clean records
    const uniqueLedger = [];
    const duplicateLedger = [];
    const excludedLedger = [];

    for (const record of allLedger) {
      if (record.stale_unmatched_buy) { excludedLedger.push(record); continue; }
      const key = `${record.ordId}:${record.instId}:${record.side}`;
      const winner = ordIdMap.get(key);
      if (winner && winner.id === record.id) {
        // This is the best record for this ordId — include if clean
        if (record.duplicate || record.excludedFromPnL) {
          excludedLedger.push(record);
        } else {
          uniqueLedger.push(record);
        }
      } else {
        duplicateLedger.push(record);
      }
    }

    // Sort unique ledger by timestamp desc for display
    uniqueLedger.sort((a, b) =>
      new Date(b.timestamp || b.updated_date).getTime() - new Date(a.timestamp || a.updated_date).getTime()
    );

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: DEDUPLICATE TRADES by buyOrdId + sellOrdId (STRICT)
    // ─────────────────────────────────────────────────────────────────
    const tradeKeyMap = new Map(); // key → best candidate trade
    const suspectTrades = [];
    const mismatchedPnlTrades = [];
    let invalidTradeCount = 0;

    for (const trade of allTrades) {
      // Hard exclusions first
      if (trade.excludedFromPnL || trade.invalid || trade.excludedFromCleanDashboard) {
        invalidTradeCount++;
        continue;
      }

      // Must have both order IDs and they must differ
      if (!trade.buyOrdId || !trade.sellOrdId || trade.buyOrdId === trade.sellOrdId) {
        suspectTrades.push({ ...trade, _reason: 'missing_or_same_ordIds' });
        continue;
      }

      // Suspect checks
      const pnlPct = parseFloat(trade.realizedPnLPct || 0);
      const absPnlPct = Math.abs(pnlPct);
      const hasNegativeHold = (trade.holdingMs || 0) < 0;
      const missingQty = !trade.buyQty || !trade.sellQty;

      if (trade.suspect_pnl || trade.duplicate_trade || absPnlPct > 5 || hasNegativeHold || missingQty) {
        suspectTrades.push({ ...trade, _reason: 'suspect_data' });
        continue;
      }

      // Check for mismatched PnL duplicates: same pair+entry+exit, different PnL
      const pairKey = `${trade.buyOrdId}+${trade.sellOrdId}`;
      if (!tradeKeyMap.has(pairKey)) {
        tradeKeyMap.set(pairKey, trade);
      } else {
        // Duplicate key — pick higher confidence record
        const existing = tradeKeyMap.get(pairKey);
        const newScore = scoreTradeRecord(trade);
        const existingScore = scoreTradeRecord(existing);
        // Check if PnL values differ significantly (mismatched)
        const existingPnl = parseFloat(existing.realizedPnL || 0);
        const newPnl = parseFloat(trade.realizedPnL || 0);
        const pnlDiffers = Math.abs(existingPnl - newPnl) > 0.0001;
        if (pnlDiffers) {
          // Mark lower-confidence one as mismatched
          if (newScore > existingScore) {
            mismatchedPnlTrades.push({ ...existing, _reason: 'mismatched_pnl_lower_confidence' });
            tradeKeyMap.set(pairKey, trade);
          } else {
            mismatchedPnlTrades.push({ ...trade, _reason: 'mismatched_pnl_lower_confidence' });
          }
        } else {
          // Same PnL, just a duplicate record — keep higher score
          if (newScore > existingScore) {
            tradeKeyMap.set(pairKey, trade);
          }
        }
      }
    }

    // Winners are the values in tradeKeyMap
    const uniqueTrades = [...tradeKeyMap.values()];
    const duplicateTradeCount = allTrades.length - uniqueTrades.length - suspectTrades.length - invalidTradeCount - mismatchedPnlTrades.length;

    // Sort by sellTime desc
    uniqueTrades.sort((a, b) =>
      new Date(b.sellTime || b.updated_date).getTime() - new Date(a.sellTime || a.updated_date).getTime()
    );

    // ─────────────────────────────────────────────────────────────────
    // STEP 4: CLEAN METRICS from unique trades only
    // ─────────────────────────────────────────────────────────────────
    const cleanNetPnL = uniqueTrades.reduce((sum, t) => sum + parseFloat(t.realizedPnL || 0), 0);
    const cleanFees = uniqueTrades.reduce((sum, t) => sum + (parseFloat(t.buyFee || 0) + parseFloat(t.sellFee || 0)), 0);
    const cleanWins = uniqueTrades.filter(t => parseFloat(t.realizedPnL || 0) > 0).length;
    const cleanLosses = uniqueTrades.filter(t => parseFloat(t.realizedPnL || 0) < 0).length;
    const cleanWinRate = uniqueTrades.length > 0 ? (cleanWins / uniqueTrades.length * 100).toFixed(2) : 0;

    // ─────────────────────────────────────────────────────────────────
    // STEP 5: CONSTRUCT RESPONSE
    // ─────────────────────────────────────────────────────────────────
    return Response.json({
      success: true,
      unique_counts: {
        unique_orders: uniqueLedger.length,
        duplicate_orders: duplicateLedger.length,
        excluded_orders: excludedLedger.length,
        unique_trades: uniqueTrades.length,
        duplicate_trades: Math.max(0, duplicateTradeCount),
        suspect_trades: suspectTrades.length,
        mismatched_pnl_trades: mismatchedPnlTrades.length,
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
        latest_orders: uniqueLedger.slice(0, 10).map(o => ({
          ordId: o.ordId,
          instId: o.instId,
          side: o.side,
          avgPx: parseFloat(o.avgPx || 0),
          accFillSz: parseFloat(o.accFillSz || 0),
          fee: parseFloat(o.fee || 0),
          timestamp: o.timestamp
        })),
        latest_trades: uniqueTrades.slice(0, 10).map(t => ({
          instId: t.instId,
          buyOrdId: t.buyOrdId,
          sellOrdId: t.sellOrdId,
          buyPrice: parseFloat(t.buyPrice || 0),
          sellPrice: parseFloat(t.sellPrice || 0),
          buyQty: parseFloat(t.buyQty || 0),
          sellQty: parseFloat(t.sellQty || 0),
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
        duplicate_trades: Math.max(0, duplicateTradeCount),
        suspect_trades: suspectTrades.length,
        mismatched_pnl_trades: mismatchedPnlTrades.length,
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

// Score an order record: higher = more reliable
function scoreOrderRecord(r) {
  let score = 0;
  if (r.verified === true) score += 4;
  if (!r.duplicate) score += 2;
  if (!r.excludedFromPnL) score += 2;
  if (r.fee !== undefined && r.fee !== null) score += 1;
  // Newer timestamp is better
  const ts = new Date(r.timestamp || r.updated_date || 0).getTime();
  score += ts / 1e13; // tiny float to break ties by time
  return score;
}

// Score a trade record: higher = more reliable
function scoreTradeRecord(t) {
  let score = 0;
  if (t.verified === true) score += 4;
  if (!t.suspect_pnl) score += 2;
  if (!t.duplicate_trade) score += 2;
  if (!t.excludedFromPnL) score += 2;
  if (t.buyFee !== undefined && t.sellFee !== undefined) score += 1;
  if (t.realizedPnL !== undefined && t.realizedPnL !== null) score += 1;
  const ts = new Date(t.updated_date || t.sellTime || 0).getTime();
  score += ts / 1e13;
  return score;
}