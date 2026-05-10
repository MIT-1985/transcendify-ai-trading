import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, ShieldCheck, RefreshCw, Layers, TrendingUp, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CapitalReservePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('robot1Scalp', {});
      const d = res.data || {};
      setData(d.capitalReserve || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const cr = data;
  const isRecovery = cr?.capitalRecoveryMode;
  const effScore = cr?.capitalEfficiencyScore ?? 0;

  return (
    <div className={`bg-slate-900/50 border rounded-xl p-5 space-y-4 ${isRecovery ? 'border-orange-600/60' : 'border-emerald-700/40'}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecovery
            ? <ShieldAlert className="w-4 h-4 text-orange-400" />
            : <ShieldCheck className="w-4 h-4 text-emerald-400" />
          }
          <h2 className="font-bold text-sm">Capital Reserve Manager</h2>
          {isRecovery && (
            <span className="text-xs px-2 py-0.5 bg-orange-900/50 border border-orange-600 text-orange-300 rounded-full font-bold">
              RECOVERY MODE
            </span>
          )}
        </div>
        <Button
          size="sm" variant="ghost"
          onClick={refresh}
          disabled={loading}
          className="text-slate-400 hover:text-white h-7 px-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {!cr ? (
        <div className="text-xs text-slate-500 text-center py-4">
          {loading ? 'Loading…' : 'No data — click refresh'}
        </div>
      ) : (
        <>
          {/* Capital bars */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Capital Allocation</span>
              <span className="font-mono">${cr.totalCapital} total</span>
            </div>
            {/* Free bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-400 font-bold">Free</span>
                <span className="font-mono text-emerald-400">{cr.freeCapitalPct}% · ${cr.freeCapital}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${cr.freeCapitalPct < 30 ? 'bg-red-500' : cr.freeCapitalPct < 50 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(cr.freeCapitalPct, 100)}%` }}
                />
              </div>
            </div>
            {/* Locked bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-orange-400 font-bold">Locked</span>
                <span className="font-mono text-orange-400">{cr.lockedCapitalPct}% · ${cr.lockedCapital}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-orange-500/70 transition-all"
                  style={{ width: `${Math.min(cr.lockedCapitalPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />Efficiency
              </div>
              <div className={`font-mono font-bold text-lg ${effScore >= 80 ? 'text-emerald-400' : effScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {effScore}
              </div>
              <div className="text-slate-600 text-xs">/100</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3" />Trade Slots
              </div>
              <div className="font-mono font-bold text-lg text-blue-400">
                {cr.availableTradeSlots}
              </div>
              <div className="text-slate-600 text-xs">open</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1 flex items-center gap-1">
                <Lock className="w-3 h-3" />Recovery
              </div>
              <div className={`font-bold ${isRecovery ? 'text-orange-400' : 'text-emerald-400'}`}>
                {isRecovery ? 'ACTIVE' : 'OFF'}
              </div>
              <div className="text-slate-600 text-xs">&lt;30% free</div>
            </div>
          </div>

          {/* Per-pair locked capital */}
          {cr.capitalLockedByPair && Object.keys(cr.capitalLockedByPair).length > 0 && (
            <div className="text-xs space-y-1">
              <div className="text-slate-500 font-bold uppercase tracking-wider">Locked by Pair</div>
              {Object.entries(cr.capitalLockedByPair).map(([pair, val]) => (
                <div key={pair} className="flex justify-between bg-slate-800/40 rounded px-2.5 py-1.5 border border-slate-700/50">
                  <span className="font-bold text-white">{pair}</span>
                  <span className="font-mono text-orange-400">${val.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recovery mode info */}
          {isRecovery && (
            <div className="bg-orange-900/20 border border-orange-600/50 rounded-lg px-3 py-2.5 text-xs text-orange-300 space-y-1">
              <div className="font-bold">⚠️ Capital Recovery Mode Active</div>
              <div>Free capital {cr.freeCapitalPct}% is below 30% threshold. New positions are blocked. Robot is prioritizing BREAK_EVEN_EXIT and fast TP exits to release locked capital.</div>
              <div className="text-slate-400">Normal trading resumes when free capital &gt; 50%</div>
            </div>
          )}

          {/* Reserve thresholds legend */}
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Recovery &lt;30%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />Caution 30–50%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Healthy &gt;50%</span>
          </div>
        </>
      )}
    </div>
  );
}