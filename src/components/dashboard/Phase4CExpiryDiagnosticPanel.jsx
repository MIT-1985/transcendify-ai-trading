import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

// ── Styling helpers ───────────────────────────────────────────────────────────
const pnlColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
const pctColor  = v => v < 40 ? 'text-emerald-400' : v < 60 ? 'text-yellow-400' : 'text-red-400';

const REASON_STYLE = {
  TP_TOO_FAR_SLIGHTLY:          { cls: 'bg-yellow-950/30 border-yellow-600 text-yellow-300', icon: '🎯' },
  SIGNAL_TOO_WEAK:              { cls: 'bg-orange-950/30 border-orange-600 text-orange-300', icon: '📉' },
  SL_TOO_TIGHT_OR_DIRECTION_BAD:{ cls: 'bg-red-950/30  border-red-600   text-red-300',    icon: '🛑' },
  FEE_DRAIN:                    { cls: 'bg-purple-950/30 border-purple-600 text-purple-300', icon: '💸' },
  EXPIRY_TOO_SHORT_OR_TP_TOO_FAR:{ cls: 'bg-blue-950/30 border-blue-600   text-blue-300',   icon: '⏱' },
  UNCLEAR:                      { cls: 'bg-slate-800/50 border-slate-600   text-slate-400',  icon: '❓' },
  INSUFFICIENT_DATA:            { cls: 'bg-slate-800/50 border-slate-600   text-slate-400',  icon: '📊' },
};

function ReasonBadge({ reason }) {
  const s = REASON_STYLE[reason] || REASON_STYLE.UNCLEAR;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${s.cls}`}>
      {s.icon} {reason}
    </span>
  );
}

function Stat({ label, value, colorClass = 'text-white' }) {
  return (
    <div className="flex flex-col">
      <span className="text-slate-500 text-xs uppercase tracking-wide">{label}</span>
      <span className={`font-bold text-sm ${colorClass}`}>{value ?? '—'}</span>
    </div>
  );
}

function PairCard({ p }) {
  const [open, setOpen] = useState(false);
  const s = REASON_STYLE[p.reason] || REASON_STYLE.UNCLEAR;

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${s.cls}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-black text-white text-base">{p.instId}</span>
        <ReasonBadge reason={p.reason} />
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Trades"    value={p.closedTrades} />
        <Stat label="Win Rate"  value={`${p.winRate}%`}  colorClass={p.winRate >= 30 ? 'text-emerald-400' : 'text-red-400'} />
        <Stat label="Net PnL"   value={`${p.netPnL >= 0 ? '+' : ''}${p.netPnL.toFixed(4)}`} colorClass={pnlColor(p.netPnL)} />
        <Stat label="TP Hits"   value={p.tpTrades}      colorClass="text-emerald-400" />
        <Stat label="SL Hits"   value={p.slTrades}      colorClass="text-red-400" />
        <Stat label="Expired"   value={`${p.expiredTrades} (${p.expiredPct}%)`} colorClass={pctColor(p.expiredPct)} />
      </div>

      {/* Expiry analysis */}
      {p.expiredTrades > 0 && (
        <div className="bg-slate-900/50 rounded-lg px-3 py-2 grid grid-cols-2 gap-2">
          <Stat label="Avg Duration"    value={p.averageDurationMinutes != null ? `${p.averageDurationMinutes}min` : '—'} />
          <Stat label="Avg Move %"      value={p.averageMoveBeforeExpiryPercent != null ? `${p.averageMoveBeforeExpiryPercent}%` : '—'} />
          <Stat label="Dist to TP %"    value={p.averageDistanceToTPAtExpiryPercent != null ? `${p.averageDistanceToTPAtExpiryPercent}%` : '—'} colorClass="text-yellow-400" />
          <Stat label="Dist to SL %"    value={p.averageDistanceToSLAtExpiryPercent != null ? `${p.averageDistanceToSLAtExpiryPercent}%` : '—'} colorClass="text-orange-400" />
        </div>
      )}

      {/* Signal quality */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Avg Score"      value={p.averageSignalScore}  colorClass={p.averageSignalScore >= 65 ? 'text-cyan-400' : 'text-yellow-400'} />
        <Stat label="BuyPressure %"  value={p.averageTickPressure != null ? `${p.averageTickPressure}%` : '—'} colorClass="text-blue-400" />
      </div>

      {/* Recommendation toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-slate-400 hover:text-white transition-colors underline underline-offset-2"
      >
        {open ? '▲ Hide recommendation' : '▼ Show recommendation'}
      </button>
      {open && (
        <div className="text-xs text-slate-300 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 leading-relaxed">
          {p.recommendation}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Phase4CExpiryDiagnosticPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4CExpiryDiagnostic', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const d  = data;
  const g  = d?.global;
  const l  = d?.last24h;
  const mainStyle = REASON_STYLE[g?.mainFailureReason] || REASON_STYLE.UNCLEAR;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4C — Expiry & TP Optimization Diagnostic</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Analyzes why paper trades expire instead of hitting TP or SL. Post-4B trades only. No market API.
          </p>
        </div>
        <Button
          size="sm"
          onClick={run}
          disabled={loading}
          className="bg-purple-700 hover:bg-purple-600 text-white text-xs shrink-0"
        >
          {loading ? '⏳ Analyzing…' : '🔬 Run Diagnostic'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>
      )}

      {d && (
        <>
          {/* Last 24h + After 4B summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Last 24h */}
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">📅 Last 24h</div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Trades"  value={l.closedTrades} />
                <Stat label="Expired" value={`${l.expiredPct}%`} colorClass={pctColor(l.expiredPct)} />
                <Stat label="Win Rate" value={`${l.winRate}%`} colorClass={l.winRate >= 30 ? 'text-emerald-400' : 'text-red-400'} />
                <Stat label="Net PnL" value={`${l.netPnL >= 0 ? '+' : ''}${l.netPnL.toFixed(4)}`} colorClass={pnlColor(l.netPnL)} />
              </div>
            </div>

            {/* After 4B global */}
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">📊 After Phase 4B (all time)</div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Trades"   value={g.closedTradesAfter4B} />
                <Stat label="Expired"  value={`${g.expiredPctAfter4B}%`} colorClass={pctColor(g.expiredPctAfter4B)} />
                <Stat label="Win Rate" value={`${g.winRateAfter4B}%`}  colorClass={g.winRateAfter4B >= 30 ? 'text-emerald-400' : 'text-red-400'} />
                <Stat label="Net PnL"  value={`${g.netPnLAfter4B >= 0 ? '+' : ''}${g.netPnLAfter4B.toFixed(4)}`} colorClass={pnlColor(g.netPnLAfter4B)} />
                <Stat label="Fees"     value={`-${g.feesAfter4B.toFixed(4)}`} colorClass="text-red-400" />
                <Stat label="Gross"    value={`${g.grossPnLAfter4B >= 0 ? '+' : ''}${g.grossPnLAfter4B.toFixed(4)}`} colorClass={pnlColor(g.grossPnLAfter4B)} />
              </div>
            </div>
          </div>

          {/* Main failure reason + recommendation */}
          <div className={`rounded-xl border-2 px-5 py-4 ${mainStyle.cls}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{mainStyle.icon}</span>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide font-bold">Main Failure Reason</div>
                <div className="font-black text-sm">{g.mainFailureReason}</div>
              </div>
            </div>
            <p className="text-xs opacity-90 leading-relaxed">{g.recommendedNextChange}</p>
          </div>

          {/* Per-pair cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(d.pairs || []).map(p => <PairCard key={p.instId} p={p} />)}
          </div>

          {/* Safety badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              `phase: ${d.phase}`,
              'realTradeAllowed: false',
              'realTradeUnlockAllowed: false',
              'killSwitchActive: true',
              'noOKXOrderEndpoint: true',
              'dataSource: PaperTrade only',
            ].map(label => (
              <span key={label} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">
                ✓ {label}
              </span>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Analyzed at {new Date(d.analyzedAt).toLocaleString('de-DE')} · {d.totalFetched} total trades fetched
          </p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-16">
          Click <strong className="text-purple-400">Run Diagnostic</strong> to analyze expiry patterns.
        </div>
      )}
    </div>
  );
}