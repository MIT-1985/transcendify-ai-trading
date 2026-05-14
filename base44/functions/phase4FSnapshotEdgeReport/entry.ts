import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── PHASE 4F ACTIVATION TIMESTAMP ────────────────────────────────────────────
// Only trades/snapshots created ON OR AFTER this timestamp are Phase 4F evidence.
// All BTC trades before this date are legacy and must be excluded.
const PHASE_4F_ACTIVATION_TIMESTAMP = '2026-05-01T00:00:00.000Z';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Safety constants ─────────────────────────────────────────────────────────
  const SAFETY = {
    realTradeAllowed: false,
    realTradeUnlockAllowed: false,
    killSwitchActive: true,
    noOKXOrderEndpointCalled: true,
    phase: 'PHASE_4F_SNAPSHOT_EDGE_REPORT',
  };

  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();

  // Phase 4F activation cutoff — use whichever is later (24h/7d vs activation)
  const activationCutoff = PHASE_4F_ACTIVATION_TIMESTAMP;
  // For 7d window we still enforce activation timestamp as minimum
  const effective7dCutoff  = cutoff7d  > activationCutoff ? cutoff7d  : activationCutoff;
  const effective24hCutoff = cutoff24h > activationCutoff ? cutoff24h : activationCutoff;

  // ── Fetch all relevant data ──────────────────────────────────────────────────
  const [allSnapshots, allBTCTrades] = await Promise.all([
    base44.entities.SignalSnapshot.list('-created_date', 500),
    base44.entities.PaperTrade.filter({ instId: 'BTC-USDT' }, '-created_date', 500),
  ]);

  // ── PHASE 4F FILTER: strict mode-field match (same as phase4FPerformanceReport) ──
  // A trade is Phase 4F ONLY if it has mode = 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE'.
  // Trades without this field are legacy (created before mode tracking was added).
  const phase4FTrades = allBTCTrades.filter(t =>
    t.mode === 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE'
  );

  const legacyBTCTrades = allBTCTrades.filter(t =>
    t.mode !== 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE'
  );

  // ── PHASE 4F FILTER: exclude legacy snapshots ────────────────────────────────
  // Snapshots with mode field = PHASE_4F are authoritative; fallback to activation date
  const phase4FSnapshots = allSnapshots.filter(s =>
    s.mode === 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE' ||
    (!s.mode && (s.created_date || '') >= activationCutoff)
  );

  // ── Snapshot helpers (Phase 4F only) ─────────────────────────────────────────
  const snapshots24h = phase4FSnapshots.filter(s => s.created_date >= effective24hCutoff);
  const snapshots7d  = phase4FSnapshots.filter(s => s.created_date >= effective7dCutoff);

  const hotSnapshots24h    = snapshots24h.filter(s => s.alertLevel === 'HOT').length;
  const readySnapshots24h  = snapshots24h.filter(s => s.alertLevel === 'READY').length;
  const hotToReadyConversion24h = hotSnapshots24h > 0
    ? +((readySnapshots24h / hotSnapshots24h) * 100).toFixed(1) : 0;

  const hotSnapshots7d     = snapshots7d.filter(s => s.alertLevel === 'HOT').length;
  const readySnapshots7d   = snapshots7d.filter(s => s.alertLevel === 'READY').length;
  const hotToReadyConversion7d = hotSnapshots7d > 0
    ? +((readySnapshots7d / hotSnapshots7d) * 100).toFixed(1) : 0;

  // ── Trade helpers (Phase 4F only) ─────────────────────────────────────────────
  const closedStatuses = ['CLOSED_TP', 'CLOSED_SL', 'EXPIRED', 'CLOSED_MANUAL'];

  const trades24h = phase4FTrades.filter(t =>
    (t.created_date || t.openedAt || '') >= effective24hCutoff && closedStatuses.includes(t.status)
  );
  const trades7d = phase4FTrades.filter(t =>
    (t.created_date || t.openedAt || '') >= effective7dCutoff && closedStatuses.includes(t.status)
  );

  const computeLinkageStats = (trades, suffix) => {
    const linked   = trades.filter(t => !!t.signalSnapshotId);
    const unlinked = trades.filter(t => !t.signalSnapshotId);

    const winNet = (arr) => arr.filter(t => (t.netPnL ?? t.netPnLUSDT ?? 0) > 0).length;
    const sumNet = (arr) => arr.reduce((s, t) => s + (t.netPnL ?? t.netPnLUSDT ?? 0), 0);

    const linkedWinRate   = linked.length   > 0 ? +((winNet(linked)   / linked.length)   * 100).toFixed(1) : 0;
    const unlinkedWinRate = unlinked.length > 0 ? +((winNet(unlinked) / unlinked.length) * 100).toFixed(1) : 0;
    const linkedNetPnL    = +sumNet(linked).toFixed(4);
    const unlinkedNetPnL  = +sumNet(unlinked).toFixed(4);
    const linkedAvgNetPnL   = linked.length   > 0 ? +(linkedNetPnL   / linked.length).toFixed(4)   : 0;
    const unlinkedAvgNetPnL = unlinked.length > 0 ? +(unlinkedNetPnL / unlinked.length).toFixed(4) : 0;
    const edgeDelta = +(linkedAvgNetPnL - unlinkedAvgNetPnL).toFixed(4);

    return {
      [`totalBTCTrades${suffix}`]:        trades.length,
      [`linkedTrades${suffix}`]:          linked.length,
      [`unlinkedTrades${suffix}`]:        unlinked.length,
      [`linkedWinRate${suffix}`]:         linkedWinRate,
      [`unlinkedWinRate${suffix}`]:       unlinkedWinRate,
      [`linkedNetPnL${suffix}`]:          linkedNetPnL,
      [`unlinkedNetPnL${suffix}`]:        unlinkedNetPnL,
      [`linkedAverageNetPnL${suffix}`]:   linkedAvgNetPnL,
      [`unlinkedAverageNetPnL${suffix}`]: unlinkedAvgNetPnL,
      [`linkageEdgeDelta${suffix}`]:      edgeDelta,
    };
  };

  const linkage24h = computeLinkageStats(trades24h, '24h');
  const linkage7d  = computeLinkageStats(trades7d,  '7d');

  // ── Totals for output fields ──────────────────────────────────────────────────
  const includedPhase4FTrades    = phase4FTrades.length;
  const excludedLegacyBTCTrades  = legacyBTCTrades.length;
  const includedPhase4FSnapshots = phase4FSnapshots.length;

  // ── Decision logic ────────────────────────────────────────────────────────────
  const l24    = linkage24h.linkedTrades24h;
  const l7d    = linkage7d.linkedTrades7d;
  const lNet24 = linkage24h.linkedNetPnL24h;
  const ulNet24 = linkage24h.unlinkedNetPnL24h;
  const lWin24 = linkage24h.linkedWinRate24h;
  const lNet7d = linkage7d.linkedNetPnL7d;
  const lWin7d = linkage7d.linkedWinRate7d;

  let status = 'COLLECTING_LINKAGE_DATA';
  let statusReason = 'Not enough Phase 4F BTC-only trades after activation.';

  // If we don't have 5+ Phase 4F trades total, always COLLECTING
  if (includedPhase4FTrades < 5) {
    status = 'COLLECTING_LINKAGE_DATA';
    statusReason = `Not enough Phase 4F BTC-only trades after activation. Have ${includedPhase4FTrades}, need ≥5.`;
  } else if (l7d >= 30 && lNet7d > 0 && lWin7d >= 55) {
    status = 'READY_SNAPSHOT_EDGE_CONFIRMED_7D';
    statusReason = `7d data: ${l7d} linked trades, winRate=${lWin7d}%, netPnL=${lNet7d} USDT — edge confirmed long-term.`;
  } else if (l24 >= 10 && lNet24 > 0 && lWin24 >= 55) {
    status = 'READY_SNAPSHOT_EDGE_CONFIRMED_SHORT_TERM';
    statusReason = `24h data: ${l24} linked trades, winRate=${lWin24}%, netPnL=${lNet24} USDT — short-term edge confirmed.`;
  } else if (l24 >= 10 && lNet24 <= 0) {
    status = 'READY_SNAPSHOT_NOT_PROFITABLE_YET';
    statusReason = `24h data: ${l24} linked trades but netPnL=${lNet24} USDT ≤ 0. Snapshot linkage not yet profitable.`;
  } else if (l24 >= 5 && lNet24 > ulNet24) {
    status = 'SNAPSHOT_LINKAGE_PROMISING';
    statusReason = `24h data: ${l24} linked trades, linked netPnL (${lNet24}) > unlinked netPnL (${ulNet24}). Promising signal.`;
  } else {
    status = 'COLLECTING_LINKAGE_DATA';
    statusReason = `Collecting Phase 4F evidence. ${includedPhase4FTrades} Phase 4F trades found (${l24} linked in 24h).`;
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    safety: SAFETY,

    // ── Phase 4F filter metadata ─────────────────────────────────────────────
    filterMode: 'PHASE_4F_ONLY',
    phase4FActivationTimestamp: PHASE_4F_ACTIVATION_TIMESTAMP,
    includedPhase4FTrades,
    excludedLegacyBTCTrades,
    includedPhase4FSnapshots,

    snapshotStats: {
      hotSnapshots24h,
      readySnapshots24h,
      hotToReadyConversion24h,
      hotSnapshots7d,
      readySnapshots7d,
      hotToReadyConversion7d,
    },
    tradeLinkageStats: {
      ...linkage24h,
      ...linkage7d,
    },
    decision: {
      status,
      statusReason,
    },
    meta: {
      totalSnapshotsAnalyzed24h: snapshots24h.length,
      totalSnapshotsAnalyzed7d:  snapshots7d.length,
      totalBTCTradesInDB:        allBTCTrades.length,
      phase4FTradesOnly:         includedPhase4FTrades,
      legacyExcluded:            excludedLegacyBTCTrades,
      cutoff24h:                 effective24hCutoff,
      cutoff7d:                  effective7dCutoff,
      activationCutoff,
    },
  });
});