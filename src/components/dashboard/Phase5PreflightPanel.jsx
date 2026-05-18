import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, XCircle, ShieldCheck, RefreshCw } from 'lucide-react';

function CheckRow({ check }) {
  const passed = check.passed;
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs ${
      passed
        ? 'bg-emerald-950/20 border-emerald-800/60'
        : 'bg-red-950/30 border-red-700'
    }`}>
      <span className="mt-0.5 shrink-0">
        {passed
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          : <XCircle className="w-3.5 h-3.5 text-red-400" />
        }
      </span>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold ${passed ? 'text-slate-200' : 'text-red-300'}`}>{check.label}</div>
        <div className="text-slate-400 mt-0.5 flex flex-wrap gap-2">
          <span>Actual: <span className="font-mono text-white">{Array.isArray(check.actual) ? check.actual.join(', ') : String(check.actual)}</span></span>
          {check.required !== undefined && (
            <span>Required: <span className="font-mono text-cyan-400">{Array.isArray(check.required) ? check.required.join(', ') : String(check.required)}</span></span>
          )}
          {check.note && <span className="text-amber-400">{check.note}</span>}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, ok, sub }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${
      ok === true  ? 'bg-emerald-950/20 border-emerald-800' :
      ok === false ? 'bg-red-950/20 border-red-800' :
                     'bg-slate-900/60 border-slate-700'
    }`}>
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-xs leading-tight ${
        ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-white'
      }`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function KpiBox({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-3 text-center">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-sm leading-tight ${color}`}>{value}</div>
    </div>
  );
}

export default function Phase5PreflightPanel() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('phase5Preflight', {});
    if (res.data?.finalVerdict) {
      setData(res.data);
    } else {
      setError('Unexpected response from preflight function');
    }
    setLoading(false);
  };

  const m = data?.liveMarket ?? {};

  return (
    <div className="space-y-4">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-slate-950 border-2 border-cyan-700 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-1">
              PHASE 5 — MANUAL REAL TEST PREFLIGHT
            </div>
            <p className="text-xs text-slate-400">
              Read-only check. No order placed. No OKX order endpoint called.
            </p>
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-all shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Running…' : 'Run Preflight'}
          </button>
        </div>
        {/* Safety badges */}
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          <span className="bg-red-950/60 border border-red-700 text-red-400 font-black px-2 py-1 rounded-lg">🛑 Kill Switch: ACTIVE</span>
          <span className="bg-red-950/60 border border-red-700 text-red-400 font-bold px-2 py-1 rounded-lg">realTradeAllowed: false</span>
          <span className="bg-red-950/60 border border-red-700 text-red-400 font-bold px-2 py-1 rounded-lg">autoTradingAllowed: false</span>
          <span className="bg-amber-950/40 border border-amber-700 text-amber-400 font-bold px-2 py-1 rounded-lg">manualConfirmRequired: true</span>
          <span className="bg-slate-800 border border-slate-700 text-slate-400 font-bold px-2 py-1 rounded-lg">placeOrderCalled: false</span>
          <span className="bg-cyan-950/30 border border-cyan-700 text-cyan-400 font-bold px-2 py-1 rounded-lg">BTC-USDT only</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-700 rounded-xl px-4 py-3 text-xs text-red-300">{error}</div>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 text-sm py-8">
          Click <span className="text-white font-bold">Run Preflight</span> to verify Phase 5 safety configuration.
        </div>
      )}

      {data && (
        <>
          {/* ── Verdict banner ─────────────────────────────────── */}
          <div className={`rounded-2xl border-2 px-5 py-5 ${
            data.preflightPassed
              ? 'bg-emerald-950/30 border-emerald-600'
              : 'bg-red-950/40 border-red-600'
          }`}>
            <div className="flex items-center gap-3">
              {data.preflightPassed
                ? <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
                : <XCircle className="w-8 h-8 text-red-400 shrink-0" />
              }
              <div>
                <div className={`text-lg font-black ${data.preflightPassed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.preflightPassed ? '✅ PREFLIGHT PASSED' : '❌ PREFLIGHT FAILED'}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{data.finalVerdict}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {data.passCount}/{data.totalChecks} checks passed · {data.failCount} failed ·
                  Generated: {new Date(data.generatedAt).toLocaleString('de-DE')}
                </div>
              </div>
            </div>
          </div>

          {/* ── Requested return values ─────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-5 py-4">
            <div className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3">📋 Preflight Return Values</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs font-mono">
              {[
                { k: 'preflightPassed',         v: String(data.preflightPassed),          ok: data.preflightPassed },
                { k: 'placeOrderCalled',         v: String(data.placeOrderCalled),          ok: !data.placeOrderCalled },
                { k: 'closeOrderCalled',         v: String(data.closeOrderCalled),          ok: !data.closeOrderCalled },
                { k: 'readOnlyCheckPassed',      v: String(data.readOnlyCheckPassed),       ok: data.readOnlyCheckPassed },
                { k: 'confirmCodeRequired',      v: String(data.confirmCodeRequired),       ok: data.confirmCodeRequired },
                { k: 'manualOnly',               v: String(data.manualOnly),                ok: data.manualOnly },
                { k: 'autoTradingAllowed',       v: String(data.autoTradingAllowed),        ok: !data.autoTradingAllowed },
                { k: 'backgroundTradingAllowed', v: String(data.backgroundTradingAllowed),  ok: !data.backgroundTradingAllowed },
                { k: 'maxRealTestSizeUSDT',      v: String(data.maxRealTestSizeUSDT),       ok: data.maxRealTestSizeUSDT === 10 },
                { k: 'defaultTestSizeUSDT',      v: String(data.defaultTestSizeUSDT),       ok: data.defaultTestSizeUSDT === 5 },
                { k: 'maxOpenRealTrades',        v: String(data.maxOpenRealTrades),         ok: data.maxOpenRealTrades === 1 },
                { k: 'killSwitchActive',         v: String(data.killSwitchActive),          ok: data.killSwitchActive },
              ].map(({ k, v, ok }) => (
                <div key={k} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  ok ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-red-950/30 border-red-700'
                }`}>
                  {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  <div>
                    <div className="text-slate-500 text-xs leading-tight">{k}</div>
                    <div className={`font-bold text-xs ${ok ? 'text-emerald-300' : 'text-red-300'}`}>{v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Live market snapshot ─────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <KpiBox label="BTC Price"    value={m.lastPrice ? `$${m.lastPrice.toLocaleString()}` : '—'} />
            <KpiBox label="Alert"        value={m.alertLevel || '—'}
              color={m.alertLevel === 'READY' ? 'text-emerald-400' : m.alertLevel === 'HOT' ? 'text-orange-400' : m.alertLevel === 'WARM' ? 'text-yellow-400' : 'text-slate-400'} />
            <KpiBox label="Score"        value={`${m.totalScore ?? '—'} / 75`}
              color={m.totalScore >= 75 ? 'text-emerald-400' : m.totalScore >= 60 ? 'text-yellow-400' : 'text-red-400'} />
            <KpiBox label="TP"           value={m.tpPrice ? `$${m.tpPrice}` : '—'} color="text-emerald-400" />
            <KpiBox label="SL"           value={m.slPrice ? `$${m.slPrice}` : '—'} color="text-red-400" />
            <KpiBox label="Est. Qty"     value={m.estQty ? `${m.estQty} BTC` : '—'} color="text-cyan-400" />
            <KpiBox label="Est. Fees"    value={m.estFees ? `~${m.estFees} USDT` : '—'} color="text-yellow-400" />
            <KpiBox label="Risk/Reward"  value={m.riskReward ? `1 : ${m.riskReward}` : '—'} color="text-blue-400" />
          </div>

          {/* ── System status ────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatusCard
              label="System Trail"
              value={data.systemTrailStatus}
              ok={null}
              sub={`Alert: ${data.alertLevel} · Score: ${data.totalScore}`}
            />
            <StatusCard
              label="Phase 5 Guard"
              value={data.phase5GuardStatus}
              ok={data.phase5GuardStatus !== 'LOCKED'}
            />
            <StatusCard
              label="Hard Blocker"
              value={data.hardBlockerStatus}
              ok={data.hardBlockerStatus !== 'REAL_TRADING_BLOCKED'}
            />
          </div>

          {/* ── Full checklist ───────────────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-2xl px-5 py-4">
            <div className="text-xs font-black text-slate-300 uppercase tracking-widest mb-3">
              🔍 Full Preflight Checklist ({data.passCount}/{data.totalChecks} passed)
            </div>
            <div className="space-y-2">
              {data.checks?.map(c => <CheckRow key={c.id} check={c} />)}
            </div>
          </div>

          {/* ── Failed checks (if any) ───────────────────────────── */}
          {data.failedChecks?.length > 0 && (
            <div className="bg-red-950/30 border-2 border-red-700 rounded-2xl px-5 py-4">
              <div className="text-xs font-black text-red-400 uppercase tracking-widest mb-3">
                ❌ Failed Checks ({data.failedChecks.length})
              </div>
              <div className="space-y-2">
                {data.failedChecks.map(c => <CheckRow key={c.id} check={{ ...c, passed: false }} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}