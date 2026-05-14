import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

  // ── Fetch all relevant data ──────────────────────────────────────────────────
  const [allSnapshots, allTrades] = await Promise.all([
    base44.entities.SignalSnapshot.list('-created_date', 500),
    base44.entities.PaperTrade.filter({ instId: 'BTC-USDT' }, '-created_date', 500),
  ]);

  // ── Snapshot helpers ─────────────────────────────────────────────────────────
  const snapshots24h = allSnapshots.filter(s => s.created_date >= cutoff24h);
  const snapshots7d  = allSnapshots.filter(s => s.created_date >= cutoff7d);

  const hotSnapshots24h  = snapshots24h.filter(s => s.alertLevel === 'HOT').length;
  const readySnapshots24h = snapshots24h.filter(s => s.alertLevel === 'READY').length;
  const hotToReadyConversion24h = hotSnapshots24h > 0
    ? +((readySnapshots24h / hotSnapshots24h) * 100).toFixed(1) : 0;

  const hotSnapshots7d  = snapshots7d.filter(s => s.alertLevel === 'HOT').length;
  const readySnapshots7d = snapshots7d.filter(s => s.alertLevel === 'READY').length;
  const hotToReadyConversion7d = hotSnapshots7d > 0
    ? +((readySnapshots7d / hotSnapshots7d) * 100).toFixed(1) : 0;

  // ── Trade helpers ─────────────────────────────────────────────────────────────
  const closedStatuses = ['CLOSED_TP', 'CLOSED_SL', 'EXPIRED', 'CLOSED_MANUAL'];

  const trades24h = allTrades.filter(t => t.created_date >= cutoff24h && closedStatuses.includes(t.status));
  const trades7d  = allTrades.filter(t => t.created_date >= cutoff7d  && closedStatuses.includes(t.status));

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

  // ── Decision logic ────────────────────────────────────────────────────────────
  let status = 'COLLECTING_LINKAGE_DATA';
  let statusReason = 'Not enough linked trades yet (need ≥5 in last 24h).';

  const l24 = linkage24h.linkedTrades24h;
  const l7d = linkage7d.linkedTrades7d;
  const lNet24 = linkage24h.linkedNetPnL24h;
  const ulNet24 = linkage24h.unlinkedNetPnL24h;
  const lWin24 = linkage24h.linkedWinRate24h;
  const lNet7d = linkage7d.linkedNetPnL7d;
  const lWin7d = linkage7d.linkedWinRate7d;

  if (l7d >= 30 && lNet7d > 0 && lWin7d >= 55) {
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
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    safety: SAFETY,
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
      totalBTCTradesInDB: allTrades.length,
      cutoff24h,
      cutoff7d,
    },
  });
});