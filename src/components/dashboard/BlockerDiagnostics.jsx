import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function BlockerDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunDiag = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await base44.functions.invoke('robot1Scalp', {});
      setResult(response.data);
    } catch (err) {
      setError(err.message || 'Failed to run diagnostics');
    } finally {
      setLoading(false);
    }
  };

  if (!result && !loading) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Blocker Diagnostics
          </h3>
          <Button
            onClick={handleRunDiag}
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-500 text-white font-semibold px-4 py-2 rounded-lg"
          >
            {loading ? 'Running...' : 'Run Diagnosis'}
          </Button>
        </div>
        <p className="text-sm text-slate-400 italic">Click "Run Diagnosis" to analyze current spread & profit blockers</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 rounded-xl p-6 border border-red-700/50 mb-6">
        <div className="text-sm font-semibold text-red-400 mb-2">✗ Diagnosis Failed</div>
        <div className="text-xs text-red-300">{error}</div>
      </div>
    );
  }

  if (!result) return null;

  // Extract the primary blocker
  const buy = result.buy;
  const positionCount = result.positionCount || 0;
  const maxPositions = result.maxPositions || 2;

  let primaryBlocker = null;
  let blockerDetails = null;

  if (positionCount >= maxPositions) {
    primaryBlocker = 'Max Positions Reached';
    blockerDetails = `Already holding ${positionCount}/${maxPositions} positions`;
  } else if (result.capitalReserve?.capitalRecoveryMode) {
    primaryBlocker = 'Capital Recovery Mode';
    blockerDetails = `Free capital at ${result.capitalReserve.freeCapitalPct}% < threshold`;
  } else if (result.freeUsdt < 12) {
    primaryBlocker = 'Insufficient Free USDT';
    blockerDetails = `Only $${result.freeUsdt?.toFixed(2)} available (min $12)`;
  } else if (buy?.decision?.includes('WAIT')) {
    primaryBlocker = 'No Qualified Setup';
    blockerDetails = buy.reason || 'All pairs failed scoring/spread/profit checks';
  } else {
    primaryBlocker = 'Unknown';
    blockerDetails = buy?.reason || 'Check diagnostic logs';
  }

  // If we have candidates, show the top rejection reason
  const firstCandidateRejection = result.buy?.reason;

  return (
    <div className="bg-gradient-to-br from-orange-900/20 to-red-900/20 rounded-xl p-6 border border-orange-700/50 mb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-orange-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Primary Blocker
        </h3>
        <Button
          onClick={handleRunDiag}
          disabled={loading}
          size="sm"
          className="bg-orange-700 hover:bg-orange-600 text-white text-xs px-3"
        >
          {loading ? 'Running...' : 'Re-run'}
        </Button>
      </div>

      {/* Main Blocker Card */}
      <div className="bg-slate-900/60 rounded-lg p-4 border border-orange-600/40">
        <div className="text-xl font-bold text-orange-400 mb-2">{primaryBlocker}</div>
        <div className="text-sm text-slate-300">{blockerDetails}</div>
      </div>

      {/* Spread & Profit Analysis (if trying to buy) */}
      {result.sizingPreview && (
        <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
          <div className="text-sm font-semibold text-slate-300 mb-3">Pair Viability Check (Top 3)</div>
          <div className="space-y-2">
            {Object.entries(result.sizingPreview)
              .slice(0, 3)
              .map(([pair, sizing]) => {
                const isViable = sizing.viable;
                const reason = !isViable ? (sizing.tpBelowFees ? 'TP < Fees' : 'Profit < Min') : 'OK';

                return (
                  <div key={pair} className="grid grid-cols-6 gap-2 text-xs bg-slate-800/50 p-2 rounded border border-slate-700/50">
                    <div>
                      <div className="text-slate-500 mb-0.5">Pair</div>
                      <div className="font-bold text-blue-400">{pair}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">OKX Spread</div>
                      <div className="font-mono text-yellow-400">
                        {(sizing.breakEvenMovePct || 0).toFixed(4)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Max Allowed</div>
                      <div className="font-mono text-cyan-400">
                        {(result.config?.MAX_SPREAD_PCT || 0.08).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Est. Fees</div>
                      <div className="font-mono text-red-400">
                        ${(sizing.estimatedFees || 0).toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Net @ TP (0.35%)</div>
                      <div className={`font-mono ${(sizing.netProfitAtTP || 0) >= 0.005 ? 'text-emerald-400' : 'text-orange-400'}`}>
                        ${(sizing.netProfitAtTP || 0).toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 mb-0.5">Status</div>
                      <div className={`font-bold text-center ${isViable ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isViable ? '✓' : '✗'}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="text-xs text-slate-400 mt-3 p-2 bg-slate-800/30 rounded border border-slate-700/40 space-y-1">
            <div><strong>Small Balance Mode Config:</strong></div>
            <div className="grid grid-cols-3 gap-2 text-slate-500">
              <div>TP = 0.35%</div>
              <div>SL = -0.20%</div>
              <div>minNet = $0.005</div>
              <div>maxTrade = $25</div>
              <div>quality ≥ 25</div>
              <div>maxPos = 1</div>
            </div>
          </div>
        </div>
      )}

      {/* Last Execution Summary */}
      {result.buy && (
        <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50 text-xs">
          <div className="text-slate-300 mb-2">
            <span className="text-slate-500">Decision:</span>{' '}
            <span className={`font-bold ${buy.decision?.includes('EXECUTED') ? 'text-emerald-400' : 'text-gray-400'}`}>
              {buy.decision}
            </span>
          </div>
          {buy.pair && (
            <div className="text-slate-300 mb-2">
              <span className="text-slate-500">Selected Pair:</span>{' '}
              <span className="font-mono text-blue-400 font-bold">{buy.pair}</span>
            </div>
          )}
          {buy.reason && (
            <div className="text-slate-300">
              <span className="text-slate-500">Reason:</span>{' '}
              <span className="text-slate-400 text-xs">{buy.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}