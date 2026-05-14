import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PaperReport24h from '@/components/dashboard/PaperReport24h';
import Phase4OpportunityDiagnosticPanel from '@/components/dashboard/Phase4OpportunityDiagnosticPanel';
import Phase4BeforeAfterPanel from '@/components/dashboard/Phase4BeforeAfterPanel';
import Phase4CExpiryDiagnosticPanel from '@/components/dashboard/Phase4CExpiryDiagnosticPanel';
import Phase4DApplyCorrectionPanel from '@/components/dashboard/Phase4DApplyCorrectionPanel';
import Phase4EPositionSizeDiagnosticPanel from '@/components/dashboard/Phase4EPositionSizeDiagnosticPanel';

export default function PaperTradingDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState(null);
  const [manualRunning, setManualRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // Latest cycle data (loaded on mount, updated by manual run)
  const { data, isLoading, error } = useQuery({
    queryKey: ['phase4-paper-trading', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase4OKXPaperTrading', {});
      return res.data;
    },
    enabled: !!user,
    staleTime: Infinity,
    refetchInterval: false,
    gcTime: 0,
  });

  // Live open positions from entity
  const { data: openTrades = [], refetch: refetchOpen } = useQuery({
    queryKey: ['paper-open-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.filter({ status: 'OPEN' }, '-created_date', 50),
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 15000,
  });

  // Recent closed trades
  const { data: recentClosed = [], refetch: refetchClosed } = useQuery({
    queryKey: ['paper-closed-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.list('-closedAt', 50),
    enabled: !!user,
    staleTime: 30000,
  });

  // Manual "Run Paper Scan Now" — calls function, then refreshes all data
  const handleManualRun = async () => {
    setManualRunning(true);
    setLastResult(null);
    try {
      const res = await base44.functions.invoke('phase4OKXPaperTrading', {});
      const d = res.data;
      setLastResult({
        openedThisRun: d?.openedThisRun ?? 0,
        closedThisRun: d?.closedThisRun ?? 0,
        skippedPairs: (d?.thisRun?.scanResults || []).filter(r => r.action !== 'PAPER_BUY'),
        openedDetails: d?.thisRun?.newPaperEntries || [],
        closedDetails: d?.thisRun?.closedThisRun || [],
        runTime: d?.lastRunAt,
      });
      setLastRun(new Date().toLocaleTimeString('de-DE'));
      // Update main data cache + refresh entity queries
      queryClient.setQueryData(['phase4-paper-trading', user?.email], d);
      await Promise.all([refetchOpen(), refetchClosed()]);
      queryClient.invalidateQueries({ queryKey: ['paper-report-24h'] });
    } finally {
      setManualRunning(false);
    }
  };

  const r24  = data?.report24h || {};
  const run  = data?.thisRun   || {};
  const audit = data?.safetyAudit || {};
  const pnlColor = (r24.totalNetPnL || 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              OKX_ONLY_INTRADAY_TRADING_ENGINE
            </div>
            <h1 className="text-2xl font-black text-white">Phase 4 — Paper Trading Simulator</h1>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className="text-red-400 font-bold">Kill Switch: ACTIVE</span>
              <span className="text-slate-500">·</span>
              <span className="text-red-400 font-bold">tradeAllowed: false</span>
              <span className="text-slate-500">·</span>
              <span className="text-yellow-400 font-bold">PAPER_ONLY — No real orders</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400 font-bold">🕐 Auto-scan: every 5 min</span>
              <span className="text-slate-500">·</span>
              <span className="text-blue-400 font-bold">Max 5 open trades</span>
              {lastRun && <><span className="text-slate-500">·</span><span className="text-slate-400">Last manual run: {lastRun}</span></>}
            </div>
          </div>
          <button
            onClick={handleManualRun}
            disabled={manualRunning || isLoading}
            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-yellow-700/30 border border-yellow-600 hover:bg-yellow-700/50 text-yellow-300 disabled:opacity-50 transition-all shrink-0"
          >
            {manualRunning ? '⏳ Scanning…' : '▶ Run Paper Scan Now'}
          </button>
        </div>

        {/* Manual Run Result Banner */}
        {lastResult && (
          <div className="bg-slate-900/80 border-2 border-cyan-700 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest">⚡ Manual Scan Result — {lastResult.runTime ? new Date(lastResult.runTime).toLocaleTimeString('de-DE') : lastRun}</div>
              <button onClick={() => setLastResult(null)} className="text-slate-500 hover:text-white text-xs">✕ dismiss</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
              <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Opened</div>
                <div className={`font-black text-2xl ${lastResult.openedThisRun > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{lastResult.openedThisRun}</div>
              </div>
              <div className="bg-blue-950/30 border border-blue-800 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Closed</div>
                <div className={`font-black text-2xl ${lastResult.closedThisRun > 0 ? 'text-blue-400' : 'text-slate-400'}`}>{lastResult.closedThisRun}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Skipped Pairs</div>
                <div className="font-black text-2xl text-slate-400">{lastResult.skippedPairs?.length ?? 0}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                <div className="text-slate-500 uppercase tracking-wide mb-1">Safety</div>
                <div className="font-black text-emerald-400 text-xs mt-1">PAPER_ONLY ✅</div>
              </div>
            </div>
            {/* Opened details */}
            {lastResult.openedDetails?.length > 0 && (
              <div className="space-y-1 mb-2">
                <div className="text-xs text-emerald-400 font-bold mb-1">📄 Opened This Run:</div>
                {lastResult.openedDetails.map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 text-xs bg-emerald-950/20 border border-emerald-900 rounded-lg px-3 py-1.5">
                    <span className="font-black text-white">{e.instId}</span>
                    <span className="text-slate-400">entry <span className="text-white">${e.entryPrice?.toLocaleString()}</span></span>
                    <span className="text-emerald-400">TP ${e.targetPrice?.toLocaleString()}</span>
                    <span className="text-red-400">SL ${e.stopLossPrice?.toLocaleString()}</span>
                    <span className="text-cyan-400">score {e.score}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Closed details */}
            {lastResult.closedDetails?.length > 0 && (
              <div className="space-y-1 mb-2">
                <div className="text-xs text-blue-400 font-bold mb-1">🔒 Closed This Run:</div>
                {lastResult.closedDetails.map((e, i) => {
                  const net = e.netPnL ?? e.netPnLUSDT ?? 0;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-3 text-xs bg-blue-950/20 border border-blue-900 rounded-lg px-3 py-1.5">
                      <span className="font-black text-white">{e.instId}</span>
                      <span className={`font-bold ${e.status === 'CLOSED_TP' ? 'text-emerald-400' : e.status === 'CLOSED_SL' ? 'text-red-400' : 'text-slate-400'}`}>{e.status}</span>
                      <span className="text-slate-400">exit <span className="text-white">${e.exitPrice?.toLocaleString()}</span></span>
                      <span className={`font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{net >= 0 ? '+' : ''}{net.toFixed(4)} USDT</span>
                      <span className="text-slate-500 italic text-xs">{e.reason}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Skipped pairs */}
            {lastResult.skippedPairs?.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 font-bold mb-1">⏭ Skipped:</div>
                <div className="flex flex-wrap gap-2">
                  {lastResult.skippedPairs.map((r, i) => (
                    <span key={i} className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-400">
                      <span className="text-white font-bold">{r.instId}</span> — {r.action}{r.reason ? ` (${r.reason})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Auto Scanner Status Panel */}
        <div className="bg-slate-900/60 border-2 border-emerald-800 rounded-2xl px-5 py-4">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">🤖 Auto Paper Scanner</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-emerald-900">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Status</div>
              <div className="font-black text-emerald-400">✅ ON</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Interval</div>
              <div className="font-black text-cyan-400">Every 5 min</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Last Scan</div>
              <div className="font-bold text-slate-300">{data?.lastRunAt ? new Date(data.lastRunAt).toLocaleTimeString('de-DE') : '—'}</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Opened</div>
              <div className={`font-black text-xl ${(data?.openedThisRun||0) > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{data?.openedThisRun ?? '—'}</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <div className="text-slate-500 uppercase tracking-wide mb-1">Closed</div>
              <div className={`font-black text-xl ${(data?.closedThisRun||0) > 0 ? 'text-blue-400' : 'text-slate-400'}`}>{data?.closedThisRun ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* Safety banners */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-red-950/40 border-2 border-red-700 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">🛑</span>
            <div className="text-xs">
              <div className="text-red-400 font-black">KILL SWITCH ACTIVE · PAPER ONLY</div>
              <div className="text-red-300 mt-0.5">noOKXOrderEndpointCalled=true · tradeAllowed=false</div>
            </div>
          </div>
          <div className="bg-yellow-950/30 border-2 border-yellow-700 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div className="text-xs">
              <div className="text-yellow-400 font-black">PHASE 4 — PAPER TRADING SIMULATOR</div>
              <div className="text-yellow-300 mt-0.5">Virtual trades only · Phase 5 (real) requires operator unlock</div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/60 border border-red-600 rounded-xl p-4 text-red-300 text-sm">{error.message}</div>
        )}

        {/* 24h P&L Summary */}
        {isLoading ? (
          <Skeleton className="h-40 bg-slate-800 rounded-2xl" />
        ) : data && (
          <div className="bg-slate-900/70 border-2 border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">📊 24h Virtual P&L Report</div>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              <Tile label="Net P&L"      value={`${(r24.totalNetPnL||0)>=0?'+':''}${(r24.totalNetPnL||0).toFixed(4)} USDT`} color={pnlColor} />
              <Tile label="Trades"       value={r24.totalTrades || 0}     color="text-white" />
              <Tile label="Win Rate"     value={`${(r24.winRate||0).toFixed(1)}%`} color={(r24.winRate||0)>=50?'text-emerald-400':'text-red-400'} />
              <Tile label="TP Hits"      value={r24.tpHits || 0}          color="text-emerald-400" />
              <Tile label="SL Hits"      value={r24.slHits || 0}          color="text-red-400" />
              <Tile label="Open"         value={openTrades.length}         color="text-yellow-400" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mt-3">
              <Tile label="Gross P&L"    value={`${(r24.totalGrossPnL||0)>=0?'+':''}${(r24.totalGrossPnL||0).toFixed(4)}`} color="text-blue-400" />
              <Tile label="Fees Paid"    value={`-${(r24.totalFees||0).toFixed(4)}`}      color="text-red-400" />
              <Tile label="P&L/Trade"    value={`${(r24.pnlPerTrade||0)>=0?'+':''}${(r24.pnlPerTrade||0).toFixed(4)}`} color="text-slate-300" />
              <Tile label="Expired"      value={r24.expired || 0}          color="text-slate-400" />
            </div>
          </div>
        )}

        {/* Safety Audit Banner */}
        {data && (
          <div className={`rounded-xl border-2 px-5 py-3 text-xs flex flex-wrap items-center gap-4 ${audit.safetyStatus === 'SAFE' ? 'border-emerald-700 bg-emerald-950/20' : 'border-red-700 bg-red-950/30'}`}>
            <span className="font-black text-sm">{audit.safetyStatus === 'SAFE' ? '✅' : '❌'} Safety Audit: <span className={audit.safetyStatus === 'SAFE' ? 'text-emerald-400' : 'text-red-400'}>{audit.safetyStatus}</span></span>
            <span className={`font-bold ${!audit.realTradingEndpointDetected ? 'text-emerald-400' : 'text-red-400'}`}>realTradingEndpointDetected: {String(audit.realTradingEndpointDetected)}</span>
            <span className={`font-bold ${audit.paperTradeStorageValid ? 'text-emerald-400' : 'text-red-400'}`}>paperTradeStorageValid: {String(audit.paperTradeStorageValid)}</span>
            <span className={`font-bold ${audit.duplicateProtection ? 'text-emerald-400' : 'text-red-400'}`}>duplicateProtection: {String(audit.duplicateProtection)}</span>
            <span className={`font-bold ${audit.autoCloseLogic ? 'text-emerald-400' : 'text-red-400'}`}>autoCloseLogic: {String(audit.autoCloseLogic)}</span>
            <span className={`font-bold ${audit.dashboardReportValid ? 'text-emerald-400' : 'text-red-400'}`}>dashboardReportValid: {String(audit.dashboardReportValid)}</span>
            {audit.finalVerdict && <span className="text-slate-400 italic">{audit.finalVerdict}</span>}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="open" className="w-full">
          <TabsList className="grid w-full grid-cols-9 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="report"   className="text-xs">📋 24h Report</TabsTrigger>
            <TabsTrigger value="open"     className="text-xs">📂 Open ({openTrades.length})</TabsTrigger>
            <TabsTrigger value="closed"   className="text-xs">✅ Closed</TabsTrigger>
            <TabsTrigger value="scan"     className="text-xs">🔍 Last Scan</TabsTrigger>
            <TabsTrigger value="pairs"    className="text-xs">📈 By Pair</TabsTrigger>
            <TabsTrigger value="compare"  className="text-xs">⚖ Before/After</TabsTrigger>
            <TabsTrigger value="phase4c"  className="text-xs">🔬 Phase 4C</TabsTrigger>
            <TabsTrigger value="phase4d"  className="text-xs">⚡ Phase 4D</TabsTrigger>
            <TabsTrigger value="phase4e"  className="text-xs">📐 Phase 4E</TabsTrigger>
            <TabsTrigger value="diag"     className="text-xs">🔎 Diagnostic</TabsTrigger>
          </TabsList>

          {/* 24H REPORT */}
          <TabsContent value="report" className="mt-4">
            <PaperReport24h />
          </TabsContent>

          {/* OPEN POSITIONS */}
          <TabsContent value="open" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-300 mb-4">Open Paper Positions</div>
              {openTrades.length === 0 ? (
                <div className="text-center text-slate-400 py-10">No open paper positions.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-slate-400">
                      <tr>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-right px-2 py-2">Entry</th>
                        <th className="text-right px-2 py-2">Target</th>
                        <th className="text-right px-2 py-2">SL</th>
                        <th className="text-right px-2 py-2">Size</th>
                        <th className="text-left px-2 py-2">Signal</th>
                        <th className="text-right px-2 py-2">Score</th>
                        <th className="text-left px-2 py-2">Opened</th>
                        <th className="text-left px-2 py-2">Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openTrades.map(t => (
                        <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-2 py-2 font-black text-yellow-400">{t.instId}</td>
                          <td className="px-2 py-2 text-right text-white">${t.entryPrice?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-emerald-400">${(t.targetPrice || t.tpPrice)?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-red-400">${(t.stopLossPrice || t.slPrice)?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-slate-300">${t.sizeUSDT}</td>
                          <td className="px-2 py-2">
                            <span className={`font-bold ${t.intradaySignal === 'BULLISH' ? 'text-emerald-400' : 'text-yellow-400'}`}>{t.intradaySignal}</span>
                          </td>
                          <td className="px-2 py-2 text-right text-cyan-400">{t.signalScore || t.entryScore}</td>
                          <td className="px-2 py-2 text-slate-400">{t.openedAt ? new Date(t.openedAt).toLocaleTimeString('de-DE') : '—'}</td>
                          <td className="px-2 py-2 text-orange-400">{t.expiresAt ? new Date(t.expiresAt).toLocaleTimeString('de-DE') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* CLOSED 24H */}
          <TabsContent value="closed" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-300 mb-4">Closed Trades (last 50)</div>
              {recentClosed.filter(t => t.status !== 'OPEN').length === 0 ? (
                <div className="text-center text-slate-400 py-10">No closed trades yet. Run a cycle to start.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-slate-400">
                      <tr>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-left px-2 py-2">Status</th>
                        <th className="text-right px-2 py-2">Entry</th>
                        <th className="text-right px-2 py-2">Exit</th>
                        <th className="text-right px-2 py-2">GrossPnL</th>
                        <th className="text-right px-2 py-2">NetPnL</th>
                        <th className="text-right px-2 py-2">Held</th>
                        <th className="text-left px-2 py-2">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentClosed.filter(t => t.status !== 'OPEN').map(t => {
                        const net = t.netPnL || t.netPnLUSDT || 0;
                        return (
                          <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                            <td className="px-2 py-2 font-black text-white">{t.instId}</td>
                            <td className="px-2 py-2">
                              <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${
                                t.status === 'closed_tp' ? 'text-emerald-300 bg-emerald-950/50 border border-emerald-800' :
                                t.status === 'closed_sl' ? 'text-red-300 bg-red-950/50 border border-red-800' :
                                'text-slate-300 bg-slate-800/50 border border-slate-700'
                              }`}>{t.status}</span>
                            </td>
                            <td className="px-2 py-2 text-right text-slate-400">${t.entryPrice?.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right text-slate-400">${t.exitPrice?.toLocaleString()}</td>
                            <td className={`px-2 py-2 text-right font-bold ${(t.grossPnL||t.grossPnLUSDT||0)>=0?'text-emerald-400':'text-red-400'}`}>{(t.grossPnL||t.grossPnLUSDT||0)>=0?'+':''}{(t.grossPnL||t.grossPnLUSDT||0).toFixed(4)}</td>
                            <td className={`px-2 py-2 text-right font-black ${net>=0?'text-emerald-400':'text-red-400'}`}>{net>=0?'+':''}{net.toFixed(4)}</td>
                            <td className="px-2 py-2 text-right text-slate-500">{t.holdingMs ? `${Math.round(t.holdingMs/1000)}s` : '—'}</td>
                            <td className="px-2 py-2 text-slate-400">{t.closedAt ? new Date(t.closedAt).toLocaleTimeString('de-DE') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* LAST SCAN */}
          <TabsContent value="scan" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4">
              <div className="text-sm font-bold text-slate-300 mb-4">Last Scan Results</div>
              {!run.scanResults ? (
                <div className="text-center text-slate-400 py-10">Run a cycle to see scan results.</div>
              ) : (
                <div className="space-y-2">
                  {run.scanResults.map((r, i) => (
                    <div key={i} className={`rounded-xl border px-4 py-3 flex items-center justify-between text-xs ${
                      r.action === 'PAPER_BUY' ? 'border-emerald-700 bg-emerald-950/20' :
                      r.action === 'SKIP_OPEN_POSITION' ? 'border-yellow-700 bg-yellow-950/10' :
                      'border-slate-700 bg-slate-900/40'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-white text-sm">{r.instId}</span>
                        <span className={`font-bold px-2 py-0.5 rounded border text-xs ${
                          r.action === 'PAPER_BUY' ? 'text-emerald-300 border-emerald-700 bg-emerald-950/40' :
                          r.action === 'SKIP_OPEN_POSITION' ? 'text-yellow-300 border-yellow-700' :
                          'text-slate-400 border-slate-700'
                        }`}>{r.action}</span>
                        {r.intraday && <span className="text-slate-400">intraday: <span className={r.intraday==='BULLISH'?'text-emerald-400':r.intraday==='BEARISH'?'text-red-400':'text-yellow-400'}>{r.intraday}</span></span>}
                        {r.tick && <span className="text-slate-400">tick: <span className={r.tick==='BUY_PRESSURE'?'text-emerald-400':r.tick==='SELL_PRESSURE'?'text-red-400':'text-yellow-400'}>{r.tick}</span></span>}
                      </div>
                      {r.score != null && (
                        <span className={`font-black text-lg ${r.score>=60?'text-emerald-400':r.score>=45?'text-yellow-400':'text-red-400'}`}>{r.score}</span>
                      )}
                    </div>
                  ))}
                  {run.newPaperEntries?.length > 0 && (
                    <div className="mt-3 bg-emerald-950/30 border border-emerald-700 rounded-xl p-4 text-xs">
                      <div className="text-emerald-400 font-bold mb-2">📄 New Paper Entries This Run</div>
                      {run.newPaperEntries.map((e, i) => (
                        <div key={i} className="flex items-center gap-4 text-slate-300">
                          <span className="font-black text-white">{e.instId}</span>
                          <span>entry: ${e.entryPrice?.toLocaleString()}</span>
                          <span className="text-emerald-400">TP: ${e.tpPrice?.toLocaleString()}</span>
                          <span className="text-red-400">SL: ${e.slPrice?.toLocaleString()}</span>
                          <span className="text-cyan-400">score: {e.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {run.closedThisRun?.length > 0 && (
                    <div className="mt-3 bg-blue-950/20 border border-blue-700 rounded-xl p-4 text-xs">
                      <div className="text-blue-400 font-bold mb-2">🔒 Closed This Run</div>
                      {run.closedThisRun.map((e, i) => (
                        <div key={i} className="flex items-center gap-4 text-slate-300">
                          <span className="font-black text-white">{e.instId}</span>
                          <span className={e.status==='closed_tp'?'text-emerald-400':'text-red-400'}>{e.status}</span>
                          <span>exit: ${e.exitPrice?.toLocaleString()}</span>
                          <span className={`font-bold ${(e.netPnLUSDT||0)>=0?'text-emerald-400':'text-red-400'}`}>{(e.netPnLUSDT||0)>=0?'+':''}{(e.netPnLUSDT||0).toFixed(4)} USDT</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* BEFORE / AFTER COMPARISON */}
          <TabsContent value="compare" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4BeforeAfterPanel />
            </div>
          </TabsContent>

          {/* PHASE 4C EXPIRY DIAGNOSTIC */}
          <TabsContent value="phase4c" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4CExpiryDiagnosticPanel />
            </div>
          </TabsContent>

          {/* PHASE 4D CORRECTION */}
          <TabsContent value="phase4d" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4DApplyCorrectionPanel />
            </div>
          </TabsContent>

          {/* PHASE 4E POSITION SIZE */}
          <TabsContent value="phase4e" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4EPositionSizeDiagnosticPanel />
            </div>
          </TabsContent>

          {/* OPPORTUNITY DIAGNOSTIC */}
          <TabsContent value="diag" className="mt-4">
            <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
              <Phase4OpportunityDiagnosticPanel />
            </div>
          </TabsContent>

          {/* BY PAIR */}
          <TabsContent value="pairs" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {(r24.pairBreakdown || []).map(p => (
                <div key={p.instId} className={`rounded-xl border-2 p-4 ${(p.netPnL||0) > 0 ? 'border-emerald-700 bg-emerald-950/20' : (p.netPnL||0) < 0 ? 'border-red-800 bg-red-950/10' : 'border-slate-700 bg-slate-900/40'}`}>
                  <div className="font-black text-white text-base mb-2">{p.instId}</div>
                  <div className={`text-2xl font-black mb-2 ${(p.netPnL||0)>=0?'text-emerald-400':'text-red-400'}`}>
                    {(p.netPnL||0)>=0?'+':''}{(p.netPnL||0).toFixed(4)}
                  </div>
                  <div className="space-y-1 text-xs text-slate-400">
                    <div>Trades: <span className="text-white">{p.trades}</span></div>
                    <div>Wins: <span className="text-emerald-400">{p.wins}</span> / Losses: <span className="text-red-400">{p.losses}</span></div>
                    <div>TP: <span className="text-emerald-400">{p.tpHits}</span> · SL: <span className="text-red-400">{p.slHits}</span> · Exp: <span className="text-slate-400">{p.expired||0}</span></div>
                  </div>
                </div>
              ))}
              {(!r24.pairBreakdown || r24.pairBreakdown.length === 0) && (
                <div className="col-span-5 text-center text-slate-400 py-12">Run a cycle to see per-pair breakdown.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
      <div className="text-slate-500 text-xs mb-1 uppercase tracking-wide">{label}</div>
      <div className={`font-black text-xl ${color}`}>{value}</div>
    </div>
  );
}