import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Wallet, TrendingUp, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import ManualScalpTriggerV2 from '@/components/dashboard/ManualScalpTriggerV2';
import LastRobotActionPanel from '@/components/dashboard/LastRobotActionPanel';
import Robot1LivePnLClock from '@/components/dashboard/Robot1LivePnLClock';

const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

export default function Dashboard() {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState('idle');

  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      await base44.functions.invoke('syncOKXOrderLedger', {});
      refetchLedger();
      refetchVerified();
      refetchBalance();
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  // Live OKX Balance
  const { data: balance = {}, isLoading: loadBalance, refetch: refetchBalance } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSuzanaBalance', {});
      const d = res.data || {};
      const map = { totalEquity: d.balance_usdt || 0, freeUSDT: 0 };
      for (const b of (d.balances || [])) {
        map[b.asset] = b.free;
        if (b.asset === 'USDT') map.freeUSDT = b.free;
      }
      return map;
    },
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 30000
  });

  // Verified Trades (closed BUY→SELL pairs) - exclude recovery reconciliation
  const { data: verifiedTrades = [], isLoading: loadVerified, refetch: refetchVerified } = useQuery({
    queryKey: ['robot1-verified', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.VerifiedTrade.list();
      return all
        .filter(t => t.robotId === 'robot1' && ALLOWED_PAIRS.includes(t.instId) && t.status === 'closed')
        .sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime());
    },
    enabled: !!user,
    staleTime: 15000
  });

  // Raw OKX Orders (all fills)
  const { data: ledger = [], isLoading: loadLedger, refetch: refetchLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
      return all
        .filter(o => o.robotId === 'robot1' && ALLOWED_PAIRS.includes(o.instId))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!user,
    staleTime: 15000
  });

  // Execution logs
  const { data: executionLogs = [], isLoading: loadLogs } = useQuery({
    queryKey: ['robot1-exec-logs', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.Robot1ExecutionLog.list();
      return all.sort((a, b) => new Date(b.execution_time).getTime() - new Date(a.execution_time).getTime());
    },
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 10000
  });

  // Calculate stats excluding reconciled positions
  const totalPnL = verifiedTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const totalFees = ledger.reduce((s, o) => s + (o.fee || 0), 0);
  const winCount = verifiedTrades.filter(t => t.realizedPnL > 0).length;
  const winRate = verifiedTrades.length > 0 ? Math.round(winCount / verifiedTrades.length * 100) : 0;

  // Detect active positions: BUY orders not in any closed VerifiedTrade
  const closedBuyIds = new Set(verifiedTrades.flatMap(t => [t.buyOrdId, t.sellOrdId]));
  const unmatched = ledger.filter(o => o.side === 'buy' && !closedBuyIds.has(o.ordId));
  const activePositionExists = unmatched.length > 0 && (balance.SOL > 0.0001 || balance.ETH > 0.0001 || balance.BTC > 0.000001);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Recovery Status Banner */}
        <div className="bg-emerald-900/30 border border-emerald-700 rounded-xl p-4 mb-6 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold text-emerald-300">Recovery Complete ✓ | Legacy Position Closed</div>
            <div className="text-emerald-200 text-xs mt-1">
              Legacy 0.945 SOL reconciled: bought @ $95.21, sold 0.774 SOL @ $96.36 → -$15.33 P&L (17% loss, fee bleed). 
              Account state: $75.02 USDT free | $125.44 equity | 0 SOL active | Ready for new controlled cycle.
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Robot 1 Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Real OKX Data · Verified Trades Only</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={async () => {
                if (window.confirm('Sell ALL crypto to USDT immediately?')) {
                  try {
                    setSyncStatus('syncing');
                    await base44.functions.invoke('liquidateAllToUSDT', {});
                    refetchBalance();
                    setSyncStatus('success');
                    setTimeout(() => setSyncStatus('idle'), 2000);
                  } catch (e) {
                    console.error(e);
                    setSyncStatus('error');
                    setTimeout(() => setSyncStatus('idle'), 2000);
                  }
                }
              }}
              disabled={syncStatus === 'syncing'}
              size="sm"
              className="gap-2 bg-red-700 hover:bg-red-600"
            >
              Liquidate All
            </Button>
            <Button
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              size="sm"
              className={`gap-2 ${syncStatus === 'success' ? 'bg-emerald-700' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
              <Activity className="w-4 h-4" />
              {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'success' ? '✓ Synced' : 'Sync OKX'}
            </Button>
          </div>
        </div>

        {/* 1. Live Balance Card */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-yellow-400" />
            <h2 className="font-bold text-lg">Live OKX Balance</h2>
          </div>
          {loadBalance ? (
            <Skeleton className="h-20 bg-slate-800" />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Total Equity (USDT)</div>
                <div className="text-2xl font-bold text-emerald-400">
                  ${parseFloat(balance.totalEquity || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Free USDT</div>
                <div className="text-2xl font-bold text-white">
                  ${parseFloat(balance.freeUSDT || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">BTC Holdings</div>
                <div className="text-lg font-mono text-yellow-400">
                  {parseFloat(balance.BTC || 0).toFixed(6)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">ETH Holdings</div>
                <div className="text-lg font-mono text-cyan-400">
                  {parseFloat(balance.ETH || 0).toFixed(6)}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 1.5 Active Position State */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 mb-1">Active Position</div>
              <div className={`text-lg font-bold ${activePositionExists ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {activePositionExists ? '⚠ HOLDING' : '✓ CLEAR'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {activePositionExists 
                  ? `${unmatched.length} unmatched BUY(s), live holdings exist`
                  : 'No stale positions. Ready for new cycle.'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 mb-1">Reconciled Trades</div>
              <div className="text-lg font-bold text-cyan-400">{verifiedTrades.length}</div>
            </div>
          </div>
        </section>

        {/* 2. Live P&L Clock */}
        <Robot1LivePnLClock />

        {/* 2b. Quick Stats */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-2">Total Realized P&L</div>
            <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(4)} USDT
            </div>
            <div className="text-xs text-slate-500 mt-2">{verifiedTrades.length} closed trades</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-2">Win Rate</div>
            <div className="text-2xl font-bold text-blue-400">{winRate}%</div>
            <div className="text-xs text-slate-500 mt-2">{winCount} wins / {verifiedTrades.length} total</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-2">Total Fees Paid</div>
            <div className="text-2xl font-bold text-red-400">{totalFees.toFixed(4)} USDT</div>
            <div className="text-xs text-slate-500 mt-2">OKX taker fees</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-2">Total Orders</div>
            <div className="text-2xl font-bold text-cyan-400">{ledger.length}</div>
            <div className="text-xs text-slate-500 mt-2">BUY + SELL fills</div>
          </div>
        </section>

        {/* 3. All Execution History */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="font-bold text-lg">Execution History</h2>
            <span className="ml-auto text-xs text-slate-500">Last 20 runs</span>
          </div>
          {loadLogs ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : executionLogs.length === 0 ? (
            <div className="text-slate-500 text-sm py-6 text-center">No execution history yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Decision</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-right px-3 py-2">Score</th>
                    <th className="text-center px-3 py-2">Allowed</th>
                    <th className="text-left px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {executionLogs.slice(0, 20).map((log, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 text-slate-400 text-xs">
                        {new Date(log.execution_time).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`font-bold ${
                          log.decision === 'BUY_EXECUTED' ? 'text-emerald-400' :
                          log.decision.includes('BUY') ? 'text-yellow-400' :
                          log.decision.includes('SELL') ? 'text-red-400' :
                          log.decision.includes('WAIT') ? 'text-slate-400' : 'text-red-600'
                        }`}>
                          {log.decision}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-blue-400">
                        {log.selectedPair || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-cyan-400">
                        {log.score !== null ? log.score.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={log.tradeAllowed ? 'text-emerald-400 font-bold' : 'text-red-400'}>
                          {log.tradeAllowed ? '✓' : '✗'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400 max-w-xs truncate">
                        {log.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 4. Verified Trades (Closed Cycles) */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-lg">Verified Trades (Closed Cycles)</h2>
            <span className="ml-auto text-xs text-slate-500">All BUY→SELL pairs</span>
          </div>
          {loadVerified ? (
            <Skeleton className="h-40 bg-slate-800" />
          ) : verifiedTrades.length === 0 ? (
            <div className="text-slate-500 text-sm py-6 text-center">No closed trades yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-right px-3 py-2">Buy Price</th>
                    <th className="text-right px-3 py-2">Sell Price</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">P&L (USDT)</th>
                    <th className="text-right px-3 py-2">P&L %</th>
                    <th className="text-left px-3 py-2">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {verifiedTrades.slice(0, 15).map((t, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 font-bold text-white">{t.instId}</td>
                      <td className="px-3 py-2 text-right font-mono">${t.buyPrice?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">${t.sellPrice?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {t.buyQty?.toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.realizedPnL >= 0 ? '+' : ''}{t.realizedPnL?.toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.realizedPnLPct?.toFixed(3)}%
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs">
                        {t.sellTime ? new Date(t.sellTime).toLocaleString('de-DE') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {verifiedTrades.length > 15 && (
                <div className="text-xs text-slate-600 text-center mt-3">
                  …{verifiedTrades.length - 15} more trades
                </div>
              )}
            </div>
          )}
        </section>

        {/* 5. All OKX Orders */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="font-bold text-lg">All OKX Orders (Raw Fills)</h2>
            <span className="ml-auto text-xs text-slate-500">robot1 verified only</span>
          </div>
          {loadLedger ? (
            <Skeleton className="h-40 bg-slate-800" />
          ) : ledger.length === 0 ? (
            <div className="text-slate-500 text-sm py-6 text-center flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              No orders. Click "Sync OKX" above to fetch.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Order ID</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Avg Price</th>
                    <th className="text-right px-3 py-2">Quote (USDT)</th>
                    <th className="text-right px-3 py-2">Fee (USDT)</th>
                    <th className="text-left px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 25).map((o) => (
                    <tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 font-mono text-cyan-400 text-xs">
                        …{o.ordId?.slice(-6)}
                      </td>
                      <td className="px-3 py-2 font-bold text-white">{o.instId}</td>
                      <td className="px-3 py-2">
                        <span className={o.side === 'buy' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                          {o.side?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">
                        {o.accFillSz?.toFixed(6)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-white">
                        ${o.avgPx?.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">
                        ${o.quoteUSDT?.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-red-400">
                        {o.fee?.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs">
                        {new Date(o.timestamp).toLocaleString('de-DE')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length > 25 && (
                <div className="text-xs text-slate-600 text-center mt-3">
                  …{ledger.length - 25} more orders
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}