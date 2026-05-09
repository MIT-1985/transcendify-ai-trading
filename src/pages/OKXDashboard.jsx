import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Wallet, Zap, Activity, BarChart2, RefreshCw, Link2, TrendingUp, Bot } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import moment from 'moment';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const OKX_SYMBOLS = [
  'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'ADA-USDT',
  'BNB-USDT', 'AVAX-USDT', 'DOT-USDT', 'LINK-USDT', 'LTC-USDT',
  'ATOM-USDT', 'UNI-USDT', 'ARB-USDT', 'SUI-USDT', 'TRX-USDT', 'TON-USDT'
];

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

export default function OKXDashboard() {
  const { user } = useAuth();
  const [tickers, setTickers] = useState([]);
  const [loadingTickers, setLoadingTickers] = useState(false);

  // Fetch live balance from OKX
  const { data: balance = {}, isLoading: loadBalance, refetch: refetchBalance } = useQuery({
    queryKey: ['okx-live-balance', user?.email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getSuzanaBalance', {});
        return res.data || {};
      } catch (e) {
        return { error: e.message };
      }
    },
    enabled: !!user,
    staleTime: 30000
  });

  // Fetch Robot 1 execution log
  const { data: execution = {}, refetch: refetchExecution, isLoading: loadExecution } = useQuery({
    queryKey: ['robot1-execution', user?.email],
    queryFn: async () => {
      try {
        const logs = await base44.asServiceRole.entities.Robot1ExecutionLog.list();
        return logs.length > 0 ? logs[0] : {};
      } catch (e) {
        return { error: e.message };
      }
    },
    enabled: !!user,
    staleTime: 20000
  });

  // Fetch Robot 1 verified trades (only ETH-USDT / SOL-USDT)
  const { data: robot1Trades = [], refetch: refetchVerified, isLoading: loadVerified } = useQuery({
    queryKey: ['robot1-verified', user?.email],
    queryFn: async () => {
      try {
        const all = await base44.asServiceRole.entities.VerifiedTrade.list();
        return all.filter(t => t.robotId === 'robot1' && (t.instId === 'ETH-USDT' || t.instId === 'SOL-USDT'));
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
    staleTime: 30000
  });

  // Fetch OKX raw orders
  const { data: ledger = [], refetch: refetchLedger, isLoading: loadLedger } = useQuery({
    queryKey: ['oxx-ledger', user?.email],
    queryFn: async () => {
      try {
        const all = await base44.asServiceRole.entities.OXXOrderLedger.list();
        return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (e) {
        return [];
      }
    },
    enabled: !!user,
    staleTime: 30000
  });

  // Fetch live tickers
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

  const handleSync = async () => {
    try {
      await base44.functions.invoke('syncOKXOrderLedger', {});
      refetchLedger();
      refetchVerified();
      refetchExecution();
    } catch (e) {
      console.error(e);
    }
  };

  const robot1PnL = robot1Trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-yellow-400" />
              </div>
              OKX Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-1">Live OKX Data • Robot 1 Only</p>
          </div>
          <Button 
            onClick={handleSync}
            className="gap-2 bg-blue-600"
          >
            <Activity className="w-4 h-4" />
            Sync OKX
          </Button>
        </div>

        {/* 1. OKX LIVE BALANCE */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-bold">1. OKX Live Balance</h2>
          </div>
          {loadBalance ? (
            <Skeleton className="h-24" />
          ) : balance.error ? (
            <div className="text-red-400 text-sm">{balance.error}</div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">Total Equity</div>
                <div className="text-2xl font-bold text-emerald-400">
                  ${parseFloat(balance.totalEquity || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">Free USDT</div>
                <div className="text-2xl font-bold text-white">
                  ${parseFloat(balance.freeUSDT || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">ETH</div>
                <div className="text-xl font-bold text-white">
                  {parseFloat(balance.ETH || 0).toFixed(6)}
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-yellow-700/30">
                <div className="text-xs text-slate-400">SOL</div>
                <div className="text-xl font-bold text-white">
                  {parseFloat(balance.SOL || 0).toFixed(4)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. ROBOT 1 LIVE STATUS */}
        <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold">2. Robot 1 Live Status</h2>
          </div>
          {loadExecution ? (
            <Skeleton className="h-32" />
          ) : !execution.execution_time ? (
            <div className="text-slate-400 text-sm">No execution log yet</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-700/30">
                  <div className="text-xs text-slate-400">Last Run</div>
                  <div className="text-sm font-mono text-blue-300">
                    {new Date(execution.execution_time).toLocaleTimeString()}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-700/30">
                  <div className="text-xs text-slate-400">Decision</div>
                  <div className={`text-sm font-bold ${
                    execution.decision === 'BUY' ? 'text-emerald-400' : 
                    execution.decision === 'SELL' ? 'text-red-400' : 
                    'text-slate-400'
                  }`}>
                    {execution.decision || '—'}
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-400 mb-1">Reason</div>
                <div className="text-sm text-white">{execution.reason || '—'}</div>
              </div>
              {execution.active_position && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="bg-blue-800/30 rounded-lg p-3 border border-blue-700/30">
                    <div className="text-xs text-slate-400">Active Position</div>
                    <div className="text-sm font-bold text-blue-300">{execution.position_symbol}</div>
                    <div className="text-xs text-slate-500 mt-1">{execution.position_qty?.toFixed(4) || '—'} qty</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-slate-400">Last Order ID</div>
                    <div className="text-xs font-mono text-cyan-400">{execution.last_order_id?.slice?.(-10) || '—'}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. ROBOT 1 VERIFIED TRADES */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">3. Robot 1 Verified Trades (ETH-USDT / SOL-USDT)</h2>
          </div>
          {loadVerified ? (
            <Skeleton className="h-20" />
          ) : robot1Trades.length === 0 ? (
            <div className="text-slate-400 text-sm">No verified trades yet</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-800/50 rounded-lg p-3 border border-emerald-700/30">
                  <div className="text-xs text-slate-400">Total Trades</div>
                  <div className="text-2xl font-bold text-white">{robot1Trades.length}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 border border-emerald-700/30">
                  <div className="text-xs text-slate-400">Closed</div>
                  <div className="text-2xl font-bold text-white">{robot1Trades.filter(t => t.status === 'closed').length}</div>
                </div>
                <div className={`bg-slate-800/50 rounded-lg p-3 border ${robot1PnL >= 0 ? 'border-emerald-700/30' : 'border-red-700/30'}`}>
                  <div className="text-xs text-slate-400">Total P&L</div>
                  <div className={`text-2xl font-bold ${robot1PnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {robot1PnL >= 0 ? '+' : ''}{robot1PnL.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="text-left px-3 py-2">Pair</th>
                      <th className="text-right px-3 py-2">Buy Qty</th>
                      <th className="text-right px-3 py-2">Buy Price</th>
                      <th className="text-right px-3 py-2">Sell Price</th>
                      <th className="text-right px-3 py-2">P&L</th>
                      <th className="text-right px-3 py-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robot1Trades.slice(0, 8).map((t, i) => (
                      <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-bold">{t.instId}</td>
                        <td className="px-3 py-2 text-right font-mono">{t.buyQty?.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right font-mono">${t.buyPrice?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">${t.sellPrice?.toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${t.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.realizedPnL >= 0 ? '+' : ''}{t.realizedPnL?.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${t.realizedPnLPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.realizedPnLPct?.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 4. OKX RAW ORDERS */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold">4. OKX Raw Orders (Verified Fills Only)</h2>
          </div>
          {loadLedger ? (
            <Skeleton className="h-40" />
          ) : ledger.length === 0 ? (
            <div className="text-slate-400 text-sm">No orders. Click "Sync OKX" above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2">Ord ID</th>
                    <th className="text-left px-3 py-2">Pair</th>
                    <th className="text-left px-3 py-2">Side</th>
                    <th className="text-right px-3 py-2">Base Qty</th>
                    <th className="text-right px-3 py-2">Quote USDT</th>
                    <th className="text-right px-3 py-2">Fee</th>
                    <th className="text-left px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.slice(0, 20).map(ord => (
                    <tr key={ord.ordId} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-3 py-2 font-mono text-cyan-400">{ord.ordId.slice(-10)}</td>
                      <td className="px-3 py-2 font-bold">{ord.instId}</td>
                      <td className="px-3 py-2">
                        <span className={ord.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                          {ord.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{ord.accFillSz?.toFixed(4)}</td>
                      <td className="px-3 py-2 text-right font-mono">${ord.quoteUSDT?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-400">{ord.fee?.toFixed(4)}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(ord.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ledger.length > 20 && (
                <div className="text-xs text-slate-500 mt-2 text-center">... {ledger.length - 20} more</div>
              )}
            </div>
          )}
        </div>

        {/* MARKET DATA */}
        <div className="mt-6">
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
              ? OKX_SYMBOLS.map(s => <div key={s} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 animate-pulse h-24" />)
              : tickers.map(t => <OKXPriceCard key={t.instId} ticker={t} />)
            }
          </div>
        </div>

        {/* CHART */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">OKX Chart</h2>
          </div>
          <OKXChart />
        </div>
      </div>
    </div>
  );
}