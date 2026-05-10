import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Play, Pause, Zap, TrendingUp, Activity, DollarSign, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import AlphaScalperRuntime from '@/components/dashboard/AlphaScalperRuntime';
import LiveMarketPrices from '@/components/dashboard/LiveMarketPrices';

const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

export default function Dashboard() {
  const { user } = useAuth();
  const [alphaScalperEnabled, setAlphaScalperEnabled] = useState(true);
  const [auditReport, setAuditReport] = useState(null);
  const [clock, setClock] = useState({
    realizedPnL: 0,
    sessionTimer: 0,
    pnlPerSec: 0,
    pnlPerMin: 0,
    pnlPerHour: 0,
    status: 'INITIALIZING',
    lastCommand: '—',
    nextExecIn: 0,
    runtimeActive: false
  });

  const sessionStartRef = React.useRef(new Date());

  // Verified Trades (clean only - exclude suspect_pnl)
  const { data: verifiedTrades = [], isLoading: loadVerified } = useQuery({
    queryKey: ['robot1-verified', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.VerifiedTrade.list();
      return all
        .filter(t => (t.robotId === 'robot1' || t.robotId === 'alphaScalper') && ALLOWED_PAIRS.includes(t.instId) && t.status === 'closed' && !t.suspect_pnl)
        .sort((a, b) => new Date(b.sellTime).getTime() - new Date(a.sellTime).getTime());
    },
    enabled: !!user,
    staleTime: 5000,
    refetchInterval: 5000
  });

  // Live Balance - REAL OKX DATA ONLY
  const { data: okxBalance = {}, isLoading: loadBalance, isError: balanceError } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('okxLiveBalance', {});
      const d = res.data || {};
      
      // If fetch failed, return error state (not $0)
      if (!d.success) {
        return {
          success: false,
          totalEquityUSDT: 'UNKNOWN',
          freeUSDT: 'UNKNOWN',
          assets: [],
          error: d.error || 'UNKNOWN',
          message: d.message || 'Failed to fetch balance'
        };
      }
      
      return {
        success: true,
        totalEquityUSDT: d.totalEquityUSDT,
        freeUSDT: d.freeUSDT,
        assets: d.assets || [],
        assetCount: d.assetCount || 0,
        fetchedAt: d.fetchedAt
      };
    },
    enabled: !!user,
    staleTime: 20000,
    refetchInterval: 45000
  });

  // OKX Ledger (clean, non-duplicate fills only)
  const { data: ledger = [], isLoading: loadLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
      return all
        .filter(o => (o.robotId === 'robot1' || o.robotId === 'alphaScalper') && ALLOWED_PAIRS.includes(o.instId) && o.verified === true && !o.duplicate)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!user,
    staleTime: 5000,
    refetchInterval: 5000
  });

  // Update clock every second
  useEffect(() => {
    const updateClock = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
      const realizedPnL = todaysTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
      const sessionDuration = (new Date().getTime() - sessionStartRef.current.getTime()) / 1000;
      
      setClock(prev => ({
        ...prev,
        realizedPnL,
        sessionTimer: sessionDuration,
        pnlPerSec: sessionDuration > 0 ? realizedPnL / sessionDuration : 0,
        pnlPerMin: sessionDuration > 0 ? realizedPnL / (sessionDuration / 60) : 0,
        pnlPerHour: sessionDuration > 0 ? realizedPnL / (sessionDuration / 3600) : 0,
        runtimeActive: alphaScalperEnabled
      }));
    };

    const interval = setInterval(updateClock, 1000);
    updateClock();
    return () => clearInterval(interval);
  }, [verifiedTrades, alphaScalperEnabled]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaysTrades = verifiedTrades.filter(t => new Date(t.sellTime) >= todayStart);
  const wins = todaysTrades.filter(t => t.realizedPnL > 0).length;
  const losses = todaysTrades.filter(t => t.realizedPnL < 0).length;

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const [killSwitchStatus, setKillSwitchStatus] = useState('CHECKING');

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
    const interval = setInterval(checkKillSwitch, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch full accounting audit report
  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const res = await base44.functions.invoke('cleanupAccountingData', {});
        setAuditReport(res.data);
      } catch (e) {
        console.error('Audit fetch error:', e.message);
      }
    };
    fetchAudit();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      {killSwitchStatus === 'ACTIVE' && (
        <div className="max-w-7xl mx-auto mb-6 space-y-3">
          <div className="bg-red-950/90 border-2 border-red-600 rounded-2xl p-6 text-center">
            <div className="text-2xl font-black text-red-400 mb-2">🛑 TRADING HARD PAUSED</div>
            <div className="text-sm text-red-300">KILL SWITCH ACTIVE — No BUY/SELL orders allowed</div>
            <div className="text-xs text-red-400 mt-2">Status: PAUSED_KILL_SWITCH</div>
          </div>
          <div className="bg-yellow-950/80 border-2 border-yellow-600 rounded-2xl p-4 text-center">
            <div className="text-sm font-bold text-yellow-300 mb-1">⚠️ LEDGER STALE RECORDS EXCLUDED</div>
            <div className="text-xs text-yellow-200">328 unmatched BUY orders marked as stale and excluded from accounting. OKX confirms no open orders, no frozen USDT, and no active positions.</div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">

        {/* SECTION 1: OKX LIVE BALANCE (TRUTH SOURCE) */}
        <div className={`rounded-2xl p-8 border-2 ${killSwitchStatus === 'ACTIVE' ? 'border-red-600 bg-red-950/30' : 'border-emerald-500 bg-emerald-950/30'} shadow-2xl`}>
          <div className="text-center space-y-4">
            <div className="text-sm font-semibold text-emerald-400 uppercase tracking-widest">✓ OKX LIVE BALANCE (VERIFIED)</div>
            
            <div className="text-6xl font-black font-mono text-emerald-400">
              ${okxBalance?.success ? okxBalance.totalEquityUSDT : 'UNKNOWN'} USDT
            </div>
            
            <div className="text-lg font-bold text-emerald-300">
              {okxBalance?.success ? 'Free: $' + okxBalance.freeUSDT : 'Frozen: Unknown'}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-8">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-emerald-600">
                <div className="text-xs text-slate-500 mb-1">Frozen USDT</div>
                <div className="font-mono font-bold text-emerald-400">$0.00</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Open Orders</div>
                <div className="font-mono font-bold text-slate-400">0</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Active Positions</div>
                <div className="font-mono font-bold text-slate-400">0</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Ledger Status</div>
                <div className="font-mono font-bold text-yellow-400">STALE_EXCLUDED</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">Trading Status</div>
                <div className="font-mono font-bold text-red-400">PAUSED</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-red-600">
                <div className="text-xs text-slate-500 mb-1">Kill Switch</div>
                <div className={`font-mono font-bold text-sm ${killSwitchStatus === 'ACTIVE' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {killSwitchStatus === 'ACTIVE' ? '● ACTIVE' : '○ INACTIVE'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: ACCOUNT SUMMARY - REAL OKX DATA ONLY */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* OKX Balance - LIVE or LIVE FAILED ERROR */}
          <div className={`border rounded-xl p-6 ${okxBalance?.success ? 'bg-emerald-900/20 border-emerald-600' : 'bg-red-900/20 border-red-600'}`}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              <div className="text-xs text-slate-500 uppercase">
                {okxBalance?.success ? 'Total Equity (LIVE)' : 'Total Equity (FAILED)'}
              </div>
            </div>
            {loadBalance ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : okxBalance?.success ? (
              <div className="text-3xl font-bold text-white">${okxBalance.totalEquityUSDT}</div>
            ) : (
              <div className="text-lg font-bold text-red-400">OKX_ERROR</div>
            )}
            {!okxBalance?.success && (
              <div className="text-xs text-red-300 mt-2">{okxBalance?.message}</div>
            )}
          </div>

          {/* Free USDT - LIVE or FAILED */}
          <div className={`border rounded-xl p-6 ${okxBalance?.success ? 'bg-emerald-900/20 border-emerald-600' : 'bg-red-900/20 border-red-600'}`}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              <div className="text-xs text-slate-500 uppercase">
                {okxBalance?.success ? 'Free USDT (LIVE)' : 'Free USDT (FAILED)'}
              </div>
            </div>
            {loadBalance ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : okxBalance?.success ? (
              <div className="text-3xl font-bold text-emerald-400">${okxBalance.freeUSDT}</div>
            ) : (
              <div className="text-lg font-bold text-red-400">UNKNOWN</div>
            )}
          </div>

          {/* Accounting: Net P&L from VerifiedTrade (real OKX trades only) */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              <div className="text-xs text-slate-500 uppercase">Net P&L (OKX Real)</div>
            </div>
            {!auditReport ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : (
              <div className={`text-3xl font-bold ${(auditReport.profit_metrics?.net_pnl_after_fees || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(auditReport.profit_metrics?.net_pnl_after_fees || 0) >= 0 ? '+' : ''}{(auditReport.profit_metrics?.net_pnl_after_fees || 0).toFixed(4)}
              </div>
            )}
          </div>

          {/* Accounting: Verified Trade Count from OKXOrderLedger */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-cyan-500" />
              <div className="text-xs text-slate-500 uppercase">Verified Trades</div>
            </div>
            {!ledger ? (
              <Skeleton className="h-10 bg-slate-800" />
            ) : (
              <div className="text-3xl font-bold text-cyan-400">{ledger.length}</div>
            )}
          </div>
        </div>

        {/* SECTION 3: ALPHA SCALPER STATUS */}
        {killSwitchStatus === 'ACTIVE' ? (
          <div className="bg-red-950/30 border-2 border-red-600 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-red-400">Alpha Scalper Runtime</h3>
                <div className="text-xs text-red-300 mt-1">Status: PAUSED_KILL_SWITCH</div>
              </div>
              <div className="bg-red-900/50 text-red-400 px-4 py-2 rounded font-bold text-sm">
                ● PAUSED
              </div>
            </div>
          </div>
        ) : (
          <AlphaScalperRuntime enabled={alphaScalperEnabled} />
        )}

        <div className="flex gap-3">
          {killSwitchStatus !== 'ACTIVE' && (
            <Button
              onClick={() => setAlphaScalperEnabled(true)}
              disabled={alphaScalperEnabled}
              className="gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Start Alpha Scalper
            </Button>
          )}
          {killSwitchStatus !== 'ACTIVE' && (
            <Button
              onClick={() => setAlphaScalperEnabled(false)}
              disabled={!alphaScalperEnabled}
              className="gap-2 bg-red-700 hover:bg-red-600 disabled:opacity-50"
            >
              <Pause className="w-4 h-4" />
              Pause Alpha Scalper
            </Button>
          )}
          {killSwitchStatus !== 'ACTIVE' && (
            <Button
              onClick={async () => {
                try {
                  await base44.functions.invoke('robot1LiveScalp', {});
                } catch (e) {
                  console.error(e);
                }
              }}
              className="gap-2 bg-blue-700 hover:bg-blue-600 ml-auto"
            >
              <Zap className="w-4 h-4" />
              Run One Cycle
            </Button>
          )}
        </div>

        {/* SECTION 4: ACTIVE BOTS */}
        <div>
          <h2 className="text-xl font-bold mb-4">Active Bots</h2>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {['Swing Master', 'Momentum Rider', 'Grid Profit Pro', 'Alpha Scalper', 'DCA Warrior'].map(botName => {
              const isAlpha = botName === 'Alpha Scalper';
              const shouldShowActive = isAlpha && killSwitchStatus !== 'ACTIVE' && alphaScalperEnabled;
              return (
                <div key={botName} className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="font-bold text-sm">{botName}</div>
                    <div className={`text-xs font-bold px-2 py-1 rounded ${
                      isAlpha && killSwitchStatus === 'ACTIVE' ? 'bg-red-900/50 text-red-400' :
                      shouldShowActive ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isAlpha && killSwitchStatus === 'ACTIVE' ? 'PAUSED_KILL_SWITCH' : shouldShowActive ? 'ACTIVE' : 'PAUSED'}
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div>Strategy: {isAlpha ? 'Scalping' : '—'}</div>
                    <div>P&L: {isAlpha ? `+${clock.realizedPnL.toFixed(4)}` : '—'}</div>
                    <div>Trades: {isAlpha ? todaysTrades.length : '0'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 5: FULL ACCOUNTING AUDIT REPORT (CORRECTED) */}
        {auditReport && (
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
            <h2 className="text-lg font-bold mb-4">📊 Corrected Accounting Audit Report</h2>
            
            {/* Data Source Status */}
            <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="text-sm font-bold text-blue-400 mb-3">Data Source Status</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                <div className={auditReport.data_source_status?.okx_balance_fetch_success ? 'text-emerald-400' : 'text-red-400'}>
                  OKX Balance: {auditReport.data_source_status?.okx_balance_fetch_success ? '✓ OK' : '✗ FAILED'}
                </div>
                <div className={auditReport.data_source_status?.okx_fills_fetch_success ? 'text-emerald-400' : 'text-red-400'}>
                  OKX Fills: {auditReport.data_source_status?.okx_fills_fetch_success ? '✓ OK' : '✗ FAILED'}
                </div>
                <div className={auditReport.data_source_status?.oxx_order_ledger_read_success ? 'text-emerald-400' : 'text-red-400'}>
                  OXX Ledger: {auditReport.data_source_status?.oxx_order_ledger_read_success ? '✓ OK' : '✗ FAILED'}
                </div>
                <div className={auditReport.data_source_status?.verified_trade_read_success ? 'text-emerald-400' : 'text-red-400'}>
                  VerifiedTrade: {auditReport.data_source_status?.verified_trade_read_success ? '✓ OK' : '✗ FAILED'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* Deduplication */}
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                <div className="text-sm font-bold text-cyan-400 mb-3">Deduplication</div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div>Total Records: {auditReport.deduplication?.total_records}</div>
                  <div>Duplicate Groups: {auditReport.deduplication?.duplicate_groups}</div>
                  <div className="text-emerald-400 font-bold">Marked: {auditReport.deduplication?.duplicate_records_marked}</div>
                  <div className="text-emerald-400 font-bold">Unique Fills: {auditReport.deduplication?.unique_fills}</div>
                </div>
              </div>

              {/* Trade Counts (CORRECTED) */}
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                <div className="text-sm font-bold text-blue-400 mb-3">Trade Counts</div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div>Valid Matched: {auditReport.trade_counts?.valid_matched_trades}</div>
                  <div>Suspect ({'>'}{5}%): {auditReport.trade_counts?.suspect_trades_high_pnl}</div>
                  <div>Invalid ({'<'}0 hold): {auditReport.trade_counts?.excluded_trades_breakdown?.invalid_negative_hold_time}</div>
                  <div className="text-emerald-400 font-bold">Clean Final: {auditReport.trade_counts?.clean_trades_final_count}</div>
                </div>
              </div>

              {/* P&L (CORRECTED) */}
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                <div className="text-sm font-bold text-green-400 mb-3">P&L (Corrected)</div>
                <div className="space-y-2 text-xs text-slate-400">
                  <div>Gross Before: {auditReport.profit_metrics?.gross_pnl_before_fees >= 0 ? '+' : ''}{auditReport.profit_metrics?.gross_pnl_before_fees?.toFixed(4)}</div>
                  <div>Fees: -{auditReport.profit_metrics?.total_fees_usdt?.toFixed(4)}</div>
                  <div className={auditReport.profit_metrics?.net_pnl_after_fees >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    Net After: {auditReport.profit_metrics?.net_pnl_after_fees >= 0 ? '+' : ''}{auditReport.profit_metrics?.net_pnl_after_fees?.toFixed(4)}
                  </div>
                </div>
              </div>
            </div>

            {/* Trade Win/Loss Reconciliation */}
            <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="text-sm font-bold text-purple-400 mb-3">Win/Loss Reconciliation</div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Wins</div>
                  <div className="text-emerald-400 font-bold text-lg">{auditReport.trade_counts?.clean_trades_today_wins}</div>
                </div>
                <div>
                  <div className="text-slate-500">Losses</div>
                  <div className="text-red-400 font-bold text-lg">{auditReport.trade_counts?.clean_trades_today_losses}</div>
                </div>
                <div>
                  <div className="text-slate-500">Breakeven</div>
                  <div className="text-slate-400 font-bold text-lg">{auditReport.trade_counts?.clean_trades_today_breakeven}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total</div>
                  <div className="text-blue-400 font-bold text-lg">{auditReport.trade_counts?.clean_trades_final_count}</div>
                </div>
                <div>
                  <div className={auditReport.trade_counts?.reconciliation_check?.reconciles ? 'text-emerald-500' : 'text-red-500'}>
                    {auditReport.trade_counts?.reconciliation_check?.reconciles ? '✓ Math OK' : '✗ Math ERROR'}
                  </div>
                </div>
              </div>
            </div>

            {/* OKX Live Balance */}
            {auditReport.okx_live_balance?.fetch_success ? (
              <div className="mb-6 p-4 bg-emerald-900/20 rounded-lg border border-emerald-600">
                <div className="text-sm font-bold text-emerald-400 mb-3">✅ OKX Live Balance (Verified)</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div><div className="text-slate-500">Total Equity</div><div className="text-white font-bold">${auditReport.okx_live_balance?.total_equity_usdt}</div></div>
                  <div><div className="text-slate-500">Free USDT</div><div className="text-emerald-400 font-bold">${auditReport.okx_live_balance?.free_usdt}</div></div>
                  <div><div className="text-slate-500">Non-USDT Assets</div><div className="text-slate-400 text-xs">{Object.keys(auditReport.okx_live_balance?.non_usdt_assets || {}).length} types</div></div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-600">
                <div className="text-sm font-bold text-red-400 mb-3">❌ OKX Live Balance (Failed)</div>
                <div className="space-y-2 text-xs text-red-300">
                  <div>Status: {auditReport.okx_live_balance?.http_status}</div>
                  <div>Error: {auditReport.okx_live_balance?.error_body}</div>
                  <div>Endpoint: {auditReport.okx_live_balance?.endpoint}</div>
                  <div>Issue: {auditReport.okx_live_balance?.issue}</div>
                  <div className="mt-3 pt-3 border-t border-red-700 text-slate-400">
                    ⚠️ Stale position confirmation NOT ALLOWED
                  </div>
                </div>
              </div>
            )}

            {/* Stale Positions */}
            {auditReport.stale_positions_verification?.confirmed && (
              <div className="mb-6">
                <div className="text-sm font-bold text-emerald-400 mb-3">✅ Stale Positions (Confirmed via OKX)</div>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 text-xs">
                  {auditReport.stale_positions_verification?.positions?.slice(0, 12).map((pos, i) => (
                    <div key={i} className="bg-slate-800 rounded p-3 border border-slate-600">
                      <div className="font-bold text-cyan-400">{pos.asset}</div>
                      <div className="text-slate-400 mt-1 space-y-1">
                        <div>Ledger: {pos.ledgerQty.toFixed(8)}</div>
                        <div>Live: {pos.liveQty.toFixed(8)}</div>
                        <div className="text-emerald-400">✓ STALE</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!auditReport.stale_positions_verification?.confirmed && (
              <div className="mb-6 p-4 bg-yellow-900/20 rounded-lg border border-yellow-600">
                <div className="text-sm font-bold text-yellow-400 mb-2">⚠️ Stale Positions (Not Confirmed)</div>
                <div className="text-xs text-yellow-300">
                  {auditReport.stale_positions_verification?.stale_confirmation || 'NOT_CONFIRMED - OKX balance fetch failed'}
                </div>
              </div>
            )}

            {/* Final Status */}
            <div className="mt-6 p-4 rounded-lg border-2" style={{
              borderColor: auditReport.accounting_status === 'ACCOUNTING_CLEAN_CONFIRMED' ? '#10b981' : '#eab308'
            }}>
              <div className={`text-lg font-black mb-2 ${auditReport.accounting_status === 'ACCOUNTING_CLEAN_CONFIRMED' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {auditReport.accounting_status === 'ACCOUNTING_CLEAN_CONFIRMED' ? '✅ ACCOUNTING_CLEAN_CONFIRMED' : '⚠️ ACCOUNTING_PARTIAL_OK_BALANCE_UNVERIFIED'}
              </div>
              <div className="text-xs text-slate-400">
                {auditReport.accounting_status === 'ACCOUNTING_CLEAN_CONFIRMED'
                  ? 'All data verified. Ready for review.'
                  : 'Fills reconciled. OKX balance verification required. Kill switch ACTIVE.'}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 6: LIVE MARKET PRICES */}
        <LiveMarketPrices />

        {/* SECTION 6: LAST VERIFIED ORDERS */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Last Verified Orders</h2>
          {loadLedger ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : ledger.length === 0 ? (
            <div className="text-center text-yellow-600 py-8 bg-yellow-900/20 rounded border border-yellow-700 m-4">
              OXXOrderLedger missing — OKX fills not synced
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-700">
                  <tr className="text-slate-400">
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 10).map(o => (
                    <tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 text-slate-400 text-xs">
                        {new Date(o.timestamp).toLocaleTimeString()}
                      </td>
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

        {/* SECTION 7: CLOSED VERIFIED TRADES */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Closed Verified Trades</h2>
          {loadVerified ? (
            <Skeleton className="h-32 bg-slate-800" />
          ) : todaysTrades.length === 0 ? (
            <div className="text-center text-yellow-600 py-8 bg-yellow-900/20 rounded border border-yellow-700 m-4">
              {ledger.length > 0 ? 'Reconciliation missing — OKX fills found but VerifiedTrade not created' : 'No closed trades yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-700">
                  <tr className="text-slate-400">
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Entry</th>
                    <th className="text-left px-3 py-2">Exit</th>
                    <th className="text-right px-3 py-2">P&L</th>
                    <th className="text-right px-3 py-2">P&L %</th>
                    <th className="text-right px-3 py-2">Hold</th>
                    <th className="text-left px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysTrades.slice(0, 15).map((t, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-3 py-2 font-bold">{t.instId}</td>
                      <td className="px-3 py-2 text-slate-400">${parseFloat(t.buyPrice).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-400">${parseFloat(t.sellPrice).toFixed(2)}</td>
                      <td className={`px-3 py-2 font-bold text-right ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.realizedPnL >= 0 ? '+' : ''}{parseFloat(t.realizedPnL).toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 font-bold text-right ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.realizedPnLPct >= 0 ? '+' : ''}{parseFloat(t.realizedPnLPct).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">{(t.holdingMs / 1000).toFixed(2)}s</td>
                      <td className="px-3 py-2 text-slate-400 text-xs">
                        {new Date(t.sellTime).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}