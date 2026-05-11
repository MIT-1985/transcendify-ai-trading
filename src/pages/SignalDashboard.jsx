import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DECISION_CONFIG = {
  BUY_READY:                { badge: 'bg-emerald-800 text-emerald-200 border-emerald-600', ring: 'border-emerald-600 bg-emerald-950/40', label: '🟢 BUY READY' },
  WAIT:                     { badge: 'bg-yellow-900 text-yellow-200 border-yellow-700',   ring: 'border-yellow-800 bg-yellow-950/20',  label: '🟡 WAIT' },
  AVOID:                    { badge: 'bg-red-900 text-red-200 border-red-700',             ring: 'border-red-800 bg-red-950/20',        label: '🔴 AVOID' },
  WAIT_POLYGON_UNAVAILABLE: { badge: 'bg-slate-800 text-slate-300 border-slate-600',      ring: 'border-slate-700 bg-slate-900/40',    label: '⚪ NO POLYGON' },
};

export default function SignalDashboard() {
  const { user } = useAuth();
  const [lastScan, setLastScan] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['fee-aware-polygon-engine-phase1', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('testPolygonFeeAwareSignal', {});
      if (!res.data.success) throw new Error(res.data.error || 'Scan failed');
      setLastScan(new Date().toLocaleTimeString('de-DE'));
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000,
    gcTime: 0
  });

  const allPairs    = data?.allPairs || [];
  const top3        = data?.top3Opportunities || [];
  const summary     = data?.summary || {};
  const constants   = data?.constants || {};
  const riskGuard   = data?.riskGuard || {};
  const bestPair    = data?.bestPair || null;
  const buyReady    = allPairs.filter(p => p.decision === 'BUY_READY');

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Engine Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">FEE_AWARE_POLYGON_TRADING_ENGINE</div>
            <h1 className="text-2xl font-black text-white">Phase 1 — Read Only Signal Engine</h1>
            <div className="text-xs text-slate-400 mt-1">
              Kill Switch: <span className="text-red-400 font-bold">ACTIVE</span> &nbsp;·&nbsp;
              tradeAllowed: <span className="text-red-400 font-bold">false</span> &nbsp;·&nbsp;
              reason: <span className="text-yellow-400 font-bold">READ_ONLY_PHASE</span> &nbsp;·&nbsp;
              Last scan: {lastScan || '...'}
            </div>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <span className="px-2 py-1 rounded text-xs bg-emerald-900/50 border border-emerald-700 text-emerald-400 font-bold">BUY_READY: {summary.buyReady ?? 0}</span>
            <span className="px-2 py-1 rounded text-xs bg-yellow-900/30 border border-yellow-700 text-yellow-400">WAIT: {summary.wait ?? 0}</span>
            <span className="px-2 py-1 rounded text-xs bg-red-900/30 border border-red-700 text-red-400">AVOID: {summary.avoid ?? 0}</span>
            <span className="px-2 py-1 rounded text-xs bg-slate-800 border border-slate-600 text-slate-400">NO POLYGON: {summary.polygonUnavailable ?? 0}</span>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
            >
              {isFetching ? '⏳ Scanning...' : '🔄 Rescan'}
            </button>
          </div>
        </div>

        {/* ── Architecture pillars banner ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          {[
            { num: '1', label: 'Polygon Signal Engine', icon: '🧠', color: 'border-blue-700 text-blue-400', status: `${summary.polygonOk ?? 0}/${summary.pairsScanned ?? 0} OK` },
            { num: '2', label: 'Optimizing Constants', icon: '⚙️', color: 'border-purple-700 text-purple-400', status: `K_SCORE=${constants.K_SCORE}` },
            { num: '3', label: 'OKX Execution Engine', icon: '⚡', color: 'border-cyan-700 text-cyan-400', status: 'READ ONLY' },
            { num: '4', label: 'Risk Guard', icon: '🛡️', color: 'border-red-700 text-red-400', status: riskGuard.blockReason || 'ACTIVE' },
            { num: '5', label: 'Dashboard Proof', icon: '📊', color: 'border-emerald-700 text-emerald-400', status: 'LIVE' },
          ].map(p => (
            <div key={p.num} className={`rounded-xl border p-3 bg-slate-900/50 ${p.color}`}>
              <div className="text-lg mb-1">{p.icon}</div>
              <div className={`font-bold text-xs ${p.color.split(' ')[1]}`}>{p.label}</div>
              <div className="text-slate-500 text-xs mt-1">{p.status}</div>
            </div>
          ))}
        </div>

        {/* ── Kill Switch / No Trade warning ── */}
        <div className="bg-red-950/40 border border-red-700 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">🛑</span>
          <div className="text-xs text-red-300 leading-5">
            <strong className="text-red-400">Kill Switch ACTIVE · tradeAllowed = false · reason = READ_ONLY_PHASE.</strong><br />
            No BUY or SELL orders will be placed. No Polygon = No trade (no OKX fallback).
            Phase 3 requires your manual approval AND kill switch disable.
          </div>
        </div>

        {/* ── Best Pair highlight ── */}
        {bestPair && (
          <div className="bg-slate-900/70 border-2 border-blue-700 rounded-xl p-5">
            <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">📡 Best Pair This Scan</div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-3xl font-black text-white">{bestPair.pair}</div>
              <DecisionBadge decision={bestPair.decision} />
              <div className="flex gap-4 text-xs">
                <ScoreChip label="Final" value={bestPair.finalScore} maxOk={70} />
                <ScoreChip label="Polygon" value={bestPair.PolygonSignalScore} maxOk={65} color="blue" />
                <ScoreChip label="OKX" value={bestPair.OKXExecutionScore} maxOk={65} color="cyan" />
                <ScoreChip label="Constants" value={bestPair.ConstantsScore} maxOk={70} color="purple" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <Metric label="Polygon" value={bestPair.polygonStatus} ok={bestPair.polygonStatus === 'OK'} />
              <Metric label="Data Source" value={bestPair.polygonDataSource} />
              <Metric label="OKX Status" value={bestPair.okxStatus} ok={bestPair.okxStatus === 'OK'} />
              <Metric label="Trend" value={bestPair.trend} ok={bestPair.trend === 'BULLISH'} warn={bestPair.trend === 'MILD_BULL'} />
              <Metric label="Net Profit" value={`$${parseFloat(bestPair.expectedNetProfitAfterFees || 0).toFixed(4)}`} ok={bestPair.expectedNetProfitAfterFees >= 0.03} />
              <Metric label="Candles" value={`${data?.allPairs?.find(p => p.pair === bestPair.pair)?.candlesCount ?? '?'}d`} />
            </div>
            {bestPair.reason && (
              <div className="mt-3 text-xs text-slate-400 bg-slate-800/50 rounded p-2 border border-slate-700">{bestPair.reason}</div>
            )}
          </div>
        )}

        {/* ── BUY_READY alert ── */}
        {buyReady.length > 0 && (
          <div className="bg-emerald-950/60 border-2 border-emerald-500 rounded-xl px-5 py-4">
            <div className="text-emerald-400 font-black text-lg mb-1">✅ {buyReady.length} pair{buyReady.length > 1 ? 's' : ''} BUY_READY</div>
            <div className="text-emerald-300 text-sm">
              {buyReady.map(p => p.pair).join(' · ')} — All entry conditions met in Phase 1.
              Trading remains blocked (tradeAllowed=false). Phase 3 + kill switch disable required.
            </div>
          </div>
        )}

        {/* ── Tabs: Top 3 / All Pairs / Risk Guard / Constants ── */}
        <Tabs defaultValue="top3" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="top3" className="text-xs">🏆 Top 3</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">📊 All Pairs</TabsTrigger>
            <TabsTrigger value="riskguard" className="text-xs">🛡️ Risk Guard</TabsTrigger>
            <TabsTrigger value="constants" className="text-xs">⚙️ Constants</TabsTrigger>
          </TabsList>

          {/* TOP 3 */}
          <TabsContent value="top3" className="mt-4">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-72 bg-slate-800 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {top3.map((p, i) => <PairCard key={p.pair} pair={p} rank={i + 1} />)}
              </div>
            )}
          </TabsContent>

          {/* ALL PAIRS TABLE */}
          <TabsContent value="all" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <div className="text-sm font-bold text-slate-300 mb-4">All Pairs — Full Signal Matrix</div>
              {isLoading ? <Skeleton className="h-64 bg-slate-800" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700">
                      <tr className="text-slate-400 text-left">
                        <th className="px-2 py-2">Pair</th>
                        <th className="px-2 py-2">Poly</th>
                        <th className="px-2 py-2">OKX</th>
                        <th className="px-2 py-2">Trend</th>
                        <th className="px-2 py-2 text-right">Mom%</th>
                        <th className="px-2 py-2 text-right">VolΔ</th>
                        <th className="px-2 py-2 text-right">Volat%</th>
                        <th className="px-2 py-2 text-right">Spread%</th>
                        <th className="px-2 py-2 text-right">NetProfit</th>
                        <th className="px-2 py-2 text-right">PolySig</th>
                        <th className="px-2 py-2 text-right">OKXExec</th>
                        <th className="px-2 py-2 text-right">Constants</th>
                        <th className="px-2 py-2 text-right">Final</th>
                        <th className="px-2 py-2">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPairs.map(p => {
                        const cfg = DECISION_CONFIG[p.decision] || DECISION_CONFIG.WAIT;
                        const sc = p.finalScore >= 70 ? 'text-emerald-400' : p.finalScore >= 50 ? 'text-yellow-400' : 'text-red-400';
                        return (
                          <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                            <td className="px-2 py-2 font-bold text-white">{p.pair}</td>
                            <td className={`px-2 py-2 font-bold ${p.polygonStatus === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>{p.polygonStatus === 'OK' ? '✓' : '✗'}</td>
                            <td className={`px-2 py-2 font-bold ${p.okxStatus === 'OK' ? 'text-emerald-400' : 'text-slate-500'}`}>{p.okxStatus === 'OK' ? '✓' : '—'}</td>
                            <td className={`px-2 py-2 font-bold text-xs ${p.trend === 'BULLISH' ? 'text-emerald-400' : p.trend === 'MILD_BULL' ? 'text-yellow-400' : p.trend === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>{p.trend}</td>
                            <td className={`px-2 py-2 text-right ${p.momentum > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.momentum.toFixed(2)}%</td>
                            <td className={`px-2 py-2 text-right ${p.volumeDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.volumeDelta.toFixed(3)}</td>
                            <td className="px-2 py-2 text-right text-slate-400">{p.volatility.toFixed(2)}%</td>
                            <td className={`px-2 py-2 text-right ${p.spreadPct < 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>{p.spreadPct.toFixed(4)}%</td>
                            <td className={`px-2 py-2 text-right font-bold ${p.expectedNetProfitAfterFees >= 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>${p.expectedNetProfitAfterFees.toFixed(4)}</td>
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

          {/* RISK GUARD */}
          <TabsContent value="riskguard" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <div className="text-sm font-bold text-slate-300 mb-4">🛡️ Risk Guard Status — Phase 1</div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(riskGuard).map(([k, v]) => {
                  const isOk   = v === true || v === 'PASS' || v === 'SKIPPED_PHASE_1';
                  const isBad  = v === false || v === 'FAIL';
                  const color  = isBad ? 'text-red-400' : isOk ? 'text-emerald-400' : 'text-yellow-400';
                  return (
                    <div key={k} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                      <div className="text-slate-500 text-xs mb-1">{k}</div>
                      <div className={`font-bold text-xs ${color}`}>{String(v)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* CONSTANTS */}
          <TabsContent value="constants" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <div className="text-sm font-bold text-slate-300 mb-1">⚙️ Optimizing Constants Engine — Phase 1 Defaults</div>
              <div className="text-xs text-slate-500 mb-4">These will be adapted by verified trade feedback in Phase 4</div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {Object.entries(constants).map(([k, v]) => (
                  <div key={k} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <div className="text-slate-400 text-xs mb-2 font-mono">{k}</div>
                    <div className="text-cyan-400 font-black text-lg">{v}</div>
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

// ── Pair detail card ──
function PairCard({ pair: p, rank }) {
  const cfg = DECISION_CONFIG[p.decision] || DECISION_CONFIG.WAIT;
  const sc  = p.finalScore >= 70 ? 'text-emerald-400' : p.finalScore >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`rounded-xl border-2 p-5 ${cfg.ring}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">#{rank}</span>
          <span className="font-black text-lg text-white">{p.pair}</span>
        </div>
        <DecisionBadge decision={p.decision} />
      </div>

      {/* Scores */}
      <div className={`text-4xl font-black ${sc} mb-1`}>{p.finalScore?.toFixed(1)}<span className="text-lg text-slate-500">/100</span></div>
      <div className="flex gap-3 text-xs mb-4">
        <span className="text-blue-400">P:{p.PolygonSignalScore?.toFixed(0)}</span>
        <span className="text-cyan-400">O:{p.OKXExecutionScore?.toFixed(0)}</span>
        <span className="text-purple-400">C:{p.ConstantsScore?.toFixed(0)}</span>
      </div>

      {/* Sub-score bars */}
      <div className="space-y-1 mb-4 text-xs">
        <div className="text-slate-500 font-bold text-xs mb-1 uppercase tracking-widest">Polygon Signal</div>
        <ScoreBar label="Trend"    value={p.trendScore}          max={25} color="blue" />
        <ScoreBar label="Momentum" value={p.momentumScore}       max={25} color="green" />
        <ScoreBar label="Volume"   value={p.volumeScore}         max={20} color="teal" />
        <ScoreBar label="Volatil." value={p.volatilityScore}     max={15} color="purple" />
        <ScoreBar label="Candle"   value={p.candleStructureScore} max={15} color="indigo" />
        <div className="border-t border-slate-700/50 pt-1 mt-1 text-slate-500 font-bold text-xs uppercase tracking-widest">OKX Execution</div>
        <ScoreBar label="Spread"   value={p.spreadScore}        max={30} color="orange" />
        <ScoreBar label="Fee OK"   value={p.feeViabilityScore}  max={30} color="red" />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Polygon"     value={p.polygonStatus}     ok={p.polygonStatus === 'OK'} />
        <Metric label="OKX"         value={p.okxStatus}         ok={p.okxStatus === 'OK'} />
        <Metric label="Trend"       value={p.trend}             ok={p.trend === 'BULLISH'} warn={p.trend === 'MILD_BULL'} />
        <Metric label="Momentum"    value={`${p.momentum.toFixed(3)}%`} ok={p.momentum > 0} />
        <Metric label="Net Profit"  value={`$${p.expectedNetProfitAfterFees.toFixed(4)}`} ok={p.expectedNetProfitAfterFees >= 0.03} />
        <Metric label="Spread"      value={`${p.spreadPct.toFixed(4)}%`} ok={p.spreadPct < 0.03} />
      </div>

      {p.reason && (
        <div className="mt-3 text-xs text-slate-400 bg-slate-900/50 rounded p-2 border border-slate-700 break-words">{p.reason}</div>
      )}

      <div className="mt-2 text-xs text-slate-600 font-mono">tradeAllowed: false · READ_ONLY_PHASE</div>
    </div>
  );
}

// ── Reusable small components ──
function DecisionBadge({ decision }) {
  const cfg = DECISION_CONFIG[decision] || DECISION_CONFIG.WAIT;
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>;
}

function ScoreBar({ label, value = 0, max, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const colorMap = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', teal: 'bg-teal-500',
    purple: 'bg-purple-500', indigo: 'bg-indigo-500', orange: 'bg-orange-500', red: 'bg-red-500'
  };
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 text-slate-500 text-right shrink-0 text-xs">{label}</div>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${colorMap[color] || 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 text-right text-slate-400 text-xs">{value}/{max}</div>
    </div>
  );
}

function ScoreChip({ label, value = 0, maxOk = 70, color = 'emerald' }) {
  const ok = value >= maxOk;
  const colorMap = { emerald: ok ? 'text-emerald-400' : 'text-yellow-400', blue: 'text-blue-400', cyan: 'text-cyan-400', purple: 'text-purple-400' };
  return (
    <div className="text-center">
      <div className="text-slate-500">{label}</div>
      <div className={`font-black text-lg ${colorMap[color]}`}>{value?.toFixed(1)}</div>
    </div>
  );
}

function Metric({ label, value, ok, bad, warn }) {
  const color = ok ? 'text-emerald-400' : bad ? 'text-red-400' : warn ? 'text-yellow-400' : 'text-slate-300';
  return (
    <div className="bg-slate-900/50 rounded p-2 border border-slate-800">
      <div className="text-slate-500 text-xs mb-0.5">{label}</div>
      <div className={`font-bold text-xs ${color}`}>{value}</div>
    </div>
  );
}