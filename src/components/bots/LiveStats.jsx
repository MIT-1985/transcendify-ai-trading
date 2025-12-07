import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Target, Zap, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LiveStats({ subscription, trades, currentProfit, elapsedSeconds }) {
  const winTrades = trades.filter(t => t.profit_loss > 0).length;
  const lossTrades = trades.filter(t => t.profit_loss <= 0).length;
  const winRate = trades.length > 0 ? (winTrades / trades.length) * 100 : 0;
  
  const avgWin = winTrades > 0 
    ? trades.filter(t => t.profit_loss > 0).reduce((sum, t) => sum + t.profit_loss, 0) / winTrades 
    : 0;
  const avgLoss = lossTrades > 0 
    ? Math.abs(trades.filter(t => t.profit_loss <= 0).reduce((sum, t) => sum + t.profit_loss, 0) / lossTrades)
    : 0;

  const roi = subscription?.capital_allocated 
    ? (currentProfit / subscription.capital_allocated) * 100 
    : 0;

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <Card className={cn(
        "p-4 border",
        currentProfit >= 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"
      )}>
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className={cn("w-4 h-4", currentProfit >= 0 ? "text-emerald-400" : "text-red-400")} />
          <span className="text-xs text-slate-400">Total Profit</span>
        </div>
        <div className={cn(
          "text-2xl font-bold",
          currentProfit >= 0 ? "text-emerald-400" : "text-red-400"
        )}>
          ${currentProfit.toFixed(2)}
        </div>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-slate-400">Win Rate</span>
        </div>
        <div className="text-2xl font-bold text-white">
          {winRate.toFixed(1)}%
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {winTrades}W / {lossTrades}L
        </div>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <span className="text-xs text-slate-400">ROI</span>
        </div>
        <div className={cn(
          "text-2xl font-bold",
          roi >= 0 ? "text-emerald-400" : "text-red-400"
        )}>
          {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
        </div>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-slate-400">Avg Win/Loss</span>
        </div>
        <div className="text-sm text-white">
          <span className="text-emerald-400">${avgWin.toFixed(2)}</span>
          {' / '}
          <span className="text-red-400">${avgLoss.toFixed(2)}</span>
        </div>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-slate-400">Runtime</span>
        </div>
        <div className="text-xl font-mono font-bold text-white">
          {formatTime(elapsedSeconds)}
        </div>
      </Card>
    </div>
  );
}