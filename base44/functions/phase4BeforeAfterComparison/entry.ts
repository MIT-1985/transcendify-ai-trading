/**
 * phase4BeforeAfterComparison — Phase 4B Before/After Constants Comparison
 *
 * Safety: READ-ONLY — PaperTrade entity only
 *   realTradeAllowed          = false  ALWAYS
 *   realTradeUnlockAllowed    = false  ALWAYS
 *   killSwitchActive          = true   ALWAYS
 *   noOKXOrderEndpointCalled  = true   ALWAYS
 *
 * Splits PaperTrade records into BEFORE / AFTER the Phase 4B constants
 * correction timestamp and compares key performance metrics.
 *
 * constantsChangedAt is determined by finding the earliest trade whose
 * signalScore >= 65 (the new requiredScore threshold introduced in Phase 4B).
 * If no such trade exists, all trades are treated as BEFORE.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HARDCODED SAFETY FLAGS ────────────────────────────────────────────────────
const REAL_TRADE_ALLOWED         = false;
const REAL_TRADE_UNLOCK_ALLOWED  = false;
const KILL_SWITCH_ACTIVE         = true;
const NO_OKX_ORDER_ENDPOINT      = true;

// Phase 4B correction was deployed on 2026-05-14.
// This is the primary cutoff. Trades opened before this date = BEFORE constants.
// Trades opened on/after this date = AFTER constants.
const PHASE4B_CORRECTION_DATE    = '2026-05-14T00:00:00.000Z';
const PHASE4B_NEW_REQUIRED_SCORE = 65; // used only if no trades straddle the cutoff date

// ── Aggregate helper ──────────────────────────────────────────────────────────
function aggregateTrades(trades) {
  const closed    = trades.filter(t => t.status !== 'OPEN');
  const tp        = closed.filter(t => t.status === 'CLOSED_TP');
  const sl        = closed.filter(t => t.status === 'CLOSED_SL');
  const expired   = closed.filter(t => t.status === 'EXPIRED');
  const wins      = closed.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);

  const netPnL      = closed.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
  const fees        = closed.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
  const spreadCost  = closed.reduce((s, t) => s + (t.spreadCost || t.spreadCostUSDT || 0), 0);
  const grossPnL    = closed.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);

  const scoresValid   = closed.filter(t => (t.signalScore || t.entryScore) != null);
  const averageScore  = scoresValid.length > 0
    ? scoresValid.reduce((s, t) => s + (t.signalScore || t.entryScore || 0), 0) / scoresValid.length : 0;

  const winRate      = closed.length > 0 ? (wins.length / closed.length * 100) : 0;
  const expiredRatio = closed.length > 0 ? (expired.length / closed.length) : 0;

  return {
    totalTrades:   trades.length,
    closedTrades:  closed.length,
    openTrades:    trades.length - closed.length,
    tpTrades:      tp.length,
    slTrades:      sl.length,
    expiredTrades: expired.length,
    wins:          wins.length,
    losses:        closed.length - wins.length,
    winRate:       parseFloat(winRate.toFixed(2)),
    netPnL:        parseFloat(netPnL.toFixed(6)),
    grossPnL:      parseFloat(grossPnL.toFixed(6)),
    fees:          parseFloat(fees.toFixed(6)),
    spreadCost:    parseFloat(spreadCost.toFixed(6)),
    averageScore:  parseFloat(averageScore.toFixed(2)),
    expiredRatio:  parseFloat(expiredRatio.toFixed(4)),
    expiredPct:    parseFloat((expiredRatio * 100).toFixed(2)),
  };
}

// ── Verdict logic ─────────────────────────────────────────────────────────────
function calcVerdict(before, after) {
  if (after.closedTrades < 10) {
    return {
      status: 'COLLECTING_AFTER_DATA',
      reason: `Only ${after.closedTrades} closed trades after correction — need >= 10 for verdict`,
      realTradeUnlockAllowed: REAL_TRADE_UNLOCK_ALLOWED,
    };
  }

  const expiryImproved = after.expiredRatio < before.expiredRatio;
  const pnlImproved    = after.netPnL > before.netPnL;

  if (expiryImproved && pnlImproved) {
    return {
      status: 'CONSTANTS_IMPROVING_ENGINE',
      reason: `expiredRatio: ${(before.expiredRatio * 100).toFixed(1)}% → ${(after.expiredRatio * 100).toFixed(1)}% ✓  netPnL: ${before.netPnL.toFixed(4)} → ${after.netPnL.toFixed(4)} ✓`,
      realTradeUnlockAllowed: REAL_TRADE_UNLOCK_ALLOWED,
    };
  }

  if (after.netPnL <= 0 && after.expiredRatio > 0.40 && after.closedTrades >= 20) {
    return {
      status: 'NEEDS_NEXT_OPTIMIZATION',
      reason: `netPnL=${after.netPnL.toFixed(4)} still negative AND expiredRatio=${(after.expiredRatio * 100).toFixed(1)}% > 40% after ${after.closedTrades} trades`,
      realTradeUnlockAllowed: REAL_TRADE_UNLOCK_ALLOWED,
    };
  }

  return {
    status: 'MONITORING',
    reason: `expiryImproved=${expiryImproved} pnlImproved=${pnlImproved} — collecting more data`,
    realTradeUnlockAllowed: REAL_TRADE_UNLOCK_ALLOWED,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4_COMPARE] Before/After comparison requested by ${user.email}`);

    // Fetch all phase 4 paper trades (no market API, no orders)
    const allTrades = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });
    console.log(`[PHASE4_COMPARE] Total trades fetched: ${allTrades.length}`);

    // ── Determine constantsChangedAt ─────────────────────────────────────────
    // Primary: hardcoded Phase 4B deployment date (2026-05-14).
    // Check if any trades exist before this date. If yes, use it as the cutoff.
    // Fallback: use the earliest trade with score >= 65 (in case date detection fails).
    const hasBefore = allTrades.some(t => t.openedAt && t.openedAt < PHASE4B_CORRECTION_DATE);
    const hasAfter  = allTrades.some(t => t.openedAt && t.openedAt >= PHASE4B_CORRECTION_DATE);

    let constantsChangedAt;
    let detectionMethod;

    if (hasBefore && hasAfter) {
      // Normal case: trades straddle the correction date
      constantsChangedAt = PHASE4B_CORRECTION_DATE;
      detectionMethod = `Hardcoded Phase 4B deployment date (${PHASE4B_CORRECTION_DATE})`;
    } else if (!hasBefore && hasAfter) {
      // All trades are after the date — try score-based detection as fallback
      const oldScoreTrades = allTrades
        .filter(t => (t.signalScore || t.entryScore || 0) < PHASE4B_NEW_REQUIRED_SCORE && t.openedAt)
        .sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt));
      const newScoreTrades = allTrades
        .filter(t => (t.signalScore || t.entryScore || 0) >= PHASE4B_NEW_REQUIRED_SCORE && t.openedAt)
        .sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt));

      if (oldScoreTrades.length > 0 && newScoreTrades.length > 0) {
        constantsChangedAt = newScoreTrades[0].openedAt;
        detectionMethod = `Score-based fallback: first trade with signalScore >= ${PHASE4B_NEW_REQUIRED_SCORE}`;
      } else {
        // All trades have high scores — treat hardcoded date as split anyway
        constantsChangedAt = PHASE4B_CORRECTION_DATE;
        detectionMethod = `Hardcoded date (all trades post-correction, no old-score trades found)`;
      }
    } else {
      // All trades before correction date
      constantsChangedAt = PHASE4B_CORRECTION_DATE;
      detectionMethod = `Hardcoded date (all trades pre-correction)`;
    }

    console.log(`[PHASE4_COMPARE] constantsChangedAt=${constantsChangedAt} method=${detectionMethod}`);

    const beforeTrades = allTrades.filter(t => t.openedAt && t.openedAt < constantsChangedAt);
    const afterTrades  = allTrades.filter(t => t.openedAt && t.openedAt >= constantsChangedAt);

    const before = aggregateTrades(beforeTrades);
    const after  = aggregateTrades(afterTrades);
    const verdict = calcVerdict(before, after);

    console.log(`[PHASE4_COMPARE] before: closed=${before.closedTrades} wr=${before.winRate}% net=${before.netPnL} expiredRatio=${before.expiredRatio}`);
    console.log(`[PHASE4_COMPARE] after:  closed=${after.closedTrades}  wr=${after.winRate}% net=${after.netPnL} expiredRatio=${after.expiredRatio}`);
    console.log(`[PHASE4_COMPARE] verdict: ${verdict.status}`);

    return Response.json({
      // ── Safety flags ──────────────────────────────────────────────────────
      realTradeAllowed:         REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:   REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:         KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,
      dataSource:               'PaperTrade entity only — no market API calls',

      // ── Split metadata ───────────────────────────────────────────────────
      constantsChangedAt,
      detectionMethod,
      totalTradesFetched:       allTrades.length,
      beforeCount:              beforeTrades.length,
      afterCount:               afterTrades.length,

      // ── Before ───────────────────────────────────────────────────────────
      before,

      // ── After ────────────────────────────────────────────────────────────
      after,

      // ── Delta (after - before) ───────────────────────────────────────────
      delta: {
        netPnL:        parseFloat((after.netPnL - before.netPnL).toFixed(6)),
        winRate:       parseFloat((after.winRate - before.winRate).toFixed(2)),
        expiredRatio:  parseFloat((after.expiredRatio - before.expiredRatio).toFixed(4)),
        expiredPct:    parseFloat(((after.expiredRatio - before.expiredRatio) * 100).toFixed(2)),
        averageScore:  parseFloat((after.averageScore - before.averageScore).toFixed(2)),
        fees:          parseFloat((after.fees - before.fees).toFixed(6)),
      },

      // ── Verdict ──────────────────────────────────────────────────────────
      verdict,

      comparedAt: new Date().toISOString(),
      comparedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4_COMPARE] Error:', err.message);
    return Response.json({
      realTradeAllowed:         false,
      realTradeUnlockAllowed:   false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      error: err.message,
    }, { status: 500 });
  }
});