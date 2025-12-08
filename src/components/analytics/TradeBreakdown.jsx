import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity } from 'lucide-react';

export default function TradeBreakdown({ trades }) {
  const recentTrades = trades.slice(-10).reverse();
  
  const chartData = recentTrades.map((trade, idx) => ({
    name: `#${trades.length - idx}`,
    profit: trade.profit_loss,
    entry: trade.entry_price,
    exit: trade.exit_price
  }));

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Recent Trades Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto">
          {recentTrades.map((trade, idx) => (
            <div key={idx} className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    trade.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {trade.side}
                  </span>
                  <span className="text-sm text-white">{trade.symbol.replace('X:', '')}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Entry: ${trade.entry_price?.toFixed(2)} → Exit: ${trade.exit_price?.toFixed(2)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(trade.created_date).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${trade.profit_loss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400">
                  {((trade.profit_loss / trade.total_value) * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}