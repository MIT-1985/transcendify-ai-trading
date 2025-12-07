import React from 'react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function TradeHistory({ trades }) {
  return (
    <Card className="bg-slate-900/50 border-slate-800 p-6">
      <h3 className="text-lg font-semibold mb-4 text-white">Recent Trades</h3>
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-2">
          {trades.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No trades yet. Start the bot to begin trading.
            </div>
          ) : (
            trades.slice().reverse().map((trade) => (
              <div 
                key={trade.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  trade.profit_loss >= 0 
                    ? "bg-emerald-500/5 border-emerald-500/20" 
                    : "bg-red-500/5 border-red-500/20"
                )}
              >
                <div className="flex items-center gap-3">
                  {trade.profit_loss >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-400" />
                  )}
                  <div>
                    <div className="font-semibold text-white text-sm">
                      {trade.symbol} {trade.side}
                    </div>
                    <div className="text-xs text-slate-500">
                      {moment(trade.timestamp).format('HH:mm:ss')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "font-bold text-sm",
                    trade.profit_loss >= 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss?.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-500">
                    @${trade.price?.toFixed(2)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}