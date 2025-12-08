import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';

export default function BotHealthScore({ trades, subscription }) {
  const calculateHealthScore = () => {
    if (trades.length < 10) return { score: 50, status: 'warming_up', color: 'text-amber-400' };
    
    const recentTrades = trades.slice(-20);
    const winRate = recentTrades.filter(t => t.profit_loss > 0).length / recentTrades.length;
    const avgProfit = recentTrades.reduce((sum, t) => sum + t.profit_loss, 0) / recentTrades.length;
    const totalProfit = subscription.total_profit || 0;
    const consistency = Math.abs(avgProfit) / (Math.abs(totalProfit) / trades.length || 1);
    
    let score = 0;
    
    // Win rate (40 points)
    score += winRate * 40;
    
    // Profitability (30 points)
    if (totalProfit > 0) score += 30;
    else if (totalProfit > -100) score += 15;
    
    // Consistency (20 points)
    score += Math.min(consistency * 20, 20);
    
    // Trading activity (10 points)
    score += Math.min((trades.length / 100) * 10, 10);
    
    let status, color;
    if (score >= 80) {
      status = 'excellent';
      color = 'text-emerald-400';
    } else if (score >= 60) {
      status = 'good';
      color = 'text-blue-400';
    } else if (score >= 40) {
      status = 'fair';
      color = 'text-amber-400';
    } else {
      status = 'poor';
      color = 'text-red-400';
    }
    
    return { score: Math.round(score), status, color };
  };

  const health = calculateHealthScore();
  const circumference = 2 * Math.PI * 45;
  const progress = (health.score / 100) * circumference;

  const metrics = [
    { label: 'Win Rate', value: `${((trades.filter(t => t.profit_loss > 0).length / (trades.length || 1)) * 100).toFixed(1)}%` },
    { label: 'Total Trades', value: trades.length },
    { label: 'Avg Trade', value: `$${(trades.reduce((sum, t) => sum + t.profit_loss, 0) / (trades.length || 1)).toFixed(2)}` },
    { label: 'Status', value: health.status.replace('_', ' ').toUpperCase() }
  ];

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Bot Health Score
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          {/* Circular Progress */}
          <div className="relative w-32 h-32 mb-6">
            <svg className="transform -rotate-90 w-32 h-32">
              <circle
                cx="64"
                cy="64"
                r="45"
                stroke="#334155"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="64"
                cy="64"
                r="45"
                stroke={health.score >= 80 ? '#10b981' : health.score >= 60 ? '#3b82f6' : health.score >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - progress}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <div className={`text-3xl font-bold ${health.color}`}>
                {health.score}
              </div>
              <div className="text-xs text-slate-400">/ 100</div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 w-full">
            {metrics.map((metric, idx) => (
              <div key={idx} className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-xs text-slate-500">{metric.label}</div>
                <div className="text-sm font-semibold text-white mt-1">{metric.value}</div>
              </div>
            ))}
          </div>

          {/* Status Indicator */}
          <div className="mt-4 flex items-center gap-2">
            {health.score >= 60 ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
            <span className={`text-sm font-medium ${health.color}`}>
              {health.status === 'excellent' && 'Performing Excellently'}
              {health.status === 'good' && 'Performing Well'}
              {health.status === 'fair' && 'Needs Monitoring'}
              {health.status === 'poor' && 'Requires Attention'}
              {health.status === 'warming_up' && 'Warming Up...'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}