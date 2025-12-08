import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, TrendingUp } from 'lucide-react';

export default function IndicatorPerformance({ trades }) {
  const analyzeIndicators = () => {
    const indicators = {
      rsi_low: { wins: 0, losses: 0, total: 0 },
      rsi_high: { wins: 0, losses: 0, total: 0 },
      macd_positive: { wins: 0, losses: 0, total: 0 },
      macd_negative: { wins: 0, losses: 0, total: 0 },
      bb_lower: { wins: 0, losses: 0, total: 0 },
      bb_upper: { wins: 0, losses: 0, total: 0 }
    };

    trades.forEach(trade => {
      const strategy = trade.strategy_used || '';
      const isWin = trade.profit_loss > 0;
      
      if (strategy.includes('RSI:')) {
        const rsi = parseFloat(strategy.match(/RSI:([\d.]+)/)?.[1]);
        if (rsi) {
          if (rsi < 30) {
            indicators.rsi_low.total++;
            if (isWin) indicators.rsi_low.wins++;
            else indicators.rsi_low.losses++;
          } else if (rsi > 70) {
            indicators.rsi_high.total++;
            if (isWin) indicators.rsi_high.wins++;
            else indicators.rsi_high.losses++;
          }
        }
      }
      
      if (strategy.includes('MACD:')) {
        const macd = parseFloat(strategy.match(/MACD:([-\d.]+)/)?.[1]);
        if (macd) {
          if (macd > 0) {
            indicators.macd_positive.total++;
            if (isWin) indicators.macd_positive.wins++;
            else indicators.macd_positive.losses++;
          } else {
            indicators.macd_negative.total++;
            if (isWin) indicators.macd_negative.wins++;
            else indicators.macd_negative.losses++;
          }
        }
      }
    });

    return Object.entries(indicators)
      .filter(([_, data]) => data.total > 0)
      .map(([name, data]) => ({
        name: name.replace(/_/g, ' ').toUpperCase(),
        winRate: (data.wins / data.total) * 100,
        trades: data.total,
        wins: data.wins,
        losses: data.losses
      }))
      .sort((a, b) => b.winRate - a.winRate);
  };

  const indicatorStats = analyzeIndicators();

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          Indicator Performance Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {indicatorStats.length === 0 ? (
          <div className="text-center py-8 text-slate-500">Not enough data for analysis</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {indicatorStats.map((stat, idx) => (
              <div key={idx} className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-white">{stat.name}</div>
                  <TrendingUp className={`w-4 h-4 ${stat.winRate >= 60 ? 'text-emerald-400' : stat.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`} />
                </div>
                
                <div className={`text-3xl font-bold mb-2 ${
                  stat.winRate >= 60 ? 'text-emerald-400' : 
                  stat.winRate >= 50 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {stat.winRate.toFixed(1)}%
                </div>
                
                <div className="space-y-1 text-xs text-slate-400">
                  <div>Total Trades: {stat.trades}</div>
                  <div className="flex justify-between">
                    <span className="text-emerald-400">{stat.wins} Wins</span>
                    <span className="text-red-400">{stat.losses} Losses</span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${
                      stat.winRate >= 60 ? 'bg-emerald-500' : 
                      stat.winRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${stat.winRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        
        {indicatorStats.length > 0 && (
          <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="text-sm text-blue-400 font-semibold mb-2">Performance Insights</div>
            <div className="text-xs text-slate-300 space-y-1">
              <div>• Best performing: {indicatorStats[0]?.name} ({indicatorStats[0]?.winRate.toFixed(1)}% win rate)</div>
              <div>• Total signals analyzed: {indicatorStats.reduce((sum, s) => sum + s.trades, 0)}</div>
              <div>• Overall accuracy: {((indicatorStats.reduce((sum, s) => sum + s.wins, 0) / indicatorStats.reduce((sum, s) => sum + s.trades, 0)) * 100).toFixed(1)}%</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}