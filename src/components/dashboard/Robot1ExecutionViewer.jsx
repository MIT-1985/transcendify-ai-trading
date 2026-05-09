import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, CheckCircle2, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function Robot1ExecutionViewer() {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLatestLog = async () => {
    setLoading(true);
    try {
      const logs = await base44.entities.Robot1ExecutionLog.list('-execution_time', 1);
      if (logs.length > 0) {
        setLog(logs[0]);
      }
    } catch (e) {
      console.error('Failed to fetch execution log:', e);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke('robot1Execute', {});
      // Wait a moment for the log to be written
      await new Promise(r => setTimeout(r, 500));
      await fetchLatestLog();
    } catch (e) {
      console.error('Failed to execute robot1:', e);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    fetchLatestLog();
    const interval = setInterval(fetchLatestLog, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading && !log) {
    return <div className="text-center py-8 text-slate-400">Loading...</div>;
  }

  if (!log) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-center">
        <p className="text-slate-400 mb-4">No execution logs yet</p>
        <Button onClick={handleRefresh} disabled={refreshing} className="bg-blue-600 hover:bg-blue-500">
          {refreshing ? 'Executing...' : 'Run Robot 1 Now'}
        </Button>
      </div>
    );
  }

  const decisionIcons = {
    'BUY': <Zap className="w-5 h-5 text-emerald-400" />,
    'SELL': <Zap className="w-5 h-5 text-red-400" />,
    'WAIT': <Clock className="w-5 h-5 text-yellow-400" />,
    'ERROR': <AlertCircle className="w-5 h-5 text-red-500" />
  };

  const decisionColors = {
    'BUY': 'bg-emerald-900/30 border-emerald-700',
    'SELL': 'bg-red-900/30 border-red-700',
    'WAIT': 'bg-yellow-900/30 border-yellow-700',
    'ERROR': 'bg-red-900/40 border-red-600'
  };

  const execTime = new Date(log.execution_time);
  const now = new Date();
  const diffMs = now - execTime;
  const diffSecs = Math.floor(diffMs / 1000);
  const timeAgo = diffSecs < 60 ? `${diffSecs}s ago` : diffSecs < 3600 ? `${Math.floor(diffSecs / 60)}m ago` : `${Math.floor(diffSecs / 3600)}h ago`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold">Robot 1 Execution Log</h2>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          size="sm"
          className="gap-2"
          variant="outline"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          {refreshing ? 'Running...' : 'Run Now'}
        </Button>
      </div>

      {/* Main Decision Card */}
      <div className={cn(
        "border rounded-xl p-6 transition-all",
        decisionColors[log.decision] || decisionColors['WAIT']
      )}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {decisionIcons[log.decision]}
            <div>
              <h3 className="text-lg font-bold">{log.decision}</h3>
              <p className="text-xs text-slate-400 mt-1">{timeAgo}</p>
            </div>
          </div>
          <div className="text-right text-sm text-slate-400">
            {execTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>

        {/* Reason */}
        <div className="bg-black/20 rounded-lg p-3 mb-4">
          <p className="text-sm text-slate-100 font-medium">{log.reason}</p>
        </div>

        {/* Grid of Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Free USDT */}
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Free USDT</div>
            <div className="text-lg font-bold text-yellow-400">${log.free_usdt?.toFixed(2) || '0.00'}</div>
          </div>

          {/* OKX Status */}
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">OKX Status</div>
            <Badge className={log.okx_status === 'OK' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}>
              {log.okx_status}
            </Badge>
          </div>

          {/* Polygon Status */}
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Polygon Status</div>
            <Badge className={log.polygon_status === 'OK' ? 'bg-emerald-900 text-emerald-300' : 'bg-yellow-900 text-yellow-300'}>
              {log.polygon_status}
            </Badge>
          </div>

          {/* Active Position */}
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Position Active</div>
            <Badge className={log.active_position ? 'bg-blue-900 text-blue-300' : 'bg-slate-700 text-slate-300'}>
              {log.active_position ? 'YES' : 'NO'}
            </Badge>
          </div>
        </div>

        {/* Position Details (if active) */}
        {log.active_position && log.position_symbol && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold mb-2">Active Position</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm">
                <span className="text-slate-400">Symbol: </span>
                <span className="font-bold text-white">{log.position_symbol}</span>
              </div>
              <div className="text-sm">
                <span className="text-slate-400">Quantity: </span>
                <span className="font-bold text-white">{log.position_qty?.toFixed(6) || '0'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Order ID (if exists) */}
        {log.last_order_id && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold mb-2">Order ID</h4>
            <div className="bg-slate-950 rounded p-2 font-mono text-xs text-slate-300 break-all">
              {log.last_order_id}
            </div>
          </div>
        )}

        {/* Error Message (if error) */}
        {log.error_message && (
          <div className="mt-4 pt-4 border-t border-red-700">
            <h4 className="text-sm font-semibold text-red-400 mb-2">Error Details</h4>
            <div className="bg-red-950/50 rounded p-2 text-xs text-red-200">
              {log.error_message}
            </div>
          </div>
        )}

        {/* Signal Data */}
        {log.signal_data && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold mb-2">Signal Data</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-black/30 rounded p-2">
                <span className="text-slate-400">Trend: </span>
                <span className="font-bold">{log.signal_data.trend || 'N/A'}</span>
              </div>
              <div className="bg-black/30 rounded p-2">
                <span className="text-slate-400">Momentum: </span>
                <span className="font-bold">{log.signal_data.momentum || 0}</span>
              </div>
              <div className="bg-black/30 rounded p-2">
                <span className="text-slate-400">Volume: </span>
                <span className="font-bold">{log.signal_data.volume || 0}</span>
              </div>
              <div className="bg-black/30 rounded p-2">
                <span className="text-slate-400">Volatility: </span>
                <span className="font-bold">{log.signal_data.volatility || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}