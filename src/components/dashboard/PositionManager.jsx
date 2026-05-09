import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Archive, Zap, Lock, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ROBOT1_SYMBOLS = ['ETH-USDT', 'SOL-USDT'];

export default function PositionManager({ orders = [] }) {
  const [archiving, setArchiving] = useState(false);

  const analysis = useMemo(() => {
    // === ROBOT 1: Only ETH-USDT & SOL-USDT ===
    const robot1Orders = orders.filter(o => 
      ROBOT1_SYMBOLS.includes(o.instId) && o.state === 'filled'
    );

    const robot1Buys = robot1Orders.filter(o => o.side === 'buy' || o.side === 'BUY');
    const robot1Sells = robot1Orders.filter(o => o.side === 'sell' || o.side === 'SELL');

    // Match BUY→SELL pairs for Robot 1
    let robot1ClosedCount = 0;
    let robot1RealizedPnL = 0;
    const robot1OpenPositions = [];

    for (let i = 0; i < Math.min(robot1Buys.length, robot1Sells.length); i++) {
      const buy = robot1Buys[i];
      const sell = robot1Sells[i];
      const buyValue = parseFloat(buy.avgPx || 0) * parseFloat(buy.accFillSz || 0);
      const sellValue = parseFloat(sell.avgPx || 0) * parseFloat(sell.accFillSz || 0);
      const fees = Math.abs(parseFloat(buy.fee || 0)) + Math.abs(parseFloat(sell.fee || 0));
      const pnl = sellValue - buyValue - fees;
      robot1RealizedPnL += pnl;
      robot1ClosedCount++;
    }

    // Robot 1 open positions (unmatched BUYs)
    if (robot1Buys.length > robot1Sells.length) {
      for (let i = robot1Sells.length; i < robot1Buys.length; i++) {
        const buy = robot1Buys[i];
        robot1OpenPositions.push({
          instId: buy.instId,
          side: 'BUY',
          qty: parseFloat(buy.accFillSz || 0),
          entryPrice: parseFloat(buy.avgPx || 0),
          timeOpen: buy.cTime,
          status: 'OPEN - WAITING FOR SELL SIGNAL',
          ordId: buy.ordId
        });
      }
    }

    // === LEGACY: Everything else ===
    const legacyOrders = orders.filter(o => 
      !ROBOT1_SYMBOLS.includes(o.instId) && o.state === 'filled'
    );

    const legacyBuys = legacyOrders.filter(o => o.side === 'buy' || o.side === 'BUY');
    const legacySells = legacyOrders.filter(o => o.side === 'sell' || o.side === 'SELL');

    // Categorize legacy positions
    const legacyOpenPositions = [];
    const verifiedLegacyPositions = [];

    // Match BUY→SELL pairs for legacy
    for (let i = 0; i < Math.min(legacyBuys.length, legacySells.length); i++) {
      const buy = legacyBuys[i];
      const sell = legacySells[i];
      const buyValue = parseFloat(buy.avgPx || 0) * parseFloat(buy.accFillSz || 0);
      const sellValue = parseFloat(sell.avgPx || 0) * parseFloat(sell.accFillSz || 0);
      const fees = Math.abs(parseFloat(buy.fee || 0)) + Math.abs(parseFloat(sell.fee || 0));
      const pnl = sellValue - buyValue - fees;

      verifiedLegacyPositions.push({
        instId: buy.instId,
        status: 'VERIFIED_CLOSED',
        buyQty: parseFloat(buy.accFillSz || 0),
        buyPrice: parseFloat(buy.avgPx || 0),
        sellQty: parseFloat(sell.accFillSz || 0),
        sellPrice: parseFloat(sell.avgPx || 0),
        pnl,
        buyCTime: buy.cTime,
        sellCTime: sell.cTime
      });
    }

    // Unmatched legacy BUYs = unverified open positions
    if (legacyBuys.length > legacySells.length) {
      for (let i = legacySells.length; i < legacyBuys.length; i++) {
        const buy = legacyBuys[i];
        legacyOpenPositions.push({
          instId: buy.instId,
          qty: parseFloat(buy.accFillSz || 0),
          entryPrice: parseFloat(buy.avgPx || 0),
          timeOpen: buy.cTime,
          status: 'UNVERIFIED_LEGACY_POSITION',
          ordId: buy.ordId
        });
      }
    }

    const legacyTotalLoss = legacyOrders
      .filter(o => parseFloat(o.pnl || 0) < 0)
      .reduce((sum, o) => sum + Math.abs(parseFloat(o.pnl || 0)), 0);

    return {
      // Robot 1
      robot1Orders,
      robot1Buys,
      robot1Sells,
      robot1OpenPositions,
      robot1ClosedCount,
      robot1RealizedPnL,
      robot1PositionCount: robot1OpenPositions.length,

      // Legacy
      legacyOrders,
      legacyOpenPositions,
      verifiedLegacyPositions,
      legacyPositionCount: legacyOpenPositions.length + verifiedLegacyPositions.length,
      legacyTotalLoss,
      legacyUnverifiedCount: legacyOpenPositions.length
    };
  }, [orders]);

  const handleArchiveLegacy = async () => {
    setArchiving(true);
    try {
      // Mark legacy positions for archival (update a flag or status in the backend)
      // For now, just a placeholder - in real implementation, would update positions
      await base44.functions.invoke('archiveLegacyPositions', {
        legacyOrderIds: analysis.legacyOrders.map(o => o.ordId)
      });
      alert('Legacy positions archived successfully');
    } catch (e) {
      console.error('Archive failed:', e);
      alert('Failed to archive: ' + e.message);
    }
    setArchiving(false);
  };

  return (
    <div className="space-y-6">
      {/* === ROBOT 1 ACTIVE POSITION === */}
      <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Robot 1 Active Position</h2>
          </div>
          <Badge className="bg-blue-900 text-blue-300">ETH-USDT / SOL-USDT Only</Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-800/70 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400">Closed Trades</div>
            <div className="text-lg font-bold text-white">{analysis.robot1ClosedCount}</div>
          </div>

          <div className={cn(
            "bg-slate-800/70 rounded-lg p-3 border",
            analysis.robot1RealizedPnL >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'
          )}>
            <div className="text-xs text-slate-400">Realized P&L</div>
            <div className={`text-lg font-bold ${analysis.robot1RealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {analysis.robot1RealizedPnL >= 0 ? '+' : ''}{analysis.robot1RealizedPnL.toFixed(2)} USDT
            </div>
          </div>

          <div className="bg-slate-800/70 rounded-lg p-3 border border-blue-500/20">
            <div className="text-xs text-slate-400">Open Positions</div>
            <div className="text-lg font-bold text-blue-400">{analysis.robot1PositionCount}</div>
          </div>

          <div className="bg-slate-800/70 rounded-lg p-3 border border-blue-500/20">
            <div className="text-xs text-slate-400">Total Trades</div>
            <div className="text-lg font-bold text-blue-400">{analysis.robot1Orders.length}</div>
          </div>
        </div>

        {/* Open Positions */}
        {analysis.robot1OpenPositions.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">Waiting for SELL Signal</h3>
            {analysis.robot1OpenPositions.map((pos, i) => (
              <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-blue-500/30">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-white">{pos.instId}</span>
                  <span className="text-blue-400 font-mono text-xs">{pos.qty.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Entry: ${pos.entryPrice.toFixed(2)}</span>
                  <span>{new Date(parseInt(pos.timeOpen)).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-slate-400 text-sm">
            No active Robot 1 positions
          </div>
        )}
      </div>

      {/* === LEGACY POSITIONS === */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Archive className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-white">Legacy Positions</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-slate-700 text-slate-300">{analysis.legacyPositionCount} Total</Badge>
            {analysis.legacyPositionCount > 0 && (
              <Button
                onClick={handleArchiveLegacy}
                disabled={archiving}
                size="sm"
                className="bg-amber-600 hover:bg-amber-500 text-xs gap-1"
              >
                <Archive className="w-3 h-3" />
                {archiving ? 'Archiving...' : 'Archive All'}
              </Button>
            )}
          </div>
        </div>

        {analysis.legacyPositionCount === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <p className="text-sm">No legacy positions - all clean!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Unverified Legacy (OPEN) */}
            {analysis.legacyOpenPositions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Unverified Open ({analysis.legacyUnverifiedCount})
                </h3>
                <div className="space-y-2">
                  {analysis.legacyOpenPositions.map((pos, i) => (
                    <div key={i} className="bg-red-950/40 rounded-lg p-3 border border-red-700/50">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-white">{pos.instId}</span>
                        <Badge className="bg-red-900 text-red-300 text-xs">NO SELL PAIR</Badge>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{pos.qty.toFixed(4)} @ ${pos.entryPrice.toFixed(2)}</span>
                        <span className="text-red-400">UNVERIFIED_LEGACY_POSITION</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verified Legacy (CLOSED) */}
            {analysis.verifiedLegacyPositions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Verified Closed ({analysis.verifiedLegacyPositions.length})</h3>
                <div className="space-y-2">
                  {analysis.verifiedLegacyPositions.slice(0, 5).map((pos, i) => {
                    const isProfitable = pos.pnl >= 0;
                    return (
                      <div key={i} className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-white">{pos.instId}</span>
                          <span className={cn(
                            'font-mono text-xs',
                            isProfitable ? 'text-emerald-400' : 'text-red-400'
                          )}>
                            {isProfitable ? '+' : ''}{pos.pnl.toFixed(2)} USDT
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {pos.buyQty.toFixed(4)} @ ${pos.buyPrice.toFixed(2)} → ${pos.sellPrice.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                  {analysis.verifiedLegacyPositions.length > 5 && (
                    <div className="text-xs text-slate-500 text-center py-2">
                      +{analysis.verifiedLegacyPositions.length - 5} more verified positions
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Loss Summary */}
            {analysis.legacyTotalLoss > 0 && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-slate-300">Total Legacy Loss:</span>
                  <span className="font-bold text-red-400">-{analysis.legacyTotalLoss.toFixed(2)} USDT</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="bg-slate-900/30 border border-slate-700 rounded-xl p-4 text-xs text-slate-400">
        <p className="mb-2">📊 <strong>Position Separation:</strong></p>
        <ul className="space-y-1 ml-4">
          <li>✓ Robot 1 manages only <strong>ETH-USDT & SOL-USDT</strong></li>
          <li>✓ P&L calculated separately for each strategy</li>
          <li>✓ Legacy positions isolated from active execution</li>
          <li>✓ Archive to remove from active logic while keeping history</li>
        </ul>
      </div>
    </div>
  );
}