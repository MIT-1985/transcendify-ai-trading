import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const CONDITION_LABELS = {
  mode:                 'Mode = PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
  pair:                 'Pair = BTC-USDT',
  decision:             'Decision = READY or PAPER_SIGNAL_ONLY',
  score:                'Score ≥ 75',
  tick:                 'Tick = BUY_PRESSURE',
  feeOK:                'Fee OK = true',
  tpRealismBarrier:     'TP Realism Barrier = PASS',
  grossProfitBarrier:   'Gross Profit Barrier = PASS',
  feeEfficiencyBarrier: 'Fee Efficiency Barrier = PASS',
  phase5GuardStatus:    'Phase 5 Guard = PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED',
  manualReviewRequired: 'Manual Review Required = true',
};

function ConditionRow({ c }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border text-xs ${
      c.pass
        ? 'border-emerald-800/70 bg-emerald-950/15'
        : c.hardBlock
          ? 'border-red-600 bg-red-950/30'
          : 'border-orange-800/60 bg-orange-950/15'
    }`}>
      <span className="text-base mt-0.5 shrink-0">
        {c.pass ? '✅' : c.hardBlock ? '🚫' : '❌'}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`font-bold ${c.pass ? 'text-emerald-300' : c.hardBlock ? 'text-red-300' : 'text-orange-300'}`}>
          {CONDITION_LABELS[c.id] || c.id}
          {c.hardBlock && <span className="ml-2 text-red-400 font-black">HARD BLOCK</span>}
        </div>
        <div className="flex flex-wrap gap-3 mt-0.5 text-slate-500">
          <span>actual: <span className="text-white font-mono">{String(c.actual)}</span></span>
          {c.required != null && <span>required: <span className="text-yellow-400 font-mono">{String(c.required)}</span></span>}
        </div>
      </div>
    </div>
  );
}

export default function RealTradingHardBlockerPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    const res = await base44.functions.invoke('realTradingHardBlocker', {});
    if (res.data?.error) { setError(res.data.error); setLoading(false); return; }
    setData(res.data);
    setLoading(false);
  };

  const d   = data || {};
  const sig = d.signalSnapshot || {};
  const p5  = d.phase5Snapshot || {};

  const isBlocked = d.blockerStatus !== 'PAPER_EVIDENCE_READY_FOR_REVIEW';

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">PHASE 4F</div>
          <h2 className="text-xl font-black text-white">Real Trading Hard Blocker</h2>
          <div className="text-xs text-slate-400 mt-1">
            Evaluates all 11 conditions required before real trading. Returns <span className="text-red-400 font-bold">REAL_TRADING_BLOCKED</span> if any fail.
          </div>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="px-5 py-2.5 text-xs font-bold rounded-xl bg-red-700/30 border border-red-600 hover:bg-red-700/50 text-red-300 disabled:opacity-50 transition-all shrink-0"
        >
          {loading ? '⏳ Evaluating…' : '🔒 Run Blocker Check'}
        </button>
      </div>

      {/* Permanent safety banner */}
      <div className="bg-red-950/50 border-2 border-red-600 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-2xl">🛑</span>
        <div>
          <div className="text-red-400 font-black text-sm">REAL TRADING IS PERMANENTLY BLOCKED IN THIS CODEBASE</div>
          <div className="text-red-300 mt-0.5">
            killSwitchActive=true · realTradeAllowed=false · realTradeUnlockAllowed=false · noOKXOrderEndpointCalled=true
          </div>
          <div className="text-red-500 mt-0.5 italic">
            This panel evaluates conditions for future reference only. No trade will ever be placed here.
          </div>
        </div>
      </div>

      {/* Hard-block signal types */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-xs">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">🚫 Signals That Always Block Real Trades</div>
        <div className="flex flex-wrap gap-2">
          {['WATCH', 'WAIT', 'SELL_PRESSURE', 'NO_SIGNAL', 'COLD', 'WARM', 'Score < 75', 'Fee OK = false'].map(s => (
            <span key={s} className="bg-red-950/40 border border-red-800 text-red-400 font-bold px-2 py-1 rounded-lg">{s}</span>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error}</div>}
      {loading && <div className="text-center text-slate-400 py-16 text-sm animate-pulse">Evaluating all conditions…</div>}

      {data && (
        <div className="space-y-4">

          {/* Main verdict */}
          <div className={`rounded-2xl border-2 px-6 py-5 ${
            isBlocked
              ? 'border-red-600 bg-red-950/30'
              : 'border-yellow-600 bg-yellow-950/20'
          }`}>
            <div className={`text-2xl font-black mb-1 ${isBlocked ? 'text-red-400' : 'text-yellow-400'}`}>
              {isBlocked ? '🛑 REAL_TRADING_BLOCKED' : '⚠️ PAPER_EVIDENCE_READY_FOR_REVIEW'}
            </div>
            <div className="text-xs text-slate-300 mt-1">{d.reason}</div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              <span className="text-slate-400">Conditions: <span className="text-white font-bold">{d.passCount}/{d.totalConditions}</span> pass</span>
              <span className="text-emerald-400 font-bold">realTradeAllowed: false</span>
              <span className="text-emerald-400 font-bold">realTradeUnlockAllowed: false</span>
              {d.hardBlockedBy?.length > 0 && (
                <span className="text-red-400 font-bold">Hard blocks: {d.hardBlockedBy.join(', ')}</span>
              )}
            </div>
          </div>

          {/* Conditions grid */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              📋 All {d.totalConditions} Conditions
            </div>

            {/* Failed first */}
            {d.failedConditions?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-red-400 font-bold">❌ Failed ({d.failedConditions.length})</div>
                {d.failedConditions.map(c => <ConditionRow key={c.id} c={c} />)}
              </div>
            )}

            {/* Passed */}
            {d.passedConditions?.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <div className="text-xs text-emerald-400 font-bold">✅ Passed ({d.passedConditions.length})</div>
                {d.passedConditions.map(c => <ConditionRow key={c.id} c={{ ...c, pass: true }} />)}
              </div>
            )}
          </div>

          {/* Signal + Phase5 snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-xs space-y-1.5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">📡 Signal Snapshot</div>
              {[
                { label: 'Mode',       value: sig.mode,       color: sig.mode === 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE' ? 'text-cyan-400' : 'text-red-400' },
                { label: 'Pair',       value: sig.pair,       color: sig.pair === 'BTC-USDT' ? 'text-yellow-400' : 'text-red-400' },
                { label: 'Decision',   value: sig.decision,   color: ['READY','PAPER_SIGNAL_ONLY'].includes(sig.decision) ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Score',      value: sig.score,      color: (sig.score ?? 0) >= 75 ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Tick',       value: sig.tick,       color: sig.tick === 'BUY_PRESSURE' ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Fee OK',     value: String(sig.feeOK), color: sig.feeOK ? 'text-emerald-400' : 'text-red-400' },
                { label: 'TP Realism', value: String(sig.tpRealism),   color: sig.tpRealism ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Gross Profit Barrier', value: String(sig.grossProfit), color: sig.grossProfit ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Fee Efficiency', value: String(sig.feeEff), color: sig.feeEff ? 'text-emerald-400' : 'text-red-400' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-400">{r.label}</span>
                  <span className={`font-bold font-mono ${r.color}`}>{r.value ?? '—'}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-xs space-y-1.5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">🔒 Phase 5 Guard Snapshot</div>
              {[
                { label: 'Guard Status',           value: p5.status,             color: p5.status === 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED' ? 'text-yellow-400' : 'text-red-400' },
                { label: 'Manual Review Required', value: String(p5.manualReviewRequired), color: p5.manualReviewRequired ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Conditions Pass',        value: p5.passCount != null ? `${p5.passCount} / ${(p5.passCount ?? 0) + (p5.failCount ?? 0)}` : '—', color: 'text-white' },
                { label: 'realTradeUnlockAllowed', value: 'false',               color: 'text-emerald-400' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="text-slate-400">{r.label}</span>
                  <span className={`font-bold font-mono ${r.color}`}>{r.value ?? '—'}</span>
                </div>
              ))}

              <div className="mt-3 pt-2 text-slate-500 italic text-xs">
                Even if all 11 conditions pass, real trading requires a separate operator unlock outside this codebase. This panel is informational only.
              </div>
            </div>
          </div>

          {/* Footer timestamp */}
          <div className="text-xs text-slate-600 text-right">
            Generated: {d.generatedAt ? new Date(d.generatedAt).toLocaleString('de-DE') : '—'} · by {d.requestedBy}
          </div>

        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 py-16 text-sm">
          Click <span className="text-red-400 font-bold">Run Blocker Check</span> to evaluate all real-trade conditions.
        </div>
      )}
    </div>
  );
}