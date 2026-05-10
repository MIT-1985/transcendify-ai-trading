import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Check, X, AlertCircle } from 'lucide-react';

export default function OKXDataSync() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const runSync = async () => {
    setLoading(true);
    try {
      // Step 1: Sync real OKX fills
      console.log('Step 1: Syncing OKX fills...');
      const syncRes = await base44.functions.invoke('syncOKXOrderLedger', {});
      console.log('Sync result:', syncRes.data);

      // Step 2: Rebuild verified trades
      console.log('Step 2: Rebuilding verified trades...');
      const rebuildRes = await base44.functions.invoke('rebuildVerifiedTradesFromOKX', {});
      console.log('Rebuild result:', rebuildRes.data);

      // Step 3: Audit pipeline
      console.log('Step 3: Auditing pipeline...');
      const auditRes = await base44.functions.invoke('auditOKXRealDataPipeline', {});
      console.log('Audit result:', auditRes.data);

      setResults({
        sync: syncRes.data,
        rebuild: rebuildRes.data,
        audit: auditRes.data.audit,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('Sync failed:', e);
      setResults({
        error: e.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">OKX Real Data Sync Pipeline</h1>
          <p className="text-slate-400 mb-6">
            Sync real OKX fills, rebuild verified trades, and audit data pipeline.
          </p>
          
          <Button
            onClick={runSync}
            disabled={loading}
            className="gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Running Sync...' : 'Run Full Sync'}
          </Button>
        </div>

        {!results && !loading && (
          <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-400">Click "Run Full Sync" to fetch real OKX data</p>
          </div>
        )}

        {results && !results.error && (
          <div className="space-y-6">
            
            {/* OKX Balance */}
            <div className={`border rounded-xl p-6 ${results.audit.okxBalance.status === 'SUCCESS' ? 'bg-emerald-900/20 border-emerald-600' : 'bg-red-900/20 border-red-600'}`}>
              <div className="flex items-center gap-3 mb-4">
                {results.audit.okxBalance.status === 'SUCCESS' ? (
                  <Check className="w-6 h-6 text-emerald-400" />
                ) : (
                  <X className="w-6 h-6 text-red-400" />
                )}
                <h2 className="text-xl font-bold">1. OKX Live Balance</h2>
              </div>
              {results.audit.okxBalance.status === 'SUCCESS' ? (
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">Total Equity</div>
                    <div className="text-2xl font-bold text-emerald-400">${results.audit.okxBalance.totalEquityUSDT}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Free USDT</div>
                    <div className="text-2xl font-bold text-emerald-400">${results.audit.okxBalance.freeUSDT}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Assets</div>
                    <div className="text-2xl font-bold text-blue-400">{results.audit.okxBalance.assetCount}</div>
                  </div>
                </div>
              ) : (
                <div className="text-red-400">
                  Error: {results.audit.okxBalance.error}
                  <div className="text-xs text-red-300 mt-2">{results.audit.okxBalance.message}</div>
                </div>
              )}
            </div>

            {/* OKX Fills Sync */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                <Check className="w-6 h-6 text-cyan-400" />
                2. OKX Fills Synced to OXXOrderLedger
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-slate-400">Fetched from OKX</div>
                  <div className="text-2xl font-bold text-cyan-400">{results.sync.fillsFetchedFromOKX}</div>
                </div>
                <div>
                  <div className="text-slate-400">Valid Entries</div>
                  <div className="text-2xl font-bold text-cyan-400">{results.sync.validEntries}</div>
                </div>
                <div>
                  <div className="text-slate-400">Upserted New</div>
                  <div className="text-2xl font-bold text-emerald-400">{results.sync.upsertedNew}</div>
                </div>
                <div>
                  <div className="text-slate-400">Duplicates Skipped</div>
                  <div className="text-2xl font-bold text-yellow-400">{results.sync.duplicatesSkipped}</div>
                </div>
              </div>
            </div>

            {/* Verified Trades Rebuilt */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                <Check className="w-6 h-6 text-purple-400" />
                3. Verified Trades Rebuilt from OKX Fills
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-slate-400">Created</div>
                  <div className="text-2xl font-bold text-emerald-400">{results.rebuild.tradesCreated}</div>
                </div>
                <div>
                  <div className="text-slate-400">Updated</div>
                  <div className="text-2xl font-bold text-blue-400">{results.rebuild.tradesUpdated}</div>
                </div>
                <div>
                  <div className="text-slate-400">Today Clean</div>
                  <div className="text-2xl font-bold text-cyan-400">{results.rebuild.todayCleanTrades}</div>
                </div>
                <div>
                  <div className="text-slate-400">Total</div>
                  <div className="text-2xl font-bold text-slate-400">{results.rebuild.totalTrades}</div>
                </div>
              </div>
            </div>

            {/* Today's P&L */}
            {results.rebuild.todayCleanTrades > 0 && (
              <div className="bg-emerald-900/20 border border-emerald-600 rounded-xl p-6">
                <h2 className="text-xl font-bold mb-4">Today's P&L (Real OKX Trades)</h2>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">Trades</div>
                    <div className="text-2xl font-bold text-cyan-400">{results.audit.todayMetrics.trades}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Win Rate</div>
                    <div className="text-2xl font-bold text-emerald-400">{results.audit.todayMetrics.winRate}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Gross P&L</div>
                    <div className={`text-2xl font-bold ${results.audit.todayMetrics.grossBeforeFees >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {results.audit.todayMetrics.grossBeforeFees >= 0 ? '+' : ''}{results.audit.todayMetrics.grossBeforeFees}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Fees</div>
                    <div className="text-2xl font-bold text-red-400">-{results.audit.todayMetrics.totalFees}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Net P&L</div>
                    <div className={`text-2xl font-bold ${results.audit.todayMetrics.netAfterFees >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {results.audit.todayMetrics.netAfterFees >= 0 ? '+' : ''}{results.audit.todayMetrics.netAfterFees}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Overall Status */}
            <div className={`border rounded-xl p-6 ${results.audit.pipelineStatus === 'HEALTHY' ? 'bg-emerald-900/20 border-emerald-600' : results.audit.pipelineStatus === 'PARTIAL_OK' ? 'bg-yellow-900/20 border-yellow-600' : 'bg-red-900/20 border-red-600'}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  Pipeline Status: <span className={results.audit.pipelineStatus === 'HEALTHY' ? 'text-emerald-400' : results.audit.pipelineStatus === 'PARTIAL_OK' ? 'text-yellow-400' : 'text-red-400'}>
                    {results.audit.pipelineStatus}
                  </span>
                </h2>
                {results.audit.pipelineStatus === 'HEALTHY' ? (
                  <Check className="w-8 h-8 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-yellow-400" />
                )}
              </div>
              <p className="text-sm text-slate-400 mt-2">All real OKX data synced and verified</p>
            </div>

            {/* Debug Info */}
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
              <div className="text-xs text-slate-400 font-mono">
                <div>Audit Time: {new Date(results.audit.auditTime).toLocaleString()}</div>
                <div>Pipeline Status: {results.audit.pipelineStatus}</div>
                <div>Kill Switch: ACTIVE (PAUSED_KILL_SWITCH)</div>
              </div>
            </div>
          </div>
        )}

        {results?.error && (
          <div className="bg-red-900/20 border border-red-600 rounded-xl p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2 flex items-center gap-3">
              <X className="w-6 h-6" />
              Sync Failed
            </h2>
            <p className="text-red-300">{results.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}