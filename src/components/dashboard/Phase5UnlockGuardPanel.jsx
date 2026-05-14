import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const CONDITION_ICONS = {
  pass: '✅',
  fail: '❌',
};

function ConditionRow({ c, pass }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs ${
      pass
        ? 'border-emerald-800 bg-emerald-950/20'
        : 'border-red-800 bg-red-950/20'
    }`}>
      <span className="text-base mt-0.5">{pass ? CONDITION_ICONS.pass : CONDITION_ICONS.fail}</span>
      <div className="flex-1 min-w-0">
        <div className={`font-bold ${pass ? 'text-emerald-300' : 'text-red-300'}`}>{c.label}</div>
        <div className="text-slate-400 mt-0.5 flex flex-wrap gap-3">
          <span>actual: <span className="text-white font-mono">{String(c.actual)}</span></span>
          {!pass && c.required != null && (
            <span>required: <span className="text-yellow-400 font-mono">{String(c.required)}</span></span>
          )}
          {c.note && <span className="text-slate-500 italic">{c.note}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Phase5UnlockGuardPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    const res = await base44.functions.invoke('phase5UnlockGuard', {});
    if (res.data?.error) {
      setError(res.data.error);
    } else {
      setData(res.data);
    }
    setLoading(false);
  };

  const isReady  = data?.status === 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED';
  const isLocked = data?.status === 'LOCKED';
  const m = data?.metrics || {};

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">PHASE 5 UNLOCK GUARD</div>
          <h2 className="text-xl font-black text-white">Real Trading Readiness Check</h2>
          <div className="text-xs text-slate-400 mt-1">
            Evaluates paper evidence against 10 strict conditions. Does NOT enable trading under any circumstances.
          </div>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-5 py-2.5 text-xs font-bold rounded-xl bg-orange-700/30 border border-orange-600 hover:bg-orange-700/50 text-orange-300 disabled:opacity-50 transition-all shrink-0"
        >
          {loading ? '⏳ Checking…' : '▶ Run Guard Check'}
        </button>
      </div>

      {/* Immutable Safety Banner */}
      <div className="bg-red-950/50 border-2 border-red-600 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🔒</span>
          <div>
            <div className="text-red-400 font-black text-sm uppercase tracking-wide">REAL TRADING LOCKED — PERMANENTLY IN THIS FUNCTION</div>
            <div className="text-red-300 text-xs mt-0.5">realTradeUnlockAllowed: false (immutable) · noOKXOrderEndpointCalled: true · killSwitchActive: true</div>
          </div>
        </div>
        <div className="text-xs text-red-300/70 italic">
          Even if all 10 conditions pass, this function returns <span className="font-mono text-red-300">realTradeUnlockAllowed=false</span>. Phase 5 requires a separate manual operator action outside this system.
        </div>
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}
      {loading && (
        <div className="text-center text-slate-400 py-16 text-sm animate-pulse">Running guard check…</div>
      )}

      {data && (
        <div className="space-y-5">

          {/* Status Card */}
          <div className={`border-2 rounded-2xl px-6 py-5 ${
            isReady  ? 'border-yellow-500 bg-yellow-900/20' :
            isLocked ? 'border-slate-600 bg-slate-800/40' :
                       'border-slate-600 bg-slate-800/40'
          }`}>
            <div className="flex items-start gap-4">
              <span className="text-4xl">{isReady ? '🟡' : '🔴'}</span>
              <div className="flex-1">
                <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${isReady ? 'text-yellow-400' : 'text-slate-400'}`}>
                  Status
                </div>
                <div className={`text-lg font-black break-all ${isReady ? 'text-yellow-400' : 'text-red-400'}`}>
                  {data.status}
                </div>
                <div className="text-slate-300 text-sm mt-2 leading-relaxed">{data.reason}</div>
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-5">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Conditions Passed</span>
                <span className={`font-black ${isReady ? 'text-yellow-400' : 'text-slate-300'}`}>
                  {data.passCount} / {data.totalConditions}
                </span>
              </div>
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isReady ? 'bg-yellow-500' : 'bg-slate-500'}`}
                  style={{ width: `${Math.round((data.passCount / data.totalConditions) * 100)}%` }}
                />
              </div>
            </div>

            {isReady && (
              <div className="mt-4 bg-yellow-900/30 border border-yellow-600 rounded-xl px-4 py-3 text-xs text-yellow-300 font-bold">
                ⚠️ Manual review required. Operator must initiate Phase 5 unlock through a separate privileged process. This dashboard cannot unlock trading.
              </div>
            )}
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {[
              { label: 'Linked Trades 7d', value: m.linkedBTCTrades7d, required: '≥ 30', pass: m.linkedBTCTrades7d >= 30, color: 'text-white' },
              { label: 'Net PnL 7d', value: `${(m.linkedNetPnL7d ?? 0) >= 0 ? '+' : ''}${m.linkedNetPnL7d} USDT`, required: '> 0', pass: (m.linkedNetPnL7d ?? 0) > 0, color: (m.linkedNetPnL7d ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Win Rate 7d', value: `${m.linkedWinRate7d}%`, required: '≥ 55%', pass: (m.linkedWinRate7d ?? 0) >= 55, color: (m.linkedWinRate7d ?? 0) >= 55 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Fee Drag 7d', value: `${m.feeDragPercent7d}%`, required: '< 50%', pass: (m.feeDragPercent7d ?? 100) < 50, color: (m.feeDragPercent7d ?? 100) < 50 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Duplicates', value: String(m.duplicateTradesDetected), required: 'false', pass: !m.duplicateTradesDetected, color: !m.duplicateTradesDetected ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Suspect Trades', value: String(m.suspectTradesDetected), required: 'false', pass: !m.suspectTradesDetected, color: !m.suspectTradesDetected ? 'text-emerald-400' : 'text-red-400' },
            ].map(item => (
              <div key={item.label} className={`rounded-xl border px-3 py-2.5 ${item.pass ? 'border-emerald-800 bg-emerald-950/10' : 'border-red-800 bg-red-950/10'}`}>
                <div className="text-slate-500 uppercase tracking-wide mb-1">{item.label}</div>
                <div className={`font-black text-base ${item.color}`}>{item.value ?? '—'}</div>
                <div className="text-slate-600 mt-0.5">req: {item.required}</div>
              </div>
            ))}
          </div>

          {/* Snapshot Edge Status */}
          <div className={`rounded-xl border-2 px-4 py-3 text-xs ${
            m.snapshotEdgeStatus === 'READY_SNAPSHOT_EDGE_CONFIRMED_7D'
              ? 'border-cyan-700 bg-cyan-950/20'
              : 'border-red-800 bg-red-950/10'
          }`}>
            <span className="text-slate-400 uppercase tracking-widest font-bold mr-3">Snapshot Edge Status</span>
            <span className={`font-black ${m.snapshotEdgeStatus === 'READY_SNAPSHOT_EDGE_CONFIRMED_7D' ? 'text-cyan-400' : 'text-red-400'}`}>
              {m.snapshotEdgeStatus || '—'}
            </span>
            <span className="text-slate-500 ml-3">(required: READY_SNAPSHOT_EDGE_CONFIRMED_7D)</span>
          </div>

          {/* Conditions Grid */}
          <div className="space-y-4">
            {data.passedConditions?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                  ✅ Passed ({data.passCount})
                </div>
                <div className="space-y-1.5">
                  {data.passedConditions.map(c => <ConditionRow key={c.id} c={c} pass={true} />)}
                </div>
              </div>
            )}
            {data.failedConditions?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-red-400 uppercase tracking-widest">
                  ❌ Not Yet Met ({data.failCount})
                </div>
                <div className="space-y-1.5">
                  {data.failedConditions.map(c => <ConditionRow key={c.id} c={c} pass={false} />)}
                </div>
              </div>
            )}
          </div>

          {/* Data Source Status */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-xs">
            <div className="text-slate-500 font-bold uppercase tracking-widest mb-2">Data Sources</div>
            <div className="flex flex-wrap gap-3">
              <span className={`px-2 py-1 rounded-lg border font-bold ${data.dataSourceStatus?.edgeReportLoaded ? 'text-emerald-400 border-emerald-800' : 'text-red-400 border-red-800'}`}>
                Edge Report: {data.dataSourceStatus?.edgeReportLoaded ? '✅ loaded' : `❌ ${data.dataSourceStatus?.edgeReportError || 'failed'}`}
              </span>
              <span className={`px-2 py-1 rounded-lg border font-bold ${data.dataSourceStatus?.accountingLoaded ? 'text-emerald-400 border-emerald-800' : 'text-yellow-400 border-yellow-800'}`}>
                Accounting: {data.dataSourceStatus?.accountingLoaded ? '✅ loaded' : `⚠️ ${data.dataSourceStatus?.accountingError || 'unavailable'}`}
              </span>
              <span className="text-slate-500 ml-auto">
                Generated: {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('de-DE') : '—'}
              </span>
            </div>
          </div>

        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 py-16 text-sm">
          Click <span className="text-orange-400 font-bold">Run Guard Check</span> to evaluate Phase 5 readiness.
        </div>
      )}
    </div>
  );
}