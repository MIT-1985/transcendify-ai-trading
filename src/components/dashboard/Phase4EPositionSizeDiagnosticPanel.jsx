import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const pnlColor = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
const passIcon = v => v ? '✓' : '✗';
const passColor = v => v ? 'text-emerald-400' : 'text-red-400';

const RECOMMENDATION_STYLE = {
  KEEP_SIZE:                   'border-emerald-600 bg-emerald-950/20 text-emerald-300',
  INCREASE_PAPER_SIZE:         'border-yellow-500 bg-yellow-950/20 text-yellow-300',
  ADJUST_TP_OR_SKIP_WEAK_MARKET: 'border-orange-600 bg-orange-950/20 text-orange-300',
};

function MetricRow({ label, value, valueColor }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-xs py-1 border-b border-slate-800/50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-mono ${valueColor || 'text-white'}`}>{value}</span>
    </div>
  );
}

function PairCard({ p }) {
  const [expanded, setExpanded] = useState(false);
  const hasProblem = !p.passesCurrentFeeFilter;

  return (
    <div className={`rounded-xl border px-4 py-3 ${hasProblem ? 'border-red-700/50 bg-red-950/10' : 'border-slate-700 bg-slate-900/40'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-white text-sm">{p.instId}</span>
          <span className="text-slate-400 text-xs font-mono">${p.lastPrice?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${p.passesCurrentFeeFilter ? 'text-emerald-400' : 'text-red-400'}`}>
            {p.passesCurrentFeeFilter ? '✓ PASSES' : '✗ BLOCKED'}
          </span>
          <button onClick={() => setExpanded(e => !e)} className="text-slate-500 hover:text-white text-xs">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Quick metrics row */}
      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
        <div className="bg-slate-800/40 rounded px-2 py-1.5">
          <div className="text-slate-500 mb-0.5">Gross</div>
          <div className={`font-bold ${p.expectedGrossProfitUSDT >= 0.15 ? 'text-emerald-400' : 'text-red-400'}`}>
            {p.expectedGrossProfitUSDT?.toFixed(4)} USDT
          </div>
        </div>
        <div className="bg-slate-800/40 rounded px-2 py-1.5">
          <div className="text-slate-500 mb-0.5">Net</div>
          <div className={`font-bold ${pnlColor(p.estimatedNetProfitUSDT)}`}>
            {p.estimatedNetProfitUSDT?.toFixed(4)} USDT
          </div>
        </div>
        <div className="bg-slate-800/40 rounded px-2 py-1.5">
          <div className="text-slate-500 mb-0.5">Fee Ratio</div>
          <div className={`font-bold ${p.feeToGrossRatio <= 0.30 ? 'text-emerald-400' : 'text-red-400'}`}>
            {p.feeToGrossRatio != null ? (p.feeToGrossRatio * 100).toFixed(1) : '—'}%
          </div>
        </div>
      </div>

      {/* Recommended size */}
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-500">Recommended size:</span>
        <span className={`font-black text-base ${p.recommendedPaperSizeUSDT > 10 ? 'text-yellow-400' : 'text-emerald-400'}`}>
          {p.recommendedPaperSizeUSDT >= 9999 ? '⚠ N/A (ratio issue)' : `${p.recommendedPaperSizeUSDT} USDT`}
        </span>
      </div>

      {/* Market movement */}
      <div className={`text-xs px-2 py-1 rounded mb-1.5 ${p.marketMovementEnough ? 'bg-emerald-900/20 text-emerald-400' : 'bg-orange-900/20 text-orange-400'}`}>
        {p.marketMovementEnough ? '✓ Market movement sufficient' : '⚠ Weak market movement'}
        <span className="text-slate-400 ml-1">avgRange={p.avgCandleRangePct?.toFixed(3)}%</span>
      </div>

      {/* Reason */}
      <div className="text-xs text-slate-400 bg-slate-800/30 rounded px-2 py-1.5 leading-relaxed">
        {p.reason}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-0.5">
          <MetricRow label="spreadPct"              value={`${p.spreadPct?.toFixed(5)}%`} />
          <MetricRow label="estimatedFeesUSDT"      value={p.estimatedFeesUSDT?.toFixed(6)} valueColor="text-red-400" />
          <MetricRow label="estimatedSpreadCost"    value={p.estimatedSpreadCostUSDT?.toFixed(6)} valueColor="text-red-400" />
          <MetricRow label="minSize(grossFloor)"    value={`${p.minimumSizeForGrossFloorUSDT} USDT`} />
          <MetricRow label="minSize(netProfit)"     value={`${p.minimumSizeForNetProfitUSDT} USDT`} />
          <MetricRow label="feeEfficiencyAchievable" value={`${passIcon(p.feeEfficiencyAchievable)} ${p.feeEfficiencyAchievable}`} valueColor={passColor(p.feeEfficiencyAchievable)} />
          <MetricRow label="passesGrossFloor"       value={`${passIcon(p.passesGrossFloor)} ${p.passesGrossFloor}`} valueColor={passColor(p.passesGrossFloor)} />
          <MetricRow label="passesNetProfit"        value={`${passIcon(p.passesNetProfit)} ${p.passesNetProfit}`} valueColor={passColor(p.passesNetProfit)} />
          <MetricRow label="passesFeeEfficiency"    value={`${passIcon(p.passesFeeEfficiency)} ${p.passesFeeEfficiency}`} valueColor={passColor(p.passesFeeEfficiency)} />
          <MetricRow label="avgMom10Pct"            value={`${p.avgMom10Pct?.toFixed(4)}%`} />
        </div>
      )}
    </div>
  );
}

export default function Phase4EPositionSizeDiagnosticPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4EPositionSizeDiagnostic', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const g = data?.global;
  const recStyle = RECOMMENDATION_STYLE[g?.recommendation] || RECOMMENDATION_STYLE['KEEP_SIZE'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4E — Position Size Calibration</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Diagnoses whether FEE_DRAIN is caused by position size being too small or by weak market movement.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-indigo-700 hover:bg-indigo-600 text-white text-xs shrink-0">
          {loading ? '⏳ Running…' : '🔬 Run Diagnostic'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>
      )}

      {data && g && (
        <>
          {/* Recommendation banner */}
          <div className={`rounded-xl border-2 px-5 py-4 ${recStyle}`}>
            <div className="font-black text-sm mb-1">
              {g.recommendation === 'KEEP_SIZE' ? '✓ KEEP_SIZE' :
               g.recommendation === 'INCREASE_PAPER_SIZE' ? '⬆ INCREASE_PAPER_SIZE' :
               '⚠ ADJUST_TP_OR_SKIP_WEAK_MARKET'}
            </div>
            <p className="text-xs opacity-90">{g.summaryReason}</p>
          </div>

          {/* Global metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Current Size',
                value: `${g.currentDefaultPaperSizeUSDT} USDT`,
                color: 'text-white',
              },
              {
                label: 'Recommended Size',
                value: `${g.recommendedDefaultPaperSizeUSDT} USDT`,
                color: g.recommendedDefaultPaperSizeUSDT > g.currentDefaultPaperSizeUSDT ? 'text-yellow-400 font-black' : 'text-emerald-400 font-black',
              },
              {
                label: 'FEE_DRAIN: Small Pos.',
                value: g.feeDrainDueToSmallPosition ? 'YES ⚠' : 'NO ✓',
                color: g.feeDrainDueToSmallPosition ? 'text-red-400 font-bold' : 'text-emerald-400',
              },
              {
                label: 'FEE_DRAIN: Weak Move.',
                value: g.feeDrainDueToWeakMovement ? 'YES ⚠' : 'NO ✓',
                color: g.feeDrainDueToWeakMovement ? 'text-orange-400 font-bold' : 'text-emerald-400',
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
                <div className={`font-mono text-base ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* 24h context */}
          <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📅 24h Context</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <div className="text-slate-500 mb-1">Closed Trades</div>
                <div className="text-white font-bold">{data.performance24h.closedTrades}</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Net PnL</div>
                <div className={`font-bold ${pnlColor(data.performance24h.netPnL)}`}>
                  {data.performance24h.netPnL >= 0 ? '+' : ''}{data.performance24h.netPnL.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Total Fees</div>
                <div className="text-red-400 font-bold">-{data.performance24h.fees.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Expiry Ratio</div>
                <div className={`font-bold ${data.recentExpiryRatio > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {(data.recentExpiryRatio * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Score Floor</div>
                <div className={`font-bold ${data.effectiveScoreFloor >= 75 ? 'text-orange-400' : 'text-white'}`}>
                  {data.effectiveScoreFloor} {data.expiryPenaltyActive ? '⚠' : ''}
                </div>
              </div>
            </div>
            {data.feeDrainConfirmed && (
              <div className="mt-2 text-xs bg-red-900/20 border border-red-700/30 rounded px-2 py-1 text-red-300">
                ⚠ FEE_DRAIN CONFIRMED: fees ({data.performance24h.fees.toFixed(4)}) &gt; |gross| ({Math.abs(data.performance24h.grossPnL).toFixed(4)}) over last 24h
              </div>
            )}
          </div>

          {/* Per-pair cards */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🔍 Per-Pair Position Size Analysis</div>
            <div className="space-y-3">
              {(data.pairDiagnostics || []).map(p => <PairCard key={p.instId} p={p} />)}
            </div>
          </div>

          {/* Constants reference */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">⚙ Phase 4D Constants Applied</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              {Object.entries(g.phase4DConstants || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-slate-500 truncate">{k}</span>
                  <span className="text-cyan-400 shrink-0">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Safety flags */}
          <div className="flex flex-wrap gap-2">
            {[
              'realTradeAllowed: false',
              'realTradeUnlockAllowed: false',
              'killSwitchActive: true',
              'noOKXOrderEndpoint: true',
              `phase: ${data.phase}`,
            ].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">
                ✓ {l}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Run at {new Date(data.runAt).toLocaleString('de-DE')} · by {data.requestedBy}
          </p>
        </>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 text-sm py-16">
          Click <strong className="text-indigo-400">Run Diagnostic</strong> to analyze position size calibration.
        </div>
      )}
    </div>
  );
}