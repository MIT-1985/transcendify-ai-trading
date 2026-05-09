import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Link2, Activity, BarChart2, Wallet, ArrowUpDown, Bot, CheckCircle2, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import moment from 'moment';

const OKX_SYMBOLS = [
  'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'ADA-USDT',
  'BNB-USDT', 'AVAX-USDT', 'DOT-USDT', 'MATIC-USDT', 'LINK-USDT', 'LTC-USDT',
  'ATOM-USDT', 'UNI-USDT', 'FIL-USDT', 'NEAR-USDT', 'APT-USDT', 'ARB-USDT',
  'OP-USDT', 'SUI-USDT', 'TRX-USDT', 'TON-USDT', 'SHIB-USDT', 'BCH-USDT'
];

const TIMEFRAMES = [
  { label: '1H', bar: '5m', limit: 12 },
  { label: '4H', bar: '15m', limit: 16 },
  { label: '1D', bar: '1H', limit: 24 },
  { label: '1W', bar: '4H', limit: 42 },
  { label: '1M', bar: '1D', limit: 30 },
];

// Suzana's email
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
// DCA Warrior bot ID (Bot #1)
const BOT1_ID = '69352a734b5108d3c7824639';
// Suzana's subscription IDs (all active bots)
const SUZANA_SUB_ID = '69e09f0e4d3cae70a455ca60';
const SUZANA_SUB_IDS = ['69e09f0e4d3cae70a455ca60', '69fee8ff90408637f331ed69', '69fee8ff90408637f331ed6a'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      <div className="text-white font-mono font-bold">${payload[0]?.value?.toLocaleString()}</div>
    </div>
  );
};

function OKXPriceCard({ ticker }) {
  const isUp = ticker.change >= 0;
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
      <div className="text-sm font-bold text-white mb-1">{ticker.symbol}</div>
      <div className="text-xl font-bold text-white">${ticker.price?.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
      <div className={`text-xs font-semibold mt-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
        {isUp ? '▲' : '▼'} {Math.abs(ticker.change).toFixed(2)}%
      </div>
      <div className="text-xs text-slate-500 mt-1">Vol: {(ticker.volume / 1e6).toFixed(1)}M</div>
    </div>
  );
}

function OKXChart() {
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2]);
  const [chartType, setChartType] = useState('area');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);

  const fetchCandles = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('okxMarketData', {
        action: 'candles', instId: symbol, bar: timeframe.bar, limit: timeframe.limit
      });
      const candles = res.data?.data || [];
      if (candles.length > 0) {
        const formatted = candles.map(c => ({
          time: moment(c.time).format('MMM D HH:mm'),
          price: c.close, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
        }));
        setData(formatted);
        setCurrentPrice(formatted[formatted.length - 1]?.close);
        const first = formatted[0]?.close;
        const last = formatted[formatted.length - 1]?.close;
        if (first && last) setPriceChange(((last - first) / first) * 100);
      }
    } catch (e) { console.error('OKX chart error', e); }
    setLoading(false);
  };

  useEffect(() => { fetchCandles(); }, [symbol, timeframe]);

  const isPositive = (priceChange || 0) >= 0;
  const color = isPositive ? '#10b981' : '#ef4444';
  const gradientId = `okx-grad-${symbol}`;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={symbol} onChange={e => setSymbol(e.target.value)} className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none">
            {OKX_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {currentPrice && <span className="text-2xl font-bold text-white">${currentPrice.toLocaleString()}</span>}
          {priceChange !== null && (
            <span className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            {['area', 'line', 'bar'].map(t => (
              <button key={t} onClick={() => setChartType(t)}
                className={`px-2 py-1 text-xs rounded-md transition-all capitalize ${chartType === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            {TIMEFRAMES.map(tf => (
              <button key={tf.label} onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs rounded-md transition-all ${timeframe.label === tf.label ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {tf.label}
              </button>
            ))}
          </div>
          <button onClick={fetchCandles} className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="h-64">
        {loading && data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading...</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="price" fill={color} radius={[2, 2, 0, 0]} />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="price" stroke={color} dot={false} strokeWidth={2} />
              </LineChart>
            ) : (
              <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Suzana Account Card ────────────────────────────────────────────────────
function SuzanaAccountPanel({ connection, subscription, subs, bot, trades, refreshing, onRefresh }) {
  const balance = connection?.balance_usdt ?? 0;
  const isLoadingBalance = connection?.loading && balance === 0;
  const totalTrades = Math.max(subscription?.total_trades || 0, trades.length);
  const totalProfit = subscription?.total_profit || 0;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-emerald-500/30 rounded-2xl p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">Suzana — OKX Акаунт</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse inline-block" />
              <span className="text-xs text-emerald-400 font-semibold">Свързан • eea.okx.com</span>
            </div>
          </div>
        </div>
        <button onClick={onRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm transition-colors border border-slate-700">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Обнови
        </button>
      </div>

      {/* Balance + Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* USDT Balance */}
        <div className="bg-slate-800/70 rounded-xl p-4 border border-yellow-500/20">
          <div className="text-xs text-slate-400 mb-1">Общ Баланс (USD)</div>
          <div className="text-3xl font-bold text-yellow-400">
            {isLoadingBalance ? <span className="animate-pulse text-slate-400">Зарежда...</span> : `$${balance.toFixed(2)}`}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {connection?.last_sync ? `Обновено: ${moment(connection.last_sync).format('HH:mm:ss')}` : '—'}
          </div>
        </div>

        {/* Assets */}
        <div className="bg-slate-800/70 rounded-xl p-4 border border-blue-500/20">
          <div className="text-xs text-slate-400 mb-2">Активи</div>
          {connection?.balances?.length > 0 ? (
            <div className="space-y-1">
              {connection.balances.filter(b => (b.free + b.locked) > 0).map(b => (
                <div key={b.asset} className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-white">{b.asset}</span>
                  <span className="text-sm text-slate-300 font-mono">{parseFloat(b.free).toFixed(b.asset === 'USDT' ? 2 : 6)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-sm">Няма активи</div>
          )}
        </div>

        {/* Total Profit */}
        <div className="bg-slate-800/70 rounded-xl p-4 border border-emerald-500/20">
          <div className="text-xs text-slate-400 mb-1">Общ Profit</div>
          <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">от стартиране</div>
        </div>
      </div>

      {/* Trade Counter + Active Bots */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 flex items-center gap-5 flex-wrap">
      <div>
        <div className="text-xs text-slate-400 mb-2">Изпълнени Трейдове (всички ботове)</div>
        <div className="flex gap-2 items-center">
          <span className="text-4xl font-bold text-emerald-400 font-mono">{totalTrades}</span>
        </div>
      </div>

      {/* Active Bots — all subs */}
      <div className="ml-auto flex flex-wrap gap-2">
        {subs && subs.length > 0 ? subs.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
            <Bot className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400 capitalize">{s.exchange?.toUpperCase()}</span>
                <span className="px-1 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded">LIVE</span>
              </div>
              <div className="text-xs font-bold text-white capitalize">{s.exchange} Bot #{i+1}</div>
              <div className="text-[10px] text-emerald-400">{s.total_trades || 0} трейда</div>
            </div>
          </div>
        )) : bot && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Активен Робот</span>
                <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded">LIVE</span>
              </div>
              <div className="font-bold text-white text-sm">{bot.name}</div>
              <div className="text-xs text-emerald-400 capitalize">{bot.strategy} • {bot.risk_level} risk</div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400 ml-2" />
          </div>
        )}
      </div>
      </div>

      {/* Real OKX Orders */}
      {trades.length > 0 && (
        <div className="mt-5">
          <div className="text-xs text-slate-400 font-semibold mb-2 uppercase tracking-wide">Последни Ордери (OKX Live)</div>
          <div className="rounded-xl overflow-hidden border border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                <tr className="text-slate-400">
                  <th className="text-left px-3 py-2">Час</th>
                  <th className="text-left px-3 py-2">Символ</th>
                  <th className="text-left px-3 py-2">Посока</th>
                  <th className="text-right px-3 py-2">Avg Цена</th>
                  <th className="text-right px-3 py-2">Кол.</th>
                  <th className="text-right px-3 py-2">P&L</th>
                  <th className="text-right px-3 py-2">Статус</th>
                </tr>
              </thead>
              <tbody>
                {trades.map(order => {
                  const pnl = order.pnl || 0;
                  const statusColors = { filled: 'text-emerald-400', canceled: 'text-slate-400', live: 'text-yellow-400', partially_filled: 'text-blue-400' };
                  return (
                    <tr key={order.ordId} className="border-t border-slate-700/50 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-slate-400">{moment(order.cTime).format('MMM D HH:mm')}</td>
                      <td className="px-3 py-2 font-semibold text-white">{order.instId}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded font-bold ${order.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {order.side}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-white">
                        {order.avgPx ? `$${order.avgPx.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">
                        {order.accFillSz > 0 ? order.accFillSz.toFixed(6) : order.sz.toFixed(6)}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnl !== 0 ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(4)}` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right capitalize ${statusColors[order.state] || 'text-white'}`}>
                        {order.state}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────
export default function OKXDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tickers, setTickers] = useState([]);
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Live balance from OKX for Suzana (via backend function)
  const [liveBalance, setLiveBalance] = useState(0);
  const [liveBalances, setLiveBalances] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  const fetchSuzanaBalance = async () => {
    setBalanceLoading(true);
    try {
      const res = await base44.functions.invoke('getSuzanaBalance', {});
      if (res.data?.success) {
        setLiveBalance(res.data.balance_usdt);
        setLiveBalances(res.data.balances || []);
        setLastSync(new Date().toISOString());
      }
    } catch (e) { console.error('getSuzanaBalance error', e); }
    setBalanceLoading(false);
  };

  useEffect(() => {
    fetchSuzanaBalance();
    const interval = setInterval(fetchSuzanaBalance, 60000);
    return () => clearInterval(interval);
  }, []);

  // Build suzanaConn from live data
  const suzanaConn = useMemo(() => ({
    balance_usdt: liveBalance,
    balances: liveBalances,
    last_sync: lastSync,
    status: 'connected',
    label: 'My OKX Account',
    loading: balanceLoading
  }), [liveBalance, liveBalances, lastSync, balanceLoading]);

  // All OKX connections (for own user)
  const { data: allOkxConns = [], refetch: refetchAll } = useQuery({
    queryKey: ['all-okx-conns'],
    queryFn: () => base44.entities.ExchangeConnection.filter({ exchange: 'okx' }),
    staleTime: 30000,
    retry: false
  });

  // All Suzana's subscriptions
  const { data: suzanaSubs = [] } = useQuery({
    queryKey: ['suzana-subs'],
    queryFn: () => base44.entities.UserSubscription.filter({ user_email: SUZANA_EMAIL }),
    staleTime: 30000,
    retry: false
  });
  const sub = suzanaSubs.find(s => s.id === SUZANA_SUB_ID) || suzanaSubs[0] || null;
  const totalTradesAllBots = suzanaSubs.reduce((s, sb) => s + (sb.total_trades || 0), 0);
  const totalProfitAllBots = suzanaSubs.reduce((s, sb) => s + (sb.total_profit || 0), 0);

  // Bot #1
  const { data: bot1 } = useQuery({
    queryKey: ['bot1'],
    queryFn: () => base44.entities.TradingBot.filter({ id: BOT1_ID }),
    staleTime: 60000,
    retry: false
  });
  const bot = bot1?.[0] || null;

  // Real OKX orders from exchange
  const { data: suzanaOrders = [], refetch: refetchOrders } = useQuery({
    queryKey: ['suzana-okx-orders'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getSuzanaOrders', {});
      return res.data?.orders || [];
    },
    staleTime: 20000,
    retry: false
  });

  // Current user's own connections (for non-Suzana users)
  const { data: myConns = [] } = useQuery({
    queryKey: ['my-okx-conns', user?.email],
    queryFn: () => base44.entities.ExchangeConnection.filter({ created_by: user?.email, exchange: 'okx' }),
    enabled: !!user && user.email !== SUZANA_EMAIL,
    staleTime: 60000,
    retry: false
  });

  // Tickers
  useEffect(() => {
    const fetchTickers = async () => {
      setLoadingTickers(true);
      try {
        const res = await base44.functions.invoke('okxMarketData', { action: 'tickers', symbols: OKX_SYMBOLS });
        if (res.data?.success) setTickers(res.data.data);
      } catch (e) { console.error('OKX tickers error', e); }
      setLoadingTickers(false);
    };
    fetchTickers();
    const interval = setInterval(fetchTickers, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh Suzana balance every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      refetchAll();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSuzanaBalance();
    await refetchAll();
    await refetchOrders();
    setRefreshing(false);
  };

  const isSuzana = user?.email === SUZANA_EMAIL || user?.email === 'sauzana.cozmas@gmail.com';

  // Show own connection for admin/other users too
  const ownConn = isSuzana ? suzanaConn : (myConns.find(c => c.status === 'connected') || null);
  const displayConn = isSuzana ? suzanaConn : ownConn;
  const totalBalance = displayConn?.balance_usdt || (isSuzana ? (suzanaConn?.balance_usdt || 0) : 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-yellow-400" />
              </div>
              OKX Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">Live OKX пазар • Акаунт на Suzana</p>
          </div>
          {/* Always visible balance badge */}
          {suzanaConn && (
            <div className="bg-slate-900/80 border border-yellow-500/30 rounded-xl px-5 py-3 text-right">
              <div className="text-xs text-slate-400">Suzana — OKX Баланс</div>
              <div className="text-2xl font-bold text-yellow-400">
                {suzanaConn.loading && suzanaConn.balance_usdt === 0
                  ? <span className="animate-pulse text-slate-400 text-lg">Зарежда...</span>
                  : <>${suzanaConn.balance_usdt.toFixed(2)} <span className="text-sm text-slate-400">USDT</span></>
                }
              </div>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-xs text-emerald-400">Свързан</span>
              </div>
            </div>
          )}
        </div>

        {/* Suzana Account Panel — always shown */}
        <SuzanaAccountPanel
          connection={suzanaConn}
          subscription={{ ...(sub || {}), total_trades: totalTradesAllBots, total_profit: totalProfitAllBots }}
          subs={suzanaSubs}
          bot={bot}
          trades={suzanaOrders}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />

        {/* Live Prices */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold">Live OKX Цени</h2>
            {loadingTickers && <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />}
            <span className="flex items-center gap-1 text-xs text-emerald-400 ml-1">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />Live
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tickers.length === 0
              ? OKX_SYMBOLS.map(s => <div key={s} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 animate-pulse h-24" />)
              : tickers.map(t => <OKXPriceCard key={t.instId} ticker={t} />)
            }
          </div>
        </div>

        {/* Chart */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">OKX График</h2>
          </div>
          <OKXChart />
        </div>
      </div>
    </div>
  );
}