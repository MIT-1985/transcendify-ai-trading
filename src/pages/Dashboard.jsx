import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Wallet, TrendingUp, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Robot1Panel from '@/components/dashboard/Robot1Panel';

export default function Dashboard() {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState('idle');

  // Sync OKX ledger
  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      await base44.functions.invoke('syncOKXOrderLedger', {});
      refetchLedger();
      refetchVerified();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  // === 1. OKX LIVE BALANCE ===
  const { data: balance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getSuzanaBalance', {});
        return res.data || {};
      } catch (e) {
        return { error: e.message };
      }
    },
    enabled: !!user,
    staleTime: 30000
  });

  // === 3. ROBOT 1 VERIFIED TRADES ===
  const { data: robot1Trades = [], refetch: refetchVerified, isLoading: loadVerified } = useQuery({
    queryKey: ['robot1-verified', user?.email],
    queryFn: async () => {
      try {
        const all = await base44.asServiceRole.entities.VerifiedTrade.list();
        return all.filter(t => t.robotId === 'robot1' && (t.instId === 'ETH-USDT' || t.instId === 'SOL-USDT'));
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
    staleTime: 30000
  });

  // === 4. OKX RAW ORDERS ===
  const { data: ledger = [], refetch: refetchLedger, isLoading: loadLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      try {
        const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
        return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
    staleTime: 30000
  });

  const robot1PnL = robot1Trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-slate-400 text-sm">OKX + Robot 1 Live Data</p>
          </div>
          <Button 
            onClick={handleSync} 
            disabled={syncStatus === 'syncing'}
            className={`gap-2 ${syncStatus === 'success' ? 'bg-emerald-600' : 'bg-blue-600'}`}
          >
            <Activity className="w-4 h-4" />
            {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'success' ? '✓ Synced' : 'Sync OKX'}
          </Button>
        </div>

        {/* 1. OKX LIVE BALANCE */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-bold">1. OKX Live Balance</h2>
          </div>
          {loadBalance ? (
            <Skeleton className="h-24" />
          ) : balance.error ? (
            <div className="text-red-400 text-sm">{balance.error}</div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">Total Equity</div>
                <div className="text-2xl font-bold text-emerald-400">
                  ${parseFloat(balance.totalEquity || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">Free USDT</div>
                <div className="text-2xl font-bold text-white">
                  ${parseFloat(balance.freeUSDT || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">ETH</div>
                <div className="text-xl font-bold text-white">
                  {parseFloat(balance.ETH || 0).toFixed(6)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">SOL</div>
                <div className="text-xl font-bold text-white">
                  {parseFloat(balance.SOL || 0).toFixed(4)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. ROBOT 1 LIVE STATUS */}
        <Robot1Panel />

        {/* 3. ROBOT 1 VERIFIED TRADES */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">3. Robot 1 Verified Trades (ETH-USDT / SOL-USDT)</h2>
          </div>
          {loadVerified ? (
            <Skeleton className="h-20" />
          ) : robot1Trades.length === 0 ? (
            <div className="text-slate-400 text-sm">No verified trades yet</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-emerald-700/30">
                  <div className="text-xs text-slate-400">Total Trades</div>
                  <div className="text-2xl font-bold text-white">{robot1Trades.length}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-emerald-700/30">
                  <div className="text-xs text-slate-400">Closed</div>
                  <div className="text-2xl font-bold text-white">{robot1Trades.filter(t => t.status === 'closed').length}</div>
                </div>
                <div className={`bg-slate-800/50 rounded-lg p-3 border ${robot1PnL >= 0 ? 'border-emerald-700/30' : 'border-red-700/30'}`}>
                  <div className="text-xs text-slate-400">Total P&L</div>
                  <div className={`text-2xl font-bold ${robot1PnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {robot1PnL >= 0 ? '+' : ''}{robot1PnL.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="text-left px-3 py-2">Pair</th>
                      <th className="text-right px-3 py-2">Buy Qty</th>
                      <th className="text-right px-3 py-2">Buy Price</th>
                      <th className="text-right px-3 py-2">Sell Price</th>
                      <th className="text-right px-3 py-2">P&L</th>
                      <th className="text-right px-3 py-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robot1Trades.slice(0, 8).map((t, i) => (
                      <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-bold">{t.instId}</td>
                        <td className="px-3 py-2 text-right font-mono">{t.buyQty?.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right font-mono">${t.buyPrice?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">${t.sellPrice?.toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.realizedPnL >= 0 ? '+' : ''}{t.realizedPnL?.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.realizedPnLPct?.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 4. OKX RAW ORDERS */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold">4. OKX Raw Orders (Verified Fills Only)</h2>
          </div>
          {loadLedger ? (
            <Skeleton className="h-40" />
          ) : ledger.length === 0 ? (
            <div className="text-slate-400 text-sm">No orders. Click "Sync OKX" above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Ord ID</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Base Qty</th>
                    <th className="text-right px-3 py-2">Quote USDT</th>
                    <th className="text-right px-3 py-2">Fee</th>
                    <th className="text-left px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 20).map(ord => (
                    <tr key={ord.ordId} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-cyan-400">{ord.ordId.slice(-10)}</td>
                      <td className="px-3 py-2 font-bold">{ord.instId}</td>
                      <td className="px-3 py-2">
                        <span className={ord.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                          {ord.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{ord.accFillSz?.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right font-mono">${ord.quoteUSDT?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-400">{ord.fee?.toFixed(4)}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(ord.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length > 20 && (
                <div className="text-xs text-slate-500 mt-2 text-center">... {ledger.length - 20} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}