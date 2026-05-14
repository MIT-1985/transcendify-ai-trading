import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// PHASE 4F WEEKLY EVIDENCE EXPORT
// READ-ONLY. No trading. No OKX order endpoints.
// Collects paper evidence for Phase 5 manual review.
// ============================================================

const SAFETY = {
  realTradeAllowed: false,
  realTradeUnlockAllowed: false,
  killSwitchActive: true,
  noOKXOrderEndpointCalled: true,
  mode: 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
};

function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const format = body.format || 'json'; // 'json' | 'csv'

  const now       = new Date();
  const periodEnd = now.toISOString();
  const period7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const periodStart = period7d.toISOString();

  // ── 1. Fetch PaperTrades (last 7d, BTC-USDT only, closed) ──
  let allTrades = [];
  try {
    const raw = await base44.entities.PaperTrade.list('-openedAt', 200);
    allTrades = raw.filter(t =>
      t.instId === 'BTC-USDT' &&
      t.status !== 'OPEN' &&
      t.openedAt &&
      new Date(t.openedAt) >= period7d
    );
  } catch (e) {
    console.error('PaperTrade fetch error:', e.message);
  }

  // ── 2. Fetch SignalSnapshots (last 7d) ──────────────────────
  let allSnapshots = [];
  try {
    const raw = await base44.entities.SignalSnapshot.list('-timestamp', 500);
    allSnapshots = raw.filter(s =>
      s.pair === 'BTC-USDT' &&
      s.timestamp &&
      new Date(s.timestamp) >= period7d
    );
  } catch (e) {
    console.error('SignalSnapshot fetch error:', e.message);
  }

  // ── 3. Fetch VerifiedTrades if available ────────────────────
  let verifiedTrades = [];
  try {
    const raw = await base44.entities.VerifiedTrade.list('-buyTime', 50);
    verifiedTrades = raw.filter(t =>
      t.instId === 'BTC-USDT' &&
      t.buyTime &&
      new Date(t.buyTime) >= period7d
    );
  } catch (e) {
    console.log('VerifiedTrade not available (expected in paper mode):', e.message);
  }

  // ── 4. Run edge report ──────────────────────────────────────
  let edgeData = null;
  try {
    const res = await base44.functions.invoke('phase4FSnapshotEdgeReport', {});
    edgeData = res?.data?.error ? null : res?.data;
  } catch (e) {
    console.error('EdgeReport error:', e.message);
  }

  // ── 5. Run phase5 guard ─────────────────────────────────────
  let guardData = null;
  try {
    const res = await base44.functions.invoke('phase5UnlockGuard', {});
    guardData = res?.data?.error ? null : res?.data;
  } catch (e) {
    console.error('Phase5Guard error:', e.message);
  }

  // ── 6. Compute derived metrics ──────────────────────────────
  const linked   = allTrades.filter(t => !!t.signalSnapshotId);
  const unlinked = allTrades.filter(t => !t.signalSnapshotId);

  const linkedWins      = linked.filter(t => t.status === 'CLOSED_TP').length;
  const linkedWinRate7d = linked.length > 0 ? Math.round((linkedWins / linked.length) * 100) : 0;
  const linkedNetPnL7d  = linked.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
  const totalFees7d     = allTrades.reduce((s, t) => s + (t.fees || t.entryFeeUSDT + t.exitFeeUSDT || 0), 0);
  const totalGross7d    = Math.abs(allTrades.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0));
  const feeDragPercent7d = totalGross7d > 0 ? Math.round((totalFees7d / totalGross7d) * 100) : 100;

  const hotSnaps   = allSnapshots.filter(s => s.alertLevel === 'HOT').length;
  const readySnaps = allSnapshots.filter(s => s.alertLevel === 'READY').length;
  const hotToReadyConversion7d = hotSnaps > 0 ? Math.round((readySnaps / hotSnaps) * 100) : 0;

  const tl  = edgeData?.tradeLinkageStats || {};
  const dec = edgeData?.decision          || {};

  // ── 7. Build summary ────────────────────────────────────────
  const summary = {
    exportGeneratedAt:        now.toISOString(),
    exportGeneratedBy:        user.email,
    mode:                     'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
    activePair:               'BTC-USDT',
    periodStart,
    periodEnd,

    // Trade evidence
    totalClosedTrades7d:      allTrades.length,
    linkedBTCTrades7d:        linked.length,
    unlinkedBTCTrades7d:      unlinked.length,
    linkedWinRate7d,
    linkedNetPnL7d:           parseFloat(linkedNetPnL7d.toFixed(4)),
    feeDragPercent7d,

    // Snapshot evidence
    totalSnapshots7d:         allSnapshots.length,
    hotSnapshots7d:           hotSnaps,
    readySnapshots7d:         readySnaps,
    hotToReadyConversion7d,

    // Edge report (7d from API)
    edgeLinkedTrades7d:       tl.linkedTrades7d        ?? linkedBTCTrades7d,
    edgeLinkedWinRate7d:      tl.linkedWinRate7d        ?? linkedWinRate7d,
    edgeLinkedNetPnL7d:       tl.linkedNetPnL7d         ?? linkedNetPnL7d,
    edgeLinkageEdgeDelta7d:   tl.linkageEdgeDelta7d     ?? null,
    snapshotEdgeStatus:       dec.status                ?? 'UNKNOWN',
    snapshotEdgeStatusReason: dec.statusReason          ?? '',

    // Phase 5 guard
    phase5GuardStatus:        guardData?.status         ?? 'NOT_RUN',
    phase5PassCount:          guardData?.passCount       ?? null,
    phase5FailCount:          guardData?.failCount       ?? null,
    phase5FailedConditions:   guardData?.failedConditions?.map(c => c.id).join(', ') ?? '',

    // Verified trades (real, should be 0 in paper mode)
    verifiedRealTrades7d:     verifiedTrades.length,

    // Safety — immutable
    ...SAFETY,
  };

  // ── 8. Build trade rows ─────────────────────────────────────
  const tradeRows = allTrades.map(t => ({
    tradeId:            t.id,
    pair:               t.instId,
    side:               t.side,
    openedAt:           t.openedAt,
    closedAt:           t.closedAt || '',
    status:             t.status,
    entryPrice:         t.entryPrice,
    targetPrice:        t.targetPrice  || t.tpPrice  || '',
    stopLossPrice:      t.stopLossPrice || t.slPrice  || '',
    sizeUSDT:           t.sizeUSDT,
    grossPnL:           parseFloat((t.grossPnL || t.grossPnLUSDT || 0).toFixed(6)),
    fees:               parseFloat((t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0) || 0).toFixed(6)),
    spreadCost:         parseFloat((t.spreadCost || t.spreadCostUSDT || 0).toFixed(6)),
    netPnL:             parseFloat((t.netPnL || t.netPnLUSDT || 0).toFixed(6)),
    signalScore:        t.signalScore || t.entryScore || '',
    linkedSnapshotId:   t.signalSnapshotId || '',
    snapshotScore:      t.signalSnapshotScore ?? '',
    snapshotMomentum:   t.signalSnapshotMomentum ?? '',
    snapshotBuyPressure: t.signalSnapshotBuyPressure ?? '',
    snapshotAgeMs:      t.signalSnapshotAgeMs ?? '',
    holdingMs:          t.holdingMs || '',
  }));

  // ── 9. Build snapshot rows ──────────────────────────────────
  const snapshotRows = allSnapshots.map(s => ({
    snapshotId:         s.id,
    timestamp:          s.timestamp,
    alertLevel:         s.alertLevel,
    score:              s.totalScore,
    requiredScore:      s.requiredScore ?? '',
    lastPrice:          s.lastPrice ?? '',
    rsi:                s.rsi ?? '',
    momentum:           s.momentumPercent ?? '',
    buyPressure:        s.buyPressurePercent ?? '',
    tickScore:          s.tickScore ?? '',
    passedBarriers:     (s.passedBarriers || []).join('|'),
    failedBarriers:     (s.failedBarriers || []).join('|'),
    recommendedAction:  s.recommendedAction || '',
  }));

  // ── 10. Return ──────────────────────────────────────────────
  if (format === 'csv') {
    // Return multi-section CSV
    const sections = [
      '# PHASE 4F WEEKLY EVIDENCE EXPORT',
      `# Generated: ${now.toISOString()}`,
      `# Mode: PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE`,
      `# realTradeAllowed: false | killSwitchActive: true`,
      '',
      '## SUMMARY',
      toCSV([summary]),
      '',
      '## TRADES (7d)',
      toCSV(tradeRows),
      '',
      '## SNAPSHOTS (7d)',
      toCSV(snapshotRows),
    ].join('\n');

    return new Response(sections, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="phase4f_evidence_${now.toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  // Default: JSON
  return Response.json({
    exportMeta: {
      generatedAt:    now.toISOString(),
      generatedBy:    user.email,
      format:         'json',
      periodStart,
      periodEnd,
      safety:         SAFETY,
    },
    summary,
    trades:    tradeRows,
    snapshots: snapshotRows,
    verifiedTrades: verifiedTrades.map(t => ({
      id:           t.id,
      instId:       t.instId,
      buyTime:      t.buyTime,
      sellTime:     t.sellTime,
      buyPrice:     t.buyPrice,
      sellPrice:    t.sellPrice,
      realizedPnL:  t.realizedPnL,
      status:       t.status,
    })),
    phase5Guard: guardData ? {
      status:           guardData.status,
      passCount:        guardData.passCount,
      failCount:        guardData.failCount,
      failedConditions: guardData.failedConditions,
      realTradeUnlockAllowed: false,
    } : null,
  });
});