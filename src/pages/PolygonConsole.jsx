import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CRYPTO_PAIRS = [
  'X:BTCUSD',
  'X:ETHUSD',
  'X:SOLUSD',
  'X:XRPUSD',
  'X:ADAUSD',
  'X:DOGEUSD'
];

const TIMEFRAMES = [
  { value: 'minute', label: '1m', multiplier: 1, limit: 60 },
  { value: 'minute', label: '5m', multiplier: 5, limit: 60 },
  { value: 'minute', label: '15m', multiplier: 15, limit: 100 },
  { value: 'minute', label: '30m', multiplier: 30, limit: 100 },
  { value: 'hour', label: '1h', multiplier: 1, limit: 100 },
  { value: 'hour', label: '6h', multiplier: 6, limit: 100 },
  { value: 'day', label: '1d', multiplier: 1, limit: 100 }
];

export default function PolygonConsole() {
  const [selectedPair, setSelectedPair] = useState('X:BTCUSD');
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[4]); // 1h default
  const [candleData, setCandleData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [volume24h, setVolume24h] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch real-time data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Calculate date range based on timeframe
        const now = Date.now();
        let fromMs;
        if (timeframe.value === 'minute') {
          fromMs = now - (timeframe.limit * timeframe.multiplier * 60 * 1000);
        } else if (timeframe.value === 'hour') {
          fromMs = now - (timeframe.limit * timeframe.multiplier * 60 * 60 * 1000);
        } else {
          fromMs = now - (timeframe.limit * timeframe.multiplier * 24 * 60 * 60 * 1000);
        }

        const from = new Date(fromMs).toISOString().split('T')[0];
        const to = new Date(now).toISOString().split('T')[0];

        const candleResponse = await base44.functions.invoke('polygonMarketData', {
          action: 'aggregates',
          symbol: selectedPair,
          from: from,
          to: to,
          timespan: timeframe.value,
          limit: timeframe.limit
        });

        if (candleResponse.data?.success && candleResponse.data.data?.results) {
          const results = candleResponse.data.data.results;
          
          const candles = results.map(candle => {
            const date = new Date(candle.t);
            let timeStr;
            if (timeframe.value === 'minute' || timeframe.value === 'hour') {
              timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
              timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }

            return {
              time: timeStr,
              timestamp: candle.t,
              open: candle.o,
              high: candle.h,
              low: candle.l,
              close: candle.c,
              volume: candle.v,
              isGreen: candle.c >= candle.o
            };
          });

          setCandleData(candles);
          
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            const first = candles[0];
            setCurrentPrice(last.close);
            setPriceChange(((last.close - first.open) / first.open) * 100);
            setVolume24h(results.reduce((sum, r) => sum + r.v, 0));
          }
        }

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, timeframe.value === 'minute' ? 3000 : 5000);
    return () => clearInterval(interval);
  }, [selectedPair, timeframe]);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-4">
      <div className="max-w-[1800px] mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Select value={selectedPair} onValueChange={setSelectedPair}>
              <SelectTrigger className="w-44 bg-slate-900 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {CRYPTO_PAIRS.map(pair => (
                  <SelectItem key={pair} value={pair}>
                    {pair.replace('X:', '').replace('USD', '/USD')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div>
              <div className="text-2xl font-bold">${currentPrice.toFixed(2)}</div>
              <div className={`text-sm ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.label}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  timeframe.label === tf.label
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
            Live
          </Badge>
        </div>

        {/* Main Chart */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            {loading ? (
              <div className="h-[600px] flex items-center justify-center text-slate-400">
                Loading {timeframe.label} chart...
              </div>
            ) : (
              <>
                {candleData.length === 0 ? (
                  <div className="h-[600px] flex items-center justify-center text-slate-400">
                    Зареждане на данни...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={600}>
                    <ComposedChart data={candleData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      
                      <XAxis 
                        dataKey="time" 
                        stroke="#64748b" 
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        interval={Math.floor(candleData.length / 15)}
                        axisLine={{ stroke: '#334155' }}
                      />
                      
                      <YAxis 
                        yAxisId="price"
                        domain={['auto', 'auto']} 
                        stroke="#64748b"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                        orientation="right"
                      />
                      
                      <YAxis 
                        yAxisId="volume"
                        orientation="left"
                        stroke="#64748b"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload[0]) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs">
                              <div className="text-slate-400 mb-2">{data.time}</div>
                              <div className="space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Open:</span>
                                  <span className="text-white font-semibold">${data.open?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">High:</span>
                                  <span className="text-emerald-400 font-semibold">${data.high?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Low:</span>
                                  <span className="text-red-400 font-semibold">${data.low?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Close:</span>
                                  <span className="text-white font-semibold">${data.close?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-500">Volume:</span>
                                  <span className="text-blue-400 font-semibold">{data.volume?.toFixed(0)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                      
                      {/* Volume bars */}
                      <Bar 
                        yAxisId="volume"
                        dataKey="volume" 
                        fill="url(#volumeGradient)"
                        radius={[4, 4, 0, 0]}
                      />
                      
                      {/* Wicks */}
                      <Bar 
                        yAxisId="price"
                        dataKey="high"
                        barSize={1}
                      >
                        {candleData.map((entry, index) => (
                          <Cell 
                            key={`wick-${index}`} 
                            fill={entry.isGreen ? '#10b981' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                      
                      {/* Candle bodies */}
                      <Bar 
                        yAxisId="price"
                        dataKey="high"
                        barSize={Math.max(6, Math.min(14, 700 / candleData.length))}
                      >
                        {candleData.map((entry, index) => (
                          <Cell 
                            key={`candle-${index}`} 
                            fill={entry.isGreen ? '#10b981' : '#ef4444'}
                            fillOpacity={0.9}
                          />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {/* OHLCV Stats */}
                <div className="grid grid-cols-5 gap-3 mt-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">O</div>
                    <div className="text-sm font-semibold text-white">
                      ${candleData.length > 0 ? candleData[0].open.toFixed(2) : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">H</div>
                    <div className="text-sm font-semibold text-emerald-400">
                      ${candleData.length > 0 ? Math.max(...candleData.map(c => c.high)).toFixed(2) : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">L</div>
                    <div className="text-sm font-semibold text-red-400">
                      ${candleData.length > 0 ? Math.min(...candleData.map(c => c.low)).toFixed(2) : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">C</div>
                    <div className="text-sm font-semibold text-white">
                      ${currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Vol 24h</div>
                    <div className="text-sm font-semibold text-blue-400">
                      {(volume24h / 1000000).toFixed(2)}M
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Market Watchlist */}
        <div className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {CRYPTO_PAIRS.map(pair => (
              <QuickPriceCard key={pair} symbol={pair} onSelect={setSelectedPair} isActive={pair === selectedPair} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickPriceCard({ symbol, onSelect, isActive }) {
  const [price, setPrice] = useState(0);
  const [change, setChange] = useState(0);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await base44.functions.invoke('polygonMarketData', {
          action: 'ticker',
          symbol: symbol
        });
        
        if (response.data?.success && response.data.data?.results?.[0]) {
          const result = response.data.data.results[0];
          setPrice(result.c);
          setChange(((result.c - result.o) / result.o) * 100);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <div 
      className={`bg-slate-900/50 border rounded-lg p-3 hover:border-blue-500/50 transition-all cursor-pointer ${
        isActive ? 'border-blue-500' : 'border-slate-800'
      }`}
      onClick={() => onSelect(symbol)}
    >
      <div className="text-xs text-slate-500 mb-1">
        {symbol.replace('X:', '').replace('USD', '/USD')}
      </div>
      <div className="text-base font-bold text-white mb-1">
        ${price.toFixed(2)}
      </div>
      <div className={`text-xs flex items-center gap-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </div>
    </div>
  );
}