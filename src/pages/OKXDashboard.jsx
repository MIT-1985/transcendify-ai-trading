import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Link2, Activity, BarChart2, Wallet, ArrowUpDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import moment from 'moment';

const OKX_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'ADA-USDT'];

const TIMEFRAMES = [
  { label: '1H', bar: '5m', limit: 12 },
  { label: '4H', bar: '15m', limit: 16 },
  { label: '1D', bar: '1H', limit: 24 },
  { label: '1W', bar: '4H', limit: 42 },
  { label: '1M', bar: '1D', limit: 30 },
];

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
        action: 'candles',
        instId: symbol,
        bar: timeframe.bar,
        limit: timeframe.limit
      });
      const candles = res.data?.data || [];
      if (candles.length > 0) {
        const formatted = candles.map(c => ({
          time: moment(c.time).format('MMM D HH:mm'),
          price: c.close,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
        setData(formatted);
        setCurrentPrice(formatted[formatted.length - 1]?.close);
        const first = formatted[0]?.close;
        const last = formatted[formatted.length - 1]?.close;
        if (first && last) setPriceChange(((last - first) / first) * 100);
      }
    } catch (e) {
      console.error('OKX chart error', e);
    }
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
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none"
          >
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
          <div className="h-full flex items-center justify-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading...
          </div>
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

export default function OKXDashboard() {
  const { user } = useAuth();
  const [tickers, setTickers] = useState([]);
  const [loadingTickers, setLoadingTickers] = useState(false);

  const { data: connections = [] } = useQuery({
    queryKey: ['exchangeConnections', user?.email],
    queryFn: () => base44.entities.ExchangeConnection.filter({ created_by: user?.email, exchange: 'okx' }),
    enabled: !!user,
    staleTime: 60000,
    retry: false
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades', user?.email],
    queryFn: () => base44.entities.Trade.filter({ created_by: user?.email }),
    enabled: !!user,
    staleTime: 15000,
    retry: false
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions', user?.email],
    queryFn: () => base44.entities.UserSubscription.filter({ created_by: user?.email }),
    enabled: !!user,
    staleTime: 30000,
    retry: false
  });

  const { data: bots = [] } = useQuery({
    queryKey: ['bots'],
    queryFn: () => base44.entities.TradingBot.list(),
    staleTime: 60000,
    retry: false
  });

  useEffect(() => {
    const fetchTickers = async () => {
      setLoadingTickers(true);
      try {
        const res = await base44.functions.invoke('okxMarketData', { action: 'tickers', symbols: OKX_SYMBOLS });
        if (res.data?.success) setTickers(res.data.data);
      } catch (e) {
        console.error('OKX tickers error', e);
      }
      setLoadingTickers(false);
    };
    fetchTickers();
    const interval = setInterval(fetchTickers, 10000);
    return () => clearInterval(interval);
  }, []);

  const okxConnections = connections.filter(c => c.status === 'connected');
  const totalBalance = okxConnections.reduce((sum, c) => sum + (c.balance_usdt || 0), 0);

  // Bot trades (transactions)
  const botTrades = trades.slice().sort((a, b) => new Date(b.timestamp || b.created_date) - new Date(a.timestamp || a.created_date));

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-yellow-400" />
              </div>
              OKX Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">Live OKX market data & bot transactions</p>
          </div>
          {okxConnections.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-700 rounded-xl px-5 py-3 text-right">
              <div className="text-xs text-slate-400">OKX Balance</div>
              <div className="text-2xl font-bold text-yellow-400">${totalBalance.toFixed(2)}</div>
            </div>
          )}
        </div>

        {/* Live Prices */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold">Live OKX Prices</h2>
            {loadingTickers && <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />}
            <span className="flex items-center gap-1 text-xs text-emerald-400 ml-1">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />Live
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tickers.length === 0
              ? OKX_SYMBOLS.map(s => (
                  <div key={s} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 animate-pulse h-24" />
                ))
              : tickers.map(t => <OKXPriceCard key={t.instId} ticker={t} />)
            }
          </div>
        </div>

        {/* Chart */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">OKX Price Chart</h2>
          </div>
          <OKXChart />
        </div>

        {/* OKX Account Balances */}
        {okxConnections.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold">OKX Account</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {okxConnections.map(conn => (
                <div key={conn.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <Link2 className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold">OKX {conn.label || ''}</h4>
                      <span className="text-xs text-emerald-400">● Connected</span>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-xs text-slate-500">Total USDT</div>
                      <div className="text-yellow-400 font-bold">${(conn.balance_usdt || 0).toFixed(2)}</div>
                    </div>
                  </div>
                  {conn.balances && conn.balances.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {conn.balances.filter(b => (b.free + b.locked) > 0).slice(0, 8).map(b => (
                        <div key={b.asset} className="bg-slate-800/60 rounded-lg px-3 py-2 flex justify-between items-center">
                          <span className="text-sm font-semibold text-white">{b.asset}</span>
                          <div className="text-right">
                            <div className="text-xs text-slate-300">{parseFloat(b.free).toFixed(4)}</div>
                            {b.locked > 0 && <div className="text-xs text-slate-500">🔒 {parseFloat(b.locked).toFixed(4)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bot Transactions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ArrowUpDown className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">Bot Transactions</h2>
            <span className="text-xs text-slate-400">({botTrades.length} total)</span>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            {botTrades.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <ArrowUpDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No bot transactions yet</p>
                <p className="text-xs mt-1">Bot trades will appear here once bots start executing</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                    <tr className="text-slate-400 text-xs">
                      <th className="text-left px-4 py-3">Time</th>
                      <th className="text-left px-4 py-3">Symbol</th>
                      <th className="text-left px-4 py-3">Side</th>
                      <th className="text-right px-4 py-3">Price</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">P&L</th>
                      <th className="text-left px-4 py-3">Bot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botTrades.map(trade => {
                      const sub = subscriptions.find(s => s.id === trade.subscription_id);
                      const bot = bots.find(b => b.id === sub?.bot_id);
                      const pnl = trade.profit_loss || 0;
                      return (
                        <tr key={trade.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {moment(trade.timestamp || trade.created_date).format('MMM D HH:mm:ss')}
                          </td>
                          <td className="px-4 py-3 font-semibold">{trade.symbol}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${trade.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {trade.side}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">${trade.price?.toFixed(4)}</td>
                          <td className="px-4 py-3 text-right font-mono">{trade.quantity?.toFixed(4)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{bot?.name || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}