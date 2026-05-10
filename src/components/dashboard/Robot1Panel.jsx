import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, Play, RefreshCw, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const DecisionBadge = ({ decision }) => {
  if (!decision) return <span className="text-slate-500">—</span>;
  const map = {
    BUY: 'text-emerald-400 bg-emerald-900/30 border-emerald-700',
    SELL: 'text-red-400 bg-red-900/30 border-red-700',
    WAIT: 'text-slate-400 bg-slate-800/50 border-slate-600',
    HOLD: 'text-blue-400 bg-blue-900/30 border-blue-700',
    ERROR: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  };
  const cls = map[decision] || 'text-slate-400 bg-slate-800 border-slate-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${cls}`}>
      {decision}
    </span>
  );
};

const StatusDot = ({ status }) => {
  const colors = { OK: 'bg-emerald-400', UNAVAILABLE: 'bg-yellow-400', FAILED: 'bg-red-400', NO_SIGNAL: 'bg-slate-500' };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors[status] || 'bg-slate-500'}`} />;
};

export default function Robot1Panel({ onRunResult } = {}) {
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['robot1-exec-logs'],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.Robot1ExecutionLog.list('-execution_time', 1);
      return all;
    },
    staleTime: 15000,
    refetchInterval: 30000
  });

  const latest = logs[0] || null;

  const handleRunNow = async () => {
    setRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const res = await base44.functions.invoke('robot1Execute', {});
      setRunResult(res.data);
      if (onRunResult) onRunResult(res.data);
      refetch();
    } catch (err) {
      setRunError(err.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-blue-700/50 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-600/40 flex items-center justify-center">
            <Zap className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">Robot 1 — BTC/ETH/SOL/DOGE/XRP</div>
            <div className="text-xs text-slate-500">Scheduler: active · every 15 min</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={handleRunNow}
            disabled={running}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 px-3 gap-1.5"
          >
            <Play className="w-3 h-3" />
            {running ? 'Running...' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* Run result banner */}
      {runResult && (
        <div className={`rounded-lg px-3 py-2 border text-xs ${
          runResult.buy?.decision?.includes('BUY_EXECUTED') ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' :
          runResult.sells?.length > 0 ? 'bg-red-900/30 border-red-700 text-red-300' :
          'bg-slate-800/50 border-slate-600 text-slate-300'
        }`}>
          {runResult.buy ? (
            <span className="font-bold">{runResult.buy.decision}</span>
          ) : (
            <span className="font-bold">WAIT</span>
          )}
          {runResult.positionCount !== undefined && (
            <span className="ml-2 opacity-75">· Positions: {runResult.positionCount}/{runResult.maxPositions} · USDT: ${runResult.freeUsdt?.toFixed(2)}</span>
          )}
        </div>
      )}
      {runError && (
        <div className="rounded-lg px-3 py-2 border bg-red-900/30 border-red-700 text-red-300 text-xs">
          Error: {runError}
        </div>
      )}

      {/* Latest Log */}
      {isLoading ? (
        <Skeleton className="h-40 bg-slate-800" />
      ) : !latest ? (
        <div className="text-slate-500 text-xs text-center py-6">No execution logs yet. Click "Run Now" to start.</div>
      ) : (
        <div className="space-y-3">
          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Last Run</div>
              <div className="text-xs font-mono text-blue-300">{new Date(latest.execution_time).toLocaleString()}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Decision</div>
              <DecisionBadge decision={latest.decision} />
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Free USDT</div>
              <div className="text-sm font-bold text-white">${parseFloat(latest.free_usdt || 0).toFixed(2)}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
              <div className="text-xs text-slate-500 mb-1">Active Position</div>
              {latest.active_position ? (
                <div>
                  <div className="text-xs font-bold text-cyan-400">{latest.position_symbol}</div>
                  <div className="text-xs text-slate-400">{latest.position_qty?.toFixed(4)} qty</div>
                </div>
              ) : (
                <div className="text-xs text-slate-500">None</div>
              )}
            </div>
          </div>

          {/* Reason */}
          <div className="bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700">
            <div className="text-xs text-slate-500 mb-1">Reason</div>
            <div className="text-xs text-white">{latest.reason || '—'}</div>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 text-slate-400">
              <StatusDot status={latest.okx_status} />
              OKX: <span className="text-white ml-0.5">{latest.okx_status || 'OK'}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <StatusDot status={latest.polygon_status} />
              Polygon: <span className="text-white ml-0.5">{latest.polygon_status || '—'}</span>
            </div>
            {latest.last_order_id && (
              <div className="flex items-center gap-1 text-slate-400">
                Last OrdId: <span className="font-mono text-cyan-400 ml-0.5">…{latest.last_order_id.slice(-8)}</span>
              </div>
            )}
          </div>

          {/* Error message if any */}
          {latest.error_message && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
              {latest.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}