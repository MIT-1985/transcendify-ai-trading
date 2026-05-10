import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { BarChart2, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const SIGNAL_COLOR = { BUY: 'text-emerald-400', SELL: 'text-red-400', null: 'text-slate-500' };
const DECISION_STYLE = {
  HOLDING:  'bg-blue-500/20 text-blue-300 border-blue-600/30',
  ELIGIBLE: 'bg-emerald-500/20 text-emerald-300 border-emerald-600/30',
  WAIT:     'bg-slate-700/40 text-slate-500 border-slate-700',
};

function ScoreBar({ score }) {
  const color = score >= 60 ? 'bg-emerald-500' : score >= 40 ? 'bg-yellow-500' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="font-mono text-xs w-6 text-right">{score}</span>
    </div>
  );
}

export default function PairScoringTable() {
  const { user } = useAuth();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['robot1-pair-scores', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('robot1Execute', {});
      return res.data || {};
    },
    enabled: !!user,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const scores = data?.pairScores || [];
  const positions = data?.activePositions || [];

  return (
    <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="w-4 h-4 text-purple-400" />
        <h2 className="font-bold text-sm">Pair Scoring</h2>
        <span className="ml-1 text-xs text-slate-500">
          {data?.positionCount ?? '?'}/{data?.maxPositions ?? 2} positions · {data?.freeUsdt != null ? `$${parseFloat(data.freeUsdt).toFixed(2)} free` : ''}
        </span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto text-slate-500 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 bg-slate-800" />
      ) : scores.length === 0 ? (
        <div className="text-slate-500 text-xs py-4 text-center">No scoring data. Click refresh.</div>
      ) : (
        <>
          {/* Active positions mini-summary */}
          {positions.length > 0 && (
            <div className="flex gap-3 mb-4 flex-wrap">
              {positions.map(p => (
                <div key={p.instId} className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs">
                  <span className="font-bold text-blue-300">{p.instId}</span>
                  <span className="text-slate-400 ml-2">entry ${p.entryPrice?.toFixed(2)}</span>
                  <span className="ml-2 font-mono">{p.currentPrice?.toFixed(2)}</span>
                  <span className={`ml-2 font-bold ${p.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct?.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <table className="w-full text-xs">
            <thead className="text-slate-500 border-b border-slate-700">
              <tr>
                <th className="text-left px-2 py-2">Pair</th>
                <th className="text-left px-2 py-2">Score</th>
                <th className="text-left px-2 py-2">Signal</th>
                <th className="text-right px-2 py-2">Spread</th>
                <th className="text-left px-2 py-2">Trend</th>
                <th className="text-right px-2 py-2">Momentum</th>
                <th className="text-right px-2 py-2">Vol Ratio</th>
                <th className="text-right px-2 py-2">Volatility</th>
                <th className="text-center px-2 py-2">Decision</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((p) => (
                <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                  <td className="px-2 py-2 font-bold">{p.pair}</td>
                  <td className="px-2 py-2"><ScoreBar score={p.score} /></td>
                  <td className={`px-2 py-2 font-bold ${SIGNAL_COLOR[p.signal] || 'text-slate-500'}`}>
                    {p.signal || '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{p.spread?.toFixed(4)}%</td>
                  <td className={`px-2 py-2 font-medium ${p.trend === 'UP' ? 'text-emerald-400' : p.trend === 'DOWN' ? 'text-red-400' : 'text-slate-500'}`}>
                    {p.trend === 'UP' ? '↑ UP' : p.trend === 'DOWN' ? '↓ DOWN' : p.trend}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono ${p.momentum > 0 ? 'text-emerald-400' : p.momentum < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {p.momentum > 0 ? '+' : ''}{p.momentum?.toFixed(3)}%
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{p.volRatio?.toFixed(2)}x</td>
                  <td className="px-2 py-2 text-right font-mono">{p.volatility?.toFixed(3)}%</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${DECISION_STYLE[p.decision] || DECISION_STYLE.WAIT}`}>
                      {p.decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-slate-600">
            Min score to buy: 40/100 · Max 2 simultaneous positions · 1 per pair · FIFO position tracking
          </div>
        </>
      )}
    </section>
  );
}