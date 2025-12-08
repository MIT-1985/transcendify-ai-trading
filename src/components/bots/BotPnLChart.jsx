import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function BotPnLChart({ trades }) {
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) return [];

    const data = [];
    let cumulativeProfit = 0;

    // Reverse to get chronological order
    const chronologicalTrades = [...trades].reverse();

    chronologicalTrades.forEach((trade, idx) => {
      cumulativeProfit += trade.profit_loss || 0;
      data.push({
        trade: idx + 1,
        profit: cumulativeProfit,
        time: new Date(trade.timestamp).toLocaleTimeString(),
        amount: trade.profit_loss
      });
    });

    return data;
  }, [trades]);

  const totalProfit = chartData.length > 0 ? chartData[chartData.length - 1].profit : 0;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Cumulative P&L
          </CardTitle>
          <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={totalProfit >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={totalProfit >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="trade" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #334155', 
                  borderRadius: '8px' 
                }}
                formatter={(value, name) => {
                  if (name === 'profit') return [`$${value.toFixed(2)}`, 'Cumulative P&L'];
                  return value;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke={totalProfit >= 0 ? "#10b981" : "#ef4444"}
                fillOpacity={1} 
                fill="url(#profitGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            No trades yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}