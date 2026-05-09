import React, { useMemo } from 'react';
import { AlertCircle, TrendingDown, Lock } from 'lucide-react';

export default function Robot1Diagnostics({ orders = [] }) {
  const analysis = useMemo(() => {
    // Filter Robot 1 orders (ETH-USDT, SOL-USDT only)
    const robot1Orders = orders.filter(o => 
      (o.instId === 'ETH-USDT' || o.instId === 'SOL-USDT') && 
      o.state === 'filled'
    );

    const buys = robot1Orders.filter(o => o.side === 'buy' || o.side === 'BUY');
    const sells = robot1Orders.filter(o => o.side === 'sell' || o.side === 'SELL');

    // Find unmatched positions (BUYs without SELL)
    const openPositions = [];
    const allBuys = [...buys];
    const allSells = [...sells];

    let totalRealizedPnL = 0;
    let closedCount = 0;

    // Match BUY→SELL pairs
    for (let i = 0; i < Math.min(buys.length, sells.length); i++) {
      const buy = buys[i];
      const sell = sells[i];
      
      const buyValue = parseFloat(buy.avgPx || 0) * parseFloat(buy.accFillSz || 0);
      const sellValue = parseFloat(sell.avgPx || 0) * parseFloat(sell.accFillSz || 0);
      const fees = Math.abs(parseFloat(buy.fee || 0)) + Math.abs(parseFloat(sell.fee || 0));
      
      const pnl = sellValue - buyValue - fees;
      totalRealizedPnL += pnl;
      closedCount++;
    }

    // Unmatched BUYs = open positions
    if (buys.length > sells.length) {
      for (let i = sells.length; i < buys.length; i++) {
        const buy = buys[i];
        openPositions.push({
          instId: buy.instId,
          side: 'BUY',
          qty: parseFloat(buy.accFillSz || 0),
          entryPrice: parseFloat(buy.avgPx || 0),
          timeOpen: buy.cTime,
          status: 'OPEN - WAITING FOR SELL SIGNAL'
        });
      }
    }

    // Other symbols = potential losses
    const otherCryptos = orders.filter(o => 
      o.state === 'filled' && 
      o.instId !== 'ETH-USDT' && 
      o.instId !== 'SOL-USDT'
    );

    const losingOrders = orders.filter(o => {
      const pnl = parseFloat(o.pnl || 0);
      return pnl < 0 && o.state === 'filled';
    });

    return {
      robot1Orders,
      buys,
      sells,
      openPositions,
      totalRealizedPnL,
      closedCount,
      otherCryptos,
      losingOrders,
      totalLoss: losingOrders.reduce((sum, o) => sum + Math.abs(parseFloat(o.pnl || 0)), 0)
    };
  }, [orders]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          Robot 1 Status
        </h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/70 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400">ETH-USDT Trades</div>
            <div className="text-lg font-bold text-white">{analysis.buys.length} BUY / {analysis.sells.length} SELL</div>
          </div>

          <div className="bg-slate-800/70 rounded-lg p-3 border border-emerald-500/20">
            <div className="text-xs text-slate-400">Realized P&L</div>
            <div className={`text-lg font-bold ${analysis.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {analysis.totalRealizedPnL >= 0 ? '+' : ''}{analysis.totalRealizedPnL.toFixed(2)} USDT
            </div>
          </div>

          <div className="bg-slate-800/70 rounded-lg p-3 border border-blue-500/20">
            <div className="text-xs text-slate-400">Open Positions</div>
            <div className="text-lg font-bold text-blue-400">{analysis.openPositions.length}</div>
          </div>

          <div className="bg-slate-800/70 rounded-lg p-3 border border-red-500/20">
            <div className="text-xs text-slate-400">Other Losses</div>
            <div className="text-lg font-bold text-red-400">-{analysis.totalLoss.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Open Positions - MUST CLOSE */}
      {analysis.openPositions.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Open Positions - WAITING TO CLOSE
          </h3>
          <div className="space-y-2">
            {analysis.openPositions.map((pos, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-white">{pos.instId}</span>
                  <span className="text-blue-400">{pos.qty.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Entry: ${pos.entryPrice.toFixed(2)}</span>
                  <span>Status: {pos.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Problem: Trades in other cryptos */}
      {analysis.otherCryptos.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            Problem: Active Positions in Other Cryptos ({analysis.otherCryptos.length})
          </h3>
          <p className="text-xs text-red-300 mb-3">
            Robot 1 is designed for ETH-USDT / SOL-USDT only. These positions are NOT managed by Robot 1:
          </p>
          <div className="space-y-2">
            {analysis.otherCryptos.slice(0, 10).map((o, i) => {
              const pnl = parseFloat(o.pnl || 0);
              return (
                <div key={i} className="bg-slate-800/50 rounded-lg p-2 text-xs flex justify-between items-center">
                  <span className="font-mono text-white">{o.instId}</span>
                  <span className={pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDT
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 p-2 bg-slate-800 rounded-lg border border-slate-700">
            <div className="text-xs text-slate-400">⚠ Recommendation:</div>
            <div className="text-xs text-red-300 mt-1">
              Close or isolate non-Robot1 positions. Robot 1 trades only ETH-USDT & SOL-USDT with Polygon signals + OKX execution.
            </div>
          </div>
        </div>
      )}

      {/* All losing orders */}
      {analysis.losingOrders.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-3">All Losing Trades</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-700">
                  <th className="text-left px-2 py-1">Pair</th>
                  <th className="text-left px-2 py-1">Side</th>
                  <th className="text-right px-2 py-1">P&L</th>
                </tr>
              </thead>
              <tbody>
                {analysis.losingOrders.slice(0, 8).map(o => (
                  <tr key={o.ordId} className="border-b border-slate-700/50">
                    <td className="px-2 py-1 font-mono text-white">{o.instId}</td>
                    <td className="px-2 py-1 text-slate-400">{o.side.toUpperCase()}</td>
                    <td className="px-2 py-1 text-right text-red-400">{parseFloat(o.pnl || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}