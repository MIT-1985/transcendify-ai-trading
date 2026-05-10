import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SIGNAL_COLORS = {
  BUY: 'text-emerald-400',
  SELL: 'text-red-400',
};

const DECISION_STYLES = {
  HOLDING:  'bg-blue-900/40 text-blue-300 border border-blue-700/40',
  ELIGIBLE: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40',
  WAIT:     'bg-slate-800 text-slate-400 border border-slate-700',
};

function ScoreBar({ score }) {
  const color = score >= 60 ? 'bg-emerald-500' : score >= 40 ? 'bg-yellow-500' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-slate-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="font-mono text-xs font-bold">{score}</span>
    </div>
  );
}

export default function PairScoringTable({ pairScores = [], isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-8 bg-slate-800/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!pairScores.length) {
    return <div className="text-slate-500 text-xs text-center py-4">Run Robot 1 to see pair scores</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-slate-500 border-b border-slate-700">
          <tr>
            <th className="text-left px-2 py-2">Pair</th>
            <th className="text-left px-2 py-2">Score</th>
            <th className="text-left px-2 py-2">Signal</th>
            <th className="text-right px-2 py-2">Spread</th>
            <th className="text-left px-2 py-2">Trend</th>
            <th className="text-right px-2 py-2">Momentum</th>
            <th className="text-right px-2 py-2">VolRatio</th>
            <th className="text-left px-2 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {pairScores.map((p) => (
            <tr key={p.pair} className="border-b border-slate-800/50 hover:bg-slate-800/20">
              <td className="px-2 py-2 font-bold">{p.pair}</td>
              <td className="px-2 py-2"><ScoreBar score={p.score} /></td>
              <td className={`px-2 py-2 font-bold ${SIGNAL_COLORS[p.signal] || 'text-slate-500'}`}>
                {p.signal === 'BUY' ? '▲ BUY' : p.signal === 'SELL' ? '▼ SELL' : '— NONE'}
              </td>
              <td className="px-2 py-2 text-right font-mono">{p.spread?.toFixed(4)}%</td>
              <td className="px-2 py-2">
                <span className={`flex items-center gap-1 ${p.trend === 'UP' ? 'text-emerald-400' : p.trend === 'DOWN' ? 'text-red-400' : 'text-slate-500'}`}>
                  {p.trend === 'UP' ? <TrendingUp className="w-3 h-3" /> : p.trend === 'DOWN' ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {p.trend}
                </span>
              </td>
              <td className={`px-2 py-2 text-right font-mono ${p.momentum > 0 ? 'text-emerald-400' : p.momentum < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                {p.momentum > 0 ? '+' : ''}{p.momentum?.toFixed(3)}%
              </td>
              <td className={`px-2 py-2 text-right font-mono ${p.volRatio >= 1.1 ? 'text-emerald-400' : 'text-slate-400'}`}>
                {p.volRatio?.toFixed(2)}x
              </td>
              <td className="px-2 py-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${DECISION_STYLES[p.decision] || DECISION_STYLES.WAIT}`}>
                  {p.decision}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}