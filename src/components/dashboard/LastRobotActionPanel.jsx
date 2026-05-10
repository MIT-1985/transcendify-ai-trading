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
              {lastExecution.reason.substring(0, 120)}
              {lastExecution.reason.length > 120 ? '...' : ''}
            </div>
          </div>
        ) : null}

        {/* Selected Pair */}
        {lastExecution.position_symbol ? (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Selected Pair</div>
            <div className="text-lg font-bold text-blue-400">{lastExecution.position_symbol}</div>
          </div>
        ) : null}

        {/* Last Order ID */}
        {lastExecution.last_order_id ? (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
            <div className="text-xs text-slate-400 mb-1">Last Order ID</div>
            <div className="text-xs font-mono text-slate-300 break-all">
              {lastExecution.last_order_id}
            </div>
          </div>
        ) : null}

        {/* OKX Status */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">OKX Status</div>
          <div className={`text-sm font-bold ${statusColor}`}>
            {lastExecution.okx_status}
          </div>
        </div>

        {/* Error Message */}
        {lastExecution.error_message ? (
          <div className="bg-red-900/20 rounded-lg p-3 border border-red-700/30">
            <div className="text-xs text-red-400 mb-1">Error</div>
            <div className="text-xs text-red-300 break-words">
              {lastExecution.error_message}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}