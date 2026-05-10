import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

export default function BlockerDiagnosticsDetailed() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('robot1Diagnostics', {});
      setResult(res.data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <h2 className="font-bold text-sm">Exact OKX Ticker Analysis</h2>
        </div>
        <Button
          onClick={runDiagnostics}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500"
          size="sm"
        >
          {loading ? 'Running...' : 'Run Full Diagnostics'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm mb-4">
          Error: {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Config & Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-slate-500 mb-1">Trade Amount</div>
              <div className="font-bold text-white">${result.config.DEFAULT_TRADE_USDT}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-slate-500 mb-1">Take Profit Target</div>
              <div className="font-bold text-white">{result.config.TAKE_PROFIT_PCT}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-slate-500 mb-1">Max Allowed Spread</div>
              <div className="font-bold text-white">{result.config.MAX_SPREAD_PCT}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-slate-500 mb-1">Min Net Required</div>
              <div className="font-bold text-white">${result.config.MIN_NET_PROFIT_USDT}</div>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-slate-400">Pairs Analyzed: </span>
                <span className="font-bold text-white">{result.summary.totalPairs}</span>
              </div>
              <div>
                <span className="text-emerald-400 font-bold">{result.summary.tradeAllowed} ALLOWED</span>
                <span className="text-slate-500 mx-2">|</span>
                <span className="text-red-400 font-bold">{result.summary.tradeBlocked} BLOCKED</span>
              </div>
            </div>
          </div>

          {/* Per-pair detailed breakdown */}
          <div className="space-y-3">
            {result.diagnostics.map((diag) => (
              <div key={diag.pair} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                {/* Header with status */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="font-bold text-lg text-blue-400">{diag.pair}</div>
                  {diag.tradeAllowed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <div
                    className={`text-xs font-semibold ml-auto px-2 py-1 rounded ${
                      diag.tradeAllowed
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {diag.tradeAllowed ? 'TRADE OK' : 'BLOCKED'}
                  </div>
                </div>

                {/* Grid of all metrics */}
                <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                  {/* Row 1: Bid/Ask/Mid/Last */}
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Bid</div>
                    <div className="font-mono text-cyan-400">${diag.bid?.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Ask</div>
                    <div className="font-mono text-cyan-400">${diag.ask?.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Mid</div>
                    <div className="font-mono text-slate-300">${diag.mid?.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Last 24h</div>
                    <div className="font-mono text-slate-300">${diag.last?.toFixed(2)}</div>
                  </div>
                </div>

                {/* Row 2: Spread */}
                <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                  <div className={`rounded p-2 ${diag.spreadRejectsHardFilter ? 'bg-red-900/30 border border-red-700' : 'bg-slate-700/50'}`}>
                    <div className="text-slate-500 text-xs mb-0.5">Bid/Ask Spread %</div>
                    <div className={`font-mono font-bold ${diag.spreadRejectsHardFilter ? 'text-red-400' : 'text-yellow-400'}`}>
                      {diag.spreadPct?.toFixed(6)}%
                    </div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Max Allowed</div>
                    <div className="font-mono text-cyan-400">{diag.maxAllowedSpreadPct}%</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Fee Round-Trip</div>
                    <div className="font-mono text-red-400">{diag.feeRoundTripPercent?.toFixed(4)}%</div>
                  </div>
                  <div className={`rounded p-2 ${diag.spreadRejectsHardFilter ? 'bg-red-900/30 border border-red-700' : 'bg-slate-700/50'}`}>
                    <div className="text-slate-500 text-xs mb-0.5">Effective (Spread+Fees)</div>
                    <div className={`font-mono font-bold ${diag.spreadRejectsHardFilter ? 'text-red-400' : 'text-orange-400'}`}>
                      {diag.effectiveSpreadAfterFees?.toFixed(4)}%
                    </div>
                  </div>
                </div>

                {/* Row 3: Profit Analysis */}
                <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Est. Fees ($25)</div>
                    <div className="font-mono text-red-400">${diag.estimatedRoundTripFees?.toFixed(6)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Gross @ TP (0.35%)</div>
                    <div className="font-mono text-slate-300">${diag.estimatedNetProfitAtTP?.toFixed(6)}</div>
                  </div>
                  <div className={`rounded p-2 ${diag.profitRejectsViability ? 'bg-red-900/30 border border-red-700' : 'bg-slate-700/50'}`}>
                    <div className="text-slate-500 text-xs mb-0.5">True Net Profit</div>
                    <div className={`font-mono font-bold ${diag.profitRejectsViability ? 'text-red-400' : 'text-emerald-400'}`}>
                      ${diag.trueExpectedNetProfit?.toFixed(8)}
                    </div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Min Required</div>
                    <div className="font-mono text-yellow-400">${diag.minNetRequired}</div>
                  </div>
                </div>

                {/* Row 4: Quality Score */}
                <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                  <div className={`rounded p-2 ${diag.scoreRejects ? 'bg-red-900/30 border border-red-700' : 'bg-slate-700/50'}`}>
                    <div className="text-slate-500 text-xs mb-0.5">Quality Score</div>
                    <div className={`font-mono font-bold text-lg ${diag.scoreRejects ? 'text-red-400' : 'text-blue-400'}`}>
                      {diag.score?.toFixed(1)}
                    </div>
                  </div>
                  <div className="bg-slate-700/50 rounded p-2">
                    <div className="text-slate-500 text-xs mb-0.5">Min Required</div>
                    <div className="font-mono text-yellow-400">{diag.minScoreRequired}</div>
                  </div>
                  <div colSpan={2} className="col-span-2" />
                </div>

                {/* Rejection reason */}
                <div className="text-xs mt-2 pt-2 border-t border-slate-700">
                  <div className={`inline-block px-2 py-1 rounded ${
                    diag.tradeAllowed
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}>
                    {diag.rejectionReason}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Timestamp */}
          <div className="text-xs text-slate-500 text-center pt-4">
            Diagnostics run at {new Date(result.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}