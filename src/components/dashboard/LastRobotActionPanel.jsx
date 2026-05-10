import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';

export default function LastRobotActionPanel() {
  const { data: lastExecution, isLoading } = useQuery({
    queryKey: ['lastRobotExecution'],
    queryFn: async () => {
      const logs = await base44.asServiceRole.entities.Robot1ExecutionLog.filter({});
      return logs.sort((a, b) => new Date(b.execution_time) - new Date(a.execution_time))[0] || null;
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700 h-48 flex items-center justify-center">
        <div className="animate-spin">
          <Zap className="w-5 h-5 text-slate-400" />
        </div>
      </div>
    );
  }

  if (!lastExecution) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Last Robot Action
        </h3>
        <div className="text-sm text-slate-400 italic">No execution log yet</div>
      </div>
    );
  }

  const decisionColor = {
    BUY: 'text-green-400',
    SELL: 'text-red-400',
    WAIT: 'text-gray-400',
    ERROR: 'text-red-600',
  }[lastExecution.decision] || 'text-gray-400';

  const statusColor = {
    OK: 'text-green-400',
    FAILED: 'text-red-500',
    NOT_VERIFIED: 'text-yellow-400',
  }[lastExecution.okx_status] || 'text-gray-400';

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5" />
        Last Robot Action
      </h3>

      <div className="space-y-3">
        {/* Timestamp */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Execution Time</div>
          <div className="text-sm font-mono text-white">
            {new Date(lastExecution.execution_time).toLocaleString()}
          </div>
        </div>

        {/* Decision */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Decision</div>
          <div className={`text-lg font-bold ${decisionColor}`}>
            {lastExecution.decision}
          </div>
        </div>

        {/* Reason */}
        {lastExecution.reason ? (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Reason</div>
            <div className="text-xs text-slate-300 break-words">
              {lastExecution.reason.substring(0, 150)}
              {lastExecution.reason.length > 150 ? '...' : ''}
            </div>
          </div>
        ) : null}

        {/* Selected Pair */}
        {lastExecution.selectedPair ? (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Pair</div>
            <div className="text-lg font-bold text-blue-400">{lastExecution.selectedPair}</div>
          </div>
        ) : null}

        {/* Score */}
        {lastExecution.score !== null && lastExecution.score !== undefined ? (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Score</div>
            <div className="text-sm font-mono font-bold text-cyan-400">{parseFloat(lastExecution.score).toFixed(2)}</div>
          </div>
        ) : null}

        {/* Trade Allowed */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Trade Allowed</div>
          <div className={`text-sm font-bold ${lastExecution.tradeAllowed ? 'text-emerald-400' : 'text-red-400'}`}>
            {lastExecution.tradeAllowed ? '✓ YES' : '✗ NO'}
          </div>
        </div>

        {/* Rejection Reason */}
        {lastExecution.rejectionReason ? (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Rejection Reason</div>
            <div className="text-xs text-slate-300 break-words">
              {lastExecution.rejectionReason.substring(0, 150)}
              {lastExecution.rejectionReason.length > 150 ? '...' : ''}
            </div>
          </div>
        ) : null}

        {/* OKX Status */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">OKX Status</div>
          <div className={`text-sm font-bold ${statusColor}`}>
            {lastExecution.okx_status || 'UNKNOWN'}
          </div>
        </div>

        {/* Polygon Status */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Polygon Status</div>
          <div className="text-sm font-bold text-purple-400">
            {lastExecution.polygon_status || 'UNKNOWN'}
          </div>
        </div>
      </div>
    </div>
  );
}