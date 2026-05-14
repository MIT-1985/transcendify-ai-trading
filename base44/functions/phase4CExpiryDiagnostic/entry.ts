/**
 * phase4CExpiryDiagnostic — Phase 4C Expiry & TP Optimization Diagnostic
 *
 * Safety:
 *   realTradeAllowed          = false  ALWAYS
 *   realTradeUnlockAllowed    = false  ALWAYS
 *   killSwitchActive          = true   ALWAYS
 *   noOKXOrderEndpointCalled  = true   ALWAYS
 *   phase                     = PHASE_4C_DIAGNOSTIC_ONLY
 *
 * Reads PaperTrade entity ONLY.
 * No market API calls. No OKX order endpoints.
 * Analyzes why trades expire instead of hitting TP or SL.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HARDCODED SAFETY ──────────────────────────────────────────────────────────
const REAL_TRADE_ALLOWED         = false;
const REAL_TRADE_UNLOCK_ALLOWED  = false;
const KILL_SWITCH_ACTIVE         = true;
const NO_OKX_ORDER_ENDPOINT      = true;
const PHASE                      = 'PHASE_4C_DIAGNOSTIC_ONLY';

// Phase 4B correction date — only trades opened on/after this are analyzed
const PHASE4B_DATE = '2026-05-14T00:00:00.000Z';
const PAIRS        = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// Expiry limit used in the engine (15 minutes)
const EXPIRY_LIMIT_MS = 15 * 60 * 1000;

// ── Classify reason for expiry ────────────────────────────────────────────────
function classifyReason(stats) {
  const {
    expiredRatio,
    slTrades,
    closedTrades,
    averageDistanceToTPAtExpiryPercent,
    averageDistanceToSLAtExpiryPercent,
    averageDurationMinutes,
    netPnL,
    fees,
    grossPnL,
  } = stats;

  const slRatio     = closedTrades > 0 ? slTrades / closedTrades : 0;
  const expiryMins  = EXPIRY_LIMIT_MS / 60000; // 15

  if (fees > 0 && grossPnL !== null && grossPnL < fees) {
    return 'FEE_DRAIN';
  }
  if (slRatio > 0.35) {
    return 'SL_TOO_TIGHT_OR_DIRECTION_BAD';
  }
  if (expiredRatio > 0.50 && averageDurationMinutes !== null && averageDurationMinutes >= expiryMins * 0.85) {
    return 'EXPIRY_TOO_SHORT_OR_TP_TOO_FAR';
  }
  if (expiredRatio > 0.50 && averageDistanceToTPAtExpiryPercent !== null && averageDistanceToTPAtExpiryPercent < 0.12) {
    return 'TP_TOO_FAR_SLIGHTLY';
  }
  if (expiredRatio > 0.50 && averageDistanceToTPAtExpiryPercent !== null && averageDistanceToTPAtExpiryPercent >= 0.12) {
    return 'SIGNAL_TOO_WEAK';
  }
  return 'UNCLEAR';
}

// ── Per-pair recommendation ───────────────────────────────────────────────────
function makeRecommendation(reason, stats) {
  switch (reason) {
    case 'TP_TOO_FAR_SLIGHTLY':
      return `TP is slightly too far for ${stats.instId}. Consider reducing tpPercent from 0.25% to 0.18–0.20%. Price gets close but doesn't reach.`;
    case 'SIGNAL_TOO_WEAK':
      return `Signal too weak for ${stats.instId}. Price barely moves after entry. Consider requiring score >= 70 or stronger tick confirmation.`;
    case 'SL_TOO_TIGHT_OR_DIRECTION_BAD':
      return `SL hit rate is high for ${stats.instId}. Either direction is often wrong or SL is too tight. Consider raising slPercent or requiring BULLISH+BUY_PRESSURE combo.`;
    case 'FEE_DRAIN':
      return `Fees exceed gross profit for ${stats.instId}. Even winning trades lose money. Increase minimum netProfit barrier or reduce trade frequency.`;
    case 'EXPIRY_TOO_SHORT_OR_TP_TOO_FAR':
      return `Trades for ${stats.instId} consistently run to full expiry. Either raise expiry from 15min to 20–25min, or lower TP target so price can reach it in time.`;
    default:
      return `Insufficient data to classify ${stats.instId}. Collect more trades.`;
  }
}

// ── Aggregate pair stats ──────────────────────────────────────────────────────
function aggregatePair(instId, trades) {
  const closed   = trades.filter(t => t.status !== 'OPEN');
  const tp       = closed.filter(t => t.status === 'CLOSED_TP');
  const sl       = closed.filter(t => t.status === 'CLOSED_SL');
  const expired  = closed.filter(t => t.status === 'EXPIRED');
  const wins     = closed.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);

  const netPnL   = closed.reduce((s, t) => s + (t.netPnL   || t.netPnLUSDT   || 0), 0);
  const grossPnL = closed.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
  const fees     = closed.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
  const winRate  = closed.length > 0 ? wins.length / closed.length * 100 : 0;
  const expiredRatio = closed.length > 0 ? expired.length / closed.length : 0;

  // Average duration (holdingMs or derived from openedAt→closedAt)
  const durationsMs = closed
    .map(t => {
      if (t.holdingMs) return t.holdingMs;
      if (t.openedAt && t.closedAt) return new Date(t.closedAt) - new Date(t.openedAt);
      return null;
    })
    .filter(v => v !== null && v > 0);
  const averageDurationMinutes = durationsMs.length > 0
    ? parseFloat((durationsMs.reduce((s, v) => s + v, 0) / durationsMs.length / 60000).toFixed(2))
    : null;

  // For expired trades: how far was price from TP at expiry?
  // We use (tpPrice - entryPrice) / entryPrice as TP distance, and
  // approximate "move before expiry" as (exitPrice - entryPrice) / entryPrice
  const expiredWithPrices = expired.filter(t =>
    t.entryPrice && (t.tpPrice || t.targetPrice) && t.exitPrice
  );

  let averageDistanceToTPAtExpiryPercent = null;
  let averageDistanceToSLAtExpiryPercent = null;
  let averageMoveBeforeExpiryPercent     = null;

  if (expiredWithPrices.length > 0) {
    const tpDistances = expiredWithPrices.map(t => {
      const tp = t.tpPrice || t.targetPrice;
      // remaining distance from exit to TP as % of entry
      return Math.abs(tp - t.exitPrice) / t.entryPrice * 100;
    });
    averageDistanceToTPAtExpiryPercent = parseFloat(
      (tpDistances.reduce((s, v) => s + v, 0) / tpDistances.length).toFixed(4)
    );

    const slDistances = expiredWithPrices
      .filter(t => t.slPrice || t.stopLossPrice)
      .map(t => {
        const sl = t.slPrice || t.stopLossPrice;
        return Math.abs(t.exitPrice - sl) / t.entryPrice * 100;
      });
    if (slDistances.length > 0) {
      averageDistanceToSLAtExpiryPercent = parseFloat(
        (slDistances.reduce((s, v) => s + v, 0) / slDistances.length).toFixed(4)
      );
    }

    const moves = expiredWithPrices.map(t =>
      (t.exitPrice - t.entryPrice) / t.entryPrice * 100
    );
    averageMoveBeforeExpiryPercent = parseFloat(
      (moves.reduce((s, v) => s + v, 0) / moves.length).toFixed(4)
    );
  }

  // Average signal score
  const scoredTrades = closed.filter(t => (t.signalScore || t.entryScore) != null);
  const averageSignalScore = scoredTrades.length > 0
    ? parseFloat((scoredTrades.reduce((s, t) => s + (t.signalScore || t.entryScore || 0), 0) / scoredTrades.length).toFixed(2))
    : null;

  // Average entry momentum (tpPercent field as proxy if entryMomentum not stored)
  const momentumTrades = closed.filter(t => t.tpPercent != null);
  const averageEntryMomentumPercent = momentumTrades.length > 0
    ? parseFloat((momentumTrades.reduce((s, t) => s + (t.tpPercent || 0), 0) / momentumTrades.length).toFixed(4))
    : null;

  // Tick pressure: count trades where tickDirection === BUY_PRESSURE
  const tickTrades  = closed.filter(t => t.tickDirection != null);
  const buyPressure = tickTrades.filter(t => t.tickDirection === 'BUY_PRESSURE').length;
  const averageTickPressure = tickTrades.length > 0
    ? parseFloat((buyPressure / tickTrades.length * 100).toFixed(2))
    : null;

  const stats = {
    instId,
    totalTrades:    trades.length,
    closedTrades:   closed.length,
    openTrades:     trades.length - closed.length,
    tpTrades:       tp.length,
    slTrades:       sl.length,
    expiredTrades:  expired.length,
    expiredRatio:   parseFloat(expiredRatio.toFixed(4)),
    expiredPct:     parseFloat((expiredRatio * 100).toFixed(2)),
    winRate:        parseFloat(winRate.toFixed(2)),
    netPnL:         parseFloat(netPnL.toFixed(6)),
    grossPnL:       parseFloat(grossPnL.toFixed(6)),
    fees:           parseFloat(fees.toFixed(6)),
    averageDurationMinutes,
    averageMoveBeforeExpiryPercent,
    averageDistanceToTPAtExpiryPercent,
    averageDistanceToSLAtExpiryPercent,
    averageEntryMomentumPercent,
    averageSignalScore,
    averageTickPressure,
  };

  const reason         = classifyReason(stats);
  const recommendation = makeRecommendation(reason, stats);

  return { ...stats, reason, recommendation };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4C_DIAG] Requested by ${user.email}`);

    // Fetch ALL phase 4 paper trades — no market API, no OKX order calls
    const allTrades = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });
    console.log(`[PHASE4C_DIAG] Total fetched: ${allTrades.length}`);

    // Split windows
    const now       = new Date();
    const h24ago    = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last24h   = allTrades.filter(t => t.openedAt && t.openedAt >= h24ago);
    const after4B   = allTrades.filter(t => t.openedAt && t.openedAt >= PHASE4B_DATE);

    console.log(`[PHASE4C_DIAG] last24h: ${last24h.length}  after4B: ${after4B.length}`);

    // ── Per-pair analysis (after4B window) ───────────────────────────────────
    const pairResults = PAIRS.map(pair => {
      const pairTrades = after4B.filter(t => t.instId === pair);
      return aggregatePair(pair, pairTrades);
    });

    // ── Global after-4B stats ─────────────────────────────────────────────────
    const globalClosed   = after4B.filter(t => t.status !== 'OPEN');
    const globalExpired  = globalClosed.filter(t => t.status === 'EXPIRED');
    const globalWins     = globalClosed.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);
    const globalNetPnL   = globalClosed.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const globalFees     = globalClosed.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
    const globalGross    = globalClosed.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
    const globalExpRatio = globalClosed.length > 0 ? globalExpired.length / globalClosed.length : 0;
    const globalWinRate  = globalClosed.length > 0 ? globalWins.length  / globalClosed.length * 100 : 0;

    // ── Main failure reason (majority vote) ──────────────────────────────────
    const reasonCounts = {};
    pairResults.forEach(p => {
      if (p.closedTrades >= 5) {
        reasonCounts[p.reason] = (reasonCounts[p.reason] || 0) + 1;
      }
    });
    const mainFailureReason = Object.keys(reasonCounts).length > 0
      ? Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0][0]
      : 'INSUFFICIENT_DATA';

    // ── Recommended next change ───────────────────────────────────────────────
    const recommendedNextChange = (() => {
      switch (mainFailureReason) {
        case 'TP_TOO_FAR_SLIGHTLY':
          return 'Reduce tpPercent from 0.25% to 0.18–0.20% across all pairs. Price is reaching close to TP but not crossing it before expiry.';
        case 'SIGNAL_TOO_WEAK':
          return 'Increase requiredScore from 65 to 70 AND require tickDirection === BUY_PRESSURE as mandatory gate. Weak signals open trades that never move enough.';
        case 'SL_TOO_TIGHT_OR_DIRECTION_BAD':
          return 'Increase slPercent magnitude (e.g. from -0.18% to -0.25%) OR add directional confirmation (intraday BULLISH + tick BUY_PRESSURE both required).';
        case 'FEE_DRAIN':
          return 'Raise minimum net profit barrier from 0.05 USDT to 0.10 USDT. Current trade sizes are too small to overcome fees even on winning trades.';
        case 'EXPIRY_TOO_SHORT_OR_TP_TOO_FAR':
          return 'Extend expiry from 15min to 20–25min, OR reduce TP target to 0.18%. The market needs more time to reach the current TP level.';
        default:
          return 'Collect more post-4B trades (target: 50+ per pair) before making constant changes.';
      }
    })();

    // ── Last 24h global summary ───────────────────────────────────────────────
    const closed24h  = last24h.filter(t => t.status !== 'OPEN');
    const expired24h = closed24h.filter(t => t.status === 'EXPIRED');
    const wins24h    = closed24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);
    const net24h     = closed24h.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);

    console.log(`[PHASE4C_DIAG] mainFailureReason: ${mainFailureReason}`);
    console.log(`[PHASE4C_DIAG] globalExpRatio: ${(globalExpRatio * 100).toFixed(1)}% globalWinRate: ${globalWinRate.toFixed(1)}%`);

    return Response.json({
      // ── Safety flags ──────────────────────────────────────────────────────
      phase:                     PHASE,
      realTradeAllowed:          REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:    REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:          KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled:  NO_OKX_ORDER_ENDPOINT,
      dataSource:                'PaperTrade entity only — no market API calls',

      // ── Metadata ─────────────────────────────────────────────────────────
      analyzedAt:     new Date().toISOString(),
      analyzedBy:     user.email,
      phase4BDate:    PHASE4B_DATE,
      expiryLimitMin: EXPIRY_LIMIT_MS / 60000,
      totalFetched:   allTrades.length,

      // ── Last 24h summary ─────────────────────────────────────────────────
      last24h: {
        totalTrades:   last24h.length,
        closedTrades:  closed24h.length,
        expiredTrades: expired24h.length,
        expiredPct:    closed24h.length > 0 ? parseFloat((expired24h.length / closed24h.length * 100).toFixed(2)) : 0,
        winRate:       closed24h.length > 0 ? parseFloat((wins24h.length / closed24h.length * 100).toFixed(2)) : 0,
        netPnL:        parseFloat(net24h.toFixed(6)),
      },

      // ── Global after-4B ───────────────────────────────────────────────────
      global: {
        totalTradesAfter4B:  after4B.length,
        closedTradesAfter4B: globalClosed.length,
        expiredRatioAfter4B: parseFloat(globalExpRatio.toFixed(4)),
        expiredPctAfter4B:   parseFloat((globalExpRatio * 100).toFixed(2)),
        winRateAfter4B:      parseFloat(globalWinRate.toFixed(2)),
        netPnLAfter4B:       parseFloat(globalNetPnL.toFixed(6)),
        feesAfter4B:         parseFloat(globalFees.toFixed(6)),
        grossPnLAfter4B:     parseFloat(globalGross.toFixed(6)),
        mainFailureReason,
        recommendedNextChange,
      },

      // ── Per-pair results (after-4B window) ───────────────────────────────
      pairs: pairResults,
    });

  } catch (err) {
    console.error('[PHASE4C_DIAG] Error:', err.message);
    return Response.json({
      phase:                     PHASE,
      realTradeAllowed:          false,
      realTradeUnlockAllowed:    false,
      killSwitchActive:          true,
      noOKXOrderEndpointCalled:  true,
      error:                     err.message,
    }, { status: 500 });
  }
});