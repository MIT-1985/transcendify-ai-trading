import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

const ENGINE_STATUS_STYLE = {
  INSUFFICIENT_DATA:               { color: 'text-slate-400', border: 'border-slate-600', bg: 'bg-slate-900/40', icon: '⏳' },
  PAPER_ENGINE_NOT_PROFITABLE_YET: { color: 'text-yellow-400', border: 'border-yellow-700', bg: 'bg-yellow-950/20', icon: '⚠️' },
  PAPER_ENGINE_PROMISING:          { color: 'text-emerald-400', border: 'border-emerald-700', bg: 'bg-emerald-950/20', icon: '🚀' },
};

const REC_STYLE = {
  KEEP:    'text-emerald-300 bg-emerald-950/50 border-emerald-700',
  WATCH:   'text-yellow-300 bg-yellow-950/30 border-yellow-700',
  DISABLE: 'text-red-300 bg-red-950/40 border-red-700',
};

function MetricRow({ label, value, color = 'text-white' }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-bold ${color}`}>{value}</span>
    </div>
  );
}

function PairCard({ pair }) {
  const pnlColor = pair.netPnL > 0 ? 'text-emerald-400' : pair.netPnL < 0 ? 'text-red-400' : 'text-slate-400';
  return (
    <div className={`rounded-xl border-2 p-4 ${pair.netPnL > 0 ? 'border-emerald-800 bg-emerald-950/10' : pair.netPnL < 0 ? 'border-red-900 bg-red-950/10' : 'border-slate-700 bg-slate-900/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-white">{pair.instId}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${REC_STYLE[pair.recommendation] || REC_STYLE.WATCH}`}>{pair.recommendation}</span>
      </div>
      <div className={`text-xl font-black mb-3 ${pnlColor}`}>{pair.netPnL >= 0 ? '+' : ''}{pair.netPnL.toFixed(4)} USDT</div>
      <div className="space-y-0">
        <MetricRow label="Trades"    value={`${pair.tradesCount} (open: ${pair.openTrades})`} />
        <MetricRow label="Win Rate"  value={`${pair.winRate.toFixed(1)}%`} color={pair.winRate >= 55 ? 'text-emerald-400' : pair.winRate < 45 ? 'text-red-400' : 'text-yellow-400'} />
        <MetricRow label="TP / SL"   value={`${pair.wins} / ${pair.losses}`} />
        <MetricRow label="Expired"   value={pair.expired} color="text-slate-400" />
        <MetricRow label="Avg Score" value={pair.averageScore.toFixed(1)} color="text-cyan-400" />
        <MetricRow label="Avg Hold"  value={`${pair.averageDurationMinutes.toFixed(1)} min`} color="text-slate-300" />
        <MetricRow label="Fees"      value={`-${pair.fees.toFixed(4)}`} color="text-red-400" />
        <MetricRow label="Spread"    value={`-${pair.spreadCost.toFixed(4)}`} color="text-orange-400" />
      </div>
      <div className="mt-2 text-xs text-slate-500 italic">{pair.reason}</div>
    </div>
  );
}

export default function PaperReport24h() {
  const { user } = useAuth();

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['paper-report-24h', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase4PaperReport24h', {});
      return res.data;
    },
    enabled: !!user,
    staleTime: 60000,
    refetchInterval: false,
    gcTime: 0,
  });

  const g  = data?.global || {};
  const es = ENGINE_STATUS_STYLE[data?.engineStatus] || ENGINE_STATUS_STYLE.INSUFFICIENT_DATA;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">PHASE_4_24H_PAPER_REPORT · Read-Only</div>
          <h2 className="text-xl font-black text-white">24h Paper Trading Performance Report</h2>
          <div className="flex flex-wrap gap-3 mt-1 text-xs">
            <span className="text-red-400 font-bold">realTradeAllowed: false</span>
            <span className="text-slate-600">·</span>
            <span className="text-red-400 font-bold">killSwitchActive: true</span>
            <span className="text-slate-600">·</span>
            <span className="text-blue-400 font-bold">noOKXOrderEndpointCalled: true</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">source: PaperTrade entity only</span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching || isLoading}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-700/30 border border-blue-700 hover:bg-blue-700/50 text-blue-300 disabled:opacity-50 transition-all shrink-0"
        >
          {isFetching || isLoading ? '⏳ Loading…' : '🔄 Refresh Report'}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error.message}</div>
      )}

      {isLoading && <Skeleton className="h-48 bg-slate-800 rounded-2xl" />}

      {data && (
        <>
          {/* Engine Status */}
          <div className={`rounded-2xl border-2 px-6 py-4 ${es.border} ${es.bg}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{es.icon}</span>
              <div>
                <div className={`text-lg font-black ${es.color}`}>{data.engineStatus}</div>
                <div className="text-xs text-slate-400 mt-0.5">{data.engineReason}</div>
              </div>
            </div>
          </div>

          {/* Global metrics grid */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">📊 Global 24h Metrics</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-4">
              {[
                { label: 'Total Trades',   value: g.totalPaperTrades || 0,                           color: 'text-white' },
                { label: 'Open',           value: g.openTrades || 0,                                  color: 'text-yellow-400' },
                { label: 'Closed',         value: g.closedTrades || 0,                                color: 'text-slate-300' },
                { label: 'Win Rate',       value: `${(g.winRate || 0).toFixed(1)}%`,                  color: (g.winRate || 0) >= 55 ? 'text-emerald-400' : (g.winRate || 0) < 45 ? 'text-red-400' : 'text-yellow-400' },
                { label: 'TP Hits',        value: g.tpTrades || 0,                                    color: 'text-emerald-400' },
                { label: 'SL Hits',        value: g.slTrades || 0,                                    color: 'text-red-400' },
                { label: 'Expired',        value: g.expiredTrades || 0,                               color: 'text-slate-400' },
                { label: 'Avg Score',      value: (g.averageSignalScore || 0).toFixed(1),             color: 'text-cyan-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                  <div className="text-slate-500 mb-1 uppercase tracking-wide text-xs">{label}</div>
                  <div className={`font-black text-lg ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                { label: 'Gross P&L',       value: `${(g.grossPnL || 0) >= 0 ? '+' : ''}${(g.grossPnL || 0).toFixed(4)}`,          color: 'text-blue-400' },
                { label: 'Fees',            value: `-${(g.totalFees || 0).toFixed(4)}`,                                              color: 'text-red-400' },
                { label: 'Spread Cost',     value: `-${(g.totalSpreadCost || 0).toFixed(4)}`,                                        color: 'text-orange-400' },
                { label: 'Net P&L',         value: `${(g.netPnL || 0) >= 0 ? '+' : ''}${(g.netPnL || 0).toFixed(4)} USDT`,          color: (g.netPnL || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Avg Net/Trade',   value: `${(g.averageNetPnLPerTrade || 0) >= 0 ? '+' : ''}${(g.averageNetPnLPerTrade || 0).toFixed(4)}`, color: 'text-slate-300' },
                { label: 'Avg Duration',    value: `${(g.averageDurationMinutes || 0).toFixed(1)} min`,                              color: 'text-slate-300' },
                { label: 'Best Pair',       value: g.bestPair || '—',                                                               color: 'text-emerald-400' },
                { label: 'Worst Pair',      value: g.worstPair || '—',                                                              color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                  <div className="text-slate-500 mb-1 uppercase tracking-wide text-xs">{label}</div>
                  <div className={`font-black text-base ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Best / Worst trade */}
          {(g.bestTrade || g.worstTrade) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {g.bestTrade && (
                <div className="bg-emerald-950/20 border border-emerald-800 rounded-xl p-4 text-xs">
                  <div className="text-emerald-400 font-bold mb-2">🏆 Best Trade</div>
                  <div className="space-y-0">
                    <MetricRow label="Pair"   value={g.bestTrade.instId} />
                    <MetricRow label="Status" value={g.bestTrade.status} />
                    <MetricRow label="Entry"  value={`$${g.bestTrade.entryPrice?.toLocaleString()}`} />
                    <MetricRow label="Exit"   value={`$${g.bestTrade.exitPrice?.toLocaleString()}`} />
                    <MetricRow label="Net PnL" value={`+${g.bestTrade.netPnL.toFixed(4)} USDT`} color="text-emerald-400" />
                    <MetricRow label="Score"  value={g.bestTrade.signalScore} color="text-cyan-400" />
                  </div>
                </div>
              )}
              {g.worstTrade && (
                <div className="bg-red-950/20 border border-red-800 rounded-xl p-4 text-xs">
                  <div className="text-red-400 font-bold mb-2">📉 Worst Trade</div>
                  <div className="space-y-0">
                    <MetricRow label="Pair"   value={g.worstTrade.instId} />
                    <MetricRow label="Status" value={g.worstTrade.status} />
                    <MetricRow label="Entry"  value={`$${g.worstTrade.entryPrice?.toLocaleString()}`} />
                    <MetricRow label="Exit"   value={`$${g.worstTrade.exitPrice?.toLocaleString()}`} />
                    <MetricRow label="Net PnL" value={`${g.worstTrade.netPnL.toFixed(4)} USDT`} color="text-red-400" />
                    <MetricRow label="Score"  value={g.worstTrade.signalScore} color="text-cyan-400" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Per-pair cards */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">📈 Per-Pair Breakdown</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(data.perPair || []).map(pair => (
                <PairCard key={pair.instId} pair={pair} />
              ))}
            </div>
          </div>

          {/* Report timestamp */}
          <div className="text-xs text-slate-600 text-center">
            Report generated: {g.windowEnd ? new Date(g.windowEnd).toLocaleString('de-DE') : '—'} ·
            Window: {g.windowStart ? new Date(g.windowStart).toLocaleString('de-DE') : '—'} → now
          </div>
        </>
      )}

      {!data && !isLoading && (
        <div className="text-center text-slate-400 py-16 text-sm">Click "Refresh Report" to generate the 24h performance report.</div>
      )}
    </div>
  );
}