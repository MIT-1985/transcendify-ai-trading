import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { ChevronDown, ChevronUp, RefreshCw, Play } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Advanced panel imports — only loaded when user expands
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

const ALERT_STYLES = {
  COLD:  { bg: 'bg-slate-800/80',       border: 'border-slate-600',   text: 'text-slate-300',  dot: 'bg-slate-500' },
  WARM:  { bg: 'bg-yellow-950/40',      border: 'border-yellow-700',  text: 'text-yellow-300', dot: 'bg-yellow-500' },
  HOT:   { bg: 'bg-orange-950/40',      border: 'border-orange-700',  text: 'text-orange-300', dot: 'bg-orange-500' },
  READY: { bg: 'bg-emerald-950/40',     border: 'border-emerald-600', text: 'text-emerald-300',dot: 'bg-emerald-400' },
};

function Kpi({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-center">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-lg ${color}`}>{value}</div>
    </div>
  );
}

function AdvPanel({ children }) {
  return <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">{children}</div>;
}

export default function PaperTradingDashboard() {
  const { user } = useAuth();
  const [trail, setTrail]       = useState(null);
  const [report, setReport]     = useState(null);
  const [trailLoading, setTrailLoading] = useState(false);
  const [scanLoading, setScanLoading]   = useState(false);
  const [scanResult, setScanResult]     = useState(null);
  const [advOpen, setAdvOpen]           = useState(false);

  // Load system trail on mount
  const loadTrail = async () => {
    setTrailLoading(true);
    const res = await base44.functions.invoke('systemTrailTradingState', {});
    setTrail(res.data);
    setTrailLoading(false);
  };

  // Load performance report on mount
  const loadReport = async () => {
    const res = await base44.functions.invoke('phase4FPerformanceReport', {});
    setReport(res.data);
  };

  useEffect(() => {
    if (user) {
      loadTrail();
      loadReport();
    }
  }, [user]);

  const handleScan = async () => {
    setScanLoading(true);
    setScanResult(null);
    const res = await base44.functions.invoke('phase4FBTCOnlyPaperMode', {});
    setScanResult(res.data);
    await Promise.all([loadTrail(), loadReport()]);
    setScanLoading(false);
  };

  // Derived values
  const live    = trail?.liveStatus || {};
  const safety  = trail?.safety || {};
  const cfg     = trail?.config || {};
  const alertLvl = live.alertLevel || 'COLD';
  const st      = ALERT_STYLES[alertLvl] || ALERT_STYLES.COLD;

  const m        = report?.metrics || {};
  const decision = report?.decision || {};
  const netPnL   = m.netPnL ?? 0;
  const pnlColor = netPnL >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white">Transcendify BTC Paper Mode</h1>
            <div className="text-xs text-cyan-500 font-mono mt-0.5">PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadTrail}
              disabled={trailLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-600 hover:bg-slate-700 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${trailLoading ? 'animate-spin' : ''}`} />
              Refresh Signal
            </button>
            <button
              onClick={handleScan}
              disabled={scanLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-cyan-700/30 border border-cyan-600 hover:bg-cyan-700/50 text-cyan-300 disabled:opacity-50 transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              {scanLoading ? 'Scanning…' : 'Run Paper Scan'}
            </button>
          </div>
        </div>

        {/* ── Main Status Card ───────────────────────────────────── */}
        <div className={`rounded-2xl border-2 px-5 py-5 ${st.bg} ${st.border}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full shrink-0 ${st.dot} ${alertLvl === 'READY' ? 'animate-pulse' : ''}`} />
              <div>
                <div className={`text-2xl font-black ${st.text}`}>{alertLvl}</div>
                <div className="text-xs text-slate-400 mt-0.5">{live.mainBlockingReason || 'Awaiting signal…'}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="text-center">
                <div className="text-slate-500 uppercase tracking-wide">BTC Price</div>
                <div className="font-black text-white text-base">${live.lastPrice?.toLocaleString() || '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500 uppercase tracking-wide">Score</div>
                <div className={`font-black text-base ${st.text}`}>{live.totalScore ?? '—'} / {live.requiredScore ?? 75}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500 uppercase tracking-wide">Open</div>
                <div className="font-black text-base text-yellow-400">{live.openBTCTrades ?? 0} / 1</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500 uppercase tracking-wide">Status</div>
                <div className="font-black text-xs text-slate-300 leading-tight max-w-[120px]">{trail?.uiDecision?.showStatus || '—'}</div>
              </div>
            </div>
          </div>
          {trailLoading && (
            <div className="mt-3 text-xs text-slate-500 animate-pulse">Fetching live signal…</div>
          )}
        </div>

        {/* ── Scan result flash ──────────────────────────────────── */}
        {scanResult && (
          <div className="bg-slate-900/80 border border-cyan-700 rounded-xl px-4 py-3 flex items-center justify-between text-xs">
            <span className="text-cyan-400 font-bold">
              ⚡ Scan complete — Opened: <span className="text-white">{scanResult.openedThisRun ?? 0}</span> · Closed: <span className="text-white">{scanResult.closedThisRun ?? 0}</span>
            </span>
            <button onClick={() => setScanResult(null)} className="text-slate-500 hover:text-white ml-4">✕</button>
          </div>
        )}

        {/* ── Performance + Safety grid ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Paper Performance */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-black text-slate-200">📊 Paper Performance</div>
              <div className="text-xs text-slate-500 font-mono">phase4FPerformanceReport</div>
            </div>
            {decision.status && (
              <div className="text-xs text-blue-400 mb-3 font-semibold">{decision.emoji} {decision.note}</div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kpi label="BTC Trades"  value={m.totalBTCTrades ?? 0}  />
              <Kpi label="Open"        value={m.openBTCTrades  ?? 0}    color="text-yellow-400" />
              <Kpi label="Closed"      value={m.closedBTCTrades ?? 0}  />
              <Kpi label="Net PnL"     value={`${netPnL >= 0 ? '+' : ''}${netPnL.toFixed(4)}`} color={pnlColor} />
              <Kpi label="Win Rate"    value={`${(m.winRate ?? 0).toFixed(1)}%`} color={m.winRate >= 55 ? 'text-emerald-400' : m.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'} />
              <Kpi label="TP Hits"     value={m.tpHits    ?? 0} color="text-emerald-400" />
              <Kpi label="SL Hits"     value={m.slHits    ?? 0} color="text-red-400" />
              <Kpi label="Expired"     value={m.expiredTrades ?? 0} color="text-slate-400" />
            </div>
          </div>

          {/* Safety Card */}
          <div className="bg-slate-900/70 border-2 border-red-800 rounded-2xl px-5 py-4">
            <div className="text-sm font-black text-red-400 mb-4">🛡 Safety Status</div>
            <div className="space-y-2 text-xs">
              <SafeRow label="Kill Switch"              value="ACTIVE"                  ok={true}  />
              <SafeRow label="Real Trading"             value="LOCKED"                  ok={true}  />
              <SafeRow label="Mode"                     value="PAPER ONLY"              ok={true}  />
              <SafeRow label="noOKXOrderEndpointCalled" value={String(safety.noOKXOrderEndpointCalled ?? true)} ok={safety.noOKXOrderEndpointCalled !== false} />
              <SafeRow label="realTradeAllowed"         value={String(safety.realTradeAllowed ?? false)}        ok={safety.realTradeAllowed === false} />
              <SafeRow label="realTradeUnlockAllowed"   value={String(safety.realTradeUnlockAllowed ?? false)}  ok={safety.realTradeUnlockAllowed === false} />
              <SafeRow label="Phase 5 Guard"            value={live.phase5GuardStatus || 'LOCKED'}             ok={true}  />
              <SafeRow label="Hard Blocker"             value={live.hardBlockerStatus || 'REAL_TRADING_BLOCKED'} ok={true} />
            </div>
          </div>
        </div>

        {/* ── Advanced / Diagnostics (collapsible) ──────────────── */}
        <div className="border border-slate-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setAdvOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 bg-slate-900/60 hover:bg-slate-800/60 transition-colors text-sm font-bold text-slate-400"
          >
            <span>⚙ Advanced / Diagnostics</span>
            {advOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {advOpen && (
            <div className="p-4 bg-slate-950/40">
              <Tabs defaultValue="why" className="w-full">
                <TabsList className="flex flex-wrap gap-1 bg-slate-900/50 border border-slate-700 rounded-xl p-1 h-auto mb-4">
                  <TabsTrigger value="hard_blocker"      className="text-xs text-red-300">🛑 Hard Blocker</TabsTrigger>
                  <TabsTrigger value="verify_final"      className="text-xs text-cyan-300">🔬 Final Verify</TabsTrigger>
                  <TabsTrigger value="why"               className="text-xs">🔎 4F Why?</TabsTrigger>
                  <TabsTrigger value="alert"             className="text-xs">🚨 4F Alert</TabsTrigger>
                  <TabsTrigger value="snap"              className="text-xs">📸 Snapshots</TabsTrigger>
                  <TabsTrigger value="linkage"           className="text-xs">🔗 Linkage</TabsTrigger>
                  <TabsTrigger value="edge"              className="text-xs">📊 Edge Report</TabsTrigger>
                  <TabsTrigger value="snap_edge"         className="text-xs">📊 Snap Edge</TabsTrigger>
                  <TabsTrigger value="phase5_guard"      className="text-xs">🔒 Phase 5 Guard</TabsTrigger>
                  <TabsTrigger value="phase5_prepared"   className="text-xs text-red-300">🔴 Phase 5 Prep</TabsTrigger>
                  <TabsTrigger value="weekly_export"     className="text-xs">📤 Weekly Export</TabsTrigger>
                  <TabsTrigger value="phase4f_btc"       className="text-xs">🚀 4F Run</TabsTrigger>
                  <TabsTrigger value="phase4f_report"    className="text-xs">📋 4F Report</TabsTrigger>
                  <TabsTrigger value="phase4f_verify"    className="text-xs">✅ 4F Verify</TabsTrigger>
                  <TabsTrigger value="diag"              className="text-xs">🔎 Diagnostic</TabsTrigger>
                  <TabsTrigger value="legacy_archive"    className="text-xs text-slate-500 italic">🗄 Archive / Legacy</TabsTrigger>
                </TabsList>

                <TabsContent value="hard_blocker"><AdvPanel><RealTradingHardBlockerPanel /></AdvPanel></TabsContent>
                <TabsContent value="verify_final"><AdvPanel><Phase4FDashboardVerificationPanel /></AdvPanel></TabsContent>
                <TabsContent value="why"><AdvPanel><Phase4FWhyNoTradePanel /></AdvPanel></TabsContent>
                <TabsContent value="alert"><AdvPanel><Phase4FAlertWidget /></AdvPanel></TabsContent>
                <TabsContent value="snap"><AdvPanel><Phase4FSnapshotPanel /></AdvPanel></TabsContent>
                <TabsContent value="linkage"><AdvPanel><Phase4FSnapshotLinkagePanel /></AdvPanel></TabsContent>
                <TabsContent value="edge"><AdvPanel><Phase4FSnapshotEdgeReportPanel /></AdvPanel></TabsContent>
                <TabsContent value="snap_edge"><AdvPanel><Phase4FSnapshotEdgeDashboard /></AdvPanel></TabsContent>
                <TabsContent value="phase5_guard"><AdvPanel><Phase5UnlockGuardPanel /></AdvPanel></TabsContent>
                <TabsContent value="phase5_prepared"><AdvPanel><Phase5ManualRealTradePreparedPanel /></AdvPanel></TabsContent>
                <TabsContent value="weekly_export"><AdvPanel><Phase4FWeeklyExportPanel /></AdvPanel></TabsContent>
                <TabsContent value="phase4f_btc"><AdvPanel><Phase4FBTCOnlyPanel /></AdvPanel></TabsContent>
                <TabsContent value="phase4f_report"><AdvPanel><Phase4FReportPanel /></AdvPanel></TabsContent>
                <TabsContent value="phase4f_verify"><AdvPanel><Phase4FAutomationVerifyPanel /></AdvPanel></TabsContent>
                <TabsContent value="diag"><AdvPanel><Phase4OpportunityDiagnosticPanel /></AdvPanel></TabsContent>

                {/* Archive / Legacy */}
                <TabsContent value="legacy_archive">
                  <div className="bg-amber-950/20 border-2 border-amber-700 rounded-xl p-4 mb-4">
                    <div className="text-amber-400 font-black text-sm mb-1">🗄 ARCHIVE / LEGACY — Historical only. Not the active trading state.</div>
                    <div className="text-amber-300/70 text-xs">Active engine: <span className="font-mono text-cyan-400">phase4FBTCOnlyPaperMode</span> · Active report: <span className="font-mono text-cyan-400">phase4FPerformanceReport</span></div>
                  </div>
                  <Tabs defaultValue="legacy_report" className="w-full">
                    <TabsList className="flex flex-wrap gap-1 bg-slate-900/50 border border-slate-700 rounded-xl p-1 h-auto mb-4">
                      <TabsTrigger value="legacy_report" className="text-xs text-slate-500">📄 Legacy Report</TabsTrigger>
                      <TabsTrigger value="compare"       className="text-xs text-slate-500">⚖ Before/After</TabsTrigger>
                      <TabsTrigger value="phase4c"       className="text-xs text-slate-500">🔬 4C Expiry</TabsTrigger>
                      <TabsTrigger value="phase4d"       className="text-xs text-slate-500">⚡ 4D Correction</TabsTrigger>
                      <TabsTrigger value="phase4e"       className="text-xs text-slate-500">📐 4E Size</TabsTrigger>
                      <TabsTrigger value="phase4e2"      className="text-xs text-slate-500">🧾 4E Accounting</TabsTrigger>
                    </TabsList>
                    <TabsContent value="legacy_report"><PaperReport24h /></TabsContent>
                    <TabsContent value="compare"><AdvPanel><Phase4BeforeAfterPanel /></AdvPanel></TabsContent>
                    <TabsContent value="phase4c"><AdvPanel><Phase4CExpiryDiagnosticPanel /></AdvPanel></TabsContent>
                    <TabsContent value="phase4d"><AdvPanel><Phase4DApplyCorrectionPanel /></AdvPanel></TabsContent>
                    <TabsContent value="phase4e"><AdvPanel><Phase4EPositionSizeDiagnosticPanel /></AdvPanel></TabsContent>
                    <TabsContent value="phase4e2"><AdvPanel><Phase4ECleanAccountingPanel /></AdvPanel></TabsContent>
                  </Tabs>
                </TabsContent>

              </Tabs>
            </div>
          )}
        </div>

        {/* ── Final Verdict footer ───────────────────────────────── */}
        <div className="text-center text-xs text-slate-600 pb-4">
          simplifiedDashboardActive: true · mainScreenUsesSystemTrail: true · mainReportUsesPhase4FPerformanceReport: true · advancedTabsCollapsed: true · legacyReportsArchived: true · tradingLogicChanged: false · realTradeAllowed: false · finalVerdict: COMMAND_CENTER_UI_ACTIVE
        </div>

      </div>
    </div>
  );
}

function SafeRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-mono font-bold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{value}</span>
        <span>{ok ? '✅' : '❌'}</span>
      </div>
    </div>
  );
}