import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PaperReport24h from '@/components/dashboard/PaperReport24h';
import Phase4OpportunityDiagnosticPanel from '@/components/dashboard/Phase4OpportunityDiagnosticPanel';
import Phase4BeforeAfterPanel from '@/components/dashboard/Phase4BeforeAfterPanel';
import Phase4CExpiryDiagnosticPanel from '@/components/dashboard/Phase4CExpiryDiagnosticPanel';
import Phase4DApplyCorrectionPanel from '@/components/dashboard/Phase4DApplyCorrectionPanel';
import Phase4EPositionSizeDiagnosticPanel from '@/components/dashboard/Phase4EPositionSizeDiagnosticPanel';
import Phase4ECleanAccountingPanel from '@/components/dashboard/Phase4ECleanAccountingPanel';
import Phase4FBTCOnlyPanel from '@/components/dashboard/Phase4FBTCOnlyPanel';
import Phase4FReportPanel from '@/components/dashboard/Phase4FReportPanel';
import Phase4FAutomationVerifyPanel from '@/components/dashboard/Phase4FAutomationVerifyPanel';
import Phase4FWhyNoTradePanel from '@/components/dashboard/Phase4FWhyNoTradePanel';
import Phase4FAlertWidget from '@/components/dashboard/Phase4FAlertWidget';
import Phase4FSnapshotPanel from '@/components/dashboard/Phase4FSnapshotPanel';
import Phase4FSnapshotLinkagePanel from '@/components/dashboard/Phase4FSnapshotLinkagePanel';
import Phase4FSnapshotEdgeReportPanel from '@/components/dashboard/Phase4FSnapshotEdgeReportPanel';
import Phase4FSnapshotEdgeDashboard from '@/components/dashboard/Phase4FSnapshotEdgeDashboard';
import Phase5UnlockGuardPanel from '@/components/dashboard/Phase5UnlockGuardPanel';
import Phase5ManualRealTradePreparedPanel from '@/components/dashboard/Phase5ManualRealTradePreparedPanel';
import Phase4FWeeklyExportPanel from '@/components/dashboard/Phase4FWeeklyExportPanel';
import Phase4FDashboardVerificationPanel from '@/components/dashboard/Phase4FDashboardVerificationPanel';
import RealTradingHardBlockerPanel from '@/components/dashboard/RealTradingHardBlockerPanel';
import SystemTrailStatusBar from '@/components/dashboard/SystemTrailStatusBar';

// ── Phase 4F active constants ──────────────────────────────────────────────
const P4F = {
  mode:           'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE',
  scanFn:         'phase4FBTCOnlyPaperMode',
  reportFn:       'phase4FPerformanceReport',
  activePairs:    ['BTC-USDT'],
  disabledPairs:  ['ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'],
  maxOpenTrades:  1,
  tp:             '1.30%',
  sl:             '0.65%',
  expiry:         '60 min',
  requiredScore:  75,
};

export default function PaperTradingDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lastRun, setLastRun]       = useState(null);
  const [manualRunning, setManualRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // ── Phase 4F KPI report (primary) ──────────────────────────
  const { data: f4Report, isLoading: f4Loading, refetch: refetchF4Report } = useQuery({
    queryKey: ['phase4f-perf-report', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase4FPerformanceReport', {});
      return res.data;
    },
    enabled: !!user,
    staleTime: Infinity,
    refetchInterval: false,
    gcTime: 0,
  });

  // ── Live open positions (BTC-USDT only) ────────────────────
  const { data: openTrades = [], refetch: refetchOpen } = useQuery({
    queryKey: ['paper-open-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.filter({ status: 'OPEN', instId: 'BTC-USDT' }, '-created_date', 10),
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 15000,
  });

  // ── Recent closed trades (BTC-USDT only) ───────────────────
  const { data: recentClosedRaw = [], refetch: refetchClosed } = useQuery({
    queryKey: ['paper-closed-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.filter({ instId: 'BTC-USDT' }, '-closedAt', 50),
    enabled: !!user,
    staleTime: 30000,
  });
  const recentClosed = recentClosedRaw.filter(t => t.status !== 'OPEN');

  // ── Manual "Run Paper Scan Now" — calls phase4FBTCOnlyPaperMode ──
  const handleManualRun = async () => {
    setManualRunning(true);
    setLastResult(null);
    const res = await base44.functions.invoke('phase4FBTCOnlyPaperMode', {});
    const d = res.data;
    setLastResult({
      openedThisRun:  d?.openedThisRun  ?? 0,
      closedThisRun:  d?.closedThisRun  ?? 0,
      openedDetails:  d?.thisRun?.newPaperEntries || d?.newPaperEntries || [],
      closedDetails:  d?.thisRun?.closedThisRun   || d?.closedThisRun   || [],
      runTime:        d?.lastRunAt,
    });
    setLastRun(new Date().toLocaleTimeString('de-DE'));
    await Promise.all([refetchOpen(), refetchClosed(), refetchF4Report()]);
    queryClient.invalidateQueries({ queryKey: ['paper-report-24h'] });
    setManualRunning(false);
  };

  // ── Derived KPIs from phase4FPerformanceReport ─────────────
  const rpt   = f4Report?.report || f4Report || {};
  const netPnL    = rpt.netPnL    ?? rpt.totalNetPnL    ?? 0;
  const grossPnL  = rpt.grossPnL  ?? rpt.totalGrossPnL  ?? 0;
  const fees      = rpt.fees      ?? rpt.totalFees       ?? 0;
  const spreadCost = rpt.spreadCost ?? 0;
  const winRate   = rpt.winRate   ?? 0;
  const tpHits    = rpt.tpHits    ?? 0;
  const slHits    = rpt.slHits    ?? 0;
  const expired   = rpt.expiredTrades ?? rpt.expired ?? 0;
  const totalBTC  = rpt.totalBTCTrades ?? rpt.totalTrades ?? 0;
  const closedBTC = rpt.closedBTCTrades ?? (totalBTC - (rpt.openBTCTrades ?? openTrades.length));
  const feeDrag   = rpt.feeDragPercent ?? (grossPnL > 0 ? Math.round((fees / Math.abs(grossPnL)) * 100) : 100);
  const status    = rpt.status ?? (netPnL > 0 ? 'PROFITABLE' : 'NEEDS_MORE_DATA');

  const pnlColor = netPnL >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── SYSTEM TRAIL — Single Source of Truth ──────────── */}
        <SystemTrailStatusBar onRunScan={handleManualRun} isRunning={manualRunning} />

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-1">
              {P4F.mode}
            </div>
            <h1 className="text-2xl font-black text-white">Phase 4F — BTC-USDT Paper Engine</h1>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <span className="bg-red-950/50 border border-red-700 text-red-400 font-bold px-2 py-0.5 rounded">🛑 Kill Switch: ACTIVE</span>
              <span className="bg-red-950/50 border border-red-700 text-red-400 font-bold px-2 py-0.5 rounded">tradeAllowed: false</span>
              <span className="bg-yellow-950/40 border border-yellow-700 text-yellow-400 font-bold px-2 py-0.5 rounded">PAPER ONLY</span>
              <span className="bg-slate-800 border border-slate-700 text-cyan-400 font-bold px-2 py-0.5 rounded">Pair: BTC-USDT</span>
              <span className="bg-slate-800 border border-slate-700 text-white font-bold px-2 py-0.5 rounded">Max Open: 1</span>
              <span className="bg-slate-800 border border-slate-700 text-emerald-400 font-bold px-2 py-0.5 rounded">TP: {P4F.tp}</span>
              <span className="bg-slate-800 border border-slate-700 text-red-400 font-bold px-2 py-0.5 rounded">SL: {P4F.sl}</span>
              <span className="bg-slate-800 border border-slate-700 text-orange-400 font-bold px-2 py-0.5 rounded">Expiry: {P4F.expiry}</span>
              <span className="bg-slate-800 border border-slate-700 text-purple-400 font-bold px-2 py-0.5 rounded">Score ≥ {P4F.requiredScore}</span>
              <span className="bg-emerald-950/40 border border-emerald-800 text-emerald-400 font-bold px-2 py-0.5 rounded">🕐 Auto-scan: 5 min</span>
              {lastRun && <span className="text-slate-400">Last run: {lastRun}</span>}
            </div>
          </div>
          <button
            onClick={handleManualRun}
            disabled={manualRunning}
            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-cyan-700/30 border border-cyan-600 hover:bg-cyan-700/50 text-cyan-300 disabled:opacity-50 transition-all shrink-0"
          >
            {manualRunning ? '⏳ Scanning…' : '▶ Run Paper Scan Now'}
          </button>
        </div>

        {/* ── Manual Run Result Banner ────────────────────────── */}
        {lastResult && (
          <div className="bg-slate-900/80 border-2 border-cyan-700 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                ⚡ phase4FBTCOnlyPaperMode — {lastResult.runTime ? new Date(lastResult.runTime).toLocaleTimeString('de-DE') : lastRun}
              </div>
              <button onClick={() => setLastResult(null)} className="text-slate-500 hover:text-white text-xs">✕ dismiss</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
              <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Opened</div>
                <div className={`font-black text-2xl ${lastResult.openedThisRun > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{lastResult.openedThisRun}</div>
              </div>
              <div className="bg-blue-950/30 border border-blue-800 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Closed</div>
                <div className={`font-black text-2xl ${lastResult.closedThisRun > 0 ? 'text-blue-400' : 'text-slate-400'}`}>{lastResult.closedThisRun}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Pair</div>
                <div className="font-black text-cyan-400">BTC-USDT</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Safety</div>
                <div className="font-black text-emerald-400 text-xs mt-1">PAPER_ONLY ✅</div>
              </div>
            </div>
            {lastResult.openedDetails?.length > 0 && (
              <div className="space-y-1 mb-2">
                <div className="text-xs text-emerald-400 font-bold mb-1">📄 Opened This Run:</div>
                {lastResult.openedDetails.map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 text-xs bg-emerald-950/20 border border-emerald-900 rounded-lg px-3 py-1.5">
                    <span className="font-black text-white">{e.instId}</span>
                    <span className="text-slate-400">entry <span className="text-white">${e.entryPrice?.toLocaleString()}</span></span>
                    <span className="text-emerald-400">TP ${e.targetPrice?.toLocaleString()}</span>
                    <span className="text-red-400">SL ${e.stopLossPrice?.toLocaleString()}</span>
                    <span className="text-cyan-400">score {e.score}</span>
                  </div>
                ))}
              </div>
            )}
            {lastResult.closedDetails?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-blue-400 font-bold mb-1">🔒 Closed This Run:</div>
                {lastResult.closedDetails.map((e, i) => {
                  const net = e.netPnL ?? e.netPnLUSDT ?? 0;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-3 text-xs bg-blue-950/20 border border-blue-900 rounded-lg px-3 py-1.5">
                      <span className="font-black text-white">{e.instId}</span>
                      <span className={`font-bold ${e.status === 'CLOSED_TP' ? 'text-emerald-400' : e.status === 'CLOSED_SL' ? 'text-red-400' : 'text-slate-400'}`}>{e.status}</span>
                      <span className="text-slate-400">exit <span className="text-white">${e.exitPrice?.toLocaleString()}</span></span>
                      <span className={`font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{net >= 0 ? '+' : ''}{net.toFixed(4)} USDT</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Auto Scanner Status Panel ───────────────────────── */}
        <div className="bg-slate-900/60 border-2 border-cyan-800 rounded-2xl px-5 py-4">
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">🤖 Auto Paper Scanner — Phase 4F</div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-emerald-900">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Status</div>
              <div className="font-black text-emerald-400">✅ ON</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Function</div>
              <div className="font-bold text-cyan-400 text-xs">phase4FBTCOnlyPaperMode</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Active Pairs</div>
              <div className="font-black text-yellow-400">BTC-USDT</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Disabled</div>
              <div className="font-bold text-slate-500 text-xs">ETH/SOL/DOGE/XRP</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Max Open</div>
              <div className="font-black text-white">1</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Interval</div>
              <div className="font-black text-emerald-400">Every 5 min</div>
            </div>
          </div>
        </div>

        {/* ── Safety banners ──────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-red-950/40 border-2 border-red-700 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">🛑</span>
            <div className="text-xs">
              <div className="text-red-400 font-black">KILL SWITCH ACTIVE · PAPER ONLY</div>
              <div className="text-red-300 mt-0.5">noOKXOrderEndpointCalled=true · realTradeAllowed=false · realTradeUnlockAllowed=false</div>
            </div>
          </div>
          <div className="bg-cyan-950/30 border-2 border-cyan-700 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">🔒</span>
            <div className="text-xs">
              <div className="text-cyan-400 font-black">PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE</div>
              <div className="text-cyan-300 mt-0.5">BTC-USDT only · Max 1 open trade · Phase 5 requires manual operator unlock</div>
            </div>
          </div>
        </div>

        {/* ── Phase 4F Primary KPI Cards (from phase4FPerformanceReport) ── */}
        {f4Loading ? (
          <Skeleton className="h-44 bg-slate-800 rounded-2xl" />
        ) : (
          <div className="bg-slate-900/70 border-2 border-cyan-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest">📊 Phase 4F Performance Report — BTC-USDT</div>
              <span className="text-xs font-mono text-slate-500">phase4FPerformanceReport</span>
              {status && (
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded border ${
                  status === 'PROFITABLE' ? 'text-emerald-400 border-emerald-700 bg-emerald-950/30' :
                  status === 'BREAK_EVEN' ? 'text-yellow-400 border-yellow-700 bg-yellow-950/20' :
                  'text-slate-400 border-slate-700 bg-slate-800/50'
                }`}>{status}</span>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              <Tile label="Net PnL"       value={`${netPnL >= 0 ? '+' : ''}${netPnL.toFixed(4)} USDT`} color={pnlColor} />
              <Tile label="BTC Trades"    value={totalBTC}      color="text-white" />
              <Tile label="Win Rate"      value={`${winRate.toFixed(1)}%`} color={winRate >= 55 ? 'text-emerald-400' : winRate >= 45 ? 'text-yellow-400' : 'text-red-400'} />
              <Tile label="TP Hits"       value={tpHits}        color="text-emerald-400" />
              <Tile label="SL Hits"       value={slHits}        color="text-red-400" />
              <Tile label="Open Now"      value={openTrades.length} color="text-yellow-400" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs mt-3">
              <Tile label="Gross PnL"     value={`${grossPnL >= 0 ? '+' : ''}${grossPnL.toFixed(4)}`} color="text-blue-400" />
              <Tile label="Fees"          value={`-${fees.toFixed(4)}`}         color="text-red-400" />
              <Tile label="Spread Cost"   value={`-${spreadCost.toFixed(4)}`}   color="text-orange-400" />
              <Tile label="Fee Drag"      value={`${feeDrag}%`}                 color={feeDrag < 50 ? 'text-emerald-400' : 'text-red-400'} />
              <Tile label="Expired"       value={expired}                        color="text-slate-400" />
              <Tile label="Closed"        value={closedBTC}                      color="text-slate-300" />
            </div>
            {!f4Report && (
              <div className="mt-3 text-xs text-slate-500 text-center">Run "▶ Run Paper Scan Now" or wait for auto-scan to populate.</div>
            )}
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <Tabs defaultValue="open" className="w-full">
          <TabsList className="flex flex-wrap gap-1 bg-slate-900/50 border border-slate-700 rounded-xl p-1 h-auto">
            <TabsTrigger value="hard_blocker"     className="text-xs font-bold text-red-300">🛑 Hard Blocker</TabsTrigger>
            <TabsTrigger value="verify_final"    className="text-xs font-bold text-cyan-300">🔬 Final Verify</TabsTrigger>
            <TabsTrigger value="open"            className="text-xs">📂 Open ({openTrades.length})</TabsTrigger>
            <TabsTrigger value="closed"          className="text-xs">✅ Closed</TabsTrigger>
            <TabsTrigger value="phase4f_report"  className="text-xs">📊 4F Report</TabsTrigger>
            <TabsTrigger value="phase4f_verify"  className="text-xs">✅ 4F Verify</TabsTrigger>
            <TabsTrigger value="phase4f_why"     className="text-xs">🔎 4F Why?</TabsTrigger>
            <TabsTrigger value="phase4f_alert"   className="text-xs">🚨 4F Alert</TabsTrigger>
            <TabsTrigger value="phase4f_snap"    className="text-xs">📸 Snapshots</TabsTrigger>
            <TabsTrigger value="phase4f_link"    className="text-xs">🔗 Linkage</TabsTrigger>
            <TabsTrigger value="phase4f_edge"    className="text-xs">📊 Edge Report</TabsTrigger>
            <TabsTrigger value="phase4f_snap_edge" className="text-xs">📊 Snapshot Edge</TabsTrigger>
            <TabsTrigger value="phase5_guard"    className="text-xs">🔒 Phase 5 Guard</TabsTrigger>
            <TabsTrigger value="phase5_prepared" className="text-xs font-bold text-red-300">🔴 Phase 5 Prepared</TabsTrigger>
            <TabsTrigger value="weekly_export"   className="text-xs">📤 Weekly Export</TabsTrigger>
            <TabsTrigger value="phase4f_btc"     className="text-xs">🚀 Phase 4F Run</TabsTrigger>
            <TabsTrigger value="diag"            className="text-xs">🔎 Diagnostic</TabsTrigger>
            <TabsTrigger value="legacy_archive"   className="text-xs text-slate-600 italic">🗄 Archive / Legacy ▾</TabsTrigger>
          </TabsList>

          {/* REAL TRADING HARD BLOCKER */}
          <TabsContent value="hard_blocker" className="mt-4">
            <div className="bg-slate-900/70 border border-red-800 rounded-xl p-5">
              <RealTradingHardBlockerPanel />
            </div>
          </TabsContent>

          {/* FINAL VERIFICATION */}
          <TabsContent value="verify_final" className="mt-4">
            <div className="bg-slate-900/70 border border-cyan-800 rounded-xl p-5">
              <Phase4FDashboardVerificationPanel />
            </div>
          </TabsContent>

          {/* OPEN POSITIONS */}
          <TabsContent value="open" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="text-sm font-bold text-slate-300">Open Paper Positions — BTC-USDT</div>
                <span className="text-xs text-slate-500">Max 1 allowed · Kill switch active</span>
              </div>
              {openTrades.length === 0 ? (
                <div className="text-center text-slate-400 py-10">No open BTC-USDT paper positions.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-slate-400">
                      <tr>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-right px-2 py-2">Entry</th>
                        <th className="text-right px-2 py-2">Target</th>
                        <th className="text-right px-2 py-2">SL</th>
                        <th className="text-right px-2 py-2">Size</th>
                        <th className="text-left px-2 py-2">Signal</th>
                        <th className="text-right px-2 py-2">Score</th>
                        <th className="text-left px-2 py-2">Snap</th>
                        <th className="text-right px-2 py-2">Snap Score</th>
                        <th className="text-right px-2 py-2">Snap Mom</th>
                        <th className="text-right px-2 py-2">Snap BuyP</th>
                        <th className="text-right px-2 py-2">Snap Age</th>
                        <th className="text-left px-2 py-2">Opened</th>
                        <th className="text-left px-2 py-2">Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openTrades.map(t => (
                        <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-2 py-2 font-black text-yellow-400">{t.instId}</td>
                          <td className="px-2 py-2 text-right text-white">${t.entryPrice?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-emerald-400">${(t.targetPrice || t.tpPrice)?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-red-400">${(t.stopLossPrice || t.slPrice)?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-slate-300">${t.sizeUSDT}</td>
                          <td className="px-2 py-2">
                            <span className={`font-bold ${t.intradaySignal === 'BULLISH' ? 'text-emerald-400' : 'text-yellow-400'}`}>{t.intradaySignal}</span>
                          </td>
                          <td className="px-2 py-2 text-right text-cyan-400">{t.signalScore || t.entryScore}</td>
                          <td className="px-2 py-2">
                            {t.signalSnapshotId
                              ? <span className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold">📸 Linked</span>
                              : <span className="text-xs text-slate-600">⬜</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-300">{t.signalSnapshotScore ?? '—'}</td>
                          <td className="px-2 py-2 text-right">
                            {t.signalSnapshotMomentum != null
                              ? <span className={t.signalSnapshotMomentum > 0 ? 'text-emerald-400' : 'text-red-400'}>{t.signalSnapshotMomentum.toFixed(3)}%</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right text-slate-300">{t.signalSnapshotBuyPressure != null ? `${t.signalSnapshotBuyPressure.toFixed(1)}%` : '—'}</td>
                          <td className="px-2 py-2 text-right text-slate-500">{t.signalSnapshotAgeMs != null ? `${(t.signalSnapshotAgeMs / 60000).toFixed(1)}m` : '—'}</td>
                          <td className="px-2 py-2 text-slate-400">{t.openedAt ? new Date(t.openedAt).toLocaleTimeString('de-DE') : '—'}</td>
                          <td className="px-2 py-2 text-orange-400">{t.expiresAt ? new Date(t.expiresAt).toLocaleTimeString('de-DE') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* CLOSED */}
          <TabsContent value="closed" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-300 mb-4">Closed BTC-USDT Trades (last 50)</div>
              {recentClosed.length === 0 ? (
                <div className="text-center text-slate-400 py-10">No closed trades yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-slate-400">
                      <tr>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-left px-2 py-2">Status</th>
                        <th className="text-right px-2 py-2">Entry</th>
                        <th className="text-right px-2 py-2">Exit</th>
                        <th className="text-right px-2 py-2">GrossPnL</th>
                        <th className="text-right px-2 py-2">NetPnL</th>
                        <th className="text-left px-2 py-2">Snap</th>
                        <th className="text-right px-2 py-2">Snap Score</th>
                        <th className="text-right px-2 py-2">Snap Mom</th>
                        <th className="text-right px-2 py-2">Snap BuyP</th>
                        <th className="text-right px-2 py-2">Snap Age</th>
                        <th className="text-right px-2 py-2">Held</th>
                        <th className="text-left px-2 py-2">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentClosed.map(t => {
                        const net = t.netPnL || t.netPnLUSDT || 0;
                        return (
                          <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                            <td className="px-2 py-2 font-black text-white">{t.instId}</td>
                            <td className="px-2 py-2">
                              <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${
                                t.status === 'CLOSED_TP' ? 'text-emerald-300 bg-emerald-950/50 border border-emerald-800' :
                                t.status === 'CLOSED_SL' ? 'text-red-300 bg-red-950/50 border border-red-800' :
                                'text-slate-300 bg-slate-800/50 border border-slate-700'
                              }`}>{t.status}</span>
                            </td>
                            <td className="px-2 py-2 text-right text-slate-400">${t.entryPrice?.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right text-slate-400">${t.exitPrice?.toLocaleString()}</td>
                            <td className={`px-2 py-2 text-right font-bold ${(t.grossPnL||t.grossPnLUSDT||0)>=0?'text-emerald-400':'text-red-400'}`}>{(t.grossPnL||t.grossPnLUSDT||0)>=0?'+':''}{(t.grossPnL||t.grossPnLUSDT||0).toFixed(4)}</td>
                            <td className={`px-2 py-2 text-right font-black ${net>=0?'text-emerald-400':'text-red-400'}`}>{net>=0?'+':''}{net.toFixed(4)}</td>
                            <td className="px-2 py-2">
                              {t.signalSnapshotId
                                ? <span className="text-xs bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold">📸 Linked</span>
                                : <span className="text-xs text-slate-600">⬜</span>}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300">{t.signalSnapshotScore ?? '—'}</td>
                            <td className="px-2 py-2 text-right">
                              {t.signalSnapshotMomentum != null
                                ? <span className={t.signalSnapshotMomentum > 0 ? 'text-emerald-400' : 'text-red-400'}>{t.signalSnapshotMomentum.toFixed(3)}%</span>
                                : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-2 py-2 text-right text-slate-300">{t.signalSnapshotBuyPressure != null ? `${t.signalSnapshotBuyPressure.toFixed(1)}%` : '—'}</td>
                            <td className="px-2 py-2 text-right text-slate-500">{t.signalSnapshotAgeMs != null ? `${(t.signalSnapshotAgeMs / 60000).toFixed(1)}m` : '—'}</td>
                            <td className="px-2 py-2 text-right text-slate-500">{t.holdingMs ? `${Math.round(t.holdingMs/1000)}s` : '—'}</td>
                            <td className="px-2 py-2 text-slate-400">{t.closedAt ? new Date(t.closedAt).toLocaleTimeString('de-DE') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 4F REPORT */}
          <TabsContent value="phase4f_report" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FReportPanel />
            </div>
          </TabsContent>

          {/* 4F AUTOMATION VERIFY */}
          <TabsContent value="phase4f_verify" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FAutomationVerifyPanel />
            </div>
          </TabsContent>

          {/* 4F WHY NO TRADE */}
          <TabsContent value="phase4f_why" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FWhyNoTradePanel />
            </div>
          </TabsContent>

          {/* 4F ALERT */}
          <TabsContent value="phase4f_alert" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FAlertWidget />
            </div>
          </TabsContent>

          {/* 4F SNAPSHOTS */}
          <TabsContent value="phase4f_snap" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FSnapshotPanel />
            </div>
          </TabsContent>

          {/* 4F LINKAGE */}
          <TabsContent value="phase4f_link" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FSnapshotLinkagePanel />
            </div>
          </TabsContent>

          {/* 4F EDGE REPORT */}
          <TabsContent value="phase4f_edge" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FSnapshotEdgeReportPanel />
            </div>
          </TabsContent>

          {/* 4F SNAPSHOT EDGE DASHBOARD */}
          <TabsContent value="phase4f_snap_edge" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FSnapshotEdgeDashboard />
            </div>
          </TabsContent>

          {/* PHASE 5 GUARD */}
          <TabsContent value="phase5_guard" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase5UnlockGuardPanel />
            </div>
          </TabsContent>

          {/* PHASE 5 PREPARED — LOCKED */}
          <TabsContent value="phase5_prepared" className="mt-4">
            <div className="bg-slate-900/70 border border-red-900 rounded-xl p-5">
              <Phase5ManualRealTradePreparedPanel />
            </div>
          </TabsContent>

          {/* WEEKLY EXPORT */}
          <TabsContent value="weekly_export" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FWeeklyExportPanel />
            </div>
          </TabsContent>

          {/* PHASE 4F BTC-ONLY RUN PANEL */}
          <TabsContent value="phase4f_btc" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4FBTCOnlyPanel />
            </div>
          </TabsContent>

          {/* DIAGNOSTIC */}
          <TabsContent value="diag" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4OpportunityDiagnosticPanel />
            </div>
          </TabsContent>

          {/* ── ARCHIVE / LEGACY TAB ─────────────────────────── */}
          <TabsContent value="legacy_archive" className="mt-4">
            <div className="bg-amber-950/20 border-2 border-amber-700 rounded-xl p-4 mb-4">
              <div className="text-amber-400 font-black text-sm mb-1">🗄 ARCHIVE / LEGACY DIAGNOSTICS</div>
              <div className="text-amber-300/80 text-xs">
                These panels are preserved for historical reference only.
                <strong className="text-white"> They are NOT the active P&L or trading decision.</strong>
                Active engine: <span className="font-mono text-cyan-400">phase4FBTCOnlyPaperMode</span> · Active report: <span className="font-mono text-cyan-400">phase4FPerformanceReport</span>
              </div>
            </div>
            <Tabs defaultValue="legacy_report" className="w-full">
              <TabsList className="flex flex-wrap gap-1 bg-slate-900/50 border border-slate-700 rounded-xl p-1 h-auto mb-4">
                <TabsTrigger value="legacy_report" className="text-xs text-slate-500">📄 Legacy Multi-Pair Report</TabsTrigger>
                <TabsTrigger value="compare"       className="text-xs text-slate-500">⚖ Before/After (4B)</TabsTrigger>
                <TabsTrigger value="phase4c"       className="text-xs text-slate-500">🔬 4C Expiry</TabsTrigger>
                <TabsTrigger value="phase4d"       className="text-xs text-slate-500">⚡ 4D Correction</TabsTrigger>
                <TabsTrigger value="phase4e"       className="text-xs text-slate-500">📐 4E Size</TabsTrigger>
                <TabsTrigger value="phase4e2"      className="text-xs text-slate-500">🧾 4E Accounting</TabsTrigger>
              </TabsList>
              <TabsContent value="legacy_report"><PaperReport24h /></TabsContent>
              <TabsContent value="compare"><div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5"><Phase4BeforeAfterPanel /></div></TabsContent>
              <TabsContent value="phase4c"><div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5"><Phase4CExpiryDiagnosticPanel /></div></TabsContent>
              <TabsContent value="phase4d"><div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5"><Phase4DApplyCorrectionPanel /></div></TabsContent>
              <TabsContent value="phase4e"><div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5"><Phase4EPositionSizeDiagnosticPanel /></div></TabsContent>
              <TabsContent value="phase4e2"><div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5"><Phase4ECleanAccountingPanel /></div></TabsContent>
            </Tabs>
          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
      <div className="text-slate-500 text-xs mb-1 uppercase tracking-wide">{label}</div>
      <div className={`font-black text-xl ${color}`}>{value}</div>
    </div>
  );
}