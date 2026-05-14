/**
 * Phase4FSnapshotLinkagePanel
 * 
 * 24h analysis: snapshot-linked vs unlinked paper trade performance.
 * Read-only. No orders. Kill switch active.
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const PHASE = 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE';

function MetricBox({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-center">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={`font-black text-xl ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function pnlColor(v) {
  if (v == null) return 'text-slate-400';
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
}

function LinkedBadge({ linked }) {
  return linked
    ? <span className="inline-flex items-center gap-1 text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">📸 Linked</span>
    : <span className="inline-flex items-center gap-1 text-xs bg-slate-800/60 border border-slate-600/40 text-slate-500 px-2 py-0.5 rounded-full">⬜ Unlinked</span>;
}

function TradeRow({ trade }) {
  const isLinked  = !!trade.signalSnapshotId;
  const netPnL    = trade.netPnL ?? trade.netPnLUSDT ?? null;
  const ageMin    = trade.signalSnapshotAgeMs != null ? (trade.signalSnapshotAgeMs / 60000).toFixed(1) : null;
  const openedAt  = trade.openedAt ? new Date(trade.openedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';

  const statusColor = {
    CLOSED_TP: 'text-emerald-400',
    CLOSED_SL: 'text-red-400',
    EXPIRED:   'text-yellow-400',
    OPEN:      'text-blue-400',
  }[trade.status] || 'text-slate-400';

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
      <td className="px-3 py-2 text-xs text-slate-400">{openedAt}</td>
      <td className="px-3 py-2"><LinkedBadge linked={isLinked} /></td>
      <td className="px-3 py-2 text-xs font-mono text-white">{trade.signalScore ?? '—'}</td>
      {/* Snapshot fields */}
      <td className="px-3 py-2 text-xs text-slate-300">{isLinked ? trade.signalSnapshotScore : '—'}</td>
      <td className="px-3 py-2 text-xs text-slate-300">
        {isLinked && trade.signalSnapshotMomentum != null
          ? <span className={trade.signalSnapshotMomentum > 0 ? 'text-emerald-400' : 'text-red-400'}>{trade.signalSnapshotMomentum.toFixed(3)}%</span>
          : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-300">
        {isLinked && trade.signalSnapshotBuyPressure != null ? `${trade.signalSnapshotBuyPressure.toFixed(1)}%` : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-400">{ageMin != null ? `${ageMin}m` : '—'}</td>
      {/* Outcome */}
      <td className={`px-3 py-2 text-xs font-semibold ${statusColor}`}>{trade.status}</td>
      <td className={`px-3 py-2 text-xs font-bold ${pnlColor(netPnL)}`}>
        {netPnL != null ? `${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(4)}` : '—'}
      </td>
    </tr>
  );
}

export default function Phase4FSnapshotLinkagePanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [lastAt,  setLastAt]  = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const all = await base44.entities.PaperTrade.filter({ phase: PHASE }, '-openedAt', 200);
      const closed24h = all.filter(t =>
        t.status !== 'OPEN' && t.closedAt && t.closedAt >= since24h
      );

      const withSnap    = closed24h.filter(t => !!t.signalSnapshotId);
      const withoutSnap = closed24h.filter(t => !t.signalSnapshotId);

      const pnlSum  = arr => arr.reduce((s, t) => s + (t.netPnL ?? t.netPnLUSDT ?? 0), 0);
      const winRate = arr => arr.length > 0
        ? ((arr.filter(t => (t.netPnL ?? t.netPnLUSDT ?? 0) > 0).length / arr.length) * 100).toFixed(1)
        : null;

      setData({
        all: closed24h,
        withSnap,
        withoutSnap,
        stats: {
          tradesWithSnapshot:      withSnap.length,
          tradesWithoutSnapshot:   withoutSnap.length,
          snapshotLinkedWinRate:   winRate(withSnap),
          snapshotLinkedNetPnL:    parseFloat(pnlSum(withSnap).toFixed(6)),
          unlinkedWinRate:         winRate(withoutSnap),
          unlinkedNetPnL:          parseFloat(pnlSum(withoutSnap).toFixed(6)),
        },
      });
      setLastAt(new Date());
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  const s = data?.stats;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">🔗 Snapshot → Trade Linkage Analysis</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Compares performance of trades with vs without a linked READY snapshot (24h). Audit only — no orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastAt && <span className="text-xs text-slate-600">{lastAt.toLocaleTimeString('de-DE')}</span>}
          <Button size="sm" onClick={load} disabled={loading} className="bg-slate-700 hover:bg-slate-600 text-white text-xs">
            {loading ? '⏳' : '🔄 Load'}
          </Button>
        </div>
      </div>

      {/* Safety */}
      <div className="flex flex-wrap gap-2">
        {['realTradeAllowed: false', 'killSwitchActive: true', 'noOKXOrderEndpoint: true'].map(l => (
          <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
        ))}
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {!data && !loading && (
        <div className="text-center text-slate-500 text-sm py-10">
          <div className="text-2xl mb-2">🔗</div>
          Click Load to compute snapshot linkage analysis.
        </div>
      )}

      {data && (
        <>
          {/* Summary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricBox
              label="Linked Trades (24h)"
              value={s.tradesWithSnapshot}
              sub={`of ${s.tradesWithSnapshot + s.tradesWithoutSnapshot} closed`}
              color={s.tradesWithSnapshot > 0 ? 'text-emerald-400' : 'text-slate-400'}
            />
            <MetricBox
              label="Unlinked Trades (24h)"
              value={s.tradesWithoutSnapshot}
              color={s.tradesWithoutSnapshot > 0 ? 'text-yellow-400' : 'text-slate-400'}
            />
            <MetricBox
              label="Linked Win Rate"
              value={s.snapshotLinkedWinRate != null ? `${s.snapshotLinkedWinRate}%` : 'N/A'}
              color={s.snapshotLinkedWinRate != null && parseFloat(s.snapshotLinkedWinRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}
            />
            <MetricBox
              label="Linked Net P&L"
              value={s.snapshotLinkedNetPnL != null ? `$${s.snapshotLinkedNetPnL.toFixed(4)}` : 'N/A'}
              color={pnlColor(s.snapshotLinkedNetPnL)}
            />
            <MetricBox
              label="Unlinked Win Rate"
              value={s.unlinkedWinRate != null ? `${s.unlinkedWinRate}%` : 'N/A'}
              color={s.unlinkedWinRate != null && parseFloat(s.unlinkedWinRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}
            />
            <MetricBox
              label="Unlinked Net P&L"
              value={s.unlinkedNetPnL != null ? `$${s.unlinkedNetPnL.toFixed(4)}` : 'N/A'}
              color={pnlColor(s.unlinkedNetPnL)}
            />
          </div>

          {/* Comparison insight */}
          {s.tradesWithSnapshot > 0 && s.tradesWithoutSnapshot > 0 && (
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📊 Linkage Edge</div>
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-slate-500">Linked avg P&L: </span>
                  <span className={`font-bold ${pnlColor(s.snapshotLinkedNetPnL / s.tradesWithSnapshot)}`}>
                    ${(s.snapshotLinkedNetPnL / s.tradesWithSnapshot).toFixed(4)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Unlinked avg P&L: </span>
                  <span className={`font-bold ${pnlColor(s.unlinkedNetPnL / s.tradesWithoutSnapshot)}`}>
                    ${(s.unlinkedNetPnL / s.tradesWithoutSnapshot).toFixed(4)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Edge delta: </span>
                  <span className={`font-bold ${pnlColor((s.snapshotLinkedNetPnL / s.tradesWithSnapshot) - (s.unlinkedNetPnL / s.tradesWithoutSnapshot))}`}>
                    ${((s.snapshotLinkedNetPnL / s.tradesWithSnapshot) - (s.unlinkedNetPnL / s.tradesWithoutSnapshot)).toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Trade table */}
          {data.all.length > 0 ? (
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                Closed Trades (24h) — {data.all.length} total
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-400 text-xs uppercase tracking-wide">
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Linked</th>
                      <th className="px-3 py-2 text-left">Live Score</th>
                      <th className="px-3 py-2 text-left">Snap Score</th>
                      <th className="px-3 py-2 text-left">Snap Mom</th>
                      <th className="px-3 py-2 text-left">Snap BuyP</th>
                      <th className="px-3 py-2 text-left">Snap Age</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Net P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.all.map((t, i) => <TradeRow key={t.id || i} trade={t} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 text-sm py-6">No closed Phase 4F trades in the last 24h yet.</div>
          )}
        </>
      )}
    </div>
  );
}