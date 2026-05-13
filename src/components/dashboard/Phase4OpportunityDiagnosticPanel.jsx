import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ACTION_COLOR = {
  PAPER_SIGNAL_ONLY: 'bg-green-500/20 text-green-300 border-green-500/30',
  WATCH:             'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  WAIT:              'bg-slate-500/20 text-slate-400 border-slate-600/30',
};

const BARRIER_COLOR = (v) =>
  v === 'PASS' ? 'text-green-400' : 'text-red-400';

function BarrierDot({ label, value }) {
  return (
    <span className={`text-xs font-mono ${BARRIER_COLOR(value)}`}>
      {value === 'PASS' ? '✓' : '✗'} {label}
    </span>
  );
}

function PairCard({ p }) {
  const [open, setOpen] = useState(false);
  const actionCls = ACTION_COLOR[p.currentAction] ?? ACTION_COLOR.WAIT;

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white text-sm">{p.pair}</span>
          <span className={`text-xs border rounded px-2 py-0.5 font-semibold ${actionCls}`}>
            {p.currentAction}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Score</div>
          <div className={`text-lg font-bold ${p.totalScore >= p.requiredScore ? 'text-green-400' : 'text-red-400'}`}>
            {p.totalScore} / {p.requiredScore}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${p.totalScore >= p.requiredScore ? 'bg-green-500' : 'bg-orange-500'}`}
          style={{ width: `${Math.min(100, (p.totalScore / p.requiredScore) * 100)}%` }}
        />
      </div>

      {/* Barriers */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <BarrierDot label="Intraday" value={p.intradayBarrier} />
        <BarrierDot label="Tick"     value={p.tickBarrier} />
        <BarrierDot label="Fee"      value={p.feeBarrier} />
        <BarrierDot label="Spread"   value={p.spreadBarrier} />
        <BarrierDot label="Volatility" value={p.volatilityBarrier} />
        {p.duplicateOpenTradeBlocked && <span className="text-xs text-orange-400">⊘ Duplicate</span>}
        {p.maxOpenTradesBlocked      && <span className="text-xs text-red-400">⊘ Max Trades</span>}
      </div>

      {/* Blocking reason */}
      {p.mainBlockingReason && p.mainBlockingReason !== 'NONE' && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 text-xs text-red-300">
          <span className="font-semibold">Blocked:</span> {p.mainBlockingReason}
        </div>
      )}

      {/* Fix suggestion */}
      {p.recommendedConstantChange && p.recommendedConstantChange !== 'No change needed' && (
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg px-3 py-2 text-xs text-yellow-300">
          <span className="font-semibold">Fix:</span> {p.recommendedConstantChange}
        </div>
      )}

      {/* Expand for market data */}
      <button onClick={() => setOpen(o => !o)} className="text-xs text-slate-400 hover:text-slate-300 underline">
        {open ? 'Hide' : 'Show'} market data
      </button>
      {open && p.marketData && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400 font-mono pt-1">
          <span>Spread: {p.marketData.spreadPct}%</span>
          <span>RSI: {p.marketData.rsi}</span>
          <span>Vol24h: ${(p.marketData.vol24hUSDT / 1e6).toFixed(1)}M</span>
          <span>Volatility: {p.marketData.volatilityPct}%</span>
          <span>Ask: {p.marketData.askPx}</span>
          <span>Bid: {p.marketData.bidPx}</span>
        </div>
      )}
    </div>
  );
}

export default function Phase4OpportunityDiagnosticPanel() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const runDiag = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('phase4OpportunityDiagnostic', {});
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const gs = data?.globalSummary;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">Trade Opportunity Diagnostic</h3>
          <p className="text-slate-400 text-xs mt-0.5">Why are paper trades not opening? Run to find out.</p>
        </div>
        <Button
          size="sm"
          onClick={runDiag}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
        >
          {loading ? 'Analysing…' : '🔍 Run Diagnostic'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-lg p-3 text-xs text-red-300">{error}</div>
      )}

      {/* Global summary */}
      {gs && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Open Trades',       value: gs.openTrades },
            { label: 'Closed (24h)',       value: gs.closedTrades24h },
            { label: 'Signals Now',        value: gs.paperSignalsFound24h },
            { label: 'Opened (24h)',       value: gs.tradesOpened24h },
          ].map(item => (
            <div key={item.label} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{item.value}</div>
              <div className="text-xs text-slate-400 mt-1">{item.label}</div>
            </div>
          ))}
          <div className="col-span-2 md:col-span-4 flex flex-wrap gap-3 items-center">
            <span className="text-xs text-slate-400">Top Blocker:</span>
            <span className="text-xs font-mono text-orange-300 bg-orange-900/20 border border-orange-700/30 px-2 py-1 rounded">
              {gs.mostCommonBlockingReason}
            </span>
            {gs.isStrategyTooStrict && (
              <span className="text-xs font-semibold text-red-300 bg-red-900/20 border border-red-700/30 px-2 py-1 rounded">
                ⚠ Strategy may be too strict
              </span>
            )}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {data?.suggestions?.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 space-y-1">
          <p className="text-blue-300 text-xs font-semibold mb-2">💡 Suggestions</p>
          {data.suggestions.map((s, i) => (
            <p key={i} className="text-xs text-blue-200">• {s}</p>
          ))}
        </div>
      )}

      {/* Per-pair cards */}
      {data?.pairs && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.pairs.map(p => <PairCard key={p.pair} p={p} />)}
        </div>
      )}

      {/* Safety badge */}
      <div className="flex gap-2 flex-wrap pt-1">
        {[
          'tradeAllowed: false',
          'realTradeAllowed: false',
          'killSwitchActive: true',
          'noOKXOrderEndpoint: true',
        ].map(label => (
          <span key={label} className="text-xs font-mono bg-green-900/20 border border-green-700/30 text-green-400 px-2 py-0.5 rounded">
            ✓ {label}
          </span>
        ))}
      </div>

      {data?.diagnosedAt && (
        <p className="text-xs text-slate-500">Diagnosed at {new Date(data.diagnosedAt).toLocaleString()}</p>
      )}
    </div>
  );
}