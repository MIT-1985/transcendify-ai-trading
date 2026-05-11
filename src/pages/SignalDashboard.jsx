import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

const DECISION_CONFIG = {
  BUY_READY:                { color: 'text-emerald-400', bg: 'bg-emerald-950/50 border-emerald-600', badge: 'bg-emerald-800 text-emerald-200', label: '🟢 BUY READY' },
  WAIT:                     { color: 'text-yellow-400',  bg: 'bg-yellow-950/30 border-yellow-700',   badge: 'bg-yellow-900 text-yellow-200',  label: '🟡 WAIT' },
  AVOID:                    { color: 'text-red-400',     bg: 'bg-red-950/30 border-red-700',         badge: 'bg-red-900 text-red-200',        label: '🔴 AVOID' },
  WAIT_POLYGON_UNAVAILABLE: { color: 'text-slate-400',  bg: 'bg-slate-900/50 border-slate-700',     badge: 'bg-slate-800 text-slate-300',    label: '⚪ NO POLYGON' },
};

export default function SignalDashboard() {
  const { user } = useAuth();
  const [lastScan, setLastScan] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['polygon-fee-aware-signal', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('testPolygonFeeAwareSignal', {});
      if (!res.data.success) throw new Error(res.data.error || 'Scan failed');
      setLastScan(new Date().toLocaleTimeString('de-DE'));
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000, // re-scan every 60s
    gcTime: 0
  });

  const allPairs   = data?.allPairs || [];
  const top3       = data?.top3Opportunities || [];
  const summary    = data?.summary || {};
  const constants  = data?.constants || {};
  const buyReady   = allPairs.filter(p => p.decision === 'BUY_READY');

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">📡 FEE_AWARE_POLYGON_SCALP</h1>
            <div className="text-xs text-slate-400 mt-1">
              READ-ONLY · NO TRADING · Kill Switch: ACTIVE · Last scan: {lastScan || '...'}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-emerald-900/50 border border-emerald-700 text-emerald-400 font-bold">BUY READY: {summary.buyReady ?? 0}</span>
              <span className="px-2 py-1 rounded bg-yellow-900/30 border border-yellow-700 text-yellow-400">WAIT: {summary.wait ?? 0}</span>
              <span className="px-2 py-1 rounded bg-red-900/30 border border-red-700 text-red-400">AVOID: {summary.avoid ?? 0}</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
            >
              {isFetching ? '⏳ Scanning...' : '🔄 Rescan'}
            </button>
          </div>
        </div>

        {/* ── Kill Switch Warning ── */}
        <div className="bg-red-950/50 border border-red-700 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-lg">🛑</span>
          <div className="text-xs text-red-300">
            <strong className="text-red-400">Kill Switch ACTIVE.</strong> This is a READ-ONLY diagnostic. No orders will be placed.
            If a pair shows BUY_READY, you must manually disable the kill switch before any trade can execute.
          </div>
        </div>

        {/* ── BUY READY alert ── */}
        {buyReady.length > 0 && (
          <div className="bg-emerald-950/60 border-2 border-emerald-500 rounded-xl px-5 py-4">
            <div className="text-emerald-400 font-black text-lg mb-2">✅ {buyReady.length} pair{buyReady.length > 1 ? 's' : ''} BUY READY</div>
            <div className="text-emerald-300 text-sm">
              {buyReady.map(p => p.pair).join(' · ')} — All entry conditions met.
              Awaiting manual kill switch disable + your approval before any execution.
            </div>
          </div>
        )}

        {/* ── Top 3 Opportunities ── */}
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top 3 Opportunities</div>
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-64 bg-slate-800 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {top3.map((p, i) => <PairCard key={p.pair} pair={p} rank={i + 1} />)}
            </div>
          )}
        </div>

        {/* ── All Pairs Table ── */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
          <div className="text-sm font-bold text-slate-300 mb-4">All Pairs — Full Signal Matrix</div>
          {isLoading ? <Skeleton className="h-64 bg-slate-800" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-700">
                  <tr className="text-slate-400 text-left">
                    <th className="px-2 py-2">Pair</th>
                    <th className="px-2 py-2">Polygon</th>
                    <th className="px-2 py-2">Trend</th>
                    <th className="px-2 py-2 text-right">Mom%</th>
                    <th className="px-2 py-2 text-right">VolΔ</th>
                    <th className="px-2 py-2 text-right">Volat%</th>
                    <th className="px-2 py-2 text-right">Bid</th>
                    <th className="px-2 py-2 text-right">Ask</th>
                    <th className="px-2 py-2 text-right">Spread%</th>
                    <th className="px-2 py-2 text-right">NetProfit</th>
                    <th className="px-2 py-2 text-right">PolyScore</th>
                    <th className="px-2 py-2 text-right">OKXScore</th>
                    <th className="px-2 py-2 text-right">FinalScore</th>
                    <th className="px-2 py-2">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {allPairs.map(p => {
                    const cfg = DECISION_CONFIG[p.decision] || DECISION_CONFIG.WAIT;
                    const scoreColor = p.finalScore >= 70 ? 'text-emerald-400' : p.finalScore >= 50 ? 'text-yellow-400' : 'text-red-400';
                    return (
                      <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-2 py-2 font-bold text-white">{p.pair}</td>
                        <td className={`px-2 py-2 font-bold ${p.polygonStatus === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.polygonStatus}
                        </td>
                        <td className={`px-2 py-2 font-bold ${
                          p.trend === 'BULLISH' ? 'text-emerald-400' :
                          p.trend === 'BEARISH' ? 'text-red-400' : 'text-slate-400'
                        }`}>{p.trend}</td>
                        <td className={`px-2 py-2 text-right ${p.momentum > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.momentum.toFixed(2)}%
                        </td>
                        <td className={`px-2 py-2 text-right ${p.volumeDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.volumeDelta.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right text-slate-400">{p.volatility.toFixed(2)}%</td>
                        <td className="px-2 py-2 text-right font-mono">{p.okxBid > 0 ? p.okxBid.toLocaleString() : '—'}</td>
                        <td className="px-2 py-2 text-right font-mono">{p.okxAsk > 0 ? p.okxAsk.toLocaleString() : '—'}</td>
                        <td className={`px-2 py-2 text-right ${p.spreadPct < 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.spreadPct.toFixed(4)}%
                        </td>
                        <td className={`px-2 py-2 text-right font-bold ${p.expectedNetProfitAfterFees >= 0.03 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ${p.expectedNetProfitAfterFees.toFixed(4)}
                        </td>
                        <td className="px-2 py-2 text-right text-blue-400">{p.PolygonSignalScore.toFixed(0)}</td>
                        <td className="px-2 py-2 text-right text-purple-400">{p.OKXExecutionScore.toFixed(0)}</td>
                        <td className={`px-2 py-2 text-right font-bold ${scoreColor}`}>{p.finalScore.toFixed(1)}</td>
                        <td className="px-2 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Strategy Constants ── */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-5">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Active Strategy Constants</div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs font-mono">
            {Object.entries(constants).map(([k, v]) => (
              <div key={k} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-slate-500 mb-1">{k}</div>
                <div className="text-cyan-400 font-bold">{v}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Pair detail card ──
function PairCard({ pair: p, rank }) {
  const cfg = DECISION_CONFIG[p.decision] || DECISION_CONFIG.WAIT;
  const scoreColor = p.finalScore >= 70 ? 'text-emerald-400' : p.finalScore >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`rounded-xl border p-5 ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">#{rank}</span>
          <span className="font-black text-lg text-white">{p.pair}</span>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.badge}`}>{cfg.label}</span>
      </div>

      {/* Score donut */}
      <div className={`text-4xl font-black ${scoreColor} mb-4`}>
        {p.finalScore.toFixed(1)} <span className="text-lg text-slate-500">/ 100</span>
      </div>

      {/* Sub-scores */}
      <div className="space-y-1 mb-4 text-xs">
        <ScoreBar label="Trend" value={p.trendScore} max={25} color="blue" />
        <ScoreBar label="Momentum" value={p.momentumScore} max={25} color="green" />
        <ScoreBar label="Volume" value={p.volumeScore} max={20} color="teal" />
        <ScoreBar label="Volatility" value={p.volatilityScore} max={15} color="purple" />
        <ScoreBar label="Candle Struct" value={p.candleStructureScore} max={15} color="indigo" />
        <div className="border-t border-slate-700/50 pt-1 mt-1" />
        <ScoreBar label="Spread" value={p.spreadScore} max={30} color="orange" />
        <ScoreBar label="Fee Viability" value={p.feeViabilityScore} max={30} color="red" />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Polygon" value={p.polygonStatus} ok={p.polygonStatus === 'OK'} />
        <Metric label="Candles" value={`${p.candlesCount}d`} />
        <Metric label="Trend" value={p.trend} ok={p.trend === 'BULLISH'} warn={p.trend === 'MILD_BULL'} />
        <Metric label="Momentum" value={`${p.momentum.toFixed(3)}%`} ok={p.momentum > 0} />
        <Metric label="VolΔ" value={p.volumeDelta.toFixed(3)} ok={p.volumeDelta > 0} />
        <Metric label="Volatility" value={`${p.volatility.toFixed(3)}%`} />
        <Metric label="OKX Bid" value={p.okxBid > 0 ? p.okxBid.toLocaleString() : '—'} />
        <Metric label="Spread" value={`${p.spreadPct.toFixed(4)}%`} ok={p.spreadPct < 0.03} />
        <Metric label="Gross@TP" value={`$${p.expectedGrossProfit.toFixed(4)}`} />
        <Metric label="Fees" value={`$${p.expectedFees.toFixed(4)}`} bad />
        <Metric
          label="Net Profit"
          value={`$${p.expectedNetProfitAfterFees.toFixed(4)}`}
          ok={p.expectedNetProfitAfterFees >= 0.03}
          bad={p.expectedNetProfitAfterFees < 0}
        />
        <Metric label="PolyScore" value={`${p.PolygonSignalScore.toFixed(0)}/100`} />
      </div>

      {/* Reason */}
      {p.reason && (
        <div className="mt-3 text-xs text-slate-400 bg-slate-900/50 rounded p-2 border border-slate-700 break-words">
          {p.reason}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  const colorMap = {
    blue: 'bg-blue-500', green: 'bg-emerald-500', teal: 'bg-teal-500',
    purple: 'bg-purple-500', indigo: 'bg-indigo-500', orange: 'bg-orange-500', red: 'bg-red-500'
  };
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 text-slate-500 text-right shrink-0">{label}</div>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${colorMap[color] || 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-slate-300">{value}/{max}</div>
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