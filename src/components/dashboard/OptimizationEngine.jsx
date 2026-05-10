import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Zap, TrendingUp, Clock, AlertCircle, BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function OptimizationEngine() {
  const [constants, setConstants] = useState(null);
  const [kpiHistory, setKpiHistory] = useState([]);
  const [scannerData, setScannerData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch current constants
  const { data: constantsList } = useQuery({
    queryKey: ['optimizing-constants'],
    queryFn: async () => {
      const all = await base44.entities.OptimizingConstants.list();
      return all.filter(c => c.botId === 'robot1').sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );
    },
    staleTime: 60000
  });

  // Fetch KPI logs
  const { data: kpiLogs } = useQuery({
    queryKey: ['robot-kpi-logs'],
    queryFn: async () => {
      const all = await base44.entities.RobotKPILog.list();
      return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);
    },
    staleTime: 30000
  });

  useEffect(() => {
    if (constantsList?.length > 0) {
      setConstants(constantsList[0]);
    }
    if (kpiLogs?.length > 0) {
      setKpiHistory(kpiLogs);
    }
  }, [constantsList, kpiLogs]);

  const refreshScanner = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('robot1Scanner', {});
      setScannerData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshScanner();
    const interval = setInterval(refreshScanner, 5000);
    return () => clearInterval(interval);
  }, []);

  const avgKpi = kpiHistory.length > 0 
    ? (kpiHistory.reduce((s, l) => s + (l.kpi || 0), 0) / kpiHistory.length).toFixed(3)
    : 'N/A';

  const winRate = kpiHistory.length > 0
    ? `${Math.round(kpiHistory.filter(l => l.win).length / kpiHistory.length * 100)}%`
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Current Constants */}
      <section className="bg-slate-900/50 border border-purple-700/40 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <h2 className="font-bold text-sm">Current Adaptive Constants</h2>
            <span className="text-xs text-slate-500">Robot1 · Epoch {constants?.epoch || 1}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshScanner}
            disabled={loading}
            className="text-slate-400 hover:text-white h-7 px-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {!constants ? <Skeleton className="h-32 bg-slate-800" /> : (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'K_TP', value: constants.K_TP?.toFixed(2), suffix: '%', color: 'text-emerald-400' },
              { label: 'K_SL', value: constants.K_SL?.toFixed(2), suffix: '%', color: 'text-red-400' },
              { label: 'K_SPREAD', value: constants.K_SPREAD?.toFixed(3), suffix: '%', color: 'text-cyan-400' },
              { label: 'K_HOLD', value: constants.K_HOLD?.toFixed(1), suffix: 'm', color: 'text-white' },
              { label: 'K_SIZE', value: constants.K_SIZE?.toFixed(2), suffix: 'x', color: 'text-purple-400' },
              { label: 'K_QUALITY', value: constants.K_QUALITY?.toFixed(0), suffix: '/100', color: 'text-yellow-400' },
              { label: 'K_RESERVE', value: (constants.K_RESERVE * 100).toFixed(0), suffix: '%', color: 'text-orange-400' },
              { label: 'K_COOLDOWN', value: constants.K_COOLDOWN?.toFixed(0), suffix: 's', color: 'text-blue-400' },
            ].map(({ label, value, suffix, color }) => (
              <div key={label} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className={`text-lg font-bold font-mono ${color}`}>
                  {value}{suffix}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* KPI Performance Metrics */}
      <section className="bg-slate-900/50 border border-emerald-700/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h2 className="font-bold text-sm">KPI Performance (Last {kpiHistory.length} trades)</h2>
        </div>

        {kpiHistory.length === 0 ? (
          <div className="text-slate-500 text-xs py-4 text-center">No KPI data yet. Run robot1Scalp to generate feedback.</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Avg KPI</div>
                <div className="text-xl font-bold text-purple-400">{avgKpi}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Win Rate</div>
                <div className="text-xl font-bold text-emerald-400">{winRate}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Total P&L</div>
                <div className="text-xl font-bold text-cyan-400">
                  ${kpiHistory.reduce((s, l) => s + (l.realizedPnL || 0), 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Dead Positions</div>
                <div className="text-xl font-bold text-orange-400">
                  {kpiHistory.filter(l => l.exitMode === 'DEAD_POSITION').length}
                </div>
              </div>
            </div>

            {/* KPI Trend */}
            <div className="text-xs bg-slate-800/30 rounded-lg p-3 border border-slate-700">
              <div className="font-bold text-slate-300 mb-2">KPI Trend (Recent 10)</div>
              <div className="flex gap-1 items-end h-12">
                {kpiHistory.slice(0, 10).reverse().map((l, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-gradient-to-t from-purple-500 to-purple-600"
                    style={{ height: `${Math.max(5, (l.kpi || 0) * 100)}%` }}
                    title={`KPI: ${l.kpi?.toFixed(3)}`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Live Scanner Stream */}
      <section className="bg-slate-900/50 border border-cyan-700/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <h2 className="font-bold text-sm">LIVE_SCALP_SIGNAL_STREAM</h2>
          <span className="text-xs text-slate-500 ml-1">Scan: {scannerData?.scanFrequency || '—'} · Exec: {scannerData?.executionFrequency || '—'}</span>
        </div>

        {!scannerData ? <Skeleton className="h-32 bg-slate-800" /> : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Signals Detected</div>
                <div className="text-xl font-bold">{scannerData.signalsDetected}/5</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Qualified Setups</div>
                <div className="text-xl font-bold text-emerald-400">{scannerData.qualifiedCount}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Rejected</div>
                <div className="text-xl font-bold text-red-400">{scannerData.rejectedCount}</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500">Exec Ready</div>
                <div className="text-xl font-bold text-purple-400">
                  {scannerData.qualifiedSetups?.length || 0}
                </div>
              </div>
            </div>

            {/* Rejection reasons */}
            {scannerData.rejectionReasons && (
              <div className="text-xs bg-orange-900/20 border border-orange-700/40 rounded-lg px-3 py-2 mb-4 text-orange-300">
                <div className="font-bold mb-1">Rejection Breakdown</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span>Low Quality: {scannerData.rejectionReasons.lowQuality}</span>
                  <span>High Spread: {scannerData.rejectionReasons.highSpread}</span>
                  <span>Low Profit: {scannerData.rejectionReasons.lowProfitExpected}</span>
                </div>
              </div>
            )}

            {/* Signal stream table */}
            {scannerData.liveSignalStream && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 border-b border-slate-700">
                    <tr>
                      <th className="text-left px-2 py-2">Pair</th>
                      <th className="text-right px-2 py-2">Momentum %</th>
                      <th className="text-right px-2 py-2">Spread %</th>
                      <th className="text-right px-2 py-2">Score</th>
                      <th className="text-right px-2 py-2">Expected Net</th>
                      <th className="text-center px-2 py-2">Ready</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannerData.liveSignalStream.map((s, i) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-2 py-2 font-bold">{s.pair}</td>
                        <td className={`px-2 py-2 text-right font-mono ${s.momentum > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {s.momentum}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-cyan-400">{s.spread}</td>
                        <td className="px-2 py-2 text-right font-mono text-yellow-400">{s.score}</td>
                        <td className="px-2 py-2 text-right font-mono text-purple-400">{s.expectedNet}</td>
                        <td className="px-2 py-2 text-center">
                          {s.ready ? '✓' : '✗'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Recent KPI Changes */}
      <section className="bg-slate-900/50 border border-yellow-700/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-yellow-400" />
          <h2 className="font-bold text-sm">Recent Constant Adjustments (Last 5 Trades)</h2>
        </div>

        {kpiHistory.slice(0, 5).length === 0 ? (
          <div className="text-slate-500 text-xs py-4 text-center">No adjustments yet.</div>
        ) : (
          <div className="space-y-2">
            {kpiHistory.slice(0, 5).map((log, i) => (
              <div key={i} className="bg-slate-800/30 rounded-lg p-3 border border-slate-700 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{log.pair}</span>
                  <span className={`font-mono ${log.win ? 'text-emerald-400' : 'text-red-400'}`}>
                    {log.win ? '✓ WIN' : '✗ LOSS'} · KPI {log.kpi?.toFixed(3)}
                  </span>
                </div>
                <div className="text-slate-400 mb-1">
                  {log.exitMode} · PnL ${log.realizedPnL?.toFixed(4)} · {new Date(log.timestamp).toLocaleTimeString()}
                </div>
                {log.constantsChanged && Object.keys(log.constantsChanged).length > 0 && (
                  <div className="text-yellow-400 text-xs">
                    Adjustments: {Object.keys(log.constantsChanged).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}