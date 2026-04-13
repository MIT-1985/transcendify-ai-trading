import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown, BarChart2, Activity, RefreshCw } from 'lucide-react';

const TIMEFRAMES = [
  { label: '1H', minutes: 60, interval: 'minute', multiplier: 5 },
  { label: '4H', minutes: 240, interval: 'minute', multiplier: 15 },
  { label: '1D', minutes: 1440, interval: 'hour', multiplier: 1 },
  { label: '1W', minutes: 10080, interval: 'day', multiplier: 1 },
  { label: '1M', minutes: 43200, interval: 'day', multiplier: 1 },
];

const CHART_TYPES = [
  { id: 'area', label: 'Area', icon: Activity },
  { id: 'line', label: 'Line', icon: TrendingUp },
  { id: 'bar', label: 'Bar', icon: BarChart2 },
  { id: 'candlestick', label: 'Candle', icon: BarChart2 },
];

const SYMBOLS = ['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD', 'X:XRPUSD', 'X:DOGEUSD'];

const CustomCandlestick = ({ x, y, width, height, open, close, high, low, isPositive }) => {
  const color = isPositive ? '#10b981' : '#ef4444';
  const barX = x + width / 2 - 3;
  const barW = 6;
  const bodyTop = Math.min(open, close);
  const bodyHeight = Math.abs(open - close) || 1;

  return (
    <g>
      <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={barX} y={bodyTop} width={barW} height={bodyHeight} fill={color} />
    </g>
  );
};

const CustomTooltip = ({ active, payload, label, chartType }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <div className="text-slate-400 mb-2">{label}</div>
      {chartType === 'candlestick' && d ? (
        <div className="space-y-1">
          <div className="flex gap-3"><span className="text-slate-400">O</span><span className="text-white font-mono">${d.open?.toLocaleString()}</span></div>
          <div className="flex gap-3"><span className="text-slate-400">H</span><span className="text-emerald-400 font-mono">${d.high?.toLocaleString()}</span></div>
          <div className="flex gap-3"><span className="text-slate-400">L</span><span className="text-red-400 font-mono">${d.low?.toLocaleString()}</span></div>
          <div className="flex gap-3"><span className="text-slate-400">C</span><span className="text-white font-mono">${d.close?.toLocaleString()}</span></div>
        </div>
      ) : (
        <div className="text-white font-mono font-bold">${payload[0]?.value?.toLocaleString()}</div>
      )}
      {d?.volume && <div className="text-slate-400 mt-1">Vol: {(d.volume / 1e6).toFixed(2)}M</div>}
    </div>
  );
};

export default function CryptoChart() {
  const [symbol, setSymbol] = useState('X:BTCUSD');
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2]);
  const [chartType, setChartType] = useState('area');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(Date.now() - timeframe.minutes * 60 * 1000);
      const toDate = now.toISOString().split('T')[0];
      const fromDate = from.toISOString().split('T')[0];
      const res = await base44.functions.invoke('polygonMarketData', {
        action: 'aggregates',
        symbol,
        multiplier: timeframe.multiplier,
        timespan: timeframe.interval,
        from: fromDate,
        to: toDate,
        limit: 120,
      });

      const results = res.data?.data?.results || [];
      if (results.length > 0) {
        const formatted = results.map(r => ({
          time: new Date(r.t).toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: timeframe.interval === 'minute' ? '2-digit' : undefined,
            minute: timeframe.interval === 'minute' ? '2-digit' : undefined,
          }),
          price: r.c,
          open: r.o,
          high: r.h,
          low: r.l,
          close: r.c,
          volume: r.v,
          isPositive: r.c >= r.o,
        }));
        setData(formatted);
        const last = formatted[formatted.length - 1];
        const first = formatted[0];
        setCurrentPrice(last.close);
        setPriceChange(((last.close - first.close) / first.close) * 100);
      }
    } catch (e) {
      console.error('Chart data error', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [symbol, timeframe]);

  const isPositive = priceChange >= 0;
  const color = isPositive ? '#10b981' : '#ef4444';
  const gradientId = `grad-${symbol}`;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none"
            >
              {SYMBOLS.map(s => (
                <option key={s} value={s}>{s.replace('X:', '').replace('USD', '/USD')}</option>
              ))}
            </select>
            {currentPrice && (
              <span className="text-2xl font-bold text-white">${currentPrice.toLocaleString()}</span>
            )}
            {priceChange !== null && (
              <span className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Chart Type */}
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.id}
                onClick={() => setChartType(ct.id)}
                className={`px-2 py-1 text-xs rounded-md transition-all ${chartType === ct.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {ct.label}
              </button>
            ))}
          </div>
          {/* Timeframe */}
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.label}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-xs rounded-md transition-all ${timeframe.label === tf.label ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {loading && data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading chart...
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip chartType={chartType} />} />
                <Bar dataKey="price" fill={color} radius={[2, 2, 0, 0]} />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip chartType={chartType} />} />
                <Line type="monotone" dataKey="price" stroke={color} dot={false} strokeWidth={2} />
              </LineChart>
            ) : chartType === 'candlestick' ? (
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={55} />
                <Tooltip content={<CustomTooltip chartType="candlestick" />} />
                <Bar dataKey="close" shape={<CustomCandlestick />} />
              </BarChart>
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
                <Tooltip content={<CustomTooltip chartType={chartType} />} />
                <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Volume Bar */}
      {data.length > 0 && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
              <Bar dataKey="volume" fill="#334155" radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}