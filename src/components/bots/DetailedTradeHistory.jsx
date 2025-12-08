import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function DetailedTradeHistory({ trades }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredTrades = trades?.filter(trade => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'wins' && trade.profit_loss > 0) ||
      (filter === 'losses' && trade.profit_loss <= 0);
    
    const matchesSearch = 
      search === '' || 
      trade.symbol.toLowerCase().includes(search.toLowerCase());
    
    return matchesFilter && matchesSearch;
  }) || [];

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="space-y-4">
          <CardTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            Detailed Trade History
          </CardTitle>
          
          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by symbol..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32 bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="wins">Wins</SelectItem>
                <SelectItem value="losses">Losses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredTrades.length > 0 ? (
            filteredTrades.map((trade) => (
              <div 
                key={trade.id} 
                className="bg-slate-800/50 rounded-lg p-4 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Badge className={trade.side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                      {trade.side}
                    </Badge>
                    <span className="text-white font-semibold">{trade.symbol}</span>
                  </div>
                  <div className={`text-right ${trade.profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <div className="font-bold flex items-center gap-1">
                      {trade.profit_loss >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss.toFixed(2)}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500 text-xs">Quantity</div>
                    <div className="text-slate-300">{trade.quantity.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">Entry Price</div>
                    <div className="text-slate-300">${trade.entry_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">Exit Price</div>
                    <div className="text-slate-300">${trade.exit_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">Fee</div>
                    <div className="text-slate-300">${trade.fee.toFixed(2)}</div>
                  </div>
                </div>
                
                {trade.strategy_used && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <div className="text-xs text-slate-400">Strategy: {trade.strategy_used}</div>
                  </div>
                )}
                
                <div className="mt-2 text-xs text-slate-500">
                  {new Date(trade.timestamp).toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-slate-500">
              No trades found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}