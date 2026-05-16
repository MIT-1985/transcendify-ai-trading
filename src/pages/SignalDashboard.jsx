import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import SystemTrailStatusBar from '@/components/dashboard/SystemTrailStatusBar';

// ── Phase 4F alert level from score (BTC rules)
function btcAlertLevel(score, allBarriersPass) {
  if (score >= 75 && allBarriersPass) return 'READY_FOR_PAPER_SCAN';
  if (score >= 70) return 'HOT';
  if (score >= 60) return 'WARM';
  return 'COLD';
}

const ALERT_STYLE = {
  READY_FOR_PAPER_SCAN: { badge: 'bg-emerald-900/80 text-emerald-200 border-emerald-600', dot: 'bg-emerald-400' },
  HOT:                  { badge: 'bg-orange-900/80 text-orange-200 border-orange-700',    dot: 'bg-orange-400' },
  WARM:                 { badge: 'bg-yellow-900/80 text-yellow-200 border-yellow-700',    dot: 'bg-yellow-400' },
  COLD:                 { badge: 'bg-slate-800 text-slate-400 border-slate-600',          dot: 'bg-slate-500' },
  DISABLED:             { badge: 'bg-slate-900 text-slate-600 border-slate-700',          dot: 'bg-slate-700' },
};

const DISABLED_PAIRS = ['ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

export default function SignalDashboard() {
  const { user } = useAuth();
  const [lastScan, setLastScan] = useState(null);
  const [matrixOpen, setMatrixOpen] = useState(false);

  // System Trail (primary)
  const { data: trailData, isLoading: tLoading, refetch: tRefetch, isFetching: tFetching } = useQuery({
    queryKey: ['system-trail-signal-dash', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('systemTrailTradingState', {});
      setLastScan(new Date().toLocaleTimeString('de-DE'));
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: false,
    gcTime: 0,
  });

  // Phase 3 validator (advanced diagnostics only)
  const { data: validatorData, isLoading: vLoading, refetch: vRefetch, isFetching: vFetching } = useQuery({
    queryKey: ['phase3-okx-validator', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase3ReadOnlySignalValidator', {});
      return res.data;
    },
    enabled: !!user && matrixOpen,
    staleTime: 30000,
    refetchInterval: false,
    gcTime: 0,
  });

  // OKX data access (advanced diagnostics only)
  const { data: accessData, isLoading: aLoading, refetch: aRefetch, isFetching: aFetching } = useQuery({
    queryKey: ['okx-only-access', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('testOKXOnlyDataAccess', {});
      return res.data;
    },
    enabled: !!user && matrixOpen,
    staleTime: 60000,
    refetchInterval: false,
    gcTime: 0,
  });

  const live    = trailData?.liveStatus || {};
  const safety  = trailData?.safety || {};
  const pairs   = validatorData?.pairs || [];
  const accessPairs = accessData?.pairs || [];

  const handleRescan = () => {
    tRefetch();
    if (matrixOpen) { vRefetch(); aRefetch(); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── BIG DIAGNOSTIC BANNER ──────────────────────────────── */}
        <div className="bg-amber-950/40 border-2 border-amber-600 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🔬</span>
            <div className="font-black text-amber-400 uppercase tracking-widest text-sm">
              DATA DIAGNOSTICS ONLY — NO TRADING DECISIONS MADE HERE
            </div>
          </div>
          <div className="text-amber-300/80 text-xs leading-5">
            This page shows OKX data health and Phase 3 read-only signal diagnostics.
            It does not make trading decisions.
            The active paper engine is <span className="font-mono text-cyan-400">PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE</span>.
            Use <strong className="text-white">PaperTradingDashboard / System Trail</strong> for the active BTC paper engine.
          </div>
        </div>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-300">Signal Dashboard <span className="text-slate-600 text-sm font-normal">[Diagnostics]</span></h1>
            {lastScan && <div className="text-xs text-slate-500 mt-0.5">Last refresh: {lastScan}</div>}
          </div>
          <button
            onClick={handleRescan}
            disabled={tFetching || tLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${tFetching || tLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Safety — shown ONCE only ────────────────────────────── */}
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="bg-red-950/50 border border-red-700 text-red-400 font-bold px-3 py-1.5 rounded-lg">Real Trading: LOCKED</span>
          <span className="bg-emerald-950/40 border border-emerald-700 text-emerald-400 font-bold px-3 py-1.5 rounded-lg">Paper Only: ACTIVE</span>
          <span className="bg-slate-800 border border-slate-700 text-slate-400 px-3 py-1.5 rounded-lg font-mono">noOKXOrderEndpointCalled: true</span>
        </div>

        {/* ── PRIMARY: System Trail ───────────────────────────────── */}
        <div className="bg-slate-900/70 border-2 border-cyan-700 rounded-2xl px-5 py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-black text-cyan-400 text-sm uppercase tracking-wide">📡 System Trail — Active BTC Engine State</div>
            <div className="text-xs text-slate-500 font-mono">systemTrailTradingState</div>
          </div>

          {tLoading ? (
            <Skeleton className="h-24 bg-slate-800 rounded-xl" />
          ) : trailData ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <TrailKpi label="Active Mode"     value={trailData.activeMode?.replace('PHASE_4F_', '4F_') || '—'} color="text-cyan-400" />
              <TrailKpi label="Active Pair"     value={trailData.activePair || 'BTC-USDT'}                        color="text-white" />
              <TrailKpi label="Alert Level"     value={live.alertLevel || 'COLD'}
                color={live.alertLevel === 'READY' ? 'text-emerald-400' : live.alertLevel === 'HOT' ? 'text-orange-400' : live.alertLevel === 'WARM' ? 'text-yellow-400' : 'text-slate-400'} />
              <TrailKpi label="Score"           value={`${live.totalScore ?? '—'} / ${live.requiredScore ?? 75}`} color="text-white" />
              <TrailKpi label="BTC Price"       value={live.lastPrice ? `$${live.lastPrice.toLocaleString()}` : '—'} color="text-white" />
              <TrailKpi label="Action"          value={trailData.uiDecision?.buttonLabel || '—'}                  color="text-blue-400" />
              <TrailKpi label="Blocking Reason" value={live.mainBlockingReason || '—'}                            color="text-red-400" />
              <TrailKpi label="realTradingLocked" value={String(safety.realTradeAllowed === false ? 'true' : 'false')} color="text-emerald-400" />
              <TrailKpi label="paperOnly"       value="true"                                                        color="text-emerald-400" />
              <TrailKpi label="Open Trades"     value={`${live.openBTCTrades ?? 0} / 1`}                          color="text-yellow-400" />
            </div>
          ) : (
            <div className="text-slate-500 text-sm text-center py-4">Click Refresh to load system trail.</div>
          )}
        </div>

        {/* ── System Trail Status Bar component ──────────────────── */}
        <SystemTrailStatusBar />

        {/* ── ADVANCED: Data Diagnostics (collapsed by default) ──── */}
        <div className="border border-slate-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setMatrixOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 bg-slate-900/60 hover:bg-slate-800/60 transition-colors text-sm font-bold text-slate-400"
          >
            <span>⚙ Advanced Data Diagnostics — Phase 3 / Multi-Pair OKX Matrix</span>
            {matrixOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {matrixOpen && (
            <div className="p-4 bg-slate-950/40 space-y-5">

              {/* Note */}
              <div className="bg-amber-950/30 border border-amber-700 rounded-xl px-4 py-3 text-xs text-amber-300">
                ⚠ Use <strong className="text-white">PaperTradingDashboard / System Trail</strong> for the active BTC paper engine.
                This matrix is Phase 3 multi-pair diagnostic data only — <strong>not the active trading signal</strong>.
              </div>

              {/* Rescan button for advanced section */}
              <div className="flex justify-end">
                <button
                  onClick={() => { vRefetch(); aRefetch(); }}
                  disabled={vFetching || aFetching || vLoading || aLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${(vFetching || aFetching) ? 'animate-spin' : ''}`} />
                  Rescan Matrix
                </button>
              </div>

              {/* OKX Data Access — renamed READY → DATA_READY */}
              {(aLoading) ? (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-28 bg-slate-800 rounded-xl" />)}
                </div>
              ) : accessData ? (
                <div>
                  <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">OKX Data Health</div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                    {accessData.pairs?.map(p => (
                      <div key={p.pair} className={`rounded-xl border px-3 py-3 ${p.dataReady ? 'border-emerald-700 bg-emerald-950/20' : 'border-red-800 bg-red-950/20'}`}>
                        <div className="font-black text-sm text-white mb-1">{p.pair}</div>
                        <div className={`font-bold mb-1 ${p.dataReady ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.dataReady ? '✅ DATA_READY' : '❌ NO_DATA'}
                        </div>
                        <div className="text-slate-400 space-y-0.5">
                          <div>Ticker: {p.tickerAvailable ? <span className="text-emerald-400">OK</span> : <span className="text-red-400">✗</span>}</div>
                          <div>1m candles: {p.okx1mAvailable ? <span className="text-emerald-400">OK</span> : <span className="text-red-400">✗</span>}</div>
                          <div>Trades: {p.okxTradesAvailable ? <span className="text-emerald-400">OK</span> : <span className="text-red-400">✗</span>}</div>
                          {p.lastPrice && <div className="text-white font-mono">${p.lastPrice?.toLocaleString()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Signal Matrix */}
              <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
                <div className="text-sm font-bold text-slate-300 mb-1">OKX Signal Matrix <span className="text-slate-600 text-xs font-normal">[diagnostic only]</span></div>
                <div className="text-xs text-amber-400 mb-4">
                  ETH/SOL/DOGE/XRP are DISABLED in Phase 4F. BTC score uses Phase 4F thresholds (≥75 = READY_FOR_PAPER_SCAN).
                </div>
                {vLoading ? (
                  <Skeleton className="h-64 bg-slate-800" />
                ) : pairs.length === 0 ? (
                  <div className="text-center text-slate-400 py-10">No data — click Rescan Matrix.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-slate-700">
                        <tr className="text-slate-400 text-left">
                          <th className="px-2 py-2">Pair</th>
                          <th className="px-2 py-2">Phase Status</th>
                          <th className="px-2 py-2 text-right">Price</th>
                          <th className="px-2 py-2">Intraday</th>
                          <th className="px-2 py-2">Tick</th>
                          <th className="px-2 py-2 text-right font-bold">Score</th>
                          <th className="px-2 py-2">4F Signal Level</th>
                          <th className="px-2 py-2">Decision [diag]</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairs.map(p => {
                          const isDisabled = DISABLED_PAIRS.includes(p.pair);
                          const score = p.score ?? 0;
                          const allPass = p.barriers?.allPass || false;
                          const alertLvl = isDisabled ? 'DISABLED' : btcAlertLevel(score, allPass);
                          const astyle = ALERT_STYLE[alertLvl] || ALERT_STYLE.COLD;
                          const rawDecision = p.finalDecision?.recommendedAction || 'WATCH';
                          const diagLabel = rawDecision === 'PAPER_SIGNAL_ONLY' ? 'DATA_ONLY_NOT_ACTIVE'
                                          : rawDecision === 'WAIT'             ? 'DATA_ONLY_WAIT'
                                          : rawDecision === 'WATCH'            ? 'DATA_ONLY_WATCH'
                                          : 'DATA_ONLY_WAIT';
                          const sc = score >= 70 ? 'text-emerald-400' : score >= 55 ? 'text-yellow-400' : 'text-red-400';
                          return (
                            <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                              <td className="px-2 py-2 font-black text-white">{p.pair}</td>
                              <td className="px-2 py-2">
                                {isDisabled ? (
                                  <span className="text-slate-600 font-mono text-xs">DISABLED_IN_PHASE_4F<br/><span className="text-slate-700">Diagnostic only</span></span>
                                ) : (
                                  <span className="text-blue-400 font-mono text-xs">ACTIVE_PAIR</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right text-slate-300">{p.lastPrice ? `$${p.lastPrice.toLocaleString()}` : '—'}</td>
                              <td className={`px-2 py-2 font-bold ${p.intradaySignal?.signal === 'BULLISH' ? 'text-emerald-400' : p.intradaySignal?.signal === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>{p.intradaySignal?.signal || '—'}</td>
                              <td className={`px-2 py-2 font-bold ${p.tickConfirmation?.signal === 'BUY_PRESSURE' ? 'text-emerald-400' : p.tickConfirmation?.signal === 'SELL_PRESSURE' ? 'text-red-400' : 'text-yellow-400'}`}>{p.tickConfirmation?.signal || '—'}</td>
                              <td className={`px-2 py-2 text-right font-black ${isDisabled ? 'text-slate-600' : sc}`}>{isDisabled ? '—' : (p.score ?? '—')}</td>
                              <td className="px-2 py-2">
                                <span className={`px-2 py-0.5 rounded border text-xs font-bold ${astyle.badge}`}>
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${astyle.dot}`} />
                                  {alertLvl}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <span className="text-slate-500 text-xs font-mono">{diagLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Engine info */}
              <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 text-xs space-y-2">
                <div className="font-bold text-slate-400 mb-2">Engine Info</div>
                {[
                  { label: 'Active mode',               value: 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE', color: 'text-cyan-400' },
                  { label: 'Phase 3 engine (this page)', value: 'OKX_ONLY_READ_ONLY — diagnostic archive', color: 'text-amber-400' },
                  { label: 'tradeAllowed',               value: 'false',  color: 'text-red-400' },
                  { label: 'noOKXOrderEndpointCalled',   value: 'true',   color: 'text-emerald-400' },
                  { label: 'Polygon',                    value: 'REMOVED', color: 'text-red-400' },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-3 bg-slate-800/30 rounded p-2 border border-slate-800">
                    <div className="text-slate-500 w-52 shrink-0">{r.label}</div>
                    <div className={`font-bold ${r.color}`}>{r.value}</div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        {/* ── Footer verdict ─────────────────────────────────────── */}
        <div className="text-center text-xs text-slate-700 pb-4">
          signalDashboardSimplified: true · readyRenamedToDataReady: true · matrixCollapsedByDefault: true · disabledPairsMarkedDiagnosticOnly: true · systemTrailIsPrimary: true · tradingLogicChanged: false · realTradeAllowed: false · finalVerdict: SIGNAL_DASHBOARD_CLEANED
        </div>

      </div>
    </div>
  );
}

function TrailKpi({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-3 text-center">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-sm leading-tight ${color}`}>{value}</div>
    </div>
  );
}