import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Zap, RefreshCw, Clock, DollarSign, ShieldCheck, ShieldX, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SCHEDULER_INTERVAL_MIN = 5;

export default function Robot1ModePanel() {
  const [mode, setMode] = useState('SCALP');
  const [saving, setSaving] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [scalpStatus, setScalpStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const logs = await base44.entities.Robot1ExecutionLog.list('-execution_time', 50);
      const configRecord = logs.filter(l => l.decision === 'CONFIG').sort((a, b) =>
        new Date(b.execution_time) - new Date(a.execution_time)
      )[0];
      if (configRecord?.signal_data?.robot1_mode) {
        setMode(configRecord.signal_data.robot1_mode);
      }
      const lastRec = logs.filter(l => l.decision !== 'CONFIG')[0];
      setLastRun(lastRec || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchScalpStatus = async () => {
    try {
      const res = await base44.functions.invoke('robot1Scalp', {});
      const d = res.data || {};
      const pos = d.positionDiagnostics?.[0] || null;
      const sizing = d.sizingPreview ? Object.values(d.sizingPreview)[0] : null;
      const computedSizing = computeLocalSizing(d.freeUsdt, sizing);

      setScalpStatus({
        freeUsdt: d.freeUsdt,
        positionCount: d.positionCount,
        exitMode: pos?.exitMode,
        pnlPercent: pos?.pnlPercent,
        netPnL: pos?.netPnL,
        activePair: pos?.pair,
        minTradeAmountForProfit: sizing?.minTradeAmountForProfit,
        expectedNetProfitAtTP: sizing?.netProfitAtTP,
        tpBelowFees: sizing?.tpBelowFees,
        tradeAllowed: computedSizing.tradeAllowed,
        tradeBlockReason: computedSizing.reason,
      });
    } catch (e) {
      console.error(e);
    }
  };

  function computeLocalSizing(freeUsdt, sizing) {
    if (!sizing || !freeUsdt) return { tradeAllowed: false, reason: 'No data' };
    if (sizing.tpBelowFees) return { tradeAllowed: false, reason: 'TP below round-trip fees' };
    if (!sizing.minTradeAmountForProfit) return { tradeAllowed: false, reason: 'Cannot compute min trade size' };
    if (freeUsdt < sizing.minTradeAmountForProfit) {
      return { tradeAllowed: false, reason: `freeUSDT $${freeUsdt?.toFixed(2)} < minTrade $${sizing.minTradeAmountForProfit?.toFixed(2)}` };
    }
    if (sizing.netProfitAtTP < 0.02) {
      return { tradeAllowed: false, reason: `netProfitAtTP ${sizing.netProfitAtTP?.toFixed(4)} USDT < 0.02 minimum` };
    }
    return { tradeAllowed: true, reason: 'Fee-aware sizing OK' };
  }

  const saveMode = async (newMode) => {
    setSaving(true);
    try {
      await base44.entities.Robot1ExecutionLog.create({
        execution_time: new Date().toISOString(),
        decision: 'CONFIG',
        reason: `Mode set to ${newMode}`,
        signal_data: { robot1_mode: newMode }
      });
      setMode(newMode);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    refresh();
    fetchScalpStatus();
  }, []);

  const nextRunMs = lastRun
    ? Math.max(0, new Date(lastRun.execution_time).getTime() + SCHEDULER_INTERVAL_MIN * 60 * 1000 - Date.now())
    : null;
  const nextRunMin = nextRunMs !== null ? Math.ceil(nextRunMs / 60000) : null;
  const activeFn = mode === 'SCALP' ? 'robot1Scalp' : 'robot1Execute';

  return (
    <div className="bg-slate-900/50 border border-blue-700/40 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-blue-400" />
          <h2 className="font-bold text-sm">Robot 1 — Mode & Scheduler</h2>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { refresh(); fetchScalpStatus(); }}
          className="text-slate-400 hover:text-white h-7 px-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex gap-2">
        {['SCALP', 'SWING'].map(m => (
          <button
            key={m}
            disabled={saving}
            onClick={() => saveMode(m)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${
              mode === m
                ? m === 'SCALP'
                  ? 'bg-purple-700/60 border-purple-500 text-white'
                  : 'bg-blue-700/60 border-blue-500 text-white'
                : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
            }`}
          >
            {m === 'SCALP' ? '⚡ SCALP' : '📈 SWING'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
          <div className="text-slate-500 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" />Active Function</div>
          <div className="font-mono font-bold text-blue-400">{activeFn}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
          <div className="text-slate-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />Next Run</div>
          <div className="font-bold text-white">
            {nextRunMin !== null ? `~${nextRunMin}m` : 'Every 5 min'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
          <div className="text-slate-500 mb-1">Last Run</div>
          <div className="font-mono text-slate-300 truncate">
            {lastRun ? new Date(lastRun.execution_time).toLocaleTimeString() : '—'}
          </div>
        </div>
      </div>

      {scalpStatus && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Status</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" />Free USDT</div>
              <div className="font-mono font-bold text-white">${scalpStatus.freeUsdt?.toFixed(2)}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1">Min Trade for Profit</div>
              <div className={`font-mono font-bold ${scalpStatus.minTradeAmountForProfit ? 'text-cyan-400' : 'text-slate-500'}`}>
                {scalpStatus.minTradeAmountForProfit != null ? `$${scalpStatus.minTradeAmountForProfit?.toFixed(2)}` : 'N/A'}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1">Expected Net @ TP</div>
              <div className={`font-mono font-bold ${(scalpStatus.expectedNetProfitAtTP ?? 0) >= 0.02 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {scalpStatus.expectedNetProfitAtTP != null ? `${scalpStatus.expectedNetProfitAtTP?.toFixed(4)} USDT` : '—'}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
              <div className="text-slate-500 mb-1">TP below fees?</div>
              <div className={`font-bold ${scalpStatus.tpBelowFees ? 'text-red-400' : 'text-emerald-400'}`}>
                {scalpStatus.tpBelowFees ? '✗ YES — trading off' : '✓ NO — TP clear'}
              </div>
            </div>
          </div>

          {scalpStatus.activePair && (
            <div className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700 text-xs space-y-1">
              <div className="font-bold text-white">Active: {scalpStatus.activePair}</div>
              <div className="flex gap-4">
                <span>P&L: <span className={`font-mono font-bold ${(scalpStatus.pnlPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(scalpStatus.pnlPercent ?? 0) >= 0 ? '+' : ''}{scalpStatus.pnlPercent?.toFixed(4)}%</span></span>
                <span>Net: <span className={`font-mono font-bold ${(scalpStatus.netPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(scalpStatus.netPnL ?? 0) >= 0 ? '+' : ''}{scalpStatus.netPnL?.toFixed(4)} U</span></span>
                <span>Exit: <span className="text-yellow-400 font-bold">{scalpStatus.exitMode}</span></span>
              </div>
            </div>
          )}

          <div className={`rounded-lg px-3 py-2.5 border text-xs flex items-center gap-2 ${
            scalpStatus.tradeAllowed
              ? 'bg-emerald-900/30 border-emerald-600 text-emerald-300'
              : 'bg-red-900/30 border-red-600 text-red-300'
          }`}>
            {scalpStatus.tradeAllowed
              ? <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              : <ShieldX className="w-4 h-4 flex-shrink-0" />
            }
            <span>
              <span className="font-bold">{scalpStatus.tradeAllowed ? 'Trade ALLOWED' : 'Trade BLOCKED'}</span>
              {' — '}{scalpStatus.tradeBlockReason || (scalpStatus.tradeAllowed ? 'Fee-aware sizing OK' : '')}
            </span>
          </div>
        </div>
      )}
      {loading && !scalpStatus && (
        <div className="text-xs text-slate-500 text-center py-2">Loading live status…</div>
      )}
    </div>
  );
}