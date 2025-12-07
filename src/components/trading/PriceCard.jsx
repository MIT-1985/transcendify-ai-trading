import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PriceCard({ symbol, price, change, volume }) {
  const isPositive = change >= 0;
  
  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-4 hover:border-blue-500/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-semibold">{symbol}</span>
        <div className={cn(
          "flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full",
          isPositive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
        )}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? '+' : ''}{change?.toFixed(2)}%
        </div>
      </div>
      <div className="text-2xl font-bold text-white mb-1">
        ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {volume && (
        <div className="text-xs text-slate-500">
          Vol: ${(volume / 1000000).toFixed(2)}M
        </div>
      )}
    </div>
  );
}