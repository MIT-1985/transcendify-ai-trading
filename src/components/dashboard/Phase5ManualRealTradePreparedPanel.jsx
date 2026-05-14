import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const SCORE_COLORS = {
  COLD:  'text-slate-400',
  WARM:  'text-yellow-400',
  HOT:   'text-orange-400',
  READY: 'text-emerald-400',
};

function CheckRow({ check }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-300">{check.label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-slate-400">{String(check.actual)}</span>
        <span className={`text-xs font-black ${check.passed ? 'text-emerald-400' : 'text-red-400'}`}>
          {check.passed ? '✅' : '❌'}
        </span>
      </div>
    </div>
  );
}

function ConditionRow({ cond, passed }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
      passed
        ? 'bg-emerald-950/20 border-emerald-800 text-emerald-300'
        : 'bg-red-950/20 border-red-800 text-red-300'
    }`}>
      <span className="mt-0.5 shrink-0">{passed ? '✅' : '❌'}</span>
      <div>
        <div className="font-semibold">{cond.label}</div>
        <div className="text-slate-400 mt-0.5">
          Actual: <span className="font-mono text-white">{String(cond.actual ?? cond.actual)}</span>
          {cond.required !== undefined && (
            <> · Required: <span className="font-mono text-cyan-400">{String(cond.required)}</span></>
          )}
          {cond.note && <> · <span className="text-amber-400">{cond.note}</span></>}
        </div>
      </div>
    </div>
  );
}

export default function Phase5ManualRealTradePreparedPanel() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase5ManualRealTradePrepared', {});
    if (res.data?.finalVerdict) {
      setData(res.data);
    } else {
      setError('Unexpected response');
    }
    setLoading(false);
  };

  const cfg  = data?.config ?? {};
  const mkt  = data?.liveMarket ?? {};
  const tpPrice = mkt.lastPrice ? (mkt.lastPrice * (1 + cfg.tpPercent / 100)).toFixed(2) : '—';
  const slPrice = mkt.lastPrice ? (mkt.lastPrice * (1 - cfg.slPercent / 100)).toFixed(2) : '—';
  const scoreColor = SCORE_COLORS[mkt.alertLevel ?? 'COLD'] ?? 'text-slate-400';

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="bg-slate-950 border-2 border-red-700 rounded-2xl px-5 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-red-400 uppercase tracking-widest mb-1">
              🔒 PHASE_5_MANUAL_CONFIRM_PREPARED_LOCKED
            </div>
            <h2 className="text-xl font-black text-white">Manual Real BTC Test Trade — Locked</h2>
            <p className="text-xs text-slate-400 mt-1">
              Preparation complete. <strong className="text-white">No real order will be placed</strong> until manual operator review and explicit unlock.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-all shrink-0"
          >
            {loading ? '⏳ Loading…' : '🔍 Load Status'}
          </button>
        </div>

        {/* Safety badges */}
        <div className="flex flex-wrap gap-2 mt-4 text-xs">
          <span className="bg-red-950/60 border border-red-700 text-red-400 font-black px-2 py-1 rounded-lg">🛑 Kill Switch: ACTIVE</span>
          <span className="bg-red-950/60 border border-red-700 text-red-400 font-bold px-2 py-1 rounded-lg">realTradeAllowed: false</span>
          <span className="bg-red-950/60 border border-red-700 text-red-400 font-bold px-2 py-1 rounded-lg">autoTradingAllowed: false</span>
          <span className="bg-amber-950/40 border border-amber-700 text-amber-400 font-bold px-2 py-1 rounded-lg">manualConfirmRequired: true</span>
          <span className="bg-slate-800 border border-slate-700 text-slate-400 font-bold px-2 py-1 rounded-lg">okxOrderEndpointCalled: false</span>
          <span className="bg-cyan-950/30 border border-cyan-700 text-cyan-400 font-bold px-2 py-1 rounded-lg">BTC-USDT only</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-700 rounded-xl px-4 py-3 text-xs text-red-300">{error}</div>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 text-sm py-8">
          Click <span className="text-white font-bold">Load Status</span> to inspect Phase 5 preparation state.
        </div>
      )}

      {data && (
        <>
          {/* ── Planned Trade Config ────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">BTC Price</div>
              <div className="font-black text-xl text-white">${mkt.lastPrice?.toLocaleString() ?? '—'}</div>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-800 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">TP %</div>
              <div className="font-black text-xl text-emerald-400">{cfg.tpPercent}%</div>
              <div className="text-emerald-600 text-xs mt-0.5">≈ ${tpPrice}</div>
            </div>
            <div className="bg-red-950/30 border border-red-800 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">SL %</div>
              <div className="font-black text-xl text-red-400">{cfg.slPercent}%</div>
              <div className="text-red-600 text-xs mt-0.5">≈ ${slPrice}</div>
            </div>
            <div className="bg-cyan-950/30 border border-cyan-800 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Planned Size</div>
              <div className="font-black text-xl text-cyan-400">{cfg.plannedTestSizeUSDT} USDT</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Max Test Size</div>
              <div className="font-black text-xl text-yellow-400">{cfg.maxTestSizeUSDT} USDT</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Score</div>
              <div className={`font-black text-xl ${scoreColor}`}>{mkt.totalScore ?? '—'}</div>
              <div className="text-slate-500 text-xs">{mkt.alertLevel}</div>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-3">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Required</div>
              <div className="font-black text-xl text-purple-400">≥{cfg.requiredScore}</div>
            </div>
          </div>

          {/* ── System Status Row ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className={`rounded-xl border px-4 py-3 ${
              data.systemTrailStatus === 'SYSTEM_TRAIL_SINGLE_SOURCE_OF_TRUTH_ACTIVE'
                ? 'bg-emerald-950/20 border-emerald-800'
                : 'bg-slate-900/60 border-slate-700'
            }`}>
              <div className="text-slate-500 uppercase tracking-wide mb-1">System Trail</div>
              <div className="font-black text-white text-xs leading-tight">{data.systemTrailStatus}</div>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${
              data.phase5GuardStatus === 'LOCKED'
                ? 'bg-red-950/20 border-red-800'
                : 'bg-emerald-950/20 border-emerald-800'
            }`}>
              <div className="text-slate-500 uppercase tracking-wide mb-1">Phase 5 Guard</div>
              <div className={`font-black ${data.phase5GuardStatus === 'LOCKED' ? 'text-red-400' : 'text-emerald-400'}`}>
                {data.phase5GuardStatus}
              </div>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${
              data.hardBlockerStatus === 'REAL_TRADING_BLOCKED'
                ? 'bg-red-950/20 border-red-800'
                : 'bg-emerald-950/20 border-emerald-800'
            }`}>
              <div className="text-slate-500 uppercase tracking-wide mb-1">Hard Blocker</div>
              <div className={`font-black text-xs leading-tight ${data.hardBlockerStatus === 'REAL_TRADING_BLOCKED' ? 'text-red-400' : 'text-emerald-400'}`}>
                {data.hardBlockerStatus}
              </div>
            </div>
          </div>

          {/* ── Safety Checklist ────────────────────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-5 py-4">
            <div className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3">🛡 Safety Checklist</div>
            {(data.readinessChecks ?? []).map(c => <CheckRow key={c.id} check={c} />)}
          </div>

          {/* ── Failed Unlock Conditions ─────────────────────────────────── */}
          {(data.futureUnlockRequirements?.length > 0) && (
            <div className="bg-slate-900/60 border border-amber-800 rounded-2xl px-5 py-4">
              <div className="text-xs font-black text-amber-400 uppercase tracking-widest mb-3">
                🔓 Conditions Required Before Phase 5 Unlock ({data.futureUnlockRequirements.length} failed)
              </div>
              <div className="space-y-2">
                {data.futureUnlockRequirements.map(c => (
                  <ConditionRow key={c.id} cond={c} passed={false} />
                ))}
              </div>
            </div>
          )}

          {/* ── Emergency Stop Notice ────────────────────────────────────── */}
          <div className="bg-red-950/30 border-2 border-red-700 rounded-2xl px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🚨</span>
              <div>
                <div className="text-red-400 font-black text-sm mb-1">Emergency Stop — Always Available</div>
                <div className="text-xs text-red-300/80 space-y-1">
                  <div>• Kill switch is permanently active until manually disabled by operator</div>
                  <div>• Max 1 real open trade — no automatic repeat</div>
                  <div>• No real trade if System Trail ≠ READY or score &lt; 75</div>
                  <div>• No real trade if SELL_PRESSURE detected</div>
                  <div>• No real trade if Phase5Guard = LOCKED</div>
                  <div>• All OKX order endpoints remain uncalled</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── DISABLED Trade Button (for visual reference) ─────────────── */}
          <div className="bg-slate-900/70 border-2 border-slate-700 rounded-2xl px-5 py-5 text-center">
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-3">Manual Real Trade Button — Preview (Disabled)</div>
            <button
              disabled
              className="px-8 py-3 text-sm font-black rounded-xl bg-slate-800 border-2 border-slate-600 text-slate-500 cursor-not-allowed opacity-60"
            >
              🔒 EXECUTE REAL BTC TEST TRADE (5 USDT) — LOCKED
            </button>
            <div className="text-xs text-slate-600 mt-2">
              Unlocks only after: manual operator review + Phase 5 Guard PASS + realTradeUnlockAllowed = true
            </div>
          </div>

          {/* ── Final Verdict ────────────────────────────────────────────── */}
          <div className="bg-cyan-950/20 border-2 border-cyan-700 rounded-2xl px-5 py-4 flex items-center gap-4">
            <span className="text-3xl">🔒</span>
            <div>
              <div className="text-cyan-400 font-black">{data.finalVerdict}</div>
              <div className="text-cyan-300/70 text-xs mt-1">{data.verdictNote}</div>
              <div className="text-slate-500 text-xs mt-1 font-mono">Generated: {new Date(data.generatedAt).toLocaleString('de-DE')}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}