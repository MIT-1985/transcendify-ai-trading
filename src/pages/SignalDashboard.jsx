import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DECISION_CFG = {
  BUY_READY:                { badge: 'bg-emerald-900 text-emerald-200 border-emerald-600', label: '🟢 BUY_READY', ring: 'border-emerald-600 bg-emerald-950/30' },
  WAIT:                     { badge: 'bg-yellow-900 text-yellow-200 border-yellow-700',   label: '🟡 WAIT',      ring: 'border-yellow-800 bg-yellow-950/20' },
  AVOID:                    { badge: 'bg-red-900 text-red-200 border-red-700',             label: '🔴 AVOID',     ring: 'border-red-800 bg-red-950/20' },
  WAIT_POLYGON_UNAVAILABLE: { badge: 'bg-slate-800 text-slate-400 border-slate-600',      label: '⚪ NO DATA',   ring: 'border-slate-700 bg-slate-900/30' },
};

const SCAN_QUALITY_CFG = {
  FULL_SCAN:       { color: 'text-emerald-400 border-emerald-700 bg-emerald-950/30', label: '✅ FULL_SCAN' },
  PRIMARY_OK:      { color: 'text-blue-400 border-blue-700 bg-blue-950/30',          label: '🔵 PRIMARY_OK' },
  PARTIAL_PRIMARY: { color: 'text-yellow-400 border-yellow-700 bg-yellow-950/20',    label: '🟡 PARTIAL_PRIMARY' },
  DEGRADED_SCAN:   { color: 'text-orange-400 border-orange-700 bg-orange-950/20',    label: '🟠 DEGRADED_SCAN' },
  BLOCKED:         { color: 'text-red-400 border-red-700 bg-red-950/20',             label: '🔴 BLOCKED' },
};

export default function SignalDashboard() {
  const { user } = useAuth();
  const [lastScan, setLastScan] = useState(null);

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['fee-aware-polygon-engine-phase1', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('testPolygonFeeAwareSignal', {});
      if (!res.data.success) throw new Error(res.data.error || 'Scan failed');
      setLastScan(new Date().toLocaleTimeString('de-DE'));
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: false,
    gcTime: 0,
  });

  const results    = data?.results    || [];
  const top3       = data?.top3       || [];
  const constants  = data?.constants  || {};
  const bestPair   = data?.bestPair   || null;
  const sqCfg      = SCAN_QUALITY_CFG[data?.scanQuality] || SCAN_QUALITY_CFG.BLOCKED;
  const buyReady   = results.filter(r => r.decision === 'BUY_READY');

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              FEE_AWARE_POLYGON_TRADING_ENGINE
            </div>
            <h1 className="text-2xl font-black text-white">Phase 1 — Read Only Signal Engine</h1>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className="text-red-400 font-bold">Kill Switch: ACTIVE</span>
              <span className="text-slate-500">·</span>
              <span className="text-red-400 font-bold">tradeAllowed: false</span>
              <span className="text-slate-500">·</span>
              <span className="text-yellow-400 font-bold">reason: {data?.reason || 'READ_ONLY_PHASE'}</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400 font-bold">noOKXOrderEndpointCalled: true</span>
              {lastScan && <><span className="text-slate-500">·</span><span className="text-slate-400">Last scan: {lastScan}</span></>}
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching || isLoading}
            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all shrink-0"
          >
            {isFetching || isLoading ? '⏳ Scanning…' : '🔄 Rescan Now'}
          </button>
        </div>

        {/* ── Scan Quality + Key Counts ── */}
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            <div className={`col-span-2 rounded-xl border px-4 py-3 flex flex-col justify-center ${sqCfg.color}`}>
              <div className="text-slate-400 mb-1">Scan Quality</div>
              <div className="font-black text-lg">{sqCfg.label}</div>
            </div>
            <StatTile label="Pairs Requested"  value={data.pairsRequested}   color="slate" />
            <StatTile label="Polygon OK"        value={data.pairsPolygonOK}   color="emerald" />
            <StatTile label="From Cache"        value={data.pairsFromCache}   color="blue" />
            <StatTile label="Unavailable"       value={data.pairsUnavailable} color="red" />
          </div>
        )}

        {/* ── Kill Switch banner ── */}
        <div className="bg-red-950/40 border border-red-700 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">🛑</span>
          <div className="text-xs text-red-300 leading-5">
            <strong className="text-red-400">Kill Switch ACTIVE · tradeAllowed=false · reason={data?.reason || 'READ_ONLY_PHASE'}</strong><br />
            No BUY/SELL orders placed. No Polygon = No trade (no OKX fallback). noOKXOrderEndpointCalled=true.
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error.message}</div>
        )}

        {/* ── BUY_READY alert ── */}
        {buyReady.length > 0 && (
          <div className="bg-emerald-950/60 border-2 border-emerald-500 rounded-xl px-5 py-4">
            <div className="text-emerald-400 font-black text-lg mb-1">✅ {buyReady.length} pair{buyReady.length > 1 ? 's' : ''} BUY_READY</div>
            <div className="text-emerald-300 text-sm">{buyReady.map(p => p.pair).join(' · ')} — Phase 3 + kill switch disable required to execute.</div>
          </div>
        )}

        {/* ── Best Pair ── */}
        {bestPair && (
          <div className="bg-slate-900/70 border-2 border-blue-700 rounded-xl p-5">
            <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">📡 Best Pair This Scan</div>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <span className="text-3xl font-black text-white">{bestPair.pair}</span>
              <DecisionBadge decision={bestPair.decision} />
              <div className="flex gap-4">
                <ScoreChip label="Final"     value={bestPair.finalScore}         ok={bestPair.finalScore >= 70} />
                <ScoreChip label="Polygon"   value={bestPair.PolygonSignalScore} color="blue" />
                <ScoreChip label="OKX"       value={bestPair.OKXExecutionScore}  color="cyan" />
                <ScoreChip label="Constants" value={bestPair.ConstantsScore}     color="purple" />
              </div>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 text-xs mb-3">
              <MetricCell label="Polygon"    value={bestPair.polygonStatus}     ok={bestPair.polygonStatus === 'OK'} />
              <MetricCell label="Source"     value={bestPair.polygonDataSource} />
              <MetricCell label="OKX"        value={bestPair.okxStatus}         ok={bestPair.okxStatus === 'OK'} />
              <MetricCell label="Trend"      value={bestPair.trend}             ok={bestPair.trend === 'BULLISH'} warn={bestPair.trend === 'MILD_BULL'} />
              <MetricCell label="Net Profit" value={`$${(bestPair.expectedNetProfitAfterFees||0).toFixed(4)}`} ok={bestPair.expectedNetProfitAfterFees >= 0.03} />
              <MetricCell label="Momentum"   value={`${(bestPair.momentum||0).toFixed(3)}%`} ok={bestPair.momentum > 0} />
            </div>
            {bestPair.blockers?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {bestPair.blockers.map((b, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-red-950/50 border border-red-800 text-red-300 text-xs">{b}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs defaultValue="matrix" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="top3"     className="text-xs">🏆 Top 3</TabsTrigger>
            <TabsTrigger value="matrix"   className="text-xs">📊 All Pairs</TabsTrigger>
            <TabsTrigger value="constants" className="text-xs">⚙️ Constants</TabsTrigger>
            <TabsTrigger value="info"     className="text-xs">🛡️ Engine Info</TabsTrigger>
          </TabsList>

          {/* TOP 3 */}
          <TabsContent value="top3" className="mt-4">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-80 bg-slate-800 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {top3.map((p, i) => <PairCard key={p.pair} pair={p} rank={i + 1} />)}
                {top3.length === 0 && (
                  <div className="col-span-3 text-center text-slate-400 py-12">No results — click Rescan to start.</div>
                )}
              </div>
            )}
          </TabsContent>

          {/* FULL MATRIX */}
          <TabsContent value="matrix" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-300 mb-4">Full Pair Signal Matrix</div>
              {isLoading ? (
                <Skeleton className="h-64 bg-slate-800" />
              ) : results.length === 0 ? (
                <div className="text-center text-slate-400 py-10">No data — click Rescan.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700">
                      <tr className="text-slate-400 text-left">
                        <th className="px-2 py-2">Pair</th>
                        <th className="px-2 py-2">Poly</th>
                        <th className="px-2 py-2">Source</th>
                        <th className="px-2 py-2">Cache</th>
                        <th className="px-2 py-2">OKX</th>
                        <th className="px-2 py-2">Trend</th>
                        <th className="px-2 py-2 text-right">Mom%</th>
                        <th className="px-2 py-2 text-right">VolΔ</th>
                        <th className="px-2 py-2 text-right">Volat%</th>
                        <th className="px-2 py-2 text-right">Bid</th>
                        <th className="px-2 py-2 text-right">Spread%</th>
                        <th className="px-2 py-2 text-right">NetProfit</th>
                        <th className="px-2 py-2 text-right text-blue-400">PolyScore</th>
                        <th className="px-2 py-2 text-right text-cyan-400">OKXScore</th>
                        <th className="px-2 py-2 text-right text-purple-400">CstScore</th>
                        <th className="px-2 py-2 text-right font-bold">Final</th>
                        <th className="px-2 py-2">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map(p => {
                        const cfg = DECISION_CFG[p.decision] || DECISION_CFG.WAIT;
                        const sc  = p.finalScore >= 70 ? 'text-emerald-400' : p.finalScore >= 50 ? 'text-yellow-400' : 'text-red-400';
                        return (
                          <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                            <td className="px-2 py-2 font-bold text-white">{p.pair}</td>
                            <td className={`px-2 py-2 font-bold ${p.polygonStatus === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>{p.polygonStatus === 'OK' ? '✓' : '✗'}</td>
                            <td className="px-2 py-2 text-slate-400 text-xs">{p.polygonDataSource === 'CACHE_DAILY_BARS' ? '💾 CACHE' : p.polygonDataSource === 'POLYGON_DAILY_BARS' ? '🌐 LIVE' : '—'}</td>
                            <td className="px-2 py-2 text-slate-500 text-xs">{p.cacheAgeSeconds != null ? `${p.cacheAgeSeconds}s` : '—'}</td>
                            <td className={`px-2 py-2 font-bold ${p.okxStatus === 'OK' ? 'text-emerald-400' : 'text-slate-500'}`}>{p.okxStatus === 'OK' ? '✓' : '—'}</td>
                            <td className={`px-2 py-2 text-xs font-bold ${p.trend === 'BULLISH' ? 'text-emerald-400' : p.trend === 'MILD_BULL' ? 'text-yellow-400' : p.trend === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>{p.trend}</td>
                            <td className={`px-2 py-2 text-right ${p.momentum > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.momentum?.toFixed(2)}%</td>
                            <td className={`px-2 py-2 text-right ${p.volumeDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.volumeDelta?.toFixed(3)}</td>
                            <td className="px-2 py-2 text-right text-slate-400">{p.volatility?.toFixed(2)}%</td>
                            <td className="px-2 py-2 text-right text-slate-400">${p.bid?.toFixed(2) || '—'}</td>
                            <td className={`px-2 py-2 text-right ${(p.spreadPct||0) < 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>{p.spreadPct?.toFixed(4)}%</td>
                            <td className={`px-2 py-2 text-right font-bold ${p.expectedNetProfitAfterFees >= 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>${p.expectedNetProfitAfterFees?.toFixed(4)}</td>
                            <td className="px-2 py-2 text-right text-blue-400">{p.PolygonSignalScore?.toFixed(0)}</td>
                            <td className="px-2 py-2 text-right text-cyan-400">{p.OKXExecutionScore?.toFixed(0)}</td>
                            <td className="px-2 py-2 text-right text-purple-400">{p.ConstantsScore?.toFixed(0)}</td>
                            <td className={`px-2 py-2 text-right font-black ${sc}`}>{p.finalScore?.toFixed(1)}</td>
                            <td className="px-2 py-2">
                              <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>
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

          {/* CONSTANTS */}
          <TabsContent value="constants" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <div className="text-sm font-bold text-slate-300 mb-1">⚙️ Optimizing Constants — Phase 1</div>
              <div className="text-xs text-slate-500 mb-4">FinalScore = PolygonSignalScore × 0.65 + OKXExecutionScore × 0.35</div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {Object.entries(constants).map(([k, v]) => (
                  <div key={k} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <div className="text-slate-400 text-xs mb-2 font-mono">{k}</div>
                    <div className="text-cyan-400 font-black text-xl">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ENGINE INFO */}
          <TabsContent value="info" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5 space-y-4">
              <div className="text-sm font-bold text-slate-300">🛡️ Engine Architecture</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                {[
                  { label: 'Engine', value: 'FEE_AWARE_POLYGON_TRADING_ENGINE', color: 'text-white' },
                  { label: 'Phase',  value: 'PHASE_1_READ_ONLY_SIGNAL_ENGINE',  color: 'text-blue-400' },
                  { label: 'tradeAllowed', value: 'false', color: 'text-red-400' },
                  { label: 'killSwitchActive', value: 'true', color: 'text-red-400' },
                  { label: 'noOKXOrderEndpointCalled', value: 'true', color: 'text-emerald-400' },
                  { label: 'Polygon source', value: '1d daily bars (30 candles)', color: 'text-slate-300' },
                  { label: 'Request delay', value: '900ms between Polygon calls', color: 'text-slate-300' },
                  { label: 'Retry policy', value: '2 retries, 2500ms wait on 429', color: 'text-slate-300' },
                  { label: 'Cache TTL', value: '5 minutes per symbol', color: 'text-slate-300' },
                  { label: 'Primary pairs', value: 'BTC ETH SOL DOGE XRP', color: 'text-blue-400' },
                  { label: 'Secondary pairs', value: 'BNB ADA LINK AVAX LTC', color: 'text-slate-400' },
                  { label: 'FinalScore formula', value: 'Polygon×0.65 + OKX×0.35', color: 'text-cyan-400' },
                  { label: 'OKX calls', value: 'Market ticker only — no orders', color: 'text-emerald-400' },
                  { label: 'scanQuality', value: data?.scanQuality || '—', color: sqCfg.color.split(' ')[0] },
                ].map(row => (
                  <div key={row.label} className="flex items-start gap-3 bg-slate-800/30 rounded p-3 border border-slate-800">
                    <div className="text-slate-500 w-44 shrink-0">{row.label}</div>
                    <div className={`font-bold ${row.color}`}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

// ── Pair detail card ──────────────────────────────────────────────────────────
function PairCard({ pair: p, rank }) {
  const cfg = DECISION_CFG[p.decision] || DECISION_CFG.WAIT;
  const sc  = p.finalScore >= 70 ? 'text-emerald-400' : p.finalScore >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`rounded-xl border-2 p-5 ${cfg.ring}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs font-bold">#{rank}</span>
          <span className="font-black text-lg text-white">{p.pair}</span>
        </div>
        <DecisionBadge decision={p.decision} />
      </div>

      <div className={`text-4xl font-black ${sc} mb-1`}>
        {p.finalScore?.toFixed(1)}<span className="text-lg text-slate-500">/100</span>
      </div>
      <div className="flex gap-3 text-xs mb-4">
        <span className="text-blue-400">P:{p.PolygonSignalScore?.toFixed(0)}</span>
        <span className="text-cyan-400">O:{p.OKXExecutionScore?.toFixed(0)}</span>
        <span className="text-purple-400">C:{p.ConstantsScore?.toFixed(0)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <MetricCell label="Polygon"   value={p.polygonStatus}   ok={p.polygonStatus === 'OK'} />
        <MetricCell label="Source"    value={p.polygonDataSource === 'CACHE_DAILY_BARS' ? '💾 Cache' : p.polygonDataSource === 'POLYGON_DAILY_BARS' ? '🌐 Live' : '—'} />
        <MetricCell label="OKX"       value={p.okxStatus}       ok={p.okxStatus === 'OK'} />
        <MetricCell label="Trend"     value={p.trend}           ok={p.trend === 'BULLISH'} warn={p.trend === 'MILD_BULL'} />
        <MetricCell label="NetProfit" value={`$${(p.expectedNetProfitAfterFees||0).toFixed(4)}`} ok={p.expectedNetProfitAfterFees >= 0.03} />
        <MetricCell label="Spread"    value={`${(p.spreadPct||0).toFixed(4)}%`} ok={(p.spreadPct||0) < 0.03} />
      </div>

      {p.blockers?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.blockers.map((b, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded bg-red-950/50 border border-red-800 text-red-300 text-xs">{b}</span>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-600 font-mono">tradeAllowed: false · READ_ONLY_PHASE</div>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function DecisionBadge({ decision }) {
  const cfg = DECISION_CFG[decision] || DECISION_CFG.WAIT;
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>;
}

function ScoreChip({ label, value = 0, ok, color = 'emerald' }) {
  const colorMap = { emerald: ok ? 'text-emerald-400' : 'text-yellow-400', blue: 'text-blue-400', cyan: 'text-cyan-400', purple: 'text-purple-400' };
  return (
    <div className="text-center">
      <div className="text-slate-500 text-xs">{label}</div>
      <div className={`font-black text-xl ${colorMap[color]}`}>{value?.toFixed ? value.toFixed(1) : value}</div>
    </div>
  );
}

function MetricCell({ label, value, ok, bad, warn }) {
  const color = ok ? 'text-emerald-400' : bad ? 'text-red-400' : warn ? 'text-yellow-400' : 'text-slate-300';
  return (
    <div className="bg-slate-900/50 rounded p-2 border border-slate-800">
      <div className="text-slate-500 text-xs mb-0.5">{label}</div>
      <div className={`font-bold text-xs ${color}`}>{value}</div>
    </div>
  );
}

function StatTile({ label, value, color = 'slate' }) {
  const colorMap = { slate: 'text-slate-300', emerald: 'text-emerald-400', blue: 'text-blue-400', red: 'text-red-400' };
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={`font-black text-2xl ${colorMap[color]}`}>{value}</div>
    </div>
  );
}