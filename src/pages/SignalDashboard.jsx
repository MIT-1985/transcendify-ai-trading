import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DECISION_CFG = {
  PAPER_SIGNAL_ONLY:    { badge: 'bg-emerald-900 text-emerald-200 border-emerald-600', label: '🟢 PAPER_SIGNAL', ring: 'border-emerald-600 bg-emerald-950/30' },
  WAIT:                 { badge: 'bg-yellow-900 text-yellow-200 border-yellow-700',    label: '🟡 WAIT',         ring: 'border-yellow-800 bg-yellow-950/20' },
  WATCH:                { badge: 'bg-slate-800 text-slate-300 border-slate-600',       label: '👁 WATCH',         ring: 'border-slate-700 bg-slate-900/30' },
  WAIT_DATA_UNAVAILABLE:{ badge: 'bg-red-950 text-red-400 border-red-800',            label: '⛔ NO_DATA',       ring: 'border-red-900 bg-red-950/20' },
};

export default function SignalDashboard() {
  const { user } = useAuth();
  const [lastScan, setLastScan] = useState(null);
  const [activeTab, setActiveTab] = useState('pairs');

  // OKX-only Phase 3 validator
  const { data: validatorData, isLoading: vLoading, refetch: vRefetch, isFetching: vFetching, error: vError } = useQuery({
    queryKey: ['phase3-okx-validator', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase3ReadOnlySignalValidator', {});
      setLastScan(new Date().toLocaleTimeString('de-DE'));
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: false,
    gcTime: 0,
  });

  // OKX data access test
  const { data: accessData, isLoading: aLoading, refetch: aRefetch, isFetching: aFetching } = useQuery({
    queryKey: ['okx-only-access', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('testOKXOnlyDataAccess', {});
      return res.data;
    },
    enabled: !!user,
    staleTime: 60000,
    refetchInterval: false,
    gcTime: 0,
  });

  const pairs          = validatorData?.pairs || [];
  const summary        = validatorData?.summary || {};
  const paperPairs     = summary.paperSignalPairs || [];
  const accessPairs    = accessData?.pairs || [];
  const allAccessReady = accessData?.summary?.readyPairs?.length === 5;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              OKX_ONLY_INTRADAY_TRADING_ENGINE
            </div>
            <h1 className="text-2xl font-black text-white">Phase 3 — OKX-Only Read-Only Signal Engine</h1>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className="text-red-400 font-bold">Kill Switch: ACTIVE</span>
              <span className="text-slate-500">·</span>
              <span className="text-red-400 font-bold">tradeAllowed: false</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400 font-bold">noOKXOrderEndpoint: true</span>
              <span className="text-slate-500">·</span>
              <span className="text-blue-400 font-bold">Polygon: REMOVED</span>
              {lastScan && <><span className="text-slate-500">·</span><span className="text-slate-400">Last scan: {lastScan}</span></>}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => { vRefetch(); aRefetch(); }}
              disabled={vFetching || vLoading || aFetching || aLoading}
              className="px-5 py-2.5 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
            >
              {(vFetching || vLoading) ? '⏳ Scanning…' : '🔄 Rescan Now'}
            </button>
          </div>
        </div>

        {/* ── Kill switch + mode banner ── */}
        <div className="bg-red-950/40 border border-red-700 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">🛑</span>
          <div className="text-xs text-red-300 leading-5">
            <strong className="text-red-400">Kill Switch ACTIVE · tradeAllowed=false · safeToTradeNow=false</strong><br />
            Engine mode: <span className="text-blue-300 font-mono">OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION</span> — No Polygon dependency. No orders placed.
          </div>
        </div>

        {/* ── Phase 3 verdict banner ── */}
        {validatorData && (
          <div className={`rounded-xl border px-5 py-3 text-xs font-bold ${
            validatorData.phase3Verdict === 'PHASE3_OKX_ONLY_VALIDATOR_OPERATIONAL'
              ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
              : validatorData.phase3Verdict === 'PHASE3_OKX_ONLY_VALIDATOR_PARTIAL'
                ? 'bg-yellow-950/40 border-yellow-700 text-yellow-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}>
            Verdict: {validatorData.phase3Verdict} · OKX pairs ready: {summary.readyPairs?.length || 0}/{5}
            {paperPairs.length > 0 && <span className="ml-3 text-emerald-400">📡 Paper signals: [{paperPairs.join(', ')}]</span>}
          </div>
        )}

        {/* ── OKX Data Access Summary ── */}
        {accessData && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {accessPairs.map(p => (
              <div key={p.pair} className={`rounded-xl border px-3 py-3 ${p.dataReady ? 'border-emerald-700 bg-emerald-950/20' : 'border-red-800 bg-red-950/20'}`}>
                <div className="font-black text-sm text-white mb-1">{p.pair}</div>
                <div className={`font-bold mb-1 ${p.dataReady ? 'text-emerald-400' : 'text-red-400'}`}>
                  {p.dataReady ? '✅ READY' : '❌ WAIT'}
                </div>
                <div className="text-slate-400 space-y-0.5">
                  <div>Ticker: {p.tickerAvailable ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}</div>
                  <div>1m: {p.okx1mAvailable ? <span className="text-emerald-400">✓ {p.candlesCount}</span> : <span className="text-red-400">✗</span>}</div>
                  <div>Trades: {p.okxTradesAvailable ? <span className="text-emerald-400">✓ {p.tradesCount}</span> : <span className="text-red-400">✗</span>}</div>
                  {p.lastPrice && <div className="text-white font-mono">${p.lastPrice?.toLocaleString()}</div>}
                </div>
              </div>
            ))}
            {aLoading && [1,2,3,4,5].map(i => <Skeleton key={i} className="h-28 bg-slate-800 rounded-xl" />)}
          </div>
        )}

        {/* ── Error ── */}
        {vError && (
          <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{vError.message}</div>
        )}

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="pairs"   className="text-xs">📊 Signal Matrix</TabsTrigger>
            <TabsTrigger value="detail"  className="text-xs">🔬 Pair Detail</TabsTrigger>
            <TabsTrigger value="engine"  className="text-xs">🛡️ Engine Info</TabsTrigger>
          </TabsList>

          {/* SIGNAL MATRIX */}
          <TabsContent value="pairs" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-300 mb-4">OKX-Only Signal Matrix</div>
              {vLoading ? (
                <Skeleton className="h-64 bg-slate-800" />
              ) : pairs.length === 0 ? (
                <div className="text-center text-slate-400 py-10">No data — click Rescan.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700">
                      <tr className="text-slate-400 text-left">
                        <th className="px-2 py-2">Pair</th>
                        <th className="px-2 py-2">Data Mode</th>
                        <th className="px-2 py-2 text-right">Price</th>
                        <th className="px-2 py-2 text-right">Spread%</th>
                        <th className="px-2 py-2">Intraday</th>
                        <th className="px-2 py-2 text-right">I-Score</th>
                        <th className="px-2 py-2">Tick</th>
                        <th className="px-2 py-2">Fee OK</th>
                        <th className="px-2 py-2 text-right font-bold">Score</th>
                        <th className="px-2 py-2">Decision</th>
                        <th className="px-2 py-2">Barriers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map(p => {
                        const dec = p.finalDecision?.recommendedAction || 'WATCH';
                        const cfg = DECISION_CFG[dec] || DECISION_CFG.WATCH;
                        const sc  = (p.score || 0) >= 65 ? 'text-emerald-400' : (p.score || 0) >= 50 ? 'text-yellow-400' : 'text-red-400';
                        return (
                          <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                            <td className="px-2 py-2 font-black text-white">{p.pair}</td>
                            <td className="px-2 py-2 text-slate-500 font-mono text-xs">
                              {p.dataMode === 'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION'
                                ? <span className="text-blue-400">OKX_ONLY</span>
                                : <span className="text-red-400">NO_DATA</span>}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300">{p.lastPrice ? `$${p.lastPrice.toLocaleString()}` : '—'}</td>
                            <td className={`px-2 py-2 text-right ${(p.spreadPct||0) < 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>{p.spreadPct ? p.spreadPct.toFixed(4) + '%' : '—'}</td>
                            <td className={`px-2 py-2 font-bold ${p.intradaySignal?.signal === 'BULLISH' ? 'text-emerald-400' : p.intradaySignal?.signal === 'NEUTRAL' ? 'text-yellow-400' : p.intradaySignal?.signal === 'BEARISH' ? 'text-red-400' : 'text-slate-500'}`}>{p.intradaySignal?.signal || '—'}</td>
                            <td className="px-2 py-2 text-right text-blue-400">{p.intradaySignal?.score ?? '—'}</td>
                            <td className={`px-2 py-2 font-bold ${p.tickConfirmation?.signal === 'BUY_PRESSURE' ? 'text-emerald-400' : p.tickConfirmation?.signal === 'SELL_PRESSURE' ? 'text-red-400' : 'text-yellow-400'}`}>{p.tickConfirmation?.signal || '—'}</td>
                            <td className={`px-2 py-2 font-bold ${p.feesDiagnostic?.feeViable ? 'text-emerald-400' : 'text-red-400'}`}>{p.feesDiagnostic ? (p.feesDiagnostic.feeViable ? '✓' : '✗') : '—'}</td>
                            <td className={`px-2 py-2 text-right font-black ${sc}`}>{p.score ?? '—'}</td>
                            <td className="px-2 py-2">
                              <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>
                            </td>
                            <td className="px-2 py-2">
                              {p.barriers?.failedNames?.length > 0
                                ? <span className="text-red-400 text-xs">{p.barriers.failedNames.slice(0,2).join(', ')}{p.barriers.failedNames.length > 2 ? ` +${p.barriers.failedNames.length - 2}` : ''}</span>
                                : p.barriers?.allPass ? <span className="text-emerald-400 text-xs">ALL PASS</span> : <span className="text-slate-500 text-xs">—</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* PAIR DETAIL */}
          <TabsContent value="detail" className="mt-4">
            {vLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-56 bg-slate-800 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pairs.map(p => <PairDetailCard key={p.pair} pair={p} />)}
              </div>
            )}
          </TabsContent>

          {/* ENGINE INFO */}
          <TabsContent value="engine" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5 space-y-4">
              <div className="text-sm font-bold text-slate-300">🛡️ OKX-Only Engine Architecture</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                {[
                  { label: 'Engine',                    value: 'OKX_ONLY_INTRADAY_TRADING_ENGINE',                      color: 'text-white' },
                  { label: 'Phase',                     value: 'PHASE_3_OKX_ONLY_READ_ONLY',                           color: 'text-blue-400' },
                  { label: 'Polygon',                   value: 'REMOVED — no Polygon dependency',                       color: 'text-red-400' },
                  { label: 'tradeAllowed',              value: 'false',                                                  color: 'text-red-400' },
                  { label: 'safeToTradeNow',            value: 'false',                                                  color: 'text-red-400' },
                  { label: 'killSwitchActive',          value: 'true',                                                   color: 'text-red-400' },
                  { label: 'noOKXOrderEndpointCalled',  value: 'true',                                                   color: 'text-emerald-400' },
                  { label: 'Data source 1',             value: 'OKX ticker (bid/ask/price)',                            color: 'text-slate-300' },
                  { label: 'Data source 2',             value: 'OKX 1m candles (300 bars)',                             color: 'text-slate-300' },
                  { label: 'Data source 3',             value: 'OKX latest trades (500)',                               color: 'text-slate-300' },
                  { label: 'Signal logic',              value: 'Intraday×0.55 + Tick×0.30 + Fee×0.15',                 color: 'text-cyan-400' },
                  { label: 'Pairs',                     value: 'BTC ETH SOL DOGE XRP',                                  color: 'text-blue-400' },
                  { label: 'Min score to signal',       value: `${55}`,                                                  color: 'text-slate-300' },
                  { label: 'Barrier count',             value: '6 (intraday, tick, fee, spread, score, not-bearish)',    color: 'text-slate-300' },
                ].map(row => (
                  <div key={row.label} className="flex items-start gap-3 bg-slate-800/30 rounded p-3 border border-slate-800">
                    <div className="text-slate-500 w-48 shrink-0">{row.label}</div>
                    <div className={`font-bold ${row.color}`}>{row.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-slate-800/30 rounded-xl p-4 border border-slate-700 text-xs text-slate-400">
                <strong className="text-slate-300">Deprecated (read-only, no longer active):</strong><br />
                testPolygonSecondMinuteAccess — feeAwarePolygonDecisionDryRun — polygonMarketData — polygonDailyCache
              </div>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

// ── Pair detail card ──────────────────────────────────────────────────────────
function PairDetailCard({ pair: p }) {
  const dec = p.finalDecision?.recommendedAction || 'WATCH';
  const cfg = DECISION_CFG[dec] || DECISION_CFG.WATCH;
  const sc  = (p.score || 0) >= 65 ? 'text-emerald-400' : (p.score || 0) >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`rounded-xl border-2 p-5 ${cfg.ring}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-black text-lg text-white">{p.pair}</span>
        <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>
      </div>

      {p.score != null && (
        <div className={`text-4xl font-black ${sc} mb-3`}>
          {p.score}<span className="text-lg text-slate-500">/100</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <InfoCell label="Data Mode"  value={p.dataMode === 'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION' ? 'OKX_ONLY' : 'NO_DATA'} ok={p.dataReady} />
        <InfoCell label="Last Price" value={p.lastPrice ? `$${p.lastPrice.toLocaleString()}` : '—'} />
        <InfoCell label="Intraday"   value={p.intradaySignal?.signal || '—'} ok={p.intradaySignal?.signal === 'BULLISH'} warn={p.intradaySignal?.signal === 'NEUTRAL'} />
        <InfoCell label="I-Score"    value={p.intradaySignal?.score ?? '—'} ok={(p.intradaySignal?.score || 0) >= 65} />
        <InfoCell label="Tick"       value={p.tickConfirmation?.signal || '—'} ok={p.tickConfirmation?.confirmed} />
        <InfoCell label="Spread"     value={p.spreadPct ? p.spreadPct.toFixed(4) + '%' : '—'} ok={(p.spreadPct || 1) < 0.03} />
        <InfoCell label="Fee Viable" value={p.feesDiagnostic?.feeViable ? 'YES' : 'NO'} ok={p.feesDiagnostic?.feeViable} />
        <InfoCell label="Candles"    value={p.okx1mCandles || '—'} ok={(p.okx1mCandles || 0) >= 100} />
      </div>

      {p.barriers?.failedNames?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.barriers.failedNames.map((b, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-red-950/50 border border-red-800 text-red-300 text-xs">{b}</span>
          ))}
        </div>
      )}
      {p.barriers?.allPass && (
        <div className="text-emerald-400 text-xs font-bold">✅ All {p.barriers.totalBarriers} barriers passed</div>
      )}

      <div className="mt-3 text-xs text-slate-600 font-mono">tradeAllowed: false · OKX_ONLY_READ_ONLY</div>
    </div>
  );
}

function InfoCell({ label, value, ok, warn }) {
  const color = ok ? 'text-emerald-400' : warn ? 'text-yellow-400' : 'text-slate-300';
  return (
    <div className="bg-slate-900/50 rounded p-2 border border-slate-800">
      <div className="text-slate-500 text-xs mb-0.5">{label}</div>
      <div className={`font-bold text-xs ${color}`}>{value}</div>
    </div>
  );
}