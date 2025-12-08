import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BacktestResults({ results }) {
  if (!results) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-8 text-center text-slate-400">
          Configure and run a backtest to see results
        </CardContent>
      </Card>
    );
  }

  const metrics = [
    {
      label: 'Total Return',
      value: `${results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(2)}%`,
      icon: results.totalReturn >= 0 ? TrendingUp : TrendingDown,
      color: results.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400',
      bgColor: results.totalReturn >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'
    },
    {
      label: 'Final Capital',
      value: `$${results.finalCapital.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20'
    },
    {
      label: 'Win Rate',
      value: `${results.winRate.toFixed(1)}%`,
      icon: Target,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20'
    },
    {
      label: 'Max Drawdown',
      value: `${results.maxDrawdown.toFixed(2)}%`,
      icon: AlertTriangle,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/20'
    },
    {
      label: 'Total Trades',
      value: results.totalTrades,
      icon: Award,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/20'
    },
    {
      label: 'Sharpe Ratio',
      value: results.sharpeRatio.toFixed(2),
      icon: TrendingUp,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/20'
    }
  ];

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {metrics.map((metric, idx) => {
              const Icon = metric.icon;
              return (
                <div key={idx} className={`${metric.bgColor} rounded-lg p-4`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${metric.color}`} />
                    <span className="text-xs text-slate-400">{metric.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${metric.color}`}>
                    {metric.value}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={results.equityCurve.map(e => ({
              timestamp: new Date(e.timestamp).toLocaleDateString(),
              equity: e.value
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="timestamp" 
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                interval={Math.floor(results.equityCurve.length / 10)}
              />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px'
                }}
              />
              <Line
                type="monotone"
                dataKey="equity"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Detailed Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Winning Trades:</span>
                <span className="text-emerald-400 font-semibold">{results.winningTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Losing Trades:</span>
                <span className="text-red-400 font-semibold">{results.losingTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Avg Win:</span>
                <span className="text-white font-semibold">${results.avgWin.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Avg Loss:</span>
                <span className="text-white font-semibold">${results.avgLoss.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Profit Factor:</span>
                <span className="text-white font-semibold">{results.profitFactor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Fees:</span>
                <span className="text-white font-semibold">${results.totalFees.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}