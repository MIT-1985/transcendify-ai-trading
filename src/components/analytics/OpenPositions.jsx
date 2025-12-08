import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function OpenPositions({ subscription, trades }) {
  const positions = [];
  const tradesBySymbol = {};
  
  trades.forEach(trade => {
    if (!tradesBySymbol[trade.symbol]) {
      tradesBySymbol[trade.symbol] = [];
    }
    tradesBySymbol[trade.symbol].push(trade);
  });

  Object.entries(tradesBySymbol).forEach(([symbol, symbolTrades]) => {
    symbolTrades.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    
    let position = { symbol, quantity: 0, totalCost: 0, trades: [] };
    
    symbolTrades.forEach(trade => {
      if (trade.side === 'BUY') {
        position.quantity += trade.quantity;
        position.totalCost += trade.total_value;
        position.trades.push(trade);
      } else if (trade.side === 'SELL') {
        position.quantity -= trade.quantity;
        position.totalCost -= trade.total_value;
      }
    });
    
    if (position.quantity > 0.0001) {
      position.avgEntry = position.totalCost / position.quantity;
      position.currentPrice = symbolTrades[symbolTrades.length - 1].price;
      position.unrealizedPnL = (position.currentPrice - position.avgEntry) * position.quantity;
      positions.push(position);
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Open Positions ({positions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No open positions</div>
        ) : (
          <div className="space-y-3">
            {positions.map((pos, idx) => (
              <div key={idx} className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-white">{pos.symbol.replace('X:', '')}</div>
                    <div className="text-xs text-slate-400">{pos.quantity.toFixed(8)} units</div>
                  </div>
                  <div className={`text-right ${pos.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <div className="text-xl font-bold">
                      {pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)}
                    </div>
                    <div className="text-xs">
                      {((pos.unrealizedPnL / pos.totalCost) * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Avg Entry</div>
                    <div className="text-white font-medium">${pos.avgEntry.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Current</div>
                    <div className="text-white font-medium">${pos.currentPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Total Cost</div>
                    <div className="text-white font-medium">${pos.totalCost.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}