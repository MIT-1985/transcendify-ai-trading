import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

export default function Robot1Monitor() {
  const [data, setData] = useState({
    freeUSDT: 0,
    openPositions: {},
    closedTradesToday: 0,
    realizedPnlToday: 0,
    skippedReasons: [],
    lastOrderId: null,
    lastOrderTime: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await base44.auth.me();
        if (!user) return;

        // Get all orders for today
        const today = new Date().toISOString().split('T')[0];
        const orders = await base44.entities.Order.list();
        
        // Filter today's orders
        const todayOrders = orders.filter(o => {
          const orderDate = o.filled_at?.split('T')[0] || o.created_date?.split('T')[0];
          return orderDate === today;
        });

        // Count closed trades (SELL orders)
        const closedTrades = todayOrders.filter(o => o.side === 'SELL').length;

        // Calculate realized P&L from FIFO matching
        let realizedPnl = 0;
        const positions = {};
        
        for (const order of todayOrders.sort((a, b) => 
          new Date(a.filled_at) - new Date(b.filled_at)
        )) {
          const symbol = order.symbol;
          if (!positions[symbol]) positions[symbol] = [];
          
          if (order.side === 'BUY') {
            positions[symbol].push({
              qty: order.quantity,
              price: order.average_price,
              fee: order.fee
            });
          } else {
            // SELL - match with oldest BUY (FIFO)
            while (positions[symbol]?.length > 0 && order.quantity > 0) {
              const buy = positions[symbol][0];
              const matchQty = Math.min(buy.qty, order.quantity);
              realizedPnl += (order.average_price - buy.price) * matchQty - (buy.fee + order.fee);
              buy.qty -= matchQty;
              order.quantity -= matchQty;
              if (buy.qty === 0) positions[symbol].shift();
            }
          }
        }

        // Get current open positions
        const openPos = {};
        for (const symbol in positions) {
          const remaining = positions[symbol].reduce((sum, p) => sum + p.qty, 0);
          if (remaining > 0.0001) {
            openPos[symbol] = remaining;
          }
        }

        // Get free USDT from OKX (approximate from first order's timestamp)
        const firstOrder = todayOrders[0];
        let freeUsdt = 0;
        if (firstOrder) {
          // Note: actual freeUSDT would come from OKX balance API
          // For now, estimate from capital_allocated
          const subs = await base44.entities.UserSubscription.list();
          freeUsdt = subs.reduce((sum, s) => sum + (s.capital_allocated || 0), 0);
        }

        const lastOrder = todayOrders[todayOrders.length - 1];

        setData({
          freeUSDT,
          openPositions: openPos,
          closedTradesToday: closedTrades,
          realizedPnlToday: Number(realizedPnl.toFixed(2)),
          skippedReasons: [],
          lastOrderId: lastOrder?.id,
          lastOrderTime: lastOrder?.filled_at
        });
      } catch (err) {
        console.error('[Robot1Monitor] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-center p-4 text-slate-400">Loading Robot 1 data...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Free USDT */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Free USDT</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">${data.freeUSDT.toFixed(2)}</div>
        </CardContent>
      </Card>

      {/* Open Positions */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(data.openPositions).length === 0 ? (
            <div className="text-slate-500 text-sm">None</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(data.openPositions).map(([symbol, qty]) => (
                <div key={symbol} className="flex justify-between text-sm">
                  <span className="text-blue-400">{symbol}</span>
                  <span className="text-white">{qty.toFixed(6)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Closed Trades Today */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Closed Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{data.closedTradesToday}</div>
        </CardContent>
      </Card>

      {/* Realized P&L */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Realized P&L (Today)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-3xl font-bold ${data.realizedPnlToday >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${data.realizedPnlToday.toFixed(2)}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {data.realizedPnlToday >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className="text-xs text-slate-400">from FIFO matching</span>
          </div>
        </CardContent>
      </Card>

      {/* Last Order */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400">Last Order</CardTitle>
        </CardHeader>
        <CardContent>
          {data.lastOrderId ? (
            <div className="space-y-1">
              <div className="text-xs font-mono text-blue-400 break-all">{data.lastOrderId}</div>
              <div className="text-xs text-slate-500">{new Date(data.lastOrderTime).toLocaleTimeString()}</div>
            </div>
          ) : (
            <div className="text-slate-500 text-sm">None yet</div>
          )}
        </CardContent>
      </Card>

      {/* Status */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-green-400">✓ Robot 1 Active</div>
          <div className="text-xs text-slate-500 mt-2">ETH-USDT, SOL-USDT only</div>
        </CardContent>
      </Card>
    </div>
  );
}