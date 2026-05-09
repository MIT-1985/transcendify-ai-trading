import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Database, TrendingUp, TrendingDown } from 'lucide-react';

export default function Robot1Monitor() {
  const [balance, setBalance] = useState({ usdt: 0, eth: 0, status: 'LOADING', error: null });
  const [rawOrders, setRawOrders] = useState({ orders: [], count: 0, status: 'LOADING', error: null });
  const [robot1, setRobot1] = useState({ 
    activePosition: null, 
    realizedPnL: 0, 
    closedTrades: 0, 
    status: 'LOADING', 
    error: null 
  });

  // SECTION A: Live OKX Balance
  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await base44.functions.invoke('getSuzanaBalance', {});
        if (res.data?.success) {
          const details = res.data.details || {};
          setBalance({
            usdt: details.USDT || 0,
            eth: details.ETH || 0,
            status: 'OK',
            error: null
          });
        } else {
          setBalance(prev => ({
            ...prev,
            status: res.data?.status || 'FAILED',
            error: res.data?.reason || 'Unknown error'
          }));
        }
      } catch (err) {
        setBalance(prev => ({
          ...prev,
          status: 'ERROR',
          error: err.message
        }));
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  // SECTION B: Raw OKX Orders (all instruments)
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await base44.functions.invoke('getSuzanaOrders', {});
        if (res.data?.success) {
          const orders = res.data.orders || [];
          setRawOrders({
            orders: orders,
            count: orders.length,
            status: 'OK',
            error: null
          });
        } else {
          setRawOrders(prev => ({
            ...prev,
            status: res.data?.status || 'FAILED',
            error: res.data?.reason || 'Cannot fetch OKX orders'
          }));
        }
      } catch (err) {
        setRawOrders(prev => ({
          ...prev,
          status: 'ERROR',
          error: err.message
        }));
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  // SECTION C: Robot 1 Verified Strategy (ETH-USDT, SOL-USDT only)
  useEffect(() => {
    const fetchRobot1 = async () => {
      try {
        // Get all Robot 1 trades from database
        const trades = await base44.entities.Trade.filter({
          strategy_used: 'robot1',
          execution_mode: 'MAINNET'
        });

        // Filter only ETH-USDT and SOL-USDT
        const robot1Trades = trades.filter(t => 
          t.symbol === 'ETH-USDT' || t.symbol === 'SOL-USDT'
        );

        // Find active position (BUY without exit_price)
        const activePos = robot1Trades.find(t => t.side === 'BUY' && !t.exit_price);

        // Calculate realized P&L from verified OKX order pairs
        // Match BUY→SELL pairs by symbol & timestamp sequence
        let realizedPnL = 0;
        let closedCount = 0;

        const paired = new Map(); // symbol -> { buys: [], sells: [] }
        for (const trade of robot1Trades) {
          const sym = trade.symbol;
          if (!paired.has(sym)) paired.set(sym, { buys: [], sells: [] });
          const p = paired.get(sym);
          if (trade.side === 'BUY') p.buys.push(trade);
          else p.sells.push(trade);
        }

        for (const { buys, sells } of paired.values()) {
          buys.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
          sells.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

          for (let i = 0; i < Math.min(buys.length, sells.length); i++) {
            const buy = buys[i];
            const sell = sells[i];
            if (buy.exit_price) continue; // Skip if buy has exit (matched with another sell)

            const buyValue = (buy.entry_price || buy.price) * buy.quantity + (buy.fee || 0);
            const sellValue = (sell.exit_price || sell.price) * sell.quantity - (sell.fee || 0);
            realizedPnL += sellValue - buyValue;
            closedCount++;
          }
        }

        setRobot1({
          activePosition: activePos ? {
            symbol: activePos.symbol,
            qty: activePos.quantity,
            entryPrice: activePos.entry_price,
            entryTime: activePos.created_date
          } : null,
          realizedPnL: parseFloat(realizedPnL.toFixed(2)),
          closedTrades: closedCount,
          status: 'OK',
          error: null
        });
      } catch (err) {
        setRobot1(prev => ({
          ...prev,
          status: 'ERROR',
          error: err.message
        }));
      }
    };

    fetchRobot1();
    const interval = setInterval(fetchRobot1, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION A: OKX LIVE BALANCE */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">A) OKX Live Balance</h3>
        {balance.status === 'LOADING' ? (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="text-slate-400">Loading balance...</div>
            </CardContent>
          </Card>
        ) : balance.status !== 'OK' ? (
          <Card className="border-red-700 bg-red-900/20">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4" /> Balance Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-red-300">{balance.error}</div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-400">Free USDT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">${balance.usdt.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-400">ETH Held</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-400">{balance.eth.toFixed(6)}</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION B: RAW OKX ORDERS (UNFILTERED) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">B) Raw OKX Orders</h3>
        {rawOrders.status === 'LOADING' ? (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="text-slate-400">Loading orders...</div>
            </CardContent>
          </Card>
        ) : rawOrders.status !== 'OK' ? (
          <Card className="border-orange-700 bg-orange-900/20">
            <CardHeader>
              <CardTitle className="text-orange-400 flex items-center gap-2 text-sm">
                <Database className="w-4 h-4" /> Orders Not Accessible
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-orange-300">{rawOrders.error}</div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400">
                Total: <span className="text-white font-mono">{rawOrders.count}</span> orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-slate-500">
                All instruments, all fills. Raw OKX data - not Robot 1 filtered.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION C: ROBOT 1 VERIFIED STRATEGY */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">C) Robot 1 Strategy (ETH-USDT / SOL-USDT)</h3>
        {robot1.status === 'LOADING' ? (
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="text-slate-400">Loading strategy data...</div>
            </CardContent>
          </Card>
        ) : robot1.status !== 'OK' ? (
          <Card className="border-red-700 bg-red-900/20">
            <CardHeader>
              <CardTitle className="text-red-400 flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4" /> Strategy Error
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-red-300">{robot1.error}</div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Active Position */}
            <Card className={`border-slate-700 ${robot1.activePosition ? 'bg-blue-900/20' : 'bg-slate-900/50'}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-400">Active Position</CardTitle>
              </CardHeader>
              <CardContent>
                {robot1.activePosition ? (
                  <div className="space-y-1">
                    <div className="text-sm font-mono text-blue-400">{robot1.activePosition.symbol}</div>
                    <div className="text-lg font-bold text-white">{robot1.activePosition.qty.toFixed(6)}</div>
                    <div className="text-xs text-slate-500">Entry: ${robot1.activePosition.entryPrice.toFixed(2)}</div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm">None</div>
                )}
              </CardContent>
            </Card>

            {/* Realized P&L */}
            <Card className={`border-slate-700 bg-slate-900/50`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-400">Realized P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${robot1.realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${robot1.realizedPnL.toFixed(2)}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {robot1.realizedPnL >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-400" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                  <span className="text-xs text-slate-500">BUY→SELL pairs</span>
                </div>
              </CardContent>
            </Card>

            {/* Closed Trades */}
            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-400">Closed Trades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{robot1.closedTrades}</div>
                <div className="text-xs text-slate-500 mt-1">Matched pairs</div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card className="border-slate-700 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-slate-400">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-green-400 text-sm font-mono">✓ ACTIVE</div>
                <div className="text-xs text-slate-500 mt-2">
                  Polygon Signal<br />+ OKX Execution
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}