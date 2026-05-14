import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import SystemTrailStatusBar from '@/components/dashboard/SystemTrailStatusBar';

// ── Live P&L Clock ─────────────────────────────────────────────────────────────
function PnLClock({ trades, balance }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const totalPnL  = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const totalFees = trades.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);
  const wins      = trades.filter(t => (t.realizedPnL || 0) > 0).length;
  const losses    = trades.filter(t => (t.realizedPnL || 0) < 0).length;
  const winRate   = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0.0';
  const equity    = parseFloat(balance?.totalEquityUSDT || balance?.totalEquity || 0);
  const pnlColor  = totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="rounded-2xl border-2 border-emerald-700 bg-emerald-950/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">⏱</span>
          <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Global P&L Clock — All Robots</span>
        </div>
        <span className="text-sm font-mono text-slate-400">{now.toLocaleTimeString('de-DE')}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">OKX Equity</div>
          <div className="text-2xl font-black text-emerald-400">${equity.toFixed(2)}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Net P&L (all)</div>
          <div className={`text-2xl font-black ${pnlColor}`}>{totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(4)}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Total Fees</div>
          <div className="text-2xl font-black text-red-400">{totalFees.toFixed(4)}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Total Trades</div>
          <div className="text-2xl font-black text-white">{trades.length}</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Win / Loss</div>
          <div className="text-2xl font-black text-white">{wins}W / {losses}L</div>
        </div>
        <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Win Rate</div>
          <div className={`text-2xl font-black ${parseFloat(winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winRate}%</div>
        </div>
      </div>
    </div>
  );
}

// ── Bot Card ───────────────────────────────────────────────────────────────────
function BotCard({ robotId, trades, constants }) {
  const pnl    = trades.reduce((s,t) => s+(t.realizedPnL||0), 0);
  const fees   = trades.reduce((s,t) => s+(t.buyFee||0)+(t.sellFee||0), 0);
  const wins   = trades.filter(t=>(t.realizedPnL||0)>0).length;
  const wr     = trades.length ? (wins/trades.length*100).toFixed(1) : '0.0';
  const c      = constants || {};
  const pnlClr = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="bg-slate-900/60 border border-blue-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-black text-blue-300 uppercase text-sm">{robotId}</span>
        </div>
        <span className="text-xs text-slate-500">{trades.length} trades</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Net P&L</div>
          <div className={`font-black text-lg ${pnlClr}`}>{pnl>=0?'+':''}{pnl.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Win Rate</div>
          <div className={`font-black text-lg ${parseFloat(wr)>=50?'text-emerald-400':'text-red-400'}`}>{wr}%</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">Fees Paid</div>
          <div className="font-black text-lg text-red-400">{fees.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 border border-slate-700">
          <div className="text-slate-400 mb-0.5">W/L</div>
          <div className="font-black text-lg text-white">{wins}/{trades.length-wins}</div>
        </div>
      </div>
      {Object.keys(c).length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-2 border border-slate-700 text-xs">
          <div className="text-slate-500 mb-2 font-bold uppercase tracking-wide text-xs">Optimizing Constants</div>
          <div className="grid grid-cols-3 gap-1">
            {['K_TP','K_SL','K_SPREAD','K_SCORE','K_SIZE','K_HOLD'].map(k => c[k] !== undefined && (
              <div key={k}>
                <span className="text-slate-500">{k}:</span>{' '}
                <span className="text-cyan-400 font-mono">{c[k]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();

  // OKX Live Balance
  const { data: balance = {}, isLoading: loadBalance } = useQuery({
    queryKey: ['dashboard-okx-balance', user?.email],
    queryFn: async () => { const r = await base44.functions.invoke('okxLiveBalance', {}); return r.data || {}; },
    enabled: !!user, staleTime: 0, refetchInterval: 10000, gcTime: 0
  });

  // All VerifiedTrades
  const { data: allTrades = [], isLoading: loadTrades } = useQuery({
    queryKey: ['dashboard-all-trades', user?.email],
    queryFn: async () => base44.asServiceRole.entities.VerifiedTrade.list(),
    enabled: !!user, staleTime: 30000, refetchInterval: 30000
  });

  // Optimizing Constants (all bots)
  const { data: allConstants = [], isLoading: loadConstants } = useQuery({
    queryKey: ['dashboard-constants', user?.email],
    queryFn: async () => base44.asServiceRole.entities.OptimizingConstants.list(),
    enabled: !!user, staleTime: 60000
  });

  // Robot1 Execution Log
  const { data: execLog = {}, isLoading: loadExec } = useQuery({
    queryKey: ['dashboard-exec-log', user?.email],
    queryFn: async () => { const l = await base44.asServiceRole.entities.Robot1ExecutionLog.list('-execution_time', 1); return l[0] || {}; },
    enabled: !!user, staleTime: 15000, refetchInterval: 15000
  });

  // Clean metrics
  const { data: cleanMetrics = {}, isLoading: loadMetrics } = useQuery({
    queryKey: ['dashboard-clean-metrics', user?.email],
    queryFn: async () => { const r = await base44.functions.invoke('finalCleanMetricsWithDedup', {}); return r.data || {}; },
    enabled: !!user, staleTime: 60000, refetchInterval: 60000
  });

  // Paper trades summary
  const { data: paperTrades = [] } = useQuery({
    queryKey: ['dashboard-paper-trades', user?.email],
    queryFn: () => base44.entities.PaperTrade.list('-created_date', 100),
    enabled: !!user, staleTime: 30000, refetchInterval: 30000
  });

  // AI Trading analysis — on demand
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const runAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const r = await base44.functions.invoke('aiTradingAnalysis', {});
      setAiResult(r.data);
    } catch (e) { console.error(e); }
    setAiLoading(false);
  };

  // Group trades by robot
  const byRobot = allTrades.reduce((acc, t) => {
    const r = t.robotId || 'unknown';
    if (!acc[r]) acc[r] = [];
    acc[r].push(t);
    return acc;
  }, {});

  const constByBot = allConstants.reduce((acc, c) => { if (c.botId) acc[c.botId] = c; return acc; }, {});
  const metrics    = cleanMetrics?.clean_metrics || {};
  const fmt2       = v => parseFloat(v||0).toFixed(2);
  const fmt4       = v => parseFloat(v||0).toFixed(4);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── SYSTEM TRAIL — Single Source of Truth ──────────── */}
        <SystemTrailStatusBar />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">Central Dashboard</h1>
            <p className="text-slate-400 text-xs mt-1">All robots · All P&L · OKX live · Polygon signals · AI analysis</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/OKXDashboard" className="px-4 py-2 text-xs font-bold rounded-xl bg-yellow-700/30 border border-yellow-700 hover:bg-yellow-700/50 text-yellow-300 transition-all">🔗 OKX Dashboard</Link>
            <Link to="/SignalDashboard" className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-700/30 border border-blue-700 hover:bg-blue-700/50 text-blue-300 transition-all">📡 Signal Dashboard</Link>
            <Link to="/PaperTradingDashboard" className="px-4 py-2 text-xs font-bold rounded-xl bg-yellow-700/30 border border-yellow-600 hover:bg-yellow-700/50 text-yellow-300 transition-all">📄 Phase 4 Paper Trading</Link>
          </div>
        </div>

        {/* Kill switch banners */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-red-950/60 border-2 border-red-600 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">🛑</span>
            <div>
              <div className="text-sm font-black text-red-400 uppercase tracking-widest">KILL SWITCH ACTIVE</div>
              <div className="text-xs text-red-300 mt-0.5">No BUY/SELL orders · PAUSED_KILL_SWITCH</div>
            </div>
          </div>
          <div className="bg-emerald-950/40 border-2 border-emerald-700 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">👁</span>
            <div>
              <div className="text-sm font-black text-emerald-400 uppercase tracking-widest">READ MODE ACTIVE</div>
              <div className="text-xs text-emerald-300 mt-0.5">OKX_ONLY_ENGINE · Phase 4 Paper Trading active</div>
            </div>
          </div>
        </div>

        {/* Global P&L Clock */}
        {loadTrades ? <Skeleton className="h-36 bg-slate-800 rounded-2xl" /> : <PnLClock trades={allTrades} balance={balance} />}

        {/* OKX Balance strip */}
        <div className={`rounded-xl border-2 p-5 ${balance?.success ? 'border-emerald-700 bg-emerald-950/10' : 'border-red-700 bg-red-950/10'}`}>
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">OKX Live Balance</div>
          {loadBalance ? <Skeleton className="h-20 bg-slate-800" /> : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <StatTile label="Total Equity"    value={`$${fmt2(balance?.totalEquityUSDT)}`} color="emerald" />
              <StatTile label="Available USDT"  value={`$${fmt2(balance?.availableUSDT)}`}   color="white" />
              <StatTile label="Frozen USDT"     value={`$${fmt2(balance?.frozenUSDT)}`}       color="yellow" />
              <StatTile label="Open Orders"     value={balance?.openOrdersCount ?? 0}          color="slate" />
              <StatTile label="Asset Count"     value={balance?.assetCount ?? 0}               color="slate" />
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="bots" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="bots"     className="text-xs">🤖 All Bots</TabsTrigger>
            <TabsTrigger value="polygon"  className="text-xs">📄 Paper P&L</TabsTrigger>
            <TabsTrigger value="ai"       className="text-xs">🧠 AI Trading</TabsTrigger>
            <TabsTrigger value="accounting" className="text-xs">✅ Accounting</TabsTrigger>
            <TabsTrigger value="system"   className="text-xs">🔒 System</TabsTrigger>
          </TabsList>

          {/* BOTS */}
          <TabsContent value="bots" className="mt-4">
            {loadTrades || loadConstants ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1,2].map(i => <Skeleton key={i} className="h-64 bg-slate-800 rounded-xl" />)}
              </div>
            ) : Object.keys(byRobot).length === 0 ? (
              <div className="text-center text-slate-400 py-16">No robot trades found. Sync OKX to load data.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(byRobot).map(([robotId, trades]) => (
                  <BotCard key={robotId} robotId={robotId} trades={trades} constants={constByBot[robotId]} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* PAPER P&L */}
          <TabsContent value="polygon" className="mt-4">
            <PaperPnLSummary user={user} />
          </TabsContent>

          {/* AI TRADING */}
          <TabsContent value="ai" className="mt-4">
            <div className="bg-slate-900/60 border border-purple-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">AI Trading Analysis</div>
                  <div className="text-xs text-slate-500">Powered by AI · Read-only advisory · No execution</div>
                </div>
                <button onClick={runAiAnalysis} disabled={aiLoading} className="px-4 py-2 text-xs font-bold rounded-xl bg-purple-700/30 border border-purple-700 hover:bg-purple-700/50 disabled:opacity-50 transition-all">
                  {aiLoading ? '🧠 Analyzing…' : '🧠 Run AI Analysis'}
                </button>
              </div>
              {aiLoading && <Skeleton className="h-32 bg-slate-800" />}
              {!aiLoading && !aiResult && (
                <div className="text-slate-400 text-sm text-center py-10">Click "Run AI Analysis" to get market insights.</div>
              )}
              {aiResult && (
                <div className="bg-slate-800/40 rounded-xl p-4 border border-purple-800 text-sm text-slate-200 leading-7 whitespace-pre-wrap">
                  {typeof aiResult === 'string' ? aiResult : JSON.stringify(aiResult, null, 2)}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ACCOUNTING */}
          <TabsContent value="accounting" className="mt-4">
            <div className="bg-slate-900/60 border border-emerald-800 rounded-xl p-5">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4">✅ Clean Accounting (Deduped · Verified)</div>
              {loadMetrics ? <Skeleton className="h-32 bg-slate-800" /> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <StatTile label="Unique Orders"  value={cleanMetrics?.unique_counts?.unique_orders ?? 0}  color="emerald" />
                    <StatTile label="Unique Trades"  value={cleanMetrics?.unique_counts?.unique_trades ?? 0}  color="emerald" />
                    <StatTile label="Net P&L"        value={`${(metrics.net_pnl||0)>=0?'+':''}${fmt4(metrics.net_pnl)} USDT`} color={(metrics.net_pnl||0)>=0?'emerald':'red'} />
                    <StatTile label="Win Rate"       value={`${parseFloat(metrics.win_rate||0).toFixed(1)}% (${metrics.wins||0}W/${metrics.losses||0}L)`} color="cyan" />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <StatTile label="Duplicates Excl." value={cleanMetrics?.unique_counts?.duplicate_orders ?? 0} color="yellow" />
                    <StatTile label="Suspect Excl."    value={cleanMetrics?.unique_counts?.suspect_trades ?? 0}  color="red" />
                    <StatTile label="Fees (clean)"     value={`${fmt4(metrics.fees)} USDT`}                      color="red" />
                    <StatTile label="Total Records"    value={cleanMetrics?.total_counts?.all_ledger ?? 0}        color="slate" />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* SYSTEM */}
          <TabsContent value="system" className="mt-4">
            <div className="space-y-4">
              {/* Robot 1 Status */}
              <div className="bg-slate-900/60 border border-blue-800 rounded-xl p-5">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4">🤖 Robot 1 — Last Execution</div>
                {loadExec ? <Skeleton className="h-24 bg-slate-800" /> : !execLog.execution_time ? (
                  <div className="text-slate-400 text-sm">No execution log.</div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <StatTile label="Last Run"   value={new Date(execLog.execution_time).toLocaleTimeString('de-DE')} color="slate" />
                    <StatTile label="Decision"   value={execLog.decision||'—'} color={execLog.decision==='BUY'?'emerald':execLog.decision==='SELL'?'red':'slate'} />
                    <StatTile label="OKX Status" value={execLog.okx_status||'—'} color={execLog.okx_status==='OK'?'emerald':'red'} />
                    <StatTile label="Polygon"    value={execLog.polygon_status||'—'} color={execLog.polygon_status==='OK'?'emerald':'yellow'} />
                  </div>
                )}
                {execLog.reason && (
                  <div className="mt-3 bg-slate-800/40 rounded-lg p-3 border border-slate-700 text-xs text-white">{execLog.reason}</div>
                )}
              </div>
              {/* System flags */}
              <div className="bg-red-950/20 border-2 border-red-700 rounded-xl p-5">
                <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-4">🔒 System Safety Flags</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {[
                    ['Kill Switch',      true,  'red',     'ACTIVE'],
                    ['Trading Paused',   true,  'red',     'YES'],
                    ['Read Mode',        true,  'emerald', 'ACTIVE'],
                    ['noOrderEndpoint',  true,  'emerald', 'true'],
                  ].map(([label, on, color, val]) => (
                    <div key={label} className="bg-slate-900/70 rounded-xl p-4 border border-slate-700">
                      <div className="text-xs text-slate-400 mb-1">{label}</div>
                      <div className={`font-black text-${color}-400`}>{val}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-red-300 font-mono">PAUSED_KILL_SWITCH · No BUY/SELL orders will be placed</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

// ── Paper P&L Summary for Dashboard tab ────────────────────────────────────────
function PaperPnLSummary({ user }) {
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['dash-paper-pnl', user?.email],
    queryFn:  () => base44.entities.PaperTrade.list('-created_date', 200),
    enabled: !!user, staleTime: 30000,
  });

  const since24h  = Date.now() - 24*60*60*1000;
  const closed    = trades.filter(t => t.status !== 'open');
  const last24h   = closed.filter(t => t.closedAt && new Date(t.closedAt).getTime() >= since24h);
  const open      = trades.filter(t => t.status === 'open');
  const netPnL    = last24h.reduce((s, t) => s+(t.netPnLUSDT||0), 0);
  const wins      = last24h.filter(t => (t.netPnLUSDT||0) > 0).length;
  const wr        = last24h.length > 0 ? (wins/last24h.length*100).toFixed(1) : '0.0';

  if (isLoading) return <Skeleton className="h-40 bg-slate-800 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-yellow-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-bold text-yellow-400 uppercase tracking-widest">📄 Phase 4 Paper Trading — 24h Virtual P&L</div>
          <Link to="/PaperTradingDashboard" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-yellow-700/30 border border-yellow-700 hover:bg-yellow-700/50 text-yellow-300 transition-all">→ Full Dashboard</Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <StatTile label="24h Net PnL"  value={`${netPnL>=0?'+':''}${netPnL.toFixed(4)} USDT`} color={netPnL>=0?'emerald':'red'} />
          <StatTile label="24h Trades"   value={last24h.length}    color="white" />
          <StatTile label="Win Rate"     value={`${wr}%`}          color={parseFloat(wr)>=50?'emerald':'red'} />
          <StatTile label="Open Now"     value={open.length}       color="yellow" />
          <StatTile label="Total Closed" value={closed.length}     color="slate" />
        </div>
        {last24h.length === 0 && (
          <div className="mt-4 text-center text-slate-400 text-sm py-4">No paper trades closed in last 24h. Run a cycle from the Paper Trading Dashboard.</div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, color = 'slate' }) {
  const colors = { emerald:'text-emerald-400', red:'text-red-400', yellow:'text-yellow-400', cyan:'text-cyan-400', white:'text-white', blue:'text-blue-400', slate:'text-slate-300', purple:'text-purple-400' };
  return (
    <div className="bg-slate-900/70 rounded-xl p-4 border border-slate-700">
      <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold ${colors[color]||'text-white'}`}>{value}</div>
    </div>
  );
}