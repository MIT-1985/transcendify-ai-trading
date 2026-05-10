import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Zap, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

export default function ManualScalpTriggerV2() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runScalp = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('robot1Scalp', {});
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2 className="font-bold text-sm">Manual Scalp Trigger</h2>
        </div>
        <Button
          onClick={runScalp}
          disabled={loading}
          className="bg-yellow-600 hover:bg-yellow-500 text-white gap-2"
          size="sm"
        >
          {loading ? 'Running...' : 'RUN SCALP NOW'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-xs mb-4">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Config Summary */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mb-4">
            <div className="text-xs font-semibold text-slate-300 mb-2">SMALL BALANCE MODE CONFIG</div>
            <div className="grid grid-cols-5 gap-2 text-xs">
              <div>TP: {(result.config.TAKE_PROFIT_PCT * 100).toFixed(2)}%</div>
              <div>SL: {(result.config.STOP_LOSS_PCT * 100).toFixed(2)}%</div>
              <div>minNet: ${result.config.MIN_NET_PROFIT_USDT}</div>
              <div>maxTrade: ${result.config.MAX_TRADE_USDT}</div>
              <div>score≥{Math.round(result.config.TAKE_PROFIT_PCT * 100)}</div>
            </div>
          </div>

          {/* Decision Summary */}
          {result.buy && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-sm">EXECUTION RESULT</h3>
                {result.buy.decision === 'BUY_EXECUTED' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {result.buy.decision === 'BUY_FAILED' && <XCircle className="w-5 h-5 text-red-400" />}
                {result.buy.decision.startsWith('WAIT') && <AlertCircle className="w-5 h-5 text-yellow-400" />}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-700/50 rounded p-2">
                  <div className="text-slate-400">Decision</div>
                  <div className="font-bold text-white">{result.buy.decision}</div>
                </div>
                {result.buy.decision === 'BUY_EXECUTED' && (
                  <>
                    <div className="bg-slate-700/50 rounded p-2">
                      <div className="text-slate-400">Pair</div>
                      <div className="font-bold text-blue-400">{result.buy.pair}</div>
                    </div>
                    <div className="bg-slate-700/50 rounded p-2">
                      <div className="text-slate-400">Amount</div>
                      <div className="font-bold text-white">${result.buy.usedUSDT.toFixed(2)}</div>
                    </div>
                    <div className="bg-slate-700/50 rounded p-2">
                      <div className="text-slate-400">Qty</div>
                      <div className="font-mono text-white">{result.buy.qty.toFixed(6)}</div>
                    </div>
                    <div className="bg-slate-700/50 rounded p-2">
                      <div className="text-slate-400">Entry Price</div>
                      <div className="font-mono text-white">${result.buy.avgPx.toFixed(2)}</div>
                    </div>
                    <div className="bg-emerald-900/30 border border-emerald-700 rounded p-2">
                      <div className="text-slate-400">Expected Net @ TP</div>
                      <div className="font-bold text-emerald-400">${result.buy.sizing?.expectedNetProfitAtTP?.toFixed(6)}</div>
                    </div>
                    <div className="bg-slate-700/50 rounded p-2">
                      <div className="text-slate-400">Order ID</div>
                      <div className="font-mono text-cyan-400 text-xs">…{result.buy.ordId?.slice(-8)}</div>
                    </div>
                  </>
                )}
                {result.buy.reason && (
                  <div className="col-span-2 bg-orange-900/30 border border-orange-700 rounded p-2">
                    <div className="text-slate-400 text-xs">Reason</div>
                    <div className="font-mono text-orange-300 text-xs">{result.buy.reason}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sell results */}
          {result.sells && result.sells.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="font-bold text-sm mb-2 text-red-400">SELL EXECUTIONS ({result.sells.length})</h3>
              <div className="space-y-2">
                {result.sells.map((sell, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 text-xs bg-slate-700/50 p-2 rounded">
                    <div>
                      <div className="text-slate-400">Pair</div>
                      <div className="font-bold text-blue-400">{sell.pair}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Exit Mode</div>
                      <div className="font-bold text-red-400">{sell.exitMode}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">PnL %</div>
                      <div className={`font-mono ${sell.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {sell.pnlPercent >= 0 ? '+' : ''}{sell.pnlPercent.toFixed(4)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Net P&L</div>
                      <div className={`font-mono ${sell.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${sell.netPnL.toFixed(6)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Order ID</div>
                      <div className="font-mono text-cyan-400 text-xs">…{sell.sellOrdId?.slice(-8)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position Diagnostics */}
          {result.positionDiagnostics && result.positionDiagnostics.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="font-bold text-sm mb-2">POSITION ANALYSIS</h3>
              <div className="space-y-2">
                {result.positionDiagnostics.map((pos, i) => (
                  <div key={i} className="grid grid-cols-6 gap-2 text-xs bg-slate-700/50 p-2 rounded">
                    <div>
                      <div className="text-slate-400">Pair</div>
                      <div className="font-bold text-blue-400">{pos.pair}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Entry</div>
                      <div className="font-mono">${pos.entryPx?.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Current</div>
                      <div className="font-mono">${pos.currentPx?.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">PnL %</div>
                      <div className={`font-mono ${pos.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent?.toFixed(4)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Net</div>
                      <div className={`font-mono ${pos.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${pos.netPnL?.toFixed(6)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Exit Mode</div>
                      <div className="font-bold text-orange-400">{pos.exitMode}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capital Status */}
          {result.capitalReserve && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-xs">
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <div className="text-slate-400">Free USDT</div>
                  <div className="font-bold">${result.freeUsdt?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Free %</div>
                  <div className="font-bold">{result.freeCapitalPercent?.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-slate-400">Open Positions</div>
                  <div className="font-bold">{result.positionCount}/{result.maxPositions}</div>
                </div>
                <div>
                  <div className="text-slate-400">Balance Mode</div>
                  <div className="font-bold text-yellow-400">{result.balanceMode}</div>
                </div>
                <div>
                  <div className="text-slate-400">Recovery Mode</div>
                  <div className={`font-bold ${result.capitalReserve.capitalRecoveryMode ? 'text-orange-400' : 'text-emerald-400'}`}>
                    {result.capitalReserve.capitalRecoveryMode ? 'ON' : 'OFF'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
            Last run: {new Date().toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}