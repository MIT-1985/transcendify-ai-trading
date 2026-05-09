import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Clock, Activity, AlertTriangle, Zap } from 'lucide-react';
import { format } from 'date-fns';

export default function AutomationHealthPanel() {
  const [automation, setAutomation] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get automation details
        const automations = await base44.asServiceRole.entities.Automations?.list?.() || [];
        const robot1Auto = automations.find(a => a.name?.includes('Robot 1'));
        setAutomation(robot1Auto);

        // Get last execution log
        const logs = await base44.entities.Robot1ExecutionLog.list('-execution_time', 1);
        if (logs.length > 0) {
          setLastLog(logs[0]);
        }
      } catch (err) {
        console.error('Error fetching automation data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const getReasonIcon = (decision, reason) => {
    if (decision === 'ERROR') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (decision === 'BUY') return <Activity className="w-4 h-4 text-emerald-400" />;
    if (decision === 'SELL') return <Activity className="w-4 h-4 text-amber-400" />;
    return <Clock className="w-4 h-4 text-blue-400" />;
  };

  const getDecisionColor = (decision) => {
    switch (decision) {
      case 'BUY': return 'text-emerald-400 bg-emerald-900/20';
      case 'SELL': return 'text-amber-400 bg-amber-900/20';
      case 'ERROR': return 'text-red-400 bg-red-900/20';
      default: return 'text-blue-400 bg-blue-900/20';
    }
  };

  if (loading) {
    return (
      <Card className="border-slate-700 bg-slate-900/50">
        <CardContent className="p-6">
          <div className="text-slate-400">Loading automation data...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-amber-400" />
        <h2 className="text-xl font-semibold">Robot 1 Automation Health</h2>
        {automation?.is_active && (
          <span className="flex items-center gap-1 text-xs text-emerald-400 ml-auto">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Scheduler Active
          </span>
        )}
      </div>

      {/* Main Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Last Run */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Last Run</CardTitle>
          </CardHeader>
          <CardContent>
            {lastLog ? (
              <div className="space-y-1">
                <div className="text-sm font-mono text-white">
                  {format(new Date(lastLog.execution_time), 'HH:mm:ss')}
                </div>
                <div className="text-xs text-slate-500">
                  {format(new Date(lastLog.execution_time), 'MMM d')}
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm">No runs yet</div>
            )}
          </CardContent>
        </Card>

        {/* Decision */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Last Decision</CardTitle>
          </CardHeader>
          <CardContent>
            {lastLog ? (
              <div className={`px-3 py-1 rounded inline-block text-sm font-bold ${getDecisionColor(lastLog.decision)}`}>
                {lastLog.decision}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">Pending...</div>
            )}
          </CardContent>
        </Card>

        {/* Active Position */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Position Open</CardTitle>
          </CardHeader>
          <CardContent>
            {lastLog ? (
              <div className="space-y-1">
                <div className={`text-sm font-bold ${lastLog.active_position ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {lastLog.active_position ? 'YES' : 'NO'}
                </div>
                {lastLog.active_position && lastLog.position_symbol && (
                  <div className="text-xs text-slate-400 font-mono">{lastLog.position_symbol} {lastLog.position_qty}</div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">—</div>
            )}
          </CardContent>
        </Card>

        {/* Free USDT */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400">Free USDT</CardTitle>
          </CardHeader>
          <CardContent>
            {lastLog ? (
              <div className="text-lg font-bold text-blue-400">
                ${lastLog.free_usdt?.toFixed(2) || '0.00'}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reason & Diagnostics */}
      {lastLog && (
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {getReasonIcon(lastLog.decision, lastLog.reason)}
              Execution Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Reason */}
            <div>
              <div className="text-xs text-slate-400 mb-1">Reason</div>
              <div className="text-sm text-slate-200 bg-slate-800/50 p-3 rounded border border-slate-700">
                {lastLog.reason || 'No details available'}
              </div>
            </div>

            {/* OKX Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-400 mb-1">OKX Verification</div>
                <div className={`flex items-center gap-2 text-sm ${lastLog.okx_status === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {lastLog.okx_status === 'OK' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {lastLog.okx_status || 'UNKNOWN'}
                </div>
              </div>

              {/* Polygon Status */}
              <div>
                <div className="text-xs text-slate-400 mb-1">Polygon Signal</div>
                <div className={`flex items-center gap-2 text-sm ${lastLog.polygon_status === 'OK' ? 'text-emerald-400' : lastLog.polygon_status === 'NO_SIGNAL' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {lastLog.polygon_status === 'OK' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  {lastLog.polygon_status || 'UNKNOWN'}
                </div>
              </div>
            </div>

            {/* Order ID */}
            {lastLog.last_order_id && (
              <div>
                <div className="text-xs text-slate-400 mb-1">Order ID</div>
                <div className="text-xs font-mono text-blue-400">{lastLog.last_order_id}</div>
              </div>
            )}

            {/* Error Message */}
            {lastLog.error_message && (
              <div className="bg-red-900/20 border border-red-700 rounded p-3">
                <div className="text-xs text-red-400 font-semibold mb-1">Error</div>
                <div className="text-xs text-red-300">{lastLog.error_message}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Scheduler Info */}
      {automation && (
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-sm">Scheduler Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-400">Status:</span>
                <span className={`ml-2 font-semibold ${automation.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {automation.is_active ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Interval:</span>
                <span className="ml-2 font-mono text-blue-400">
                  Every {automation.repeat_interval} {automation.repeat_unit}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Next Run (est):</span>
                <span className="ml-2 text-blue-400">
                  ~{new Date(Date.now() + automation.repeat_interval * 60000).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}