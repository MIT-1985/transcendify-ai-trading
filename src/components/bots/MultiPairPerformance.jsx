import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function MultiPairPerformance({ trades }) {
  // Group trades by symbol
  const pairStats = {};
  
  trades.forEach(trade => {
    const symbol = trade.symbol || 'UNKNOWN';
    if (!pairStats[symbol]) {
      pairStats[symbol] = {
        trades: 0,
        profit: 0,
        wins: 0,
        losses: 0
      };
    }
    
    pairStats[symbol].trades++;
    pairStats[symbol].profit += trade.profit_loss || 0;
    if ((trade.profit_loss || 0) > 0) pairStats[symbol].wins++;
    else pairStats[symbol].losses++;
  });
  
  const pairs = Object.entries(pairStats).sort((a, b) => b[1].profit - a[1].profit);
  
  if (pairs.length === 0) {
    return (
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg">Multi-Pair Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-400 text-center py-4">
            No trades yet
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-lg">Multi-Pair Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pairs.map(([symbol, stats]) => {
            const winRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
            const isPositive = stats.profit >= 0;
            
            return (
              <div key={symbol} className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {symbol.replace('X:', '').replace('USD', '/USD')}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {stats.trades} trades
                    </Badge>
                  </div>
                  <div className={`flex items-center gap-1 font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    ${stats.profit.toFixed(2)}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Win Rate</div>
                    <div className="text-white font-semibold">{winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Wins</div>
                    <div className="text-green-400 font-semibold">{stats.wins}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Losses</div>
                    <div className="text-red-400 font-semibold">{stats.losses}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}