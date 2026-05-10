import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Target, TrendingUp, TrendingDown, Zap, Clock, DollarSign, BarChart2, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';

function MetricCard({ icon: Icon, label, value, sub, color = 'text-white', border = 'border-slate-700' }) {
  return (
    <div className={`bg-slate-800/50 rounded-lg p-3 border ${border} space-y-1`}>
      <div className="flex items-center gap-1 text-slate-500 text-xs">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className={`font-mono font-bold text-lg leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-slate-600 text-xs">{sub}</div>}
    </div>
  );
}

function QualityBar({ score }) {
  const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const label = score >= 75 ? 'Professional' : score >= 50 ? 'Developing' : 'Weak';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400 font-bold">Scalp Quality Score</span>
        <span className={`font-mono font-bold ${score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
          {score}/100 · {label}
        </span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <div className="text-xs text-slate-600">Win rate 40% + Fee efficiency 30% + Drawdown -20% + Speed 10%</div>
    </div>
  );
}

export default function ScalpOptimizerPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('robot1Scalp', {});
      const d = res.data || {};
      if (d.optimizerMetrics) {
        setMetrics({
          ...d.optimizerMetrics,
          capitalEfficiencyScore: d.capitalReserve?.capitalEfficiencyScore ?? 0,
          freeCapitalPercent: d.freeCapitalPercent ?? d.capitalReserve?.freeCapitalPct ?? 0,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const m = metrics;

  const pnlTodayColor = !m ? 'text-white' : m.realizedPnLToday > 0 ? 'text-emerald-400' : m.realizedPnLToday < 0 ? 'text-red-400' : 'text-slate-400';
  const pnl7dColor = !m ? 'text-white' : m.realizedPnL7D > 0 ? 'text-emerald-400' : m.realizedPnL7D < 0 ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="bg-slate-900/50 border border-purple-700/40 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" />
          <h2 className="font-bold text-sm">Final Optimizer Metrics</h2>
          <span className="text-xs text-slate-500 ml-1">30–80 quality trades/day · compound profits</span>
        </div>
        <Button
          size="sm" variant="ghost"
          onClick={refresh}
          disabled={loading}
          className="text-slate-400 hover:text-white h-7 px-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {!m ? (
        <div className="text-xs text-slate-500 text-center py-6">
          {loading ? 'Computing optimizer metrics…' : 'No data — click refresh'}
        </div>
      ) : (
        <>
          {/* Quality bar */}
          <QualityBar score={m.scalpQualityScore} />

          {/* 9 Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              icon={Award}
              label="capitalEfficiencyScore"
              value={`${m.capitalEfficiencyScore}`}
              sub="/100 capital health"
              color={m.capitalEfficiencyScore >= 80 ? 'text-emerald-400' : m.capitalEfficiencyScore >= 50 ? 'text-yellow-400' : 'text-red-400'}
              border={m.capitalEfficiencyScore >= 80 ? 'border-emerald-700/40' : 'border-slate-700'}
            />
            <MetricCard
              icon={DollarSign}
              label="freeCapitalPercent"
              value={`${m.freeCapitalPercent}%`}
              sub="liquidity buffer"
              color={m.freeCapitalPercent >= 50 ? 'text-emerald-400' : m.freeCapitalPercent >= 30 ? 'text-yellow-400' : 'text-red-400'}
            />
            <MetricCard
              icon={Clock}
              label="avgCycleDuration"
              value={m.avgCycleDuration > 0 ? `${m.avgCycleDuration}s` : '—'}
              sub={m.avgCycleDuration > 0 ? (m.avgCycleDuration < 60 ? '🟢 fast' : m.avgCycleDuration < 300 ? '🟡 ok' : '🔴 slow') : 'no data'}
              color={m.avgCycleDuration > 0 && m.avgCycleDuration < 120 ? 'text-emerald-400' : 'text-yellow-400'}
            />
            <MetricCard
              icon={TrendingUp}
              label="realizedPnLToday"
              value={m.realizedPnLToday >= 0 ? `+${m.realizedPnLToday.toFixed(4)}` : m.realizedPnLToday.toFixed(4)}
              sub={`${m.tradesCountToday} trades today`}
              color={pnlTodayColor}
              border={m.realizedPnLToday > 0 ? 'border-emerald-700/40' : m.realizedPnLToday < 0 ? 'border-red-700/40' : 'border-slate-700'}
            />
            <MetricCard
              icon={BarChart2}
              label="realizedPnL7D"
              value={m.realizedPnL7D >= 0 ? `+${m.realizedPnL7D.toFixed(4)}` : m.realizedPnL7D.toFixed(4)}
              sub={`${m.tradesCount7D} trades 7D`}
              color={pnl7dColor}
            />
            <MetricCard
              icon={Target}
              label="rollingWinRate"
              value={`${m.rollingWinRate}%`}
              sub={`last ${m.last50Count} trades`}
              color={m.rollingWinRate >= 60 ? 'text-emerald-400' : m.rollingWinRate >= 45 ? 'text-yellow-400' : 'text-red-400'}
            />
            <MetricCard
              icon={TrendingDown}
              label="rollingDrawdown"
              value={`${m.rollingDrawdown} losses`}
              sub="max consec losses (L50)"
              color={m.rollingDrawdown === 0 ? 'text-emerald-400' : m.rollingDrawdown <= 2 ? 'text-yellow-400' : 'text-red-400'}
            />
            <MetricCard
              icon={Zap}
              label="feeEfficiencyRatio"
              value={m.feeEfficiencyRatio > 0 ? `${m.feeEfficiencyRatio}x` : '—'}
              sub="gross pnl / fees paid"
              color={m.feeEfficiencyRatio >= 2 ? 'text-emerald-400' : m.feeEfficiencyRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}
            />
            <MetricCard
              icon={Award}
              label="scalpQualityScore"
              value={`${m.scalpQualityScore}`}
              sub="/100 composite"
              color={m.scalpQualityScore >= 75 ? 'text-emerald-400' : m.scalpQualityScore >= 50 ? 'text-yellow-400' : 'text-red-400'}
              border={m.scalpQualityScore >= 75 ? 'border-purple-700/40' : 'border-slate-700'}
            />
          </div>

          {/* Philosophy summary */}
          <div className="text-xs bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-400 space-y-0.5">
            <div className="font-bold text-slate-300 mb-1">Priority: Capital → Liquidity → Win Rate → Low Drawdown → Profit Scaling</div>
            <div className="flex gap-4 flex-wrap">
              <span>Skip weak setups ✓</span>
              <span>Recycle USDT fast ✓</span>
              <span>Close dead trades ✓</span>
              <span>Scale after wins ✓</span>
              <span>Reduce after losses ✓</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}