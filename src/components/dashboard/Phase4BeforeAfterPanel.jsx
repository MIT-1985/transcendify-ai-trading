import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

// ── Helpers ───────────────────────────────────────────────────────────────────
const pnlColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
const pctColor  = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
const deltaSign = v => v > 0 ? `+${v}` : `${v}`;

const VERDICT_STYLE = {
  COLLECTING_AFTER_DATA:       'border-yellow-600 bg-yellow-950/20 text-yellow-300',
  CONSTANTS_IMPROVING_ENGINE:  'border-emerald-600 bg-emerald-950/20 text-emerald-300',
  NEEDS_NEXT_OPTIMIZATION:     'border-red-600 bg-red-950/20 text-red-300',
  MONITORING:                  'border-blue-600 bg-blue-950/20 text-blue-300',
};
const VERDICT_ICON = {
  COLLECTING_AFTER_DATA:       '⏳',
  CONSTANTS_IMPROVING_ENGINE:  '✅',
  NEEDS_NEXT_OPTIMIZATION:     '🔧',
  MONITORING:                  '👁',
};

// ── Metric row ─────────────────────────────────────────────────────────────────
function MetricRow({ label, before, after, delta, format, colorFn, invertDelta }) {
  const fmtVal  = v => format ? format(v) : String(v ?? '—');
  const dColor  = delta === null || delta === undefined ? 'text-slate-500'
    : (invertDelta ? -delta : delta) > 0 ? 'text-emerald-400'
    : (invertDelta ? -delta : delta) < 0 ? 'text-red-400'
    : 'text-slate-400';

  return (
    <div className="grid grid-cols-4 gap-2 text-xs py-1.5 border-b border-slate-800/60 last:border-0">
      <div className="text-slate-400 font-medium">{label}</div>
      <div className={`text-right font-mono ${colorFn ? colorFn(before) : 'text-slate-300'}`}>{fmtVal(before)}</div>
      <div className={`text-right font-mono ${colorFn ? colorFn(after)  : 'text-slate-300'}`}>{fmtVal(after)}</div>
      <div className={`text-right font-mono font-bold ${dColor}`}>
        {delta !== null && delta !== undefined ? deltaSign(typeof delta === 'number' ? parseFloat(delta.toFixed(4)) : delta) : '—'}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ before, after, label }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-xs mb-1 pb-1.5 border-b-2 border-slate-700">
      <div className="text-slate-500 font-bold uppercase tracking-wide">{label}</div>
      <div className="text-right text-slate-500 font-bold uppercase tracking-wide">Before</div>
      <div className="text-right text-cyan-400 font-bold uppercase tracking-wide">After</div>
      <div className="text-right text-slate-500 font-bold uppercase tracking-wide">Δ Delta</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Phase4BeforeAfterPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4BeforeAfterComparison', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const d = data;
  const b = d?.before;
  const a = d?.after;
  const delta = d?.delta;
  const verdict = d?.verdict;
  const verdictCls = VERDICT_STYLE[verdict?.status] ?? VERDICT_STYLE.MONITORING;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4B Before / After Comparison</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Compares paper trade performance before and after the Phase 4B constants correction.
          </p>
        </div>
        <Button
          size="sm"
          onClick={run}
          disabled={loading}
          className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs shrink-0"
        >
          {loading ? '⏳ Loading…' : '🔄 Run Comparison'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>
      )}

      {d && (
        <>
          {/* Cutoff info */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-xs space-y-1">
            <div className="flex flex-wrap gap-4">
              <span className="text-slate-400">Constants changed at:</span>
              <span className="font-mono text-cyan-300">
                {d.constantsChangedAt ? new Date(d.constantsChangedAt).toLocaleString('de-DE') : '⚠ Not detected yet'}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">Detection:</span>
              <span className="text-slate-300">{d.detectionMethod}</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <span className="text-slate-400">Total trades:</span>
              <span className="text-white font-bold">{d.totalTradesFetched}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">Before:</span>
              <span className="text-orange-300 font-bold">{d.beforeCount}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">After:</span>
              <span className="text-cyan-300 font-bold">{d.afterCount}</span>
            </div>
          </div>

          {/* Verdict banner */}
          <div className={`rounded-xl border-2 px-5 py-4 ${verdictCls}`}>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xl">{VERDICT_ICON[verdict?.status]}</span>
              <span className="font-black text-sm tracking-wide">{verdict?.status}</span>
            </div>
            <p className="text-xs opacity-90">{verdict?.reason}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-75">
              <span>realTradeAllowed: <strong>false</strong></span>
              <span>·</span>
              <span>realTradeUnlockAllowed: <strong>false</strong></span>
              <span>·</span>
              <span>killSwitchActive: <strong>true</strong></span>
            </div>
          </div>

          {/* Comparison table */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 space-y-0">

            {/* Trade volume */}
            <SectionHeader label="Volume" />
            <MetricRow label="Total Trades"   before={b.totalTrades}   after={a.totalTrades}   delta={null} />
            <MetricRow label="Closed Trades"  before={b.closedTrades}  after={a.closedTrades}  delta={null} />
            <MetricRow label="TP Hits"        before={b.tpTrades}      after={a.tpTrades}      delta={null} />
            <MetricRow label="SL Hits"        before={b.slTrades}      after={a.slTrades}      delta={null} />
            <MetricRow label="Expired"        before={b.expiredTrades} after={a.expiredTrades} delta={null} />

            {/* Quality */}
            <div className="pt-3">
              <SectionHeader label="Quality" />
              <MetricRow
                label="Win Rate"
                before={b.winRate}
                after={a.winRate}
                delta={delta.winRate}
                format={v => `${v}%`}
                colorFn={v => v >= 45 ? 'text-emerald-400' : 'text-red-400'}
              />
              <MetricRow
                label="Expired Ratio"
                before={b.expiredPct}
                after={a.expiredPct}
                delta={parseFloat((delta.expiredPct).toFixed(2))}
                format={v => `${v}%`}
                colorFn={v => v < 40 ? 'text-emerald-400' : 'text-red-400'}
                invertDelta={true}
              />
              <MetricRow
                label="Avg Score"
                before={b.averageScore}
                after={a.averageScore}
                delta={delta.averageScore}
                colorFn={v => v >= 65 ? 'text-emerald-400' : 'text-yellow-400'}
              />
            </div>

            {/* P&L */}
            <div className="pt-3">
              <SectionHeader label="P&L (USDT)" />
              <MetricRow
                label="Net P&L"
                before={b.netPnL}
                after={a.netPnL}
                delta={delta.netPnL}
                format={v => `${v >= 0 ? '+' : ''}${v.toFixed(4)}`}
                colorFn={pnlColor}
              />
              <MetricRow
                label="Gross P&L"
                before={b.grossPnL}
                after={a.grossPnL}
                delta={parseFloat((a.grossPnL - b.grossPnL).toFixed(6))}
                format={v => `${v >= 0 ? '+' : ''}${v.toFixed(4)}`}
                colorFn={pnlColor}
              />
              <MetricRow
                label="Fees Paid"
                before={b.fees}
                after={a.fees}
                delta={parseFloat(delta.fees.toFixed(4))}
                format={v => `-${v.toFixed(4)}`}
                colorFn={() => 'text-red-400'}
                invertDelta={true}
              />
              <MetricRow
                label="Spread Cost"
                before={b.spreadCost}
                after={a.spreadCost}
                delta={parseFloat((a.spreadCost - b.spreadCost).toFixed(6))}
                format={v => `-${v.toFixed(4)}`}
                colorFn={() => 'text-orange-400'}
                invertDelta={true}
              />
            </div>
          </div>

          {/* Safety badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              'realTradeAllowed: false',
              'realTradeUnlockAllowed: false',
              'killSwitchActive: true',
              'noOKXOrderEndpoint: true',
              'dataSource: PaperTrade entity only',
            ].map(label => (
              <span key={label} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">
                ✓ {label}
              </span>
            ))}
          </div>

          <p className="text-xs text-slate-500">Compared at {new Date(d.comparedAt).toLocaleString('de-DE')}</p>
        </>
      )}

      {!d && !loading && (
        <div className="text-center text-slate-500 text-sm py-16">
          Click <strong className="text-cyan-400">Run Comparison</strong> to load the before/after analysis.
        </div>
      )}
    </div>
  );
}