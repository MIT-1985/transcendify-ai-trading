import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Activity, Target, Percent } from 'lucide-react';

export default function PerformanceMetrics({ subscription, trades, timeframe }) {
  const filterTradesByTimeframe = (trades, tf) => {
    const now = Date.now();
    const timeframeMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': Infinity
    };
    return trades.filter(t => now - new Date(t.created_date).getTime() <= timeframeMs[tf]);
  };

  const filteredTrades = filterTradesByTimeframe(trades, timeframe);
  
  const realizedPnL = filteredTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
  const openTrades = filteredTrades.filter(t => t.side === 'BUY' && !filteredTrades.find(st => st.side === 'SELL' && st.symbol === t.symbol && new Date(st.created_date) > new Date(t.created_date)));
  const unrealizedPnL = subscription.total_profit - realizedPnL;
  
  const winningTrades = filteredTrades.filter(t => t.profit_loss > 0).length;
  const losingTrades = filteredTrades.filter(t => t.profit_loss < 0).length;
  const winRate = filteredTrades.length > 0 ? (winningTrades / filteredTrades.length) * 100 : 0;
  
  const avgWin = winningTrades > 0 ? filteredTrades.filter(t => t.profit_loss > 0).reduce((sum, t) => sum + t.profit_loss, 0) / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? Math.abs(filteredTrades.filter(t => t.profit_loss < 0).reduce((sum, t) => sum + t.profit_loss, 0) / losingTrades) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

  const metrics = [
    {
      title: 'Realized P&L',
      value: `$${realizedPnL.toFixed(2)}`,
      change: realizedPnL >= 0 ? '+' : '',
      trend: realizedPnL >= 0 ? 'up' : 'down',
      icon: DollarSign,
      color: realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
    },
    {
      title: 'Unrealized P&L',
      value: `$${unrealizedPnL.toFixed(2)}`,
      change: unrealizedPnL >= 0 ? '+' : '',
      trend: unrealizedPnL >= 0 ? 'up' : 'down',
      icon: TrendingUp,
      color: unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
    },
    {
      title: 'Total Trades',
      value: filteredTrades.length,
      subtitle: `${winningTrades}W / ${losingTrades}L`,
      icon: Activity,
      color: 'text-blue-400'
    },
    {
      title: 'Win Rate',
      value: `${winRate.toFixed(1)}%`,
      subtitle: `${winningTrades} winning trades`,
      icon: Percent,
      color: winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'
    },
    {
      title: 'Avg Win',
      value: `$${avgWin.toFixed(2)}`,
      icon: TrendingUp,
      color: 'text-emerald-400'
    },
    {
      title: 'Profit Factor',
      value: profitFactor.toFixed(2),
      subtitle: 'Avg Win / Avg Loss',
      icon: Target,
      color: profitFactor >= 1.5 ? 'text-emerald-400' : profitFactor >= 1 ? 'text-amber-400' : 'text-red-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {metrics.map((metric, idx) => (
        <Card key={idx} className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">{metric.title}</div>
              <metric.icon className={`w-4 h-4 ${metric.color}`} />
            </div>
            <div className={`text-2xl font-bold ${metric.color}`}>
              {metric.change}{metric.value}
            </div>
            {metric.subtitle && (
              <div className="text-xs text-slate-500 mt-1">{metric.subtitle}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}