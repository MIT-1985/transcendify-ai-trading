import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';

export default function SchedulerStatus() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['robot1ExecutionLogs'],
    queryFn: async () => {
      const result = await base44.asServiceRole.entities.Robot1ExecutionLog.filter({});
      return result.sort((a, b) => new Date(b.execution_time) - new Date(a.execution_time));
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700 animate-pulse">
        <div className="h-32 bg-slate-700/50 rounded"></div>
      </div>
    );
  }

  const now = new Date();
  const today = now.toDateString();
  const todayLogs = logs?.filter(l => new Date(l.execution_time).toDateString() === today) || [];
  const lastLog = logs?.[0] || null;

  // Parse last run
  const lastRunTime = lastLog?.execution_time ? new Date(lastLog.execution_time) : null;
  const lastRunMinutesAgo = lastRunTime ? Math.floor((now.getTime() - lastRunTime.getTime()) / 60000) : null;

  // Count stats
  const buyCount = todayLogs.filter(l => l.decision === 'BUY').length;
  const sellCount = todayLogs.filter(l => l.decision === 'SELL').length;
  const waitCount = todayLogs.filter(l => l.decision === 'WAIT').length;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-cyan-400" />
        Scheduler: robot1Scalp
      </h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Last Run */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Last Run</div>
          <div className="text-sm font-mono text-white">
            {lastRunTime ? lastRunTime.toLocaleTimeString() : 'Never'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {lastRunMinutesAgo !== null && lastRunMinutesAgo >= 0
              ? lastRunMinutesAgo === 0
                ? 'Just now'
                : `${lastRunMinutesAgo} min ago`
              : '—'}
          </div>
        </div>

        {/* Run Count Today */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">Runs Today</div>
          <div className="text-lg font-bold text-blue-400">{todayLogs.length}</div>
          <div className="text-xs text-slate-500 mt-1">automation cycles</div>
        </div>

        {/* Buy Count */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">BUYs Today</div>
          <div className="text-lg font-bold text-emerald-400">{buyCount}</div>
          <div className="text-xs text-slate-500 mt-1">entries</div>
        </div>

        {/* Sell Count */}
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-400 mb-1">SELLs Today</div>
          <div className="text-lg font-bold text-red-400">{sellCount}</div>
          <div className="text-xs text-slate-500 mt-1">exits</div>
        </div>
      </div>

      {/* Configuration Reference */}
      <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/50 text-xs text-slate-400">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="text-slate-500">Automation Type:</span> Scheduled
          </div>
          <div>
            <span className="text-slate-500">Function:</span> robot1Scalp
          </div>
          <div>
            <span className="text-slate-500">Interval:</span> 15 minutes
          </div>
        </div>
      </div>
    </div>
  );
}