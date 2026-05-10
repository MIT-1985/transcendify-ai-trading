import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';

export default function WhyNoTradePanel() {
  const { data: execution, isLoading } = useQuery({
    queryKey: ['noTradeReason'],
    queryFn: async () => {
      const logs = await base44.asServiceRole.entities.Robot1ExecutionLog.filter({});
      return logs.sort((a, b) => new Date(b.execution_time) - new Date(a.execution_time))[0] || null;
    },
    refetchInterval: 10000,
  });

  const { data: automationInfo } = useQuery({
    queryKey: ['automationInfo'],
    queryFn: async () => {
      const logs = await base44.asServiceRole.entities.Robot1ExecutionLog.filter({});
      const sorted = logs.sort((a, b) => new Date(b.execution_time) - new Date(a.execution_time));
      return {
        lastRun: sorted[0]?.execution_time || null,
        runCount: sorted.length,
        buys: sorted.filter(l => l.decision === 'BUY').length,
        sells: sorted.filter(l => l.decision === 'SELL').length,
      };
    },
    refetchInterval: 15000,
  });

  if (isLoading) return null;

  // If decision was BUY or SELL, nothing to show
  if (execution?.decision === 'BUY' || execution?.decision === 'SELL') {
    return null;
  }

  const reason = execution?.reason || 'No execution yet';
  
  // Map reasons to blocker categories
  const getBlockerCategory = (reason) => {
    if (reason.includes('no qualified') || reason.includes('no eligible')) return 'No Qualified Setup';
    if (reason.includes('score too low') || reason.includes('quality')) return 'Score Too Low';
    if (reason.includes('spread')) return 'Spread Too High';
    if (reason.includes('freeUSDT') || reason.includes('LOW_BALANCE')) return 'Free USDT Too Low';
    if (reason.includes('cooldown')) return 'Cooldown Active';
    if (reason.includes('position') || reason.includes('ACTIVE_POSITION')) return 'Active Position Exists';
    if (reason.includes('rejected') || reason.includes('FAILED')) return 'OKX Rejected';
    if (reason.includes('scheduler') || reason.includes('automation')) return 'Scheduler Not Running';
    if (reason.includes('CAPITAL_RECOVERY')) return 'Capital Recovery Mode';
    return reason;
  };

  const blocker = getBlockerCategory(reason);

  return (
    <div className="bg-gradient-to-br from-orange-900/20 to-red-900/20 rounded-xl p-6 border border-orange-700/50 mb-6">
      <div className="flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-orange-400 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-orange-300 mb-3">
            Why No Trade?
          </h3>
          
          <div className="bg-orange-900/30 rounded-lg p-4 border border-orange-700/40 mb-4">
            <div className="text-sm text-orange-200 font-medium mb-2">Active Blocker:</div>
            <div className="text-xl font-bold text-orange-300">
              {blocker}
            </div>
          </div>

          <div className="text-sm text-slate-300 space-y-2">
            <div>
              <span className="text-slate-400">Details:</span>
              <div className="text-xs text-slate-400 mt-1 italic">
                {reason}
              </div>
            </div>

            {automationInfo && (
              <div className="border-t border-orange-700/40 pt-3 mt-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Last Execution:</span>
                    <div className="font-mono text-orange-300">
                      {automationInfo.lastRun ? new Date(automationInfo.lastRun).toLocaleTimeString() : 'Never'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Runs Today:</span>
                    <div className="font-mono text-orange-300">{automationInfo.runCount}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">BUYs Today:</span>
                    <div className="font-mono text-green-400">{automationInfo.buys}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">SELLs Today:</span>
                    <div className="font-mono text-red-400">{automationInfo.sells}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}