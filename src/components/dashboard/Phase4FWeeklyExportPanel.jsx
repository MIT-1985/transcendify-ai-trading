import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

function SummaryRow({ label, value, color = 'text-white' }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold font-mono ${color}`}>{value ?? '—'}</span>
    </div>
  );
}

function downloadBlob(content, filename, type) {
  const blob = new URL('data:' + type + ',' + encodeURIComponent(content));
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Phase4FWeeklyExportPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async (format = 'json') => {
    setLoading(true);
    setError(null);
    setData(null);
    const res = await base44.functions.invoke('phase4FWeeklyEvidenceExport', { format });
    if (res.data?.error) {
      setError(res.data.error);
      setLoading(false);
      return;
    }
    setData(res.data);
    setLoading(false);
  };

  const downloadJSON = () => {
    if (!data) return;
    const filename = `phase4f_evidence_${new Date().toISOString().split('T')[0]}.json`;
    downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json');
  };

  const downloadCSV = async () => {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase4FWeeklyEvidenceExport', { format: 'csv' });
    setLoading(false);
    if (res.data?.error) { setError(res.data.error); return; }
    const csvText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const filename = `phase4f_evidence_${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(csvText, filename, 'text/csv');
  };

  const s  = data?.summary || {};
  const pg = data?.phase5Guard || {};

  const pnlColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
  const rateColor = v => v >= 55 ? 'text-emerald-400' : v >= 45 ? 'text-yellow-400' : 'text-red-400';
  const sign      = v => (v >= 0 ? '+' : '') + (typeof v === 'number' ? v.toFixed(4) : v);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">PHASE 4F</div>
          <h2 className="text-xl font-black text-white">Weekly Evidence Export</h2>
          <div className="text-xs text-slate-400 mt-1">
            Exports 7-day paper trading evidence — snapshots, trades, P&L, guard status. Read-only.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => run('json')}
            disabled={loading}
            className="px-4 py-2.5 text-xs font-bold rounded-xl bg-cyan-700/30 border border-cyan-600 hover:bg-cyan-700/50 text-cyan-300 disabled:opacity-50 transition-all"
          >
            {loading ? '⏳ Loading…' : '▶ Generate Report'}
          </button>
          {data && (
            <>
              <button
                onClick={downloadJSON}
                className="px-4 py-2.5 text-xs font-bold rounded-xl bg-blue-700/30 border border-blue-600 hover:bg-blue-700/50 text-blue-300 transition-all"
              >
                ⬇ Download JSON
              </button>
              <button
                onClick={downloadCSV}
                disabled={loading}
                className="px-4 py-2.5 text-xs font-bold rounded-xl bg-emerald-700/30 border border-emerald-600 hover:bg-emerald-700/50 text-emerald-300 disabled:opacity-50 transition-all"
              >
                ⬇ Download CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Safety Banner */}
      <div className="bg-red-950/40 border-2 border-red-700 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-xl">🔒</span>
        <div>
          <div className="text-red-400 font-black">REAL TRADING LOCKED · READ-ONLY EXPORT</div>
          <div className="text-red-300 mt-0.5">killSwitchActive=true · realTradeAllowed=false · realTradeUnlockAllowed=false · noOKXOrderEndpointCalled=true</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}
      {loading && (
        <div className="text-center text-slate-400 py-16 text-sm animate-pulse">Generating evidence export…</div>
      )}

      {data && (
        <div className="space-y-5">

          {/* Summary card */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">📋 7-Day Summary</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <div>
                <SummaryRow label="Period Start"           value={s.periodStart ? new Date(s.periodStart).toLocaleDateString('de-DE') : '—'} />
                <SummaryRow label="Period End"             value={s.periodEnd   ? new Date(s.periodEnd).toLocaleDateString('de-DE')   : '—'} />
                <SummaryRow label="Active Pair"            value={s.activePair}                 color="text-yellow-400" />
                <SummaryRow label="Mode"                   value={s.mode}                       color="text-slate-300" />
                <SummaryRow label="Closed Trades (7d)"     value={s.totalClosedTrades7d}        />
                <SummaryRow label="Linked Trades (7d)"     value={s.linkedBTCTrades7d}          color="text-emerald-400" />
                <SummaryRow label="Unlinked Trades (7d)"   value={s.unlinkedBTCTrades7d}        color="text-slate-400" />
                <SummaryRow label="Linked Win Rate (7d)"   value={`${s.linkedWinRate7d}%`}      color={rateColor(s.linkedWinRate7d ?? 0)} />
                <SummaryRow label="Linked Net PnL (7d)"    value={`${sign(s.linkedNetPnL7d ?? 0)} USDT`} color={pnlColor(s.linkedNetPnL7d ?? 0)} />
                <SummaryRow label="Fee Drag (7d)"          value={`${s.feeDragPercent7d}%`}     color={(s.feeDragPercent7d ?? 100) < 50 ? 'text-emerald-400' : 'text-red-400'} />
              </div>
              <div>
                <SummaryRow label="HOT Snapshots (7d)"          value={s.hotSnapshots7d}              color="text-orange-400" />
                <SummaryRow label="READY Snapshots (7d)"        value={s.readySnapshots7d}            color="text-emerald-400" />
                <SummaryRow label="HOT→READY Conversion (7d)"   value={`${s.hotToReadyConversion7d}%`} color={(s.hotToReadyConversion7d ?? 0) >= 30 ? 'text-emerald-400' : 'text-yellow-400'} />
                <SummaryRow label="Edge Delta (7d)"              value={s.edgeLinkageEdgeDelta7d != null ? `${sign(s.edgeLinkageEdgeDelta7d)} USDT` : '—'} color={pnlColor(s.edgeLinkageEdgeDelta7d ?? 0)} />
                <SummaryRow label="Snapshot Edge Status"         value={s.snapshotEdgeStatus}          color={s.snapshotEdgeStatus === 'READY_SNAPSHOT_EDGE_CONFIRMED_7D' ? 'text-cyan-400' : 'text-yellow-400'} />
                <SummaryRow label="Verified Real Trades (7d)"    value={s.verifiedRealTrades7d}        color={s.verifiedRealTrades7d > 0 ? 'text-red-400' : 'text-emerald-400'} />
                <SummaryRow label="Phase 5 Guard Status"         value={s.phase5GuardStatus}           color={s.phase5GuardStatus === 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED' ? 'text-yellow-400' : 'text-slate-400'} />
                <SummaryRow label="Phase 5 Pass / Fail"          value={pg.passCount != null ? `${pg.passCount} / ${(pg.passCount ?? 0) + (pg.failCount ?? 0)}` : '—'} />
                <SummaryRow label="realTradeUnlockAllowed"        value="false"                         color="text-red-400" />
                <SummaryRow label="killSwitchActive"              value="true"                          color="text-red-400" />
              </div>
            </div>
          </div>

          {/* Phase 5 failed conditions */}
          {pg.failedConditions?.length > 0 && (
            <div className="bg-slate-900/50 border border-red-800 rounded-xl p-4">
              <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">❌ Phase 5 Guard — Failing Conditions</div>
              <div className="space-y-1">
                {pg.failedConditions.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 text-xs bg-red-950/20 border border-red-900 rounded-lg px-3 py-1.5">
                    <span className="font-bold text-red-300">{c.id}</span>
                    <span className="text-slate-400">{c.label}</span>
                    <span className="text-slate-500 ml-auto">actual: <span className="text-white font-mono">{String(c.actual)}</span></span>
                    {c.required != null && <span className="text-slate-500">req: <span className="text-yellow-400 font-mono">{String(c.required)}</span></span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trade count chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { label: 'Total Trades',  value: data.trades?.length ?? 0,    color: 'text-white' },
              { label: 'Linked',        value: data.trades?.filter(t => t.linkedSnapshotId).length ?? 0, color: 'text-emerald-400' },
              { label: 'Snapshots',     value: data.snapshots?.length ?? 0,  color: 'text-cyan-400' },
              { label: 'Verified Real', value: data.verifiedTrades?.length ?? 0, color: data.verifiedTrades?.length > 0 ? 'text-red-400' : 'text-emerald-400' },
            ].map(item => (
              <div key={item.label} className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-center">
                <div className="text-slate-500 uppercase tracking-wide mb-0.5">{item.label}</div>
                <div className={`font-black text-xl ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Recent trades preview */}
          {data.trades?.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                📄 Trades Preview (last {Math.min(10, data.trades.length)} of {data.trades.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-700 text-slate-400">
                    <tr>
                      <th className="text-left px-2 py-1.5">Pair</th>
                      <th className="text-left px-2 py-1.5">Status</th>
                      <th className="text-right px-2 py-1.5">NetPnL</th>
                      <th className="text-right px-2 py-1.5">Score</th>
                      <th className="text-left px-2 py-1.5">Snap</th>
                      <th className="text-left px-2 py-1.5">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trades.slice(0, 10).map((t, i) => (
                      <tr key={i} className="border-b border-slate-800/50">
                        <td className="px-2 py-1.5 font-bold text-yellow-400">{t.pair}</td>
                        <td className="px-2 py-1.5">
                          <span className={t.status === 'CLOSED_TP' ? 'text-emerald-400' : t.status === 'CLOSED_SL' ? 'text-red-400' : 'text-slate-400'}>
                            {t.status}
                          </span>
                        </td>
                        <td className={`px-2 py-1.5 text-right font-bold ${(t.netPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {(t.netPnL ?? 0) >= 0 ? '+' : ''}{t.netPnL}
                        </td>
                        <td className="px-2 py-1.5 text-right text-cyan-400">{t.signalScore || '—'}</td>
                        <td className="px-2 py-1.5">
                          {t.linkedSnapshotId
                            ? <span className="text-emerald-400 font-semibold">📸 Linked</span>
                            : <span className="text-slate-600">⬜</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400">
                          {t.openedAt ? new Date(t.openedAt).toLocaleTimeString('de-DE') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Export footer */}
          <div className="bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-500 flex flex-wrap gap-4">
            <span>Generated: <span className="text-white">{data.exportMeta?.generatedAt ? new Date(data.exportMeta.generatedAt).toLocaleString('de-DE') : '—'}</span></span>
            <span>By: <span className="text-white">{data.exportMeta?.generatedBy}</span></span>
            <span className="ml-auto font-bold text-red-400">realTradeUnlockAllowed: false · killSwitchActive: true</span>
          </div>

        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 py-16 text-sm">
          Click <span className="text-cyan-400 font-bold">Generate Report</span> to build the 7-day evidence export.
        </div>
      )}
    </div>
  );
}