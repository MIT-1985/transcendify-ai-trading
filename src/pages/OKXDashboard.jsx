import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Wallet, Activity, RefreshCw, BarChart2, TrendingUp, Bot, Link2, Clock, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import moment from 'moment';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const OKX_SYMBOLS = ['BTC-USDT','ETH-USDT','SOL-USDT','XRP-USDT','DOGE-USDT','BNB-USDT','ADA-USDT','LINK-USDT','AVAX-USDT','LTC-USDT'];

const TIMEFRAMES = [
  { label: '1H', bar: '5m', limit: 12 },
  { label: '4H', bar: '15m', limit: 16 },
  { label: '1D', bar: '1H', limit: 24 },
  { label: '1W', bar: '4H', limit: 42 },
];

// ── P&L Clock ──────────────────────────────────────────────────────────────────
function PnLClock({ trades, balance }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const totalPnL   = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const totalFees  = trades.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);
  const wins       = trades.filter(t => (t.realizedPnL || 0) > 0).length;
  const losses     = trades.filter(t => (t.realizedPnL || 0) < 0).length;
  const winRate    = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0.0';
  const equity     = parseFloat(balance?.totalEquityUSDT || balance?.totalEquity || 0);
  const pnlColor   = totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="bg-slate-900/80 border-2 border-blue-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Live P&L Clock</span>
        <span className="ml-auto text-xs font-mono text-slate-400">{now.toLocaleTimeString('de-DE')}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">OKX Equity</div>
          <div className="text-xl font-black text-emerald-400">${equity.toFixed(2)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Net P&L (all trades)</div>
          <div className={`text-xl font-black ${pnlColor}`}>{totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Total Fees</div>
          <div className="text-xl font-black text-red-400">{totalFees.toFixed(4)}</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Win / Loss</div>
          <div className="text-xl font-black text-white">{wins}W / {losses}L</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
          <div className="text-slate-400 mb-1">Win Rate</div>
          <div className={`text-xl font-black ${parseFloat(winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winRate}%</div>
        </div>
      </div>
    </div>
  );
}

// ── Price Card ─────────────────────────────────────────────────────────────────
function PriceCard({ ticker }) {
  const isUp = (ticker.change || 0) >= 0;
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
      <div className="text-xs font-bold text-slate-400 mb-1">{ticker.symbol || ticker.instId}</div>
      <div className="text-lg font-black text-white">${parseFloat(ticker.price || ticker.last || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
      <div className={`text-xs font-semibold mt-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? '▲' : '▼'} {Math.abs(ticker.change || 0).toFixed(2)}%
      </div>
    </div>
  );
}

// ── Chart ──────────────────────────────────────────────────────────────────────
function OKXChart() {
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [tf, setTf] = useState(TIMEFRAMES[2]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('okxMarketData', { action: 'candles', instId: symbol, bar: tf.bar, limit: tf.limit });
      const candles = res.data?.data || [];
      if (candles.length > 0) {
        setData(candles.map(c => ({ time: moment(c.time).format('MMM D HH:mm'), price: c.close })));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [symbol, tf]);
  const color = '#3b82f6';

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={symbol} onChange={e => setSymbol(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5">
          {OKX_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
          {TIMEFRAMES.map(t => (
            <button key={t.label} onClick={() => setTf(t)} className={`px-2 py-1 text-xs rounded-md transition-all ${tf.label === t.label ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{t.label}</button>
          ))}
        </div>
        <button onClick={fetch} className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="h-56">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={['auto','auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={52} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} formatter={v => [`$${v.toLocaleString()}`, 'Price']} />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#chartGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function OKXDashboard() {
  const { user } = useAuth();
  const [tickers, setTickers] = useState([]);
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Live OKX balance
  const { data: balance = {}, isLoading: loadBalance, refetch: refetchBalance } = useQuery({
    queryKey: ['okx-live-balance-okxpage', user?.email],
    queryFn: async () => {
      const res = await base44.functions.invoke('okxLiveBalance', {});
      return res.data || {};
    },
    enabled: !!user, staleTime: 0, refetchInterval: 10000, gcTime: 0
  });

  // All VerifiedTrades (all robots)
  const { data: allTrades = [], isLoading: loadTrades, refetch: refetchTrades } = useQuery({
    queryKey: ['all-verified-trades-okxpage', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.VerifiedTrade.list();
      return all.sort((a, b) => new Date(b.sellTime || b.updated_date).getTime() - new Date(a.sellTime || a.updated_date).getTime());
    },
    enabled: !!user, staleTime: 30000
  });

  // OXX Order Ledger
  const { data: ledger = [], isLoading: loadLedger, refetch: refetchLedger } = useQuery({
    queryKey: ['oxx-ledger-okxpage', user?.email],
    queryFn: async () => {
      const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
      return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!user, staleTime: 30000
  });

  // Latest Robot1 Execution Log
  const { data: execLog = {}, isLoading: loadExec } = useQuery({
    queryKey: ['robot1-exec-log-okxpage', user?.email],
    queryFn: async () => {
      const logs = await base44.asServiceRole.entities.Robot1ExecutionLog.list('-execution_time', 1);
      return logs[0] || {};
    },
    enabled: !!user, staleTime: 15000, refetchInterval: 15000
  });

  // Live tickers
  useEffect(() => {
    const fetchTickers = async () => {
      setLoadingTickers(true);
      try {
        const res = await base44.functions.invoke('okxMarketData', { action: 'tickers', symbols: OKX_SYMBOLS });
        if (res.data?.success) setTickers(res.data.data || []);
      } catch (e) { console.error(e); }
      setLoadingTickers(false);
    };
    fetchTickers();
    const iv = setInterval(fetchTickers, 10000);
    return () => clearInterval(iv);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await base44.functions.invoke('syncOKXOrderLedger', {});
      refetchLedger(); refetchTrades(); refetchBalance();
    } catch (e) { console.error(e); }
    setSyncing(false);
  };

  // Group trades by robot
  const byRobot = allTrades.reduce((acc, t) => {
    const r = t.robotId || 'unknown';
    if (!acc[r]) acc[r] = [];
    acc[r].push(t);
    return acc;
  }, {});

  const totalPnL  = allTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const totalFees = allTrades.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);
  const fmtPnL    = v => `${v >= 0 ? '+' : ''}${v.toFixed(4)}`;
  const equity    = parseFloat(balance?.totalEquityUSDT || balance?.totalEquity || 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-yellow-400" />
              </div>
              <h1 className="text-2xl font-black">OKX Dashboard</h1>
            </div>
            <p className="text-slate-400 text-xs mt-1 ml-13">Live data · All robots · All trades</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { refetchBalance(); refetchTrades(); refetchLedger(); }} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all">
              🔄 Refresh
            </button>
            <button onClick={handleSync} disabled={syncing} className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-all">
              {syncing ? '⏳ Syncing…' : '⚡ Sync OKX Fills'}
            </button>
          </div>
        </div>

        {/* Kill Switch banner */}
        <div className="bg-red-950/40 border border-red-700 rounded-xl px-5 py-2.5 flex items-center gap-3 text-xs">
          <span className="text-red-400 font-black">🛑 KILL SWITCH ACTIVE</span>
          <span className="text-slate-500">·</span>
          <span className="text-red-300">No trading · Read mode · tradeAllowed=false</span>
          <span className="ml-auto text-slate-500 font-mono">PAUSED_KILL_SWITCH</span>
        </div>

        {/* P&L Clock */}
        <PnLClock trades={allTrades} balance={balance} />

        {/* OKX Balance */}
        <div className="bg-slate-900/50 border border-emerald-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-emerald-400">OKX Live Balance</h2>
            {loadBalance && <RefreshCw className="w-3 h-3 text-slate-500 animate-spin ml-auto" />}
          </div>
          {loadBalance ? <Skeleton className="h-20 bg-slate-800" /> : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <StatBox label="Total Equity" value={`$${equity.toFixed(2)}`} color="emerald" />
              <StatBox label="Available USDT" value={`$${parseFloat(balance?.availableUSDT || 0).toFixed(2)}`} color="white" />
              <StatBox label="Frozen USDT" value={`$${parseFloat(balance?.frozenUSDT || 0).toFixed(2)}`} color="yellow" />
              <StatBox label="Open Orders" value={balance?.openOrdersCount ?? 0} color="slate" />
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="trades" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
            <TabsTrigger value="trades"  className="text-xs">📊 All Trades</TabsTrigger>
            <TabsTrigger value="robots"  className="text-xs">🤖 By Robot</TabsTrigger>
            <TabsTrigger value="ledger"  className="text-xs">📋 Ledger</TabsTrigger>
            <TabsTrigger value="market"  className="text-xs">📈 Market</TabsTrigger>
            <TabsTrigger value="status"  className="text-xs">🔧 Robot Status</TabsTrigger>
          </TabsList>

          {/* ALL TRADES */}
          <TabsContent value="trades" className="mt-4">
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs">
                <StatBox label="Total Trades"    value={allTrades.length}         color="slate" />
                <StatBox label="Net P&L (USDT)"  value={fmtPnL(totalPnL)}         color={totalPnL >= 0 ? 'emerald' : 'red'} />
                <StatBox label="Total Fees"      value={totalFees.toFixed(4)}      color="red" />
                <StatBox label="Win Rate"        value={allTrades.length ? `${(allTrades.filter(t=>(t.realizedPnL||0)>0).length/allTrades.length*100).toFixed(1)}%` : '—'} color="cyan" />
              </div>
              {loadTrades ? <Skeleton className="h-40 bg-slate-800" /> : allTrades.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-8">No trades yet — sync OKX first.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-slate-400">
                      <tr>
                        <th className="text-left px-2 py-2">Robot</th>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-right px-2 py-2">Buy $</th>
                        <th className="text-right px-2 py-2">Sell $</th>
                        <th className="text-right px-2 py-2">Net P&L</th>
                        <th className="text-right px-2 py-2">P&L %</th>
                        <th className="text-right px-2 py-2">Fees</th>
                        <th className="text-left px-2 py-2">Sell Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTrades.slice(0, 30).map((t, i) => {
                        const pnl = t.realizedPnL || 0;
                        const fees = (t.buyFee || 0) + (t.sellFee || 0);
                        return (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                            <td className="px-2 py-2 text-blue-400 font-bold">{t.robotId}</td>
                            <td className="px-2 py-2 font-bold text-white">{t.instId}</td>
                            <td className="px-2 py-2 text-right">${(t.buyPrice || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">${(t.sellPrice || 0).toFixed(2)}</td>
                            <td className={`px-2 py-2 text-right font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPnL(pnl)}</td>
                            <td className={`px-2 py-2 text-right ${(t.realizedPnLPct||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(t.realizedPnLPct||0).toFixed(3)}%</td>
                            <td className="px-2 py-2 text-right text-red-400">{fees.toFixed(4)}</td>
                            <td className="px-2 py-2 text-slate-400 text-xs whitespace-nowrap">{t.sellTime ? new Date(t.sellTime).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'medium'}) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {allTrades.length > 30 && <div className="text-xs text-slate-500 text-center mt-2">+{allTrades.length-30} more trades</div>}
                </div>
              )}
            </div>
          </TabsContent>

          {/* BY ROBOT */}
          <TabsContent value="robots" className="mt-4">
            <div className="space-y-4">
              {Object.keys(byRobot).length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-8">No robot trade data.</div>
              ) : Object.entries(byRobot).map(([robotId, trades]) => {
                const pnl  = trades.reduce((s,t)=>s+(t.realizedPnL||0),0);
                const fees = trades.reduce((s,t)=>s+(t.buyFee||0)+(t.sellFee||0),0);
                const wins = trades.filter(t=>(t.realizedPnL||0)>0).length;
                return (
                  <div key={robotId} className="bg-slate-900/50 border border-slate-700 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <Bot className="w-4 h-4 text-blue-400" />
                      <span className="font-bold text-blue-300 uppercase">{robotId}</span>
                      <span className="ml-auto text-xs text-slate-500">{trades.length} trades</span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <StatBox label="Trades"   value={trades.length}           color="slate" />
                      <StatBox label="Net P&L"  value={fmtPnL(pnl)}             color={pnl>=0?'emerald':'red'} />
                      <StatBox label="Total Fees" value={fees.toFixed(4)}       color="red" />
                      <StatBox label="Win Rate" value={`${trades.length?((wins/trades.length)*100).toFixed(1):0}%`} color="cyan" />
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* LEDGER */}
          <TabsContent value="ledger" className="mt-4">
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-300">OXX Order Ledger ({ledger.length} records)</h3>
              </div>
              {loadLedger ? <Skeleton className="h-40 bg-slate-800" /> : ledger.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-8">No orders. Click "Sync OKX Fills".</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-700 text-slate-400">
                      <tr>
                        <th className="text-left px-2 py-2">Robot</th>
                        <th className="text-left px-2 py-2">Pair</th>
                        <th className="text-left px-2 py-2">Side</th>
                        <th className="text-right px-2 py-2">Price</th>
                        <th className="text-right px-2 py-2">Qty</th>
                        <th className="text-right px-2 py-2">USDT</th>
                        <th className="text-right px-2 py-2">Fee</th>
                        <th className="text-left px-2 py-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.slice(0,40).map((o,i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                          <td className="px-2 py-2 text-blue-400 font-bold text-xs">{o.robotId || '—'}</td>
                          <td className="px-2 py-2 font-bold text-white">{o.instId}</td>
                          <td className={`px-2 py-2 font-bold ${o.side==='buy'?'text-emerald-400':'text-red-400'}`}>{o.side?.toUpperCase()}</td>
                          <td className="px-2 py-2 text-right">${(o.avgPx||0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-slate-400">{(o.accFillSz||0).toFixed(4)}</td>
                          <td className="px-2 py-2 text-right">${(o.quoteUSDT||0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-red-400">{(o.fee||0).toFixed(4)}</td>
                          <td className="px-2 py-2 text-slate-400 whitespace-nowrap">{o.timestamp ? new Date(o.timestamp).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'medium'}) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ledger.length > 40 && <div className="text-xs text-slate-500 text-center mt-2">+{ledger.length-40} more</div>}
                </div>
              )}
            </div>
          </TabsContent>

          {/* MARKET */}
          <TabsContent value="market" className="mt-4 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {tickers.length === 0
                ? OKX_SYMBOLS.map(s => <div key={s} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 animate-pulse h-20" />)
                : tickers.map(t => <PriceCard key={t.instId||t.symbol} ticker={t} />)}
            </div>
            <OKXChart />
          </TabsContent>

          {/* ROBOT STATUS */}
          <TabsContent value="status" className="mt-4">
            <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-slate-300">Robot 1 — Last Execution Log</h3>
              </div>
              {loadExec ? <Skeleton className="h-24 bg-slate-800" /> : !execLog.execution_time ? (
                <div className="text-slate-400 text-sm">No execution log found.</div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <StatBox label="Last Run"    value={new Date(execLog.execution_time).toLocaleTimeString('de-DE')} color="slate" />
                    <StatBox label="Decision"    value={execLog.decision || '—'} color={execLog.decision==='BUY'?'emerald':execLog.decision==='SELL'?'red':'slate'} />
                    <StatBox label="OKX Status"  value={execLog.okx_status || '—'} color={execLog.okx_status==='OK'?'emerald':'red'} />
                    <StatBox label="Polygon"     value={execLog.polygon_status || '—'} color={execLog.polygon_status==='OK'?'emerald':'yellow'} />
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700 text-xs">
                    <div className="text-slate-400 mb-1">Reason</div>
                    <div className="text-white">{execLog.reason || '—'}</div>
                  </div>
                  {execLog.active_position && (
                    <div className="bg-blue-950/40 border border-blue-700 rounded-lg p-3 text-xs">
                      <div className="text-blue-400 font-bold">Active Position: {execLog.position_symbol}</div>
                      <div className="text-slate-300">Qty: {execLog.position_qty?.toFixed(4)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

function StatBox({ label, value, color = 'slate' }) {
  const colors = { emerald: 'text-emerald-400', red: 'text-red-400', yellow: 'text-yellow-400', cyan: 'text-cyan-400', white: 'text-white', blue: 'text-blue-400', slate: 'text-slate-300' };
  return (
    <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={`font-black text-lg ${colors[color]||'text-white'}`}>{value}</div>
    </div>
  );
}