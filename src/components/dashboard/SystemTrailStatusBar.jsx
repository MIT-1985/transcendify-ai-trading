/**
 * SystemTrailStatusBar
 * Compact banner shown at the top of Dashboard, PaperTradingDashboard, SignalDashboard.
 * Pulls from systemTrailTradingState — the single source of truth.
 */
import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';

const ALERT_STYLES = {
  READY: 'border-emerald-600 bg-emerald-950/30 text-emerald-300',
  HOT:   'border-orange-600 bg-orange-950/20 text-orange-300',
  WARM:  'border-yellow-700 bg-yellow-950/20 text-yellow-300',
  COLD:  'border-slate-700 bg-slate-900/40 text-slate-400',
};

const ALERT_ICONS = { READY: '🟢', HOT: '🔥', WARM: '🟡', COLD: '🔵' };

export default function SystemTrailStatusBar({ onRunScan, isRunning }) {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['system-trail', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('systemTrailTradingState', {});
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: 60000,
    gcTime: 0,
  });

  const ls    = data?.liveStatus || {};
  const cfg   = data?.config     || {};
  const ui    = data?.uiDecision || {};
  const level = ls.alertLevel    || 'COLD';
  const style = ALERT_STYLES[level] || ALERT_STYLES.COLD;

  return (
    <div className={`rounded-xl border-2 px-4 py-3 text-xs ${style}`}>
      <div className="flex flex-wrap items-center gap-3 justify-between">

        {/* Left: mode label */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base">{ALERT_ICONS[level]}</span>
          <span className="font-black text-white text-xs uppercase tracking-widest">
            SYSTEM TRAIL — SINGLE SOURCE OF TRUTH
          </span>
          <span className="font-mono text-cyan-400 text-xs">{data?.activeMode ?? 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE'}</span>
        </div>

        {/* Right: run button */}
        {onRunScan && (
          <button
            onClick={onRunScan}
            disabled={isRunning || isLoading}
            className="px-4 py-1.5 text-xs font-black rounded-lg bg-cyan-700/30 border border-cyan-600 hover:bg-cyan-700/50 text-cyan-300 disabled:opacity-50 transition-all shrink-0"
          >
            {isRunning ? '⏳ Running…' : ui.buttonLabel === 'RUN_BTC_PAPER_SCAN' ? '▶ RUN_BTC_PAPER_SCAN' : '🔄 REFRESH_BTC_SIGNAL'}
          </button>
        )}
      </div>

      {/* Status row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        <span>Engine: <span className="text-white font-bold">{data?.activeEngine ?? '—'}</span></span>
        <span>Pair: <span className="text-yellow-400 font-bold">{data?.activePair ?? '—'}</span></span>
        <span>Score: <span className={`font-black ${(ls.totalScore ?? 0) >= 75 ? 'text-emerald-400' : 'text-red-400'}`}>{ls.totalScore ?? 0}/{cfg.requiredScore ?? 75}</span></span>
        <span>Alert: <span className={`font-black ${level === 'READY' ? 'text-emerald-400' : level === 'HOT' ? 'text-orange-400' : level === 'WARM' ? 'text-yellow-400' : 'text-slate-400'}`}>{level}</span></span>
        {ls.lastPrice && <span>BTC: <span className="text-white font-bold">${ls.lastPrice?.toLocaleString()}</span></span>}
        <span>Open: <span className="text-white font-bold">{ls.openBTCTrades ?? 0}/{cfg.maxOpenTrades ?? 1}</span></span>
        <span>Action: <span className="text-cyan-400 font-bold">{ls.recommendedAction ?? '—'}</span></span>
        <span>Blocking: <span className="text-orange-400 font-mono">{ls.mainBlockingReason ?? '—'}</span></span>
        {ls.phase5GuardStatus && <span>P5Guard: <span className="text-purple-400 font-bold text-xs">{ls.phase5GuardStatus === 'PAPER_EVIDENCE_READY_BUT_MANUAL_REVIEW_REQUIRED' ? '⚠ MANUAL_REVIEW' : ls.phase5GuardStatus}</span></span>}
        <span>HardBlocker: <span className="text-red-400 font-bold">REAL_TRADING_BLOCKED</span></span>
      </div>

      {/* Safety badges */}
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="bg-red-950/50 border border-red-700 text-red-400 font-bold px-1.5 py-0.5 rounded text-xs">🛑 Kill Switch ACTIVE</span>
        <span className="bg-red-950/50 border border-red-700 text-red-400 font-bold px-1.5 py-0.5 rounded text-xs">realTradeAllowed: false</span>
        <span className="bg-slate-800 border border-slate-600 text-emerald-400 font-bold px-1.5 py-0.5 rounded text-xs">noOKXOrderEndpoint: true</span>
        <span className="bg-slate-800 border border-slate-600 text-yellow-400 font-bold px-1.5 py-0.5 rounded text-xs">PAPER ONLY</span>
        <span className="bg-slate-800 border border-slate-600 text-cyan-400 font-bold px-1.5 py-0.5 rounded text-xs">finalVerdict: {data?.finalVerdict ?? 'SYSTEM_TRAIL_SINGLE_SOURCE_OF_TRUTH_ACTIVE'}</span>
        {isLoading && <span className="text-slate-500 italic">loading…</span>}
        {!isLoading && !data && <button onClick={() => refetch()} className="text-slate-400 hover:text-white underline text-xs">retry</button>}
      </div>
    </div>
  );
}