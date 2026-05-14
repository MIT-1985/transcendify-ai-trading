import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// REAL TRADING HARD BLOCKER
// ============================================================
// This function evaluates ALL conditions required before real
// trading could ever be considered. It is READ-ONLY and will
// NEVER place any order. It will NEVER return allowRealTrade=true
// unless every single condition passes AND the phase5Guard has
// returned PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED
// AND manualReviewRequired=true.
//
// killSwitchActive is ALWAYS true.
// noOKXOrderEndpointCalled is ALWAYS true.
// ============================================================

const SAFETY = {
  realTradeAllowed:       false,
  realTradeUnlockAllowed: false,
  killSwitchActive:       true,
  noOKXOrderEndpointCalled: true,
};

// Conditions that must NEVER pass real trades
const HARD_BLOCK_SIGNALS = ['WATCH', 'WAIT', 'SELL_PRESSURE', 'NO_SIGNAL', 'COLD', 'WARM'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[HARD_BLOCKER] requested by ${user.email}`);

  // ── 1. Fetch live signal state from phase4FWhyNoTrade ───────
  let signalData = null;
  try {
    const res = await base44.functions.invoke('phase4FWhyNoTrade', {});
    signalData = res?.data;
  } catch (e) {
    console.error('[HARD_BLOCKER] phase4FWhyNoTrade error:', e.message);
  }

  // ── 2. Fetch phase5 guard ────────────────────────────────────
  let guardData = null;
  try {
    const res = await base44.functions.invoke('phase5UnlockGuard', {});
    guardData = res?.data;
  } catch (e) {
    console.error('[HARD_BLOCKER] phase5UnlockGuard error:', e.message);
  }

  // ── 3. Extract signal fields ─────────────────────────────────
  const sig = signalData || {};
  const guard = guardData || {};

  const mode         = sig.mode         ?? 'UNKNOWN';
  const pair         = sig.pair         ?? sig.instId ?? 'UNKNOWN';
  const decision     = sig.recommendedAction ?? sig.decision ?? sig.alertLevel ?? 'UNKNOWN';
  const score        = sig.totalScore   ?? sig.score  ?? 0;
  const tick         = sig.tickDirection ?? sig.tick  ?? 'UNKNOWN';
  const feeOK        = sig.feeOK        ?? sig.barriers?.feeBarrier ?? false;
  const tpRealism    = sig.barriers?.tpRealismBarrier   ?? sig.tpRealismBarrier   ?? false;
  const grossProfit  = sig.barriers?.grossProfitFloor   ?? sig.grossProfitBarrier ?? false;
  const feeEff       = sig.barriers?.feeEfficiencyBarrier ?? sig.feeEfficiencyBarrier ?? false;

  const phase5Status          = guard.status          ?? 'LOCKED';
  const manualReviewRequired  = guard.manualReviewRequired ?? false;

  // ── 4. Evaluate every condition ──────────────────────────────
  const conditions = [
    {
      id:       'mode',
      label:    'mode = PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
      pass:     mode === 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
      actual:   mode,
      required: 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
    },
    {
      id:       'pair',
      label:    'pair = BTC-USDT',
      pass:     pair === 'BTC-USDT',
      actual:   pair,
      required: 'BTC-USDT',
    },
    {
      id:       'decision',
      label:    'decision = READY or PAPER_SIGNAL_ONLY',
      pass:     ['READY', 'PAPER_SIGNAL_ONLY'].includes(decision),
      actual:   decision,
      required: 'READY | PAPER_SIGNAL_ONLY',
      hardBlock: HARD_BLOCK_SIGNALS.includes(decision),
    },
    {
      id:       'score',
      label:    'score >= 75',
      pass:     score >= 75,
      actual:   score,
      required: '>= 75',
      hardBlock: score < 75,
    },
    {
      id:       'tick',
      label:    'tick = BUY_PRESSURE',
      pass:     tick === 'BUY_PRESSURE',
      actual:   tick,
      required: 'BUY_PRESSURE',
      hardBlock: tick === 'SELL_PRESSURE',
    },
    {
      id:       'feeOK',
      label:    'feeOK = true',
      pass:     feeOK === true,
      actual:   feeOK,
      required: true,
      hardBlock: feeOK === false,
    },
    {
      id:       'tpRealismBarrier',
      label:    'tpRealismBarrier = PASS',
      pass:     tpRealism === true || tpRealism === 'PASS',
      actual:   tpRealism,
      required: 'PASS',
    },
    {
      id:       'grossProfitBarrier',
      label:    'grossProfitBarrier = PASS',
      pass:     grossProfit === true || grossProfit === 'PASS',
      actual:   grossProfit,
      required: 'PASS',
    },
    {
      id:       'feeEfficiencyBarrier',
      label:    'feeEfficiencyBarrier = PASS',
      pass:     feeEff === true || feeEff === 'PASS',
      actual:   feeEff,
      required: 'PASS',
    },
    {
      id:       'phase5GuardStatus',
      label:    'phase5GuardStatus = PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED',
      pass:     phase5Status === 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED',
      actual:   phase5Status,
      required: 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED',
    },
    {
      id:       'manualReviewRequired',
      label:    'manualReviewRequired = true',
      pass:     manualReviewRequired === true,
      actual:   manualReviewRequired,
      required: true,
    },
  ];

  const passedConditions = conditions.filter(c => c.pass);
  const failedConditions = conditions.filter(c => !c.pass);
  const hardBlockedBy    = conditions.filter(c => c.hardBlock);
  const allPass          = failedConditions.length === 0;

  // ── 5. Result — always BLOCKED unless every condition passes ─
  // Even if allPass=true, real trading still requires a separate
  // operator unlock outside this codebase. This function can only
  // return REAL_TRADING_BLOCKED or PAPER_EVIDENCE_READY_FOR_REVIEW.
  const blockerStatus = allPass
    ? 'PAPER_EVIDENCE_READY_FOR_REVIEW'
    : 'REAL_TRADING_BLOCKED';

  const failedIds = failedConditions.map(c => c.id);
  const reason = allPass
    ? 'All conditions met — still requires manual operator review. realTradeAllowed remains false.'
    : `BLOCKED — ${failedConditions.length} condition(s) not met: ${failedIds.join(', ')}`;

  console.log(`[HARD_BLOCKER] status=${blockerStatus} pass=${passedConditions.length}/${conditions.length} failed=${failedIds.join(',') || 'none'}`);

  return Response.json({
    ...SAFETY,
    blockerStatus,
    allConditionsPass:  allPass,
    passCount:          passedConditions.length,
    failCount:          failedConditions.length,
    totalConditions:    conditions.length,
    reason,
    failedConditions:   failedConditions.map(({ id, label, actual, required, hardBlock }) => ({
      id, label, actual, required, hardBlock: hardBlock ?? false,
    })),
    passedConditions:   passedConditions.map(({ id, label, actual }) => ({ id, label, actual })),
    hardBlockedBy:      hardBlockedBy.map(c => c.id),
    // Source data snapshot
    signalSnapshot: {
      mode, pair, decision, score, tick, feeOK, tpRealism, grossProfit, feeEff,
    },
    phase5Snapshot: {
      status:               phase5Status,
      manualReviewRequired,
      passCount:            guard.passCount  ?? null,
      failCount:            guard.failCount  ?? null,
    },
    generatedAt:   new Date().toISOString(),
    requestedBy:   user.email,
  });
});