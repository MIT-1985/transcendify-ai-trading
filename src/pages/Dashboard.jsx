import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { AlertCircle, TrendingUp, Activity, DollarSign, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Dashboard() {
  const { user } = useAuth();
  const [killSwitchStatus, setKillSwitchStatus] = useState('CHECKING');
  const sessionStartRef = useRef(new Date());

  // Fetch OKX Live Balance
  const { data: okxBalance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['okx-live-balance-final', user?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('okxLiveBalance', {});
        const d = res.data || {};
        if (!d.success) {
          return { 
            success: false, 
            error: 'OKX API unreachable',
            totalEquityUSDT: 'ERROR',
            freeUSDT: 'ERROR',
            frozenUSDT: 'ERROR',
            openOrdersCount: 'ERROR'
          };
        }
        return {
          success: true,
          totalEquityUSDT: d.totalEquityUSDT || '0',
          freeUSDT: d.freeUSDT || '0',
          frozenUSDT: d.frozenUSDT || '0',
          openOrdersCount: d.openOrdersCount || 0,
          assetCount: d.assetCount || 0,
          timestamp: new Date().toLocaleTimeString()
        };
      } catch (e) {
        console.error('[Dashboard] OKX Balance error:', e);
        return { 
          success: false, 
          error: e.message,
          totalEquityUSDT: 'ERROR',
          freeUSDT: 'ERROR',
          frozenUSDT: 'ERROR',
          openOrdersCount: 'ERROR'
        };
      }
    },
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 15000,
    gcTime: 0
  });

  // Fetch Clean Accounting Metrics
  const { data: cleanMetrics = {}, isLoading: loadMetrics } = useQuery({
    queryKey: ['clean-metrics', user?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getCleanAccountingMetrics', {});
        if (!res.data.success) {
          throw new Error('Failed to get clean metrics');
        }
        return res.data;
      } catch (e) {
        console.error('[Dashboard] Clean metrics error:', e);
        return {
          success: false,
          error: e.message,
          clean_metrics: {
            orders_count: 0,
            closed_trades_count: 0,
            net_pnl: 0,
            fees: 0,
            win_rate: 0,
            wins: 0,
            losses: 0,
            latest_trades: [],
            latest_orders: []
          },
          excluded_data: {},
          total_counts: {}
        };
      }
    },
    enabled: !!user,
    staleTime: 0,
    refetchInterval: 10000,
    gcTime: 0
  });

  // Check Kill Switch
  useEffect(() => {
    const checkKillSwitch = async () => {
      try {
        const res = await base44.functions.invoke('checkKillSwitch', {});
        setKillSwitchStatus(res.data?.kill_switch_active ? 'ACTIVE' : 'INACTIVE');
      } catch (e) {
        setKillSwitchStatus('ERROR');
      }
    };
    checkKillSwitch();
    const interval = setInterval(checkKillSwitch, 15000);
    return () => clearInterval(interval);
  }, []);

  const metrics = cleanMetrics?.clean_metrics || {};
  const excluded = cleanMetrics?.excluded_data || {};
  const totals = cleanMetrics?.total_counts || {};

  const getBalanceColor = (success) => success ? 'border-emerald-600 bg-emerald-950/30' : 'border-red-600 bg-red-950/30';
  const getFreeUSDTDisplay = () => {
    if (okxBalance?.freeUSDT === 'ERROR') return '—';
    const val = parseFloat(okxBalance?.freeUSDT || '0');
    return `$${val.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      {/* KILL SWITCH WARNING */}
      {killSwitchStatus === 'ACTIVE' && (
        <div className="max-w-7xl mx-auto mb-6 space-y-3">
          <div className="bg-red-950/90 border-2 border-red-600 rounded-2xl p-6 text-center">
            <div className="text-2xl font-black text-red-400 mb-2">🛑 TRADING HARD PAUSED</div>
            <div className="text-sm text-red-300">KILL SWITCH ACTIVE — All trading disabled</div>
            <div className="text-xs text-red-400 mt-2">Status: PAUSED_KILL_SWITCH</div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* SECTION 1: OKX LIVE BALANCE */}
        <div className={`rounded-2xl p-8 border-2 ${getBalanceColor(okxBalance?.success)} shadow-2xl`}>
          <div className="text-center space-y-4">
            <div className="text-sm font-semibold text-emerald-400 uppercase">OKX Live Balance (Verified)</div>
            
            <div className="text-5xl font-black text-emerald-400">
              {loadBalance ? '...' : okxBalance?.totalEquityUSDT || 'ERROR'}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-emerald-600">
                <div className="text-xs text-slate-500 mb-1">Free USDT</div>
                <div className="font-mono font-bold text-emerald-400 text-lg">{getFreeUSDTDisplay()}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Frozen USDT</div>
                <div className="font-mono font-bold text-slate-400">${okxBalance?.frozenUSDT || '0.00'}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Open Orders</div>
                <div className="font-mono font-bold text-slate-400">{okxBalance?.openOrdersCount || 0}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Assets</div>
                <div className="font-mono font-bold text-slate-400">{okxBalance?.assetCount || 0} types</div>
              </div>
            </div>

            {okxBalance?.timestamp && (
              <div className="text-xs text-slate-500 mt-4">Updated: {okxBalance.timestamp}</div>
            )}
          </div>
        </div>

        {/* SECTION 2: CLEAN OKX ACCOUNTING */}
        <div className="rounded-2xl p-8 border-2 border-emerald-600 bg-emerald-950/20">
          <h2 className="text-2xl font-bold mb-6 text-emerald-400">✅ OKX CLEAN REAL TRADES</h2>
          
          {loadMetrics ? (
            <Skeleton className="h-40 bg-slate-800" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/70 rounded-xl p-6 border border-slate-700">
                <div className="text-xs text-slate-500 uppercase mb-2">Clean Orders</div>
                <div className="text-4xl font-bold text-emerald-400">{metrics.orders_count || 0}</div>
              </div>
              <div className="bg-slate-900/70 rounded-xl p-6 border border-slate-700">
                <div className="text-xs text-slate-500 uppercase mb-2">Clean Closed Trades</div>
                <div className="text-4xl font-bold text-emerald-400">{metrics.closed_trades_count || 0}</div>
              </div>
              <div className="bg-slate-900/70 rounded-xl p-6 border border-slate-700">
                <div className="text-xs text-slate-500 uppercase mb-2">Net P&L</div>
                <div className={`text-4xl font-bold ${(metrics.net_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(metrics.net_pnl || 0) >= 0 ? '+' : ''}{(metrics.net_pnl || 0).toFixed(4)}
                </div>
              </div>
              <div className="bg-slate-900/70 rounded-xl p-6 border border-slate-700">
                <div className="text-xs text-slate-500 uppercase mb-2">Win Rate</div>
                <div className="text-4xl font-bold text-cyan-400">{(metrics.win_rate || 0).toFixed(1)}%</div>
                <div className="text-xs text-slate-400 mt-2">({metrics.wins || 0}W / {metrics.losses || 0}L)</div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: DATA CATEGORIZATION */}
        <Tabs defaultValue="clean" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="clean" className="text-sm">Clean OKX</TabsTrigger>
            <TabsTrigger value="legacy" className="text-sm">Legacy/Suspect</TabsTrigger>
            <TabsTrigger value="stale" className="text-sm">Stale Records</TabsTrigger>
          </TabsList>

          {/* TAB 1: CLEAN OKX TRADES */}
          <TabsContent value="clean" className="space-y-4 mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 text-emerald-400">Last Clean Orders</h3>
              {loadMetrics ? (
                <Skeleton className="h-32 bg-slate-800" />
              ) : metrics.latest_orders?.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No clean orders</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700">
                      <tr className="text-slate-400">
                        <th className="text-left px-3 py-2">Pair</th>
                        <th className="text-left px-3 py-2">Side</th>
                        <th className="text-right px-3 py-2">Price</th>
                        <th className="text-right px-3 py-2">Qty</th>
                        <th className="text-right px-3 py-2">Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.latest_orders?.slice(0, 5).map((o, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-3 py-2 font-bold">{o.instId}</td>
                          <td className={`px-3 py-2 font-bold ${o.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {o.side.toUpperCase()}
                          </td>
                          <td className="px-3 py-2 text-right">${parseFloat(o.avgPx).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{parseFloat(o.accFillSz).toFixed(6)}</td>
                          <td className="px-3 py-2 text-right text-red-400">{parseFloat(o.fee).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 text-emerald-400">Last Clean Closed Trades</h3>
              {loadMetrics ? (
                <Skeleton className="h-32 bg-slate-800" />
              ) : metrics.latest_trades?.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No clean trades</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700">
                      <tr className="text-slate-400">
                        <th className="text-left px-3 py-2">Pair</th>
                        <th className="text-right px-3 py-2">Entry</th>
                        <th className="text-right px-3 py-2">Exit</th>
                        <th className="text-right px-3 py-2">P&L</th>
                        <th className="text-right px-3 py-2">P&L %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.latest_trades?.slice(0, 10).map((t, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-3 py-2 font-bold">{t.instId}</td>
                          <td className="px-3 py-2 text-right">${parseFloat(t.buyPrice).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">${parseFloat(t.sellPrice).toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right font-bold ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.realizedPnL >= 0 ? '+' : ''}{parseFloat(t.realizedPnL).toFixed(4)}
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.realizedPnLPct >= 0 ? '+' : ''}{parseFloat(t.realizedPnLPct).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: LEGACY / SUSPECT TRADES */}
          <TabsContent value="legacy" className="space-y-4 mt-4">
            <div className="bg-yellow-950/30 border border-yellow-600 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 text-yellow-400">⚠️ EXCLUDED DATA</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Legacy Trades</div>
                  <div className="text-2xl font-bold text-yellow-400">{excluded.legacy_trades_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Suspect Trades</div>
                  <div className="text-2xl font-bold text-yellow-400">{excluded.suspect_trades_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Invalid Trades</div>
                  <div className="text-2xl font-bold text-red-400">{excluded.invalid_trades_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Negative Duration</div>
                  <div className="text-2xl font-bold text-red-400">{excluded.negative_duration_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Missing Order IDs</div>
                  <div className="text-2xl font-bold text-red-400">{excluded.missing_order_id_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">SIM Trades</div>
                  <div className="text-2xl font-bold text-slate-400">{excluded.sim_trades_count || 0}</div>
                </div>
              </div>
              <div className="text-xs text-yellow-300 mt-4 p-3 bg-yellow-900/20 rounded border border-yellow-600">
                ⚠️ These records are EXCLUDED from all main accounting metrics. They are shown here for audit purposes only.
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: STALE LEDGER */}
          <TabsContent value="stale" className="space-y-4 mt-4">
            <div className="bg-orange-950/30 border border-orange-600 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 text-orange-400">🗑️ STALE LEDGER RECORDS</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Stale Unmatched Buy</div>
                  <div className="text-2xl font-bold text-orange-400">{excluded.stale_ledger_records_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Duplicate Records</div>
                  <div className="text-2xl font-bold text-orange-400">{excluded.duplicate_ledger_records_count || 0}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Excluded from Positions</div>
                  <div className="text-2xl font-bold text-orange-400">{excluded.excluded_ledger_records_count || 0}</div>
                </div>
              </div>
              <div className="text-xs text-orange-300 mt-4 p-3 bg-orange-900/20 rounded border border-orange-600">
                🗑️ These ledger records have been marked as stale, duplicated, or excluded from active position tracking. OKX confirms they no longer represent open positions.
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* SECTION 4: SUMMARY STATS */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">📊 Full Dataset Summary</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Total Ledger Records</div>
              <div className="text-2xl font-bold text-slate-300">{totals.all_ledger_records || 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Total Verified Trades</div>
              <div className="text-2xl font-bold text-slate-300">{totals.all_verified_trades || 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Clean OKX Trades</div>
              <div className="text-2xl font-bold text-emerald-400">{metrics.closed_trades_count || 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Excluded Trades</div>
              <div className="text-2xl font-bold text-yellow-400">
                {((excluded.legacy_trades_count || 0) + (excluded.suspect_trades_count || 0) + (excluded.invalid_trades_count || 0))}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5: TRADING SYSTEM STATUS */}
        <div className="bg-red-950/30 border-2 border-red-600 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-red-400">Trading System Status</h3>
              <div className="text-xs text-red-300 mt-1">PAUSED_KILL_SWITCH</div>
            </div>
            <div className="text-right">
              <div className="text-red-400 font-bold text-lg">● PAUSED</div>
              <div className="text-xs text-red-300 mt-1">No trading allowed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}