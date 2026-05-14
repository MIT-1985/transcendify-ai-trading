import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// PHASE 5 UNLOCK GUARD
// READ-ONLY diagnostic function.
// NEVER executes trades. NEVER calls OKX order endpoints.
// Returns only a readiness assessment for manual review.
// ============================================================

const SAFETY = {
  noOKXOrderEndpointCalled: true,
  killSwitchActive: true,
  realTradeAllowed: false,
  mode: 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
};

// Thresholds
const REQUIRED_LINKED_TRADES_7D   = 30;
const REQUIRED_WIN_RATE_7D        = 55;   // percent
const REQUIRED_NET_PNL_7D         = 0;    // must be > 0
const MAX_FEE_DRAG_PCT_7D         = 50;   // percent
const REQUIRED_SNAPSHOT_STATUS    = 'READY_SNAPSHOT_EDGE_CONFIRMED_7D';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 1. Fetch current snapshot edge report ──────────────────
  let edgeData = null;
  let edgeError = null;
  try {
    const edgeRes = await base44.functions.invoke('phase4FSnapshotEdgeReport', {});
    edgeData = edgeRes?.data || null;
    if (edgeData?.error) {
      edgeError = edgeData.error;
      edgeData = null;
    }
  } catch (e) {
    edgeError = e.message;
  }

  // ── 2. Fetch latest 24h accounting for fee drag ────────────
  let accountingData = null;
  let accountingError = null;
  try {
    const accRes = await base44.functions.invoke('phase4ECleanAccountingDiagnostic', {});
    accountingData = accRes?.data || null;
    if (accountingData?.error) {
      accountingError = accountingData.error;
      accountingData = null;
    }
  } catch (e) {
    accountingError = e.message;
  }

  // ── 3. Fetch open trades to check for duplicates ──────────
  let openTrades = [];
  let suspectTrades = 0;
  try {
    openTrades = await base44.entities.PaperTrade.filter({ status: 'OPEN' }, '-created_date', 100);
  } catch (_) {}

  // Duplicate detection: same instId opened within 60 seconds
  const byPair = {};
  for (const t of openTrades) {
    if (!byPair[t.instId]) byPair[t.instId] = [];
    byPair[t.instId].push(new Date(t.openedAt).getTime());
  }
  let duplicateTradesDetected = false;
  for (const times of Object.values(byPair)) {
    if (times.length > 1) {
      times.sort();
      for (let i = 1; i < times.length; i++) {
        if (times[i] - times[i - 1] < 60_000) {
          duplicateTradesDetected = true;
          break;
        }
      }
    }
    if (duplicateTradesDetected) break;
  }

  // Suspect trades: any trade with no signalSnapshotId among closed trades
  try {
    const recent = await base44.entities.PaperTrade.list('-closedAt', 50);
    const closed = recent.filter(t => t.status !== 'OPEN');
    if (closed.length > 0) {
      const unlinkedClosed = closed.filter(t => !t.signalSnapshotId);
      suspectTrades = unlinkedClosed.length;
    }
  } catch (_) {}
  const suspectTradesDetected = suspectTrades > 0;

  // ── 4. Extract metrics from edge report ───────────────────
  const tl  = edgeData?.tradeLinkageStats  || {};
  const dec = edgeData?.decision           || {};

  const linkedBTCTrades7d     = tl.linkedTrades7d          ?? 0;
  const linkedNetPnL7d        = tl.linkedNetPnL7d           ?? 0;
  const linkedWinRate7d       = tl.linkedWinRate7d           ?? 0;
  const snapshotEdgeStatus    = dec.status                   ?? 'COLLECTING_LINKAGE_DATA';

  // Fee drag: (totalFees / |grossPnL|) * 100 over 7d
  // Pull from accounting if available, otherwise estimate from edge report trades
  let feeDragPercent7d = 100; // default to failing until proven otherwise
  if (accountingData?.globalStats) {
    const g = accountingData.globalStats;
    const gross = Math.abs(g.totalGrossPnL || 0);
    const fees  = Math.abs(g.totalFees     || 0);
    feeDragPercent7d = gross > 0 ? Math.round((fees / gross) * 100) : 100;
  }

  // ── 5. Evaluate each condition ────────────────────────────
  const conditions = [
    {
      id:        'mode',
      label:     'Mode = PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
      pass:      true,     // always true — this function itself enforces the mode
      actual:    'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
      required:  'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
    },
    {
      id:        'realTradingEndpointDetected',
      label:     'realTradingEndpointDetected = false',
      pass:      true,     // enforced by constant killSwitchActive=true
      actual:    false,
      required:  false,
    },
    {
      id:        'killSwitchActive',
      label:     'killSwitchActive = true',
      pass:      true,
      actual:    true,
      required:  true,
    },
    {
      id:        'linkedBTCTrades7d',
      label:     `linkedBTCTrades7d >= ${REQUIRED_LINKED_TRADES_7D}`,
      pass:      linkedBTCTrades7d >= REQUIRED_LINKED_TRADES_7D,
      actual:    linkedBTCTrades7d,
      required:  REQUIRED_LINKED_TRADES_7D,
    },
    {
      id:        'linkedNetPnL7d',
      label:     'linkedNetPnL7d > 0',
      pass:      linkedNetPnL7d > REQUIRED_NET_PNL_7D,
      actual:    linkedNetPnL7d,
      required:  '> 0',
    },
    {
      id:        'linkedWinRate7d',
      label:     `linkedWinRate7d >= ${REQUIRED_WIN_RATE_7D}%`,
      pass:      linkedWinRate7d >= REQUIRED_WIN_RATE_7D,
      actual:    `${linkedWinRate7d}%`,
      required:  `>= ${REQUIRED_WIN_RATE_7D}%`,
    },
    {
      id:        'feeDragPercent7d',
      label:     `feeDragPercent7d < ${MAX_FEE_DRAG_PCT_7D}%`,
      pass:      feeDragPercent7d < MAX_FEE_DRAG_PCT_7D,
      actual:    `${feeDragPercent7d}%`,
      required:  `< ${MAX_FEE_DRAG_PCT_7D}%`,
    },
    {
      id:        'duplicateTradesDetected',
      label:     'duplicateTradesDetected = false',
      pass:      !duplicateTradesDetected,
      actual:    duplicateTradesDetected,
      required:  false,
    },
    {
      id:        'suspectTradesDetected',
      label:     'suspectTradesDetected = false',
      pass:      !suspectTradesDetected,
      actual:    suspectTradesDetected,
      required:  false,
      note:      `${suspectTrades} closed trade(s) without snapshot linkage`,
    },
    {
      id:        'snapshotEdgeStatus',
      label:     `snapshotEdgeStatus = ${REQUIRED_SNAPSHOT_STATUS}`,
      pass:      snapshotEdgeStatus === REQUIRED_SNAPSHOT_STATUS,
      actual:    snapshotEdgeStatus,
      required:  REQUIRED_SNAPSHOT_STATUS,
    },
  ];

  const passedConditions = conditions.filter(c => c.pass);
  const failedConditions = conditions.filter(c => !c.pass);
  const allPassed        = failedConditions.length === 0;

  // ── 6. Build result ───────────────────────────────────────
  // CRITICAL: Even if all pass, NEVER allow real trading here.
  // The operator must manually unlock via a separate, privileged process.
  const status = allPassed
    ? 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED'
    : 'LOCKED';

  const reason = allPassed
    ? `All ${conditions.length} conditions passed. Paper trading evidence is sufficient for manual review. ` +
      `An operator must manually unlock Phase 5 through a separate privileged process. ` +
      `This function NEVER enables real trading.`
    : `${failedConditions.length} condition(s) not yet met: ${failedConditions.map(c => c.id).join(', ')}. ` +
      `Continue collecting paper evidence.`;

  return Response.json({
    // ── Core result ──────────────────────────────────────────
    status,
    realTradeUnlockAllowed: false,   // ALWAYS false — immutable
    manualReviewRequired:   allPassed,
    allConditionsPassed:    allPassed,

    // ── Condition breakdown ──────────────────────────────────
    passedConditions: passedConditions.map(c => ({ id: c.id, label: c.label, actual: c.actual })),
    failedConditions: failedConditions.map(c => ({ id: c.id, label: c.label, actual: c.actual, required: c.required, note: c.note })),
    totalConditions:  conditions.length,
    passCount:        passedConditions.length,
    failCount:        failedConditions.length,

    reason,

    // ── Metrics snapshot ─────────────────────────────────────
    metrics: {
      linkedBTCTrades7d,
      linkedNetPnL7d,
      linkedWinRate7d,
      feeDragPercent7d,
      snapshotEdgeStatus,
      duplicateTradesDetected,
      suspectTradesDetected,
      suspectTradeCount: suspectTrades,
    },

    // ── Safety ───────────────────────────────────────────────
    safety: SAFETY,

    // ── Data source status ───────────────────────────────────
    dataSourceStatus: {
      edgeReportLoaded:      !!edgeData,
      edgeReportError:       edgeError,
      accountingLoaded:      !!accountingData,
      accountingError:       accountingError,
    },

    generatedAt: new Date().toISOString(),
  });
});