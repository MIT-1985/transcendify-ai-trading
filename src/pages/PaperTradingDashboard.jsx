import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PaperTradingDashboard() {
  const { user } = useAuth();
  const [lastRun, setLastRun] = useState(null);

  // Run paper trading cycle
  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['phase4-paper-trading', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('phase4OKXPaperTrading', {});
      setLastRun(new Date().toLocaleTimeString('de-DE'));
      return res.data;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchInterval: false,
    gcTime: 0,
  });

  // Live open positions from entity
  const { data: openTrades = [], refetch: refetchOpen } = useQuery({
    queryKey: ['paper-open-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.filter({ status: 'open' }, '-created_date', 50),
    enabled: !!user,
    staleTime: 15000,
    refetchInterval: 15000,
  });

  // Recent closed trades
  const { data: recentClosed = [] } = useQuery({
    queryKey: ['paper-closed-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.list('-closedAt', 50),
    enabled: !!user,
    staleTime: 30000,
  });

  const r24  = data?.report24h || {};
  const run  = data?.thisRun   || {};
  const pnlColor = (r24.totalNetPnLUSDT || 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

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
              <span className="text-blue-400 font-bold">Polygon: REMOVED</span>
              {lastRun && <><span className="text-slate-500">·</span><span className="text-slate-400">Last run: {lastRun}</span></>}
            </div>
          </div>
          <button
            onClick={() => { refetch(); refetchOpen(); }}
            disabled={isFetching || isLoading}
            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-yellow-700/30 border border-yellow-600 hover:bg-yellow-700/50 text-yellow-300 disabled:opacity-50 transition-all shrink-0"
          >
            {isFetching || isLoading ? '⏳ Running…' : '▶ Run Paper Trading Cycle'}
          </button>
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
              <Tile label="Net P&L"      value={`${(r24.totalNetPnLUSDT||0)>=0?'+':''}${(r24.totalNetPnLUSDT||0).toFixed(4)} USDT`} color={pnlColor} />
              <Tile label="Trades"       value={r24.totalTrades || 0}     color="text-white" />
              <Tile label="Win Rate"     value={`${(r24.winRate||0).toFixed(1)}%`} color={(r24.winRate||0)>=50?'text-emerald-400':'text-red-400'} />
              <Tile label="TP Hits"      value={r24.tpHits || 0}          color="text-emerald-400" />
              <Tile label="SL Hits"      value={r24.slHits || 0}          color="text-red-400" />
              <Tile label="Open"         value={openTrades.length}         color="text-yellow-400" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mt-3">
              <Tile label="Gross P&L"    value={`${(r24.totalGrossPnLUSDT||0)>=0?'+':''}${(r24.totalGrossPnLUSDT||0).toFixed(4)}`} color="text-blue-400" />
              <Tile label="Fees Paid"    value={`-${(r24.totalFeesUSDT||0).toFixed(4)}`}      color="text-red-400" />
              <Tile label="P&L/Trade"    value={`${(r24.pnlPerTrade||0)>=0?'+':''}${(r24.pnlPerTrade||0).toFixed(4)}`} color="text-slate-300" />
              <Tile label="Expired"      value={r24.expired || 0}          color="text-slate-400" />
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="open" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="open"    className="text-xs">📂 Open ({openTrades.length})</TabsTrigger>
            <TabsTrigger value="closed"  className="text-xs">✅ Closed (24h)</TabsTrigger>
            <TabsTrigger value="scan"    className="text-xs">🔍 Last Scan</TabsTrigger>
            <TabsTrigger value="pairs"   className="text-xs">📈 By Pair</TabsTrigger>
          </TabsList>

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
                        <th className="text-right px-2 py-2">TP</th>
                        <th className="text-right px-2 py-2">SL</th>
                        <th className="text-right px-2 py-2">Size</th>
                        <th className="text-left px-2 py-2">Signal</th>
                        <th className="text-right px-2 py-2">Score</th>
                        <th className="text-left px-2 py-2">Opened</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openTrades.map(t => (
                        <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-2 py-2 font-black text-yellow-400">{t.instId}</td>
                          <td className="px-2 py-2 text-right text-white">${t.entryPrice?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-emerald-400">${t.tpPrice?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-red-400">${t.slPrice?.toLocaleString()}</td>
                          <td className="px-2 py-2 text-right text-slate-300">${t.sizeUSDT}</td>
                          <td className="px-2 py-2">
                            <span className={`font-bold ${t.intradaySignal === 'BULLISH' ? 'text-emerald-400' : 'text-yellow-400'}`}>{t.intradaySignal}</span>
                          </td>
                          <td className="px-2 py-2 text-right text-cyan-400">{t.entryScore}</td>
                          <td className="px-2 py-2 text-slate-400">{t.openedAt ? new Date(t.openedAt).toLocaleTimeString('de-DE') : '—'}</td>
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
              {recentClosed.filter(t => t.status !== 'open').length === 0 ? (
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
                      {recentClosed.filter(t => t.status !== 'open').map(t => {
                        const net = t.netPnLUSDT || 0;
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
                            <td className={`px-2 py-2 text-right font-bold ${(t.grossPnLUSDT||0)>=0?'text-emerald-400':'text-red-400'}`}>{(t.grossPnLUSDT||0)>=0?'+':''}{(t.grossPnLUSDT||0).toFixed(4)}</td>
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

          {/* BY PAIR */}
          <TabsContent value="pairs" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              {(r24.pairBreakdown || []).map(p => (
                <div key={p.instId} className={`rounded-xl border-2 p-4 ${(p.netPnLUSDT||0) > 0 ? 'border-emerald-700 bg-emerald-950/20' : (p.netPnLUSDT||0) < 0 ? 'border-red-800 bg-red-950/10' : 'border-slate-700 bg-slate-900/40'}`}>
                  <div className="font-black text-white text-base mb-2">{p.instId}</div>
                  <div className={`text-2xl font-black mb-2 ${(p.netPnLUSDT||0)>=0?'text-emerald-400':'text-red-400'}`}>
                    {(p.netPnLUSDT||0)>=0?'+':''}{(p.netPnLUSDT||0).toFixed(4)}
                  </div>
                  <div className="space-y-1 text-xs text-slate-400">
                    <div>Trades: <span className="text-white">{p.trades}</span></div>
                    <div>Wins: <span className="text-emerald-400">{p.wins}</span> / Losses: <span className="text-red-400">{p.losses}</span></div>
                    <div>TP: <span className="text-emerald-400">{p.tpHits}</span> · SL: <span className="text-red-400">{p.slHits}</span></div>
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