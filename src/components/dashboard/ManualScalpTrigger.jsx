import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

export default function ManualScalpTrigger() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunScalpNow = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await base44.functions.invoke('robot1Scalp', {});
      setResult(response.data);
    } catch (err) {
      setError(err.message || 'Failed to run scalp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Manual Scalp Trigger
        </h3>
      </div>

      <Button
        onClick={handleRunScalpNow}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 mb-4"
      >
        {loading ? (
          <>
            <div className="animate-spin">
              <Zap className="w-5 h-5" />
            </div>
            Running...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            RUN SCALP NOW
          </>
        )}
      </Button>

      {result && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
          <div className="text-sm font-semibold text-green-400 mb-3">✓ Execution Result</div>

          {/* Buy Result */}
          {result.buy && (
            <div className="bg-slate-700/30 rounded p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-2">BUY Decision</div>
              <div className={`text-sm font-bold ${result.buy.decision?.includes('EXECUTED') ? 'text-green-400' : 'text-gray-400'}`}>
                {result.buy.decision}
              </div>
              {result.buy.pair && (
                <div className="text-xs text-slate-300 mt-2">
                  Pair: <span className="font-mono text-blue-400">{result.buy.pair}</span>
                </div>
              )}
              {result.buy.usedUSDT && (
                <div className="text-xs text-slate-300">
                  Amount: <span className="font-mono text-green-400">{result.buy.usedUSDT} USDT</span>
                </div>
              )}
            </div>
          )}

          {/* Sell Results */}
          {result.sells && result.sells.length > 0 && (
            <div className="bg-slate-700/30 rounded p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-2">SELL Decisions ({result.sells.length})</div>
              <div className="space-y-2">
                {result.sells.map((sell, i) => (
                  <div key={i} className="text-xs text-slate-300">
                    <span className="font-mono text-red-400">{sell.pair}</span>
                    {sell.exitMode && <span className="text-slate-500"> • {sell.exitMode}</span>}
                    {sell.netPnL !== undefined && <span className="text-slate-500"> • PnL: {sell.netPnL.toFixed(4)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position Status */}
          {result.activePositions && (
            <div className="bg-slate-700/30 rounded p-3 border border-slate-600">
              <div className="text-xs text-slate-400 mb-2">Active Positions ({result.positionCount})</div>
              {result.activePositions.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No active positions</div>
              ) : (
                <div className="space-y-1">
                  {result.activePositions.map((pos, i) => (
                    <div key={i} className="text-xs text-slate-300">
                      <span className="font-mono text-yellow-400">{pos.instId}</span>
                      <span className="text-slate-500"> • {pos.pnlPct.toFixed(4)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Balance Info */}
          {result.freeUsdt !== undefined && (
            <div className="bg-slate-700/30 rounded p-3 border border-slate-600">
              <div className="text-xs text-slate-400">Free USDT: <span className="font-mono text-green-400">{result.freeUsdt.toFixed(2)}</span></div>
              <div className="text-xs text-slate-400">Free Capital: <span className="font-mono text-blue-400">{result.freeCapitalPercent?.toFixed(1)}%</span></div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/50">
          <div className="text-sm font-semibold text-red-400 mb-2">✗ Error</div>
          <div className="text-xs text-red-300">{error}</div>
        </div>
      )}
    </div>
  );
}