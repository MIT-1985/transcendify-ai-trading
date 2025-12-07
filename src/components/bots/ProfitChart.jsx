import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card } from '@/components/ui/card';

export default function ProfitChart({ trades }) {
  const chartData = React.useMemo(() => {
    let runningProfit = 0;
    return trades.map((trade, idx) => {
      runningProfit += trade.profit_loss || 0;
      return {
        index: idx + 1,
        profit: runningProfit,
        trade: trade.profit_loss
      };
    });
  }, [trades]);

  return (
    <Card className="bg-slate-900/50 border-slate-800 p-6">
      <h3 className="text-lg font-semibold mb-4 text-white">Profit Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="index" 
            stroke="#64748b"
            tick={{ fill: '#64748b' }}
            label={{ value: 'Trades', position: 'insideBottom', offset: -5, fill: '#64748b' }}
          />
          <YAxis 
            stroke="#64748b"
            tick={{ fill: '#64748b' }}
            label={{ value: 'Profit ($)', angle: -90, position: 'insideLeft', fill: '#64748b' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1e293b', 
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#fff'
            }}
            formatter={(value) => ['$' + value.toFixed(2), 'Profit']}
          />
          <Area 
            type="monotone" 
            dataKey="profit" 
            stroke="#10b981" 
            strokeWidth={2}
            fill="url(#profitGradient)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}