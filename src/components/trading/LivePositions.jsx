import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, X, DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function LivePositions({ subscription, trades = [] }) {
  const [positions, setPositions] = useState([]);
  const [currentPrices, setCurrentPrices] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => {
    // Calculate open positions from trades
    const openPositions = [];
    const positionMap = new Map();

    trades.forEach(trade => {
      const key = trade.symbol;
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          symbol: trade.symbol,
          side: trade.side,
          quantity: 0,
          avgEntry: 0,
          totalCost: 0,
          tradeIds: []
        });
      }

      const pos = positionMap.get(key);
      if (trade.side === 'BUY') {
        pos.quantity += trade.quantity;
        pos.totalCost += trade.total_value;
        pos.avgEntry = pos.totalCost / pos.quantity;
        pos.tradeIds.push(trade.id);
      } else {
        pos.quantity -= trade.quantity;
      }
    });

    // Filter only open positions
    const open = Array.from(positionMap.values()).filter(p => p.quantity > 0.0001);
    setPositions(open);
  }, [trades]);

  useEffect(() => {
    const fetchPrices = async () => {
      const priceMap = {};
      for (const pos of positions) {
        try {
          const symbol = pos.symbol.includes('X:') ? pos.symbol : `X:${pos.symbol.replace('/', '')}`;
          const response = await base44.functions.invoke('polygonMarketData', {
            action: 'ticker',
            symbol: symbol
          });

          if (response.data?.success && response.data.data?.results?.[0]) {
            priceMap[pos.symbol] = response.data.data.results[0].c;
          }
        } catch (error) {
          console.error('Error fetching price for', pos.symbol);
        }
      }
      setCurrentPrices(priceMap);
    };

    if (positions.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 5000);
      return () => clearInterval(interval);
    }
  }, [positions]);

  const handleClosePosition = async (position) => {
    try {
      const currentPrice = currentPrices[position.symbol] || position.avgEntry;
      const profit = (currentPrice - position.avgEntry) * position.quantity;

      // Create closing trade
      await base44.entities.Trade.create({
        subscription_id: subscription.id,
        symbol: position.symbol,
        side: 'SELL',
        quantity: position.quantity,
        price: currentPrice,
        total_value: currentPrice * position.quantity,
        fee: currentPrice * position.quantity * 0.001,
        profit_loss: profit,
        entry_price: position.avgEntry,
        exit_price: currentPrice,
        execution_mode: 'MANUAL',
        strategy_used: 'manual_close',
        timestamp: new Date().toISOString()
      });

      // Update subscription profit
      await base44.entities.UserSubscription.update(subscription.id, {
        total_profit: (subscription.total_profit || 0) + profit,
        total_trades: (subscription.total_trades || 0) + 1
      });

      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });

      toast.success(`Position closed with ${profit >= 0 ? 'profit' : 'loss'} of $${Math.abs(profit).toFixed(2)}`);
    } catch (error) {
      toast.error('Failed to close position: ' + error.message);
    }
  };

  if (positions.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            Open Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-slate-400">
            No open positions
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-amber-400" />
          Open Positions ({positions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {positions.map((pos, idx) => {
          const currentPrice = currentPrices[pos.symbol] || pos.avgEntry;
          const unrealizedPnL = (currentPrice - pos.avgEntry) * pos.quantity;
          const unrealizedPnLPct = ((currentPrice - pos.avgEntry) / pos.avgEntry) * 100;
          const isProfit = unrealizedPnL >= 0;

          return (
            <div key={idx} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isProfit ? (
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-400" />
                  )}
                  <div>
                    <div className="font-semibold text-white">{pos.symbol}</div>
                    <div className="text-xs text-slate-400">{pos.side} • {pos.quantity.toFixed(4)} units</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleClosePosition(pos)}
                  className="text-red-400 border-red-400/30 hover:bg-red-500/20"
                >
                  <X className="w-4 h-4 mr-1" />
                  Close
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Entry</div>
                  <div className="text-white font-semibold">${pos.avgEntry.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Current</div>
                  <div className="text-white font-semibold">${currentPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Unrealized P&L</div>
                  <div className={`font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                    ${unrealizedPnL.toFixed(2)}
                    <span className="text-xs ml-1">
                      ({isProfit ? '+' : ''}{unrealizedPnLPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bar showing P&L */}
              <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${isProfit ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(Math.abs(unrealizedPnLPct) * 2, 100)}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm">
          <div className="text-blue-300 font-semibold mb-1">Total Unrealized P&L</div>
          <div className={`text-2xl font-bold ${
            positions.reduce((sum, pos) => sum + ((currentPrices[pos.symbol] || pos.avgEntry) - pos.avgEntry) * pos.quantity, 0) >= 0
              ? 'text-green-400'
              : 'text-red-400'
          }`}>
            ${positions.reduce((sum, pos) => {
              const currentPrice = currentPrices[pos.symbol] || pos.avgEntry;
              return sum + ((currentPrice - pos.avgEntry) * pos.quantity);
            }, 0).toFixed(2)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}