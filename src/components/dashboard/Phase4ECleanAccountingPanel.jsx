import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const pnlColor = v => v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';

const ENGINE_STATUS_STYLE = {
  PAPER_ENGINE_PROFITABLE:    'border-emerald-600 bg-emerald-950/20 text-emerald-300',
  EDGE_EXISTS_BUT_FEE_DRAIN:  'border-yellow-500 bg-yellow-950/20 text-yellow-300',
  NO_DIRECTIONAL_EDGE:        'border-red-600 bg-red-950/20 text-red-300',
  MARGINAL_EDGE_FEE_DRAIN:    'border-orange-600 bg-orange-950/20 text-orange-300',
};

const REC_STYLE = {
  KEEP:               'bg-emerald-900/30 border-emerald-700/40 text-emerald-300',
  REDUCE:             'bg-yellow-900/30 border-yellow-700/40 text-yellow-300',
  DISABLE:            'bg-red-900/30 border-red-700/40 text-red-300',
  NEEDS_LARGER_TP:    'bg-orange-900/30 border-orange-700/40 text-orange-300',
};

function StatCard({ label, value, color, sub }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2.5">
      <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-black text-lg leading-none ${color || 'text-white'}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function MetricRow({ label, value, valueColor }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-xs py-1 border-b border-slate-800/50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-mono ${valueColor || 'text-white'}`}>{value}</span>
    </div>
  );
}

function PairCard({ p }) {
  const [open, setOpen] = useState(false);
  const recStyle = REC_STYLE[p.recommendation] || REC_STYLE['REDUCE'];

  return (
    <div className="bg-slate-900/40 border border-slate-700 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-black text-white text-sm">{p.instId}</span>
          <span className="text-slate-500 text-xs">{p.trades} trades</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs border px-2 py-0.5 rounded font-bold ${recStyle}`}>{p.recommendation}</span>
          <button onClick={() => setOpen(o => !o)} className="text-slate-500 hover:text-white text-xs">{open ? '▲' : '▼'}</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs mb-2">
        <div>
          <div className="text-slate-500 mb-0.5">Win Rate</div>
          <div className={`font-bold ${p.winRate >= 60 ? 'text-emerald-400' : p.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{p.winRate.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">Gross</div>
          <div className={`font-bold ${pnlColor(p.grossPnLBeforeFees)}`}>{p.grossPnLBeforeFees >= 0 ? '+' : ''}{p.grossPnLBeforeFees.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">Fees</div>
          <div className="text-red-400 font-bold">-{p.fees.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-slate-500 mb-0.5">Net</div>
          <div className={`font-bold ${pnlColor(p.netPnL)}`}>{p.netPnL >= 0 ? '+' : ''}{p.netPnL.toFixed(4)}</div>
        </div>
      </div>

      {p.feeDragPercent !== null && (
        <div className={`text-xs px-2 py-1 rounded mb-1.5 ${p.feeDragPercent > 80 ? 'bg-red-900/20 text-red-400' : p.feeDragPercent > 50 ? 'bg-orange-900/20 text-orange-400' : 'bg-slate-800/40 text-slate-400'}`}>
          Fee drag: <strong>{p.feeDragPercent.toFixed(1)}%</strong> of gross
        </div>
      )}

      <div className="text-xs text-slate-400 bg-slate-800/30 rounded px-2 py-1.5">{p.reason}</div>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-0.5">
          <MetricRow label="wins / losses"       value={`${p.wins} / ${p.losses}`} />
          <MetricRow label="avgGrossWin"          value={`+${p.averageGrossWin.toFixed(5)}`} valueColor="text-emerald-400" />
          <MetricRow label="avgGrossLoss"         value={`${p.averageGrossLoss.toFixed(5)}`} valueColor="text-red-400" />
          <MetricRow label="avgFeePerTrade"       value={`-${p.averageFeePerTrade.toFixed(5)}`} valueColor="text-red-400" />
          <MetricRow label="avgNetPerTrade"       value={`${p.averageNetPerTrade >= 0 ? '+' : ''}${p.averageNetPerTrade.toFixed(5)}`} valueColor={pnlColor(p.averageNetPerTrade)} />
        </div>
      )}
    </div>
  );
}

export default function Phase4ECleanAccountingPanel() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4ECleanAccountingDiagnostic', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const g   = data?.global;
  const eng = data?.engineStatus;
  const statusStyle = ENGINE_STATUS_STYLE[eng] || ENGINE_STATUS_STYLE['MARGINAL_EDGE_FEE_DRAIN'];
  const opt = data?.optimizationSuggestions;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Phase 4E — Clean Accounting Fee Break-Even</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Determines why a {data?.knownCleanAccounting?.winRate ?? 69.3}% win rate still produces negative net P&L using clean deduped verified trades.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={loading} className="bg-indigo-700 hover:bg-indigo-600 text-white text-xs shrink-0">
          {loading ? '⏳ Running…' : '🔬 Run Diagnostic'}
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>}

      {data && g && (
        <>
          {/* Engine status banner */}
          <div className={`rounded-xl border-2 px-5 py-4 ${statusStyle}`}>
            <div className="font-black text-sm mb-1">
              {eng === 'PAPER_ENGINE_PROFITABLE'   && '✓ PAPER_ENGINE_PROFITABLE'}
              {eng === 'EDGE_EXISTS_BUT_FEE_DRAIN' && '⚠ EDGE_EXISTS_BUT_FEE_DRAIN'}
              {eng === 'NO_DIRECTIONAL_EDGE'       && '✗ NO_DIRECTIONAL_EDGE'}
              {eng === 'MARGINAL_EDGE_FEE_DRAIN'   && '⚡ MARGINAL_EDGE_FEE_DRAIN'}
            </div>
            <p className="text-xs opacity-90 leading-relaxed">{g.feeDragReason}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs opacity-75">
              <span>cleanTrades: <strong>{data.verifiedTradeRecordsRead}</strong></span>·
              <span>duplicatesExcluded: <strong>{data.knownCleanAccounting.duplicatesExcluded}</strong></span>·
              <span>suspectExcluded: <strong>{data.knownCleanAccounting.suspectExcluded}</strong></span>
            </div>
          </div>

          {/* Global stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Win Rate"   value={`${g.winRate}%`}    color={g.winRate >= 60 ? 'text-emerald-400' : g.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'} sub={`${g.wins}W / ${g.losses}L`} />
            <StatCard label="Gross P&L"  value={`${g.grossPnLBeforeFees >= 0 ? '+' : ''}${g.grossPnLBeforeFees.toFixed(4)}`} color={pnlColor(g.grossPnLBeforeFees)} sub="before fees" />
            <StatCard label="Total Fees" value={`-${g.fees.toFixed(4)}`} color="text-red-400" sub="round-trip" />
            <StatCard label="Net P&L"    value={`${g.netPnL >= 0 ? '+' : ''}${g.netPnL.toFixed(4)}`} color={pnlColor(g.netPnL)} sub={`${g.uniqueTrades} trades`} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Avg Gross/Trade"  value={`${g.averageGrossPnLPerTrade >= 0 ? '+' : ''}${g.averageGrossPnLPerTrade.toFixed(5)}`} color={pnlColor(g.averageGrossPnLPerTrade)} />
            <StatCard label="Avg Fee/Trade"    value={`-${g.averageFeePerTrade.toFixed(5)}`} color="text-red-400" />
            <StatCard label="Avg Net/Trade"    value={`${g.averageNetPnLPerTrade >= 0 ? '+' : ''}${g.averageNetPnLPerTrade.toFixed(5)}`} color={pnlColor(g.averageNetPnLPerTrade)} />
            <StatCard label="Fee Drag"         value={g.currentFeeDragPercent !== null ? `${g.currentFeeDragPercent.toFixed(1)}%` : 'N/A'} color={g.currentFeeDragPercent > 80 ? 'text-red-400' : g.currentFeeDragPercent > 50 ? 'text-orange-400' : 'text-emerald-400'} sub="of gross" />
          </div>

          {/* Break-even callout */}
          <div className="bg-slate-900/60 border border-yellow-700/40 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-yellow-400 uppercase tracking-wide mb-2">🎯 Break-Even Analysis</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500 mb-1">Gross needed to break even</div>
                <div className="font-black text-white text-base">{g.breakEvenGrossRequired.toFixed(4)} USDT</div>
                <div className="text-slate-500">(= total fees)</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Current gross</div>
                <div className={`font-black text-base ${pnlColor(g.grossPnLBeforeFees)}`}>{g.grossPnLBeforeFees >= 0 ? '+' : ''}{g.grossPnLBeforeFees.toFixed(4)} USDT</div>
                <div className="text-slate-500">shortfall: {(g.breakEvenGrossRequired - g.grossPnLBeforeFees).toFixed(4)} USDT</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Avg gross/trade needed</div>
                <div className="font-black text-white text-base">{g.averageFeePerTrade.toFixed(5)} USDT</div>
                <div className="text-slate-500">currently: {g.averageGrossPnLPerTrade.toFixed(5)}</div>
              </div>
            </div>
          </div>

          {/* Per-pair */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">📊 Per-Pair Breakdown</div>
            <div className="space-y-3">
              {(data.perPair || []).map(p => <PairCard key={p.instId} p={p} />)}
            </div>
          </div>

          {/* Optimization suggestions */}
          {opt && (
            <div className="bg-slate-900/60 border border-cyan-700/30 rounded-xl px-4 py-3">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-wide mb-3">⚡ Optimization Suggestions</div>
              <div className="space-y-0.5 mb-3">
                <MetricRow label="reqAvgGrossToBreakEven"    value={`${opt.requiredAverageGrossPerTradeToBreakEven.toFixed(5)} USDT/trade`} />
                <MetricRow label="recommendedTPPercent"       value={`${opt.recommendedTPPercent}% (currently 0.30%)`} valueColor="text-cyan-400" />
                <MetricRow label="requiredTPIncreasePercent"  value={`+${opt.requiredTPIncreasePercent}%`} valueColor={opt.requiredTPIncreasePercent > 0 ? 'text-yellow-400' : 'text-emerald-400'} />
                <MetricRow label="minPositionSize(currentTP)" value={`${opt.minimumPositionSizeForCurrentTP} USDT`} />
                <MetricRow label="recommendedMinNetProfit"    value={`${opt.recommendedMinNetProfitUSDT} USDT`} />
                <MetricRow label="recommendedFeeEffRatio"     value={`${(opt.recommendedFeeEfficiencyRatio * 100).toFixed(1)}%`} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500 mb-1 uppercase tracking-wide">Pairs to Keep</div>
                  {opt.pairsToKeep.length > 0
                    ? opt.pairsToKeep.map(p => <span key={p} className="inline-block bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-2 py-0.5 rounded mr-1 mb-1">{p}</span>)
                    : <span className="text-slate-500">none profitable yet</span>}
                </div>
                <div>
                  <div className="text-slate-500 mb-1 uppercase tracking-wide">Pairs to Disable</div>
                  {opt.pairsToDisable.length > 0
                    ? opt.pairsToDisable.map(p => <span key={p} className="inline-block bg-red-900/30 border border-red-700/40 text-red-300 px-2 py-0.5 rounded mr-1 mb-1">{p}</span>)
                    : <span className="text-slate-500">none</span>}
                </div>
              </div>
            </div>
          )}

          {/* Safety flags */}
          <div className="flex flex-wrap gap-2">
            {['realTradeAllowed: false', 'realTradeUnlockAllowed: false', 'killSwitchActive: true', 'noOKXOrderEndpoint: true', `phase: ${data.phase}`].map(l => (
              <span key={l} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">✓ {l}</span>
            ))}
          </div>
          <p className="text-xs text-slate-500">Run at {new Date(data.runAt).toLocaleString('de-DE')} · {data.requestedBy}</p>
        </>
      )}

      {!data && !loading && (
        <div className="text-center text-slate-500 text-sm py-16">
          Click <strong className="text-indigo-400">Run Diagnostic</strong> to analyze fee break-even with clean accounting data.
        </div>
      )}
    </div>
  );
}