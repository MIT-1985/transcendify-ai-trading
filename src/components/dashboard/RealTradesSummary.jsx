import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import moment from 'moment';

export default function RealTradesSummary({ orders = [], balance = 0 }) {
  const metrics = useMemo(() => {
    const openTrades = orders.filter(o => ['live', 'partially_filled'].includes(o.state));
    const closedTrades = orders.filter(o => o.state === 'filled');
    
    // Calculate realized P&L by matching buy/sell pairs (FIFO)
    const symbolTrades = {};
    closedTrades.forEach(o => {
      if (!symbolTrades[o.instId]) symbolTrades[o.instId] = { buys: [], sells: [] };
      if (o.side === 'BUY' || o.side === 'buy') symbolTrades[o.instId].buys.push(o);
      else if (o.side === 'SELL' || o.side === 'sell') symbolTrades[o.instId].sells.push(o);
    });

    let totalProfit = 0;
    const tradesPnl = {};
    
    Object.entries(symbolTrades).forEach(([symbol, { buys, sells }]) => {
      buys.sort((a, b) => a.cTime - b.cTime);
      sells.sort((a, b) => a.cTime - b.cTime);
      
      let buyQueue = [...buys];
      sells.forEach(sell => {
        if (!sell.accFillSz || !sell.avgPx) return;
        
        let remainingSellQty = parseFloat(sell.accFillSz);
        while (remainingSellQty > 0 && buyQueue.length > 0) {
          const buy = buyQueue[0];
          const qtyToClose = Math.min(remainingSellQty, parseFloat(buy.accFillSz || 0));
          
          const pnl = (parseFloat(sell.avgPx) - parseFloat(buy.avgPx)) * qtyToClose 
                    - Math.abs(parseFloat(buy.fee || 0)) 
                    - Math.abs(parseFloat(sell.fee || 0));
          
          tradesPnl[sell.ordId] = pnl;
          totalProfit += pnl;
          remainingSellQty -= qtyToClose;
          buy.accFillSz = parseFloat(buy.accFillSz || 0) - qtyToClose;
          
          if (parseFloat(buy.accFillSz) <= 0) {
            buyQueue.shift();
          }
        }
      });
    });

    const totalVolume = orders.reduce((sum, o) => {
      return sum + parseFloat(o.notional || o.sz * o.avgPx || 0);
    }, 0);

    const winTrades = closedTrades.filter(o => (tradesPnl[o.ordId] || 0) > 0).length;
    const winRate = closedTrades.length > 0 ? (winTrades / closedTrades.length * 100).toFixed(1) : 0;

    return { openTrades, closedTrades, totalProfit, totalVolume, winRate, winTrades, tradesPnl };
  }, [orders]);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-400" />
        Real Trading Summary
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {/* Balance */}
        <div className="bg-slate-800/70 rounded-xl p-4 border border-yellow-500/20">
          <div className="text-xs text-slate-400 uppercase mb-1">Account</div>
          <div className="text-2xl font-bold text-yellow-400">${balance.toFixed(2)}</div>
          <div className="text-xs text-slate-500 mt-1">USDT</div>
        </div>

        {/* Open Trades */}
        <div className="bg-slate-800/70 rounded-xl p-4 border border-blue-500/20">
          <div className="text-xs text-slate-400 uppercase mb-1">Open Trades</div>
          <div className="text-2xl font-bold text-blue-400">{metrics.openTrades.length}</div>
          <div className="text-xs text-slate-500 mt-1">Active Now</div>
        </div>

        {/* Total P&L */}
        <div className={`bg-slate-800/70 rounded-xl p-4 border ${metrics.totalProfit >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
          <div className="text-xs text-slate-400 uppercase mb-1">Total P&L</div>
          <div className={`text-2xl font-bold flex items-center gap-1 ${metrics.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {metrics.totalProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            ${Math.abs(metrics.totalProfit).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">All trades</div>
        </div>

        {/* Win Rate */}
        <div className="bg-slate-800/70 rounded-xl p-4 border border-purple-500/20">
          <div className="text-xs text-slate-400 uppercase mb-1">Win Rate</div>
          <div className="text-2xl font-bold text-purple-400">{metrics.winRate}%</div>
          <div className="text-xs text-slate-500 mt-1">{metrics.winTrades}/{metrics.closedTrades.length}</div>
        </div>
      </div>

      {/* Active Trades Table */}
      {metrics.openTrades.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-white mb-3">Active Positions</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr className="text-slate-400">
                  <th className="text-left px-3 py-2">Pair</th>
                  <th className="text-left px-3 py-2">Side</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Entry</th>
                  <th className="text-right px-3 py-2">Avg Price</th>
                  <th className="text-right px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {metrics.openTrades.slice(0, 5).map(o => (
                  <tr key={o.ordId} className="border-t border-slate-700/50 hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-semibold text-white">{o.instId}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${o.side === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">{parseFloat(o.sz).toFixed(4)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">${parseFloat(o.px).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">${parseFloat(o.avgPx || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{moment(o.cTime).fromNow()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Closed Trades */}
      {metrics.closedTrades.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Recent Closed Trades</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr className="text-slate-400">
                  <th className="text-left px-3 py-2">Pair</th>
                  <th className="text-left px-3 py-2">Side</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Avg Price</th>
                  <th className="text-right px-3 py-2">P&L</th>
                  <th className="text-right px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {metrics.closedTrades.slice(0, 5).map(o => {
                   const pnl = metrics.tradesPnl[o.ordId] !== undefined ? metrics.tradesPnl[o.ordId] : parseFloat(o.pnl || 0);
                   const isSell = o.side === 'SELL' || o.side === 'sell';
                   return (
                     <tr key={o.ordId} className="border-t border-slate-700/50 hover:bg-slate-800/30">
                       <td className="px-3 py-2 font-semibold text-white">{o.instId}</td>
                       <td className="px-3 py-2">
                         <span className={`px-2 py-0.5 rounded text-xs font-bold ${(o.side === 'BUY' || o.side === 'buy') ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                           {o.side.toUpperCase()}
                         </span>
                       </td>
                       <td className="px-3 py-2 text-right font-mono text-slate-300">{parseFloat(o.accFillSz || o.sz).toFixed(4)}</td>
                       <td className="px-3 py-2 text-right text-slate-300">${parseFloat(o.avgPx).toFixed(2)}</td>
                       <td className={`px-3 py-2 text-right font-bold ${isSell && pnl >= 0 ? 'text-emerald-400' : isSell && pnl < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                         {isSell ? (pnl >= 0 ? '+' : '')+ pnl.toFixed(4) : '—'}
                       </td>
                       <td className="px-3 py-2 text-right text-slate-500">{moment(o.cTime).fromNow()}</td>
                     </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No trades yet</p>
        </div>
      )}
    </div>
  );
}