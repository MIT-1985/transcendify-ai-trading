import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function EquityChart({ trades, initialCapital }) {
  const equityData = [];
  let runningEquity = initialCapital;

  trades.forEach((trade, idx) => {
    runningEquity += trade.profit_loss || 0;
    equityData.push({
      trade: idx + 1,
      equity: runningEquity,
      time: new Date(trade.created_date).toLocaleTimeString(),
      profit: trade.profit_loss
    });
  });

  const currentEquity = equityData[equityData.length - 1]?.equity || initialCapital;
  const totalReturn = ((currentEquity - initialCapital) / initialCapital) * 100;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Equity Curve
          </CardTitle>
          <div className="text-right">
            <div className="text-xs text-slate-400">Total Return</div>
            <div className={`text-xl font-bold ${totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={equityData}>
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="trade" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Area 
              type="monotone" 
              dataKey="equity" 
              stroke="#3b82f6" 
              strokeWidth={2}
              fill="url(#equityGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}