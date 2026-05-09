import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Zap, Archive, TrendingUp, TrendingDown, Wallet, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function CleanDashboard() {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState('idle');

  // === SYNC: OXX Order Ledger ===
  const handleSyncOKX = async () => {
    setSyncStatus('syncing');
    try {
      const res = await base44.functions.invoke('syncOKXOrderLedger', {});
      console.log('Sync result:', res.data);
      refetchLedger();
      refetchVerified();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      console.error('Sync failed:', e);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  // === 1. OXX Order Ledger (Raw) ===
  const { data: ledger = [], refetch: refetchLedger, isLoading: loadingLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
      return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!user,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  // === 2. Verified Trades (P&L) ===
  const { data: verifiedTrades = [], refetch: refetchVerified, isLoading: loadingVerified } = useQuery({
    queryKey: ['verified-trades', user?.email],
    queryFn: () => base44.asServiceRole.entities.VerifiedTrade.list(),
    enabled: !!user,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  // === 3. OKX Live Balance ===
  const { data: liveBalance = {}, isLoading: loadingBalance } = useQuery({
    queryKey: ['okx-balance', user?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getSuzanaBalance', {});
        return res.data || {};
      } catch (e) {
        return { error: e.message };
      }
    },
    enabled: !!user,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  // === Calculate Summary ===
  const robot1Orders = ledger.filter(o => o.robotId === 'robot1');
  const legacyOrders = ledger.filter(o => o.robotId === 'legacy');

  const robot1Trades = verifiedTrades.filter(t => t.robotId === 'robot1');
  const legacyTrades = verifiedTrades.filter(t => t.robotId === 'legacy');

  const robot1PnL = robot1Trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
  const legacyPnL = legacyTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
  const totalPnL = robot1PnL + legacyPnL;

  // Robot 1 Active (open positions = BUYs without matching SELL in same order)
  const robot1ActiveQty = robot1Orders
    .filter(o => o.side === 'buy')
    .reduce((sum, o) => sum + o.accFillSz, 0)
    - robot1Orders
      .filter(o => o.side === 'sell')
      .reduce((sum, o) => sum + o.accFillSz, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard — Clean Data Architecture</h1>
            <p className="text-slate-400 text-sm">
              Single source of truth: OXXOrderLedger → VerifiedTrade
            </p>
          </div>
          <Button 
            onClick={handleSyncOKX} 
            disabled={syncStatus === 'syncing'}
            className={`gap-2 ${syncStatus === 'success' ? 'bg-emerald-600' : 'bg-blue-600'}`}
          >
            <Activity className="w-4 h-4" />
            {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'success' ? '✓ Synced' : 'Sync OKX'}
          </Button>
        </div>

        {/* A) LIVE OKX BALANCE */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-bold">A) Live OKX Balance</h2>
          </div>
          {loadingBalance ? (
            <Skeleton className="h-12" />
          ) : liveBalance.error ? (
            <div className="text-red-400 text-sm">{liveBalance.error}</div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Free USDT</div>
                <div className="text-2xl font-bold text-emerald-400">
                  ${parseFloat(liveBalance.freeUSDT || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">ETH</div>
                <div className="text-xl font-bold text-white">
                  {parseFloat(liveBalance.ETH || 0).toFixed(6)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">SOL</div>
                <div className="text-xl font-bold text-white">
                  {parseFloat(liveBalance.SOL || 0).toFixed(4)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* B) ROBOT 1 ACTIVE POSITION */}
        <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold">B) Robot 1 Active Position</h2>
          </div>
          {loadingLedger ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-700/30">
                <div className="text-xs text-slate-400">All Orders</div>
                <div className="text-2xl font-bold text-blue-400">{robot1Orders.length}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {robot1Orders.filter(o => o.side === 'buy').length} BUY / {robot1Orders.filter(o => o.side === 'sell').length} SELL
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-700/30">
                <div className="text-xs text-slate-400">Active Qty (ETH/SOL)</div>
                <div className="text-2xl font-bold text-blue-400">{robot1ActiveQty.toFixed(4)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-700/30">
                <div className="text-xs text-slate-400">Closed Trades</div>
                <div className="text-2xl font-bold text-white">{robot1Trades.length}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-blue-700/30">
                <div className="text-xs text-slate-400">Status</div>
                <div className={`text-sm font-bold mt-1 ${robot1ActiveQty > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {robot1ActiveQty > 0 ? '● OPEN' : '● READY'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* C) VERIFIED P&L */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">C) Verified P&L (BUY→SELL pairs only)</h2>
          </div>
          {loadingVerified ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-emerald-500/30">
                <div className="text-xs text-slate-400">Robot 1</div>
                <div className={`text-2xl font-bold ${robot1PnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {robot1PnL >= 0 ? '+' : ''}{robot1PnL.toFixed(2)} USDT
                </div>
                <div className="text-xs text-slate-500 mt-1">{robot1Trades.length} closed trades</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400">Legacy</div>
                <div className={`text-2xl font-bold ${legacyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {legacyPnL >= 0 ? '+' : ''}{legacyPnL.toFixed(2)} USDT
                </div>
                <div className="text-xs text-slate-500 mt-1">{legacyTrades.length} closed trades</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-emerald-500/50">
                <div className="text-xs text-slate-400 font-bold">TOTAL</div>
                <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USDT
                </div>
              </div>
            </div>
          )}
        </div>

        {/* D) OXX RAW ORDERS */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold">D) OXX Raw Orders (from ledger)</h2>
          </div>
          {loadingLedger ? (
            <Skeleton className="h-40" />
          ) : ledger.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              Click "Sync OKX" to load orders
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Ord ID</th>
                    <th className="text-left px-3 py-2">Robot</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-left px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 15).map(ord => (
                    <tr key={ord.ordId} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-cyan-400">{ord.ordId.slice(-8)}</td>
                      <td className="px-3 py-2">
                        <span className={ord.robotId === 'robot1' ? 'text-blue-400 font-bold' : 'text-slate-500'}>
                          {ord.robotId}
                        </span>
                      </td>
                      <td className="px-3 py-2">{ord.instId}</td>
                      <td className="px-3 py-2">
                        <span className={ord.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                          {ord.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{ord.accFillSz.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right font-mono">${ord.avgPx.toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(ord.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length > 15 && (
                <div className="text-xs text-slate-500 mt-2 text-center">
                  ... and {ledger.length - 15} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* E) LEGACY ARCHIVE */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Archive className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold">E) Legacy Archive Summary</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-xs text-slate-400">Legacy Orders</div>
              <div className="text-2xl font-bold text-slate-300">{legacyOrders.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                {legacyOrders.filter(o => o.side === 'buy').length} BUY / {legacyOrders.filter(o => o.side === 'sell').length} SELL
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-xs text-slate-400">Pairs</div>
              <div className="text-2xl font-bold text-slate-300">{legacyTrades.length}</div>
              <div className="text-xs text-slate-500 mt-1">Closed trades</div>
            </div>
            <div className={`bg-slate-800/50 rounded-lg p-4 border ${legacyPnL >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
              <div className="text-xs text-slate-400">P&L</div>
              <div className={`text-2xl font-bold ${legacyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {legacyPnL >= 0 ? '+' : ''}{legacyPnL.toFixed(2)} USDT
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700 text-xs text-slate-400">
            📦 Legacy positions are archived — not included in Robot 1 active execution
          </div>
        </div>
      </div>
    </div>
  );
}