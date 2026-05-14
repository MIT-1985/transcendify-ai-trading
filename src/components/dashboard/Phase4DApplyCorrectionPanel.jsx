import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const pnlColor = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
const passColor = v => v ? 'text-emerald-400' : 'text-red-400';

const VERDICT_STYLE = {
  PHASE_4D_CONSTANTS_ACTIVE:    'border-cyan-600 bg-cyan-950/20 text-cyan-300',
  SAFETY_VIOLATION:             'border-red-600 bg-red-950/30 text-red-300',
  ERROR_DURING_APPLICATION:     'border-orange-600 bg-orange-950/20 text-orange-300',
};

function DiffRow({ label, oldVal, newVal }) {
  const changed = oldVal !== newVal && !(oldVal === null && newVal === null);
  return (
    <div className={`grid grid-cols-3 gap-2 text-xs py-1.5 border-b border-slate-800/50 last:border-0 ${changed ? 'bg-yellow-950/10' : ''}`}>
      <span className="text-slate-400">{label}</span>
      <span className={`text-right font-mono ${changed ? 'text-orange-400 line-through opacity-60' : 'text-slate-400'}`}>{String(oldVal ?? '—')}</span>
      <span className={`text-right font-mono font-bold ${changed ? 'text-cyan-300' : 'text-slate-400'}`}>{String(newVal ?? '—')}</span>
    </div>
  );
}

function PairRow({ p }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${p.action === 'WOULD_OPEN' ? 'border-emerald-700 bg-emerald-950/20' : 'border-slate-700 bg-slate-900/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-black text-white">{p.instId}</span>
        <span className={`font-bold ${p.action === 'WOULD_OPEN' ? 'text-emerald-400' : 'text-red-400'}`}>{p.action}</span>
        <span className="text-slate-400">score: <span className="text-cyan-400">{p.score}</span></span>
        <span className={p.direction === 'BULLISH' ? 'text-emerald-400' : p.direction === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}>{p.direction}</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {p.blockedByFeeDrain    && <span className="text-xs bg-purple-900/30 border border-purple-700/40 text-purple-300 px-1.5 py-0.5 rounded">💸 FEE_DRAIN</span>}
        {p.blockedByTPRealism   && <span className="text-xs bg-orange-900/30 border border-orange-700/40 text-orange-300 px-1.5 py-0.5 rounded">🎯 TP_REALISM</span>}
        {p.blockedByExpiryPenalty && <span className="text-xs bg-blue-900/30 border border-blue-700/40 text-blue-300 px-1.5 py-0.5 rounded">⏱ EXPIRY_PENALTY</span>}
        {p.newlyBlockedByConstants && <span className="text-xs bg-yellow-900/30 border border-yellow-700/40 text-yellow-300 px-1.5 py-0.5 rounded">⚠ NEW in 4D</span>}
        <span className="text-slate-500">gross: <span className="text-white">{p.grossProfit}</span></span>
        <span className="text-slate-500">net: <span className={pnlColor(p.estimatedNet)}>{p.estimatedNet}</span></span>
        <span className="text-slate-500">feeEff: <span className={p.feeEffRatio > 0.30 ? 'text-red-400' : 'text-emerald-400'}>{(p.feeEffRatio * 100).toFixed(1)}%</span></span>
      </div>
    </div>
  );
}

export default function Phase4DApplyCorrectionPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4DApplyCorrection', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const d = data;
  const verdictKey = d?.finalVerdict?.startsWith('PHASE_4D_CONSTANTS') ? 'PHASE_4D_CONSTANTS_ACTIVE'
    : d?.finalVerdict?.startsWith('SAFETY') ? 'SAFETY_VIOLATION' : 'ERROR_DURING_APPLICATION';
  const verdictCls = VERDICT_STYLE[verdictKey] || VERDICT_STYLE['PHASE_4D_CONSTANTS_ACTIVE'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4D — Fee-Profit Correction</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Applies and verifies 4D constants. Shows old vs new, which pairs are blocked by each new barrier.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-indigo-700 hover:bg-indigo-600 text-white text-xs shrink-0">
          {loading ? '⏳ Running…' : '⚡ Apply & Verify 4D'}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {d && (
        <>
          {/* Verdict banner */}
          <div className={`rounded-xl border-2 px-5 py-4 ${verdictCls}`}>
            <div className="font-black text-sm mb-1">⚡ {d.engineStatus}</div>
            <p className="text-xs opacity-90">{d.finalVerdict}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs opacity-75">
              <span>realTradeAllowed: <strong>false</strong></span>·
              <span>killSwitchActive: <strong>true</strong></span>·
              <span>realTradingEndpointDetected: <strong className={passColor(!d.realTradingEndpointDetected)}>{String(d.realTradingEndpointDetected)}</strong></span>·
              <span>safetyStatus: <strong className={d.safetyStatus === 'SAFE' ? 'text-emerald-400' : 'text-red-400'}>{d.safetyStatus}</strong></span>
            </div>
          </div>

          {/* Constants diff */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-2 text-xs mb-2 pb-1.5 border-b-2 border-slate-600">
              <span className="text-slate-500 font-bold uppercase tracking-wide">Constant</span>
              <span className="text-right text-orange-400 font-bold uppercase tracking-wide">Phase 4B (Old)</span>
              <span className="text-right text-cyan-400 font-bold uppercase tracking-wide">Phase 4D (New)</span>
            </div>
            <DiffRow label="minEstimatedNetProfit" oldVal={d.oldConstants.minEstimatedNetProfit} newVal={d.newConstants.minEstimatedNetProfit} />
            <DiffRow label="feeEfficiencyMaxRatio"  oldVal={d.oldConstants.feeEfficiencyMaxRatio}  newVal={d.newConstants.feeEfficiencyMaxRatio} />
            <DiffRow label="grossProfitFloor"        oldVal={d.oldConstants.grossProfitFloor}       newVal={d.newConstants.grossProfitFloor} />
            <DiffRow label="highExpiryScoreFloor"   oldVal={d.oldConstants.highExpiryScoreFloor}   newVal={d.newConstants.highExpiryScoreFloor} />
            <DiffRow label="highExpiryThreshold"    oldVal={d.oldConstants.highExpiryThreshold}    newVal={d.newConstants.highExpiryThreshold} />
            <DiffRow label="tpRealismCheck"          oldVal={d.oldConstants.tpRealismCheck}         newVal={d.newConstants.tpRealismCheck} />
            <DiffRow label="requiredScore"           oldVal={d.oldConstants.requiredScore}          newVal={d.newConstants.requiredScore} />
            <DiffRow label="maxOpenTrades"           oldVal={d.oldConstants.maxOpenTrades}          newVal={d.newConstants.maxOpenTrades} />
          </div>

          {/* This scan summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Would Open',           value: d.openedThisRun,           color: d.openedThisRun > 0 ? 'text-emerald-400' : 'text-slate-400' },
              { label: 'Blocked: Fee Drain',   value: d.blockedByFeeDrain,       color: d.blockedByFeeDrain > 0 ? 'text-purple-400' : 'text-slate-400' },
              { label: 'Blocked: TP Realism',  value: d.blockedByTPRealism,      color: d.blockedByTPRealism > 0 ? 'text-orange-400' : 'text-slate-400' },
              { label: 'Blocked: Expiry Pen.', value: d.blockedByExpiryPenalty,  color: d.blockedByExpiryPenalty > 0 ? 'text-blue-400' : 'text-slate-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
                <div className={`font-black text-2xl ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* 24h Performance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 space-y-1.5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📅 24h Performance</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-slate-500">Closed</div><div className="text-right col-span-2 text-white">{d.performance24h.closedTrades}</div>
                <div className="text-slate-500">Net PnL</div><div className={`text-right col-span-2 font-bold ${pnlColor(d.performance24h.netPnL)}`}>{d.performance24h.netPnL >= 0 ? '+' : ''}{d.performance24h.netPnL.toFixed(4)}</div>
                <div className="text-slate-500">Fees</div><div className="text-right col-span-2 text-red-400">-{d.performance24h.fees.toFixed(4)}</div>
                <div className="text-slate-500">Gross</div><div className={`text-right col-span-2 ${pnlColor(d.performance24h.grossPnL)}`}>{d.performance24h.grossPnL >= 0 ? '+' : ''}{d.performance24h.grossPnL.toFixed(4)}</div>
                <div className="text-slate-500">Win Rate</div><div className={`text-right col-span-2 ${d.performance24h.winRate >= 45 ? 'text-emerald-400' : 'text-red-400'}`}>{d.performance24h.winRate.toFixed(1)}%</div>
                <div className="text-slate-500">Expired%</div><div className={`text-right col-span-2 ${d.performance24h.expiredPct < 50 ? 'text-emerald-400' : 'text-red-400'}`}>{d.performance24h.expiredPct.toFixed(1)}%</div>
                <div className="text-slate-500">Fee Drain</div><div className={`text-right col-span-2 font-bold ${d.performance24h.feeDrainActive ? 'text-red-400' : 'text-emerald-400'}`}>{d.performance24h.feeDrainActive ? 'ACTIVE ⚠' : 'OK ✓'}</div>
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 space-y-1.5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📊 After Phase 4B</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-slate-500">Closed</div><div className="text-right col-span-2 text-white">{d.performanceAfter4B.closedTrades}</div>
                <div className="text-slate-500">Net PnL</div><div className={`text-right col-span-2 font-bold ${pnlColor(d.performanceAfter4B.netPnL)}`}>{d.performanceAfter4B.netPnL >= 0 ? '+' : ''}{d.performanceAfter4B.netPnL.toFixed(4)}</div>
                <div className="text-slate-500">Fees</div><div className="text-right col-span-2 text-red-400">-{d.performanceAfter4B.fees.toFixed(4)}</div>
                <div className="text-slate-500">Win Rate</div><div className={`text-right col-span-2 ${d.performanceAfter4B.winRate >= 45 ? 'text-emerald-400' : 'text-red-400'}`}>{d.performanceAfter4B.winRate.toFixed(1)}%</div>
                <div className="text-slate-500">Expired%</div><div className={`text-right col-span-2 ${d.performanceAfter4B.expiredPct < 50 ? 'text-emerald-400' : 'text-red-400'}`}>{d.performanceAfter4B.expiredPct.toFixed(1)}%</div>
                <div className="text-slate-500">ExpiryRatio</div><div className={`text-right col-span-2 font-bold ${d.recentExpiryRatio < 0.50 ? 'text-emerald-400' : 'text-red-400'}`}>{(d.recentExpiryRatio*100).toFixed(1)}% {d.expiryPenaltyActive ? '→ score≥75' : '→ score≥65'}</div>
              </div>
            </div>
          </div>

          {/* Per-pair scan */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">🔍 Per-Pair 4D Scan</div>
            <div className="space-y-2">
              {(d.pairScan || []).filter(p => p.action !== 'SKIP_OPEN' && p.action !== 'SKIP_NO_DATA').map(p => <PairRow key={p.instId} p={p} />)}
            </div>
          </div>

          {/* Safety */}
          <div className="flex flex-wrap gap-2">
            {[
              'realTradeAllowed: false', 'realTradeUnlockAllowed: false',
              'killSwitchActive: true', 'noOKXOrderEndpoint: true', 'phase: PHASE_4D',
            ].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
          </div>
          <p className="text-xs text-slate-500">Applied at {new Date(d.appliedAt).toLocaleString('de-DE')}</p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-16">
          Click <strong className="text-indigo-400">Apply & Verify 4D</strong> to run the correction check.
        </div>
      )}
    </div>
  );
}