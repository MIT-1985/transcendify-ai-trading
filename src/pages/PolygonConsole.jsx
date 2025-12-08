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
  const [indicators, setIndicators] = useState({
    sma20: false,
    sma50: false,
    ema12: false,
    ema26: false,
    bb: false,
    rsi: false,
    macd: false
  });
  const [indicatorData, setIndicatorData] = useState({});

  // Fetch real-time data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const now = Date.now();
        let fromMs;
        
        // Изчислявам точния период базиран на timeframe
        if (timeframe.value === 'minute') {
          fromMs = now - (120 * timeframe.multiplier * 60 * 1000); // 120 candles
        } else if (timeframe.value === 'hour') {
          fromMs = now - (120 * timeframe.multiplier * 60 * 60 * 1000);
        } else { // day
          fromMs = now - (120 * 24 * 60 * 60 * 1000);
        }
        
        const from = new Date(fromMs).toISOString().split('T')[0];
        const to = new Date(now).toISOString().split('T')[0];

        console.log('Fetching:', selectedPair, timeframe.label, 'from', from, 'to', to);

        const candleResponse = await base44.functions.invoke('polygonMarketData', {
          action: 'aggregates',
          symbol: selectedPair,
          from: from,
          to: to,
          timespan: timeframe.value,
          multiplier: timeframe.multiplier,
          limit: 120
        });

        console.log('Response:', candleResponse.data);

        if (candleResponse.data?.success && candleResponse.data.data?.results) {
          const results = candleResponse.data.data.results;
          console.log('Got', results.length, 'candles');
          
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
          calculateIndicators(candles);
          
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
  }, [selectedPair, timeframe]);

  const calculateSMA = (data, period) => {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  const calculateEMA = (data, period) => {
    const result = [];
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
    result.push(...Array(period - 1).fill(null));
    result.push(ema);
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i].close - ema) * multiplier + ema;
      result.push(ema);
    }
    return result;
  };

  const calculateBollingerBands = (data, period = 20, stdDev = 2) => {
    const sma = calculateSMA(data, period);
    const upper = [];
    const lower = [];
    
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(null);
        lower.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const variance = slice.reduce((sum, candle) => sum + Math.pow(candle.close - mean, 2), 0) / period;
        const std = Math.sqrt(variance);
        upper.push(mean + stdDev * std);
        lower.push(mean - stdDev * std);
      }
    }
    return { sma, upper, lower };
  };

  const calculateRSI = (data, period = 14) => {
    const result = Array(period).fill(null);
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    let rs = avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));
    
    for (let i = period + 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rs = avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
    return result;
  };

  const calculateMACD = (data) => {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    const macdLine = [];
    
    for (let i = 0; i < data.length; i++) {
      if (ema12[i] === null || ema26[i] === null) {
        macdLine.push(null);
      } else {
        macdLine.push(ema12[i] - ema26[i]);
      }
    }
    
    // Signal line (9-day EMA of MACD)
    const signalLine = [];
    const validMacd = macdLine.filter(v => v !== null);
    const multiplier = 2 / 10;
    let ema = validMacd.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    
    signalLine.push(...Array(macdLine.indexOf(validMacd[0]) + 8).fill(null));
    signalLine.push(ema);
    
    for (let i = macdLine.indexOf(validMacd[0]) + 9; i < macdLine.length; i++) {
      if (macdLine[i] !== null) {
        ema = (macdLine[i] - ema) * multiplier + ema;
        signalLine.push(ema);
      } else {
        signalLine.push(null);
      }
    }
    
    const histogram = macdLine.map((v, i) => {
      if (v === null || signalLine[i] === null) return null;
      return v - signalLine[i];
    });
    
    return { macdLine, signalLine, histogram };
  };

  const calculateIndicators = (candles) => {
    const newIndicatorData = {};
    
    if (candles.length > 0) {
      newIndicatorData.sma20 = calculateSMA(candles, 20);
      newIndicatorData.sma50 = calculateSMA(candles, 50);
      newIndicatorData.ema12 = calculateEMA(candles, 12);
      newIndicatorData.ema26 = calculateEMA(candles, 26);
      
      const bb = calculateBollingerBands(candles, 20, 2);
      newIndicatorData.bbUpper = bb.upper;
      newIndicatorData.bbMiddle = bb.sma;
      newIndicatorData.bbLower = bb.lower;
      
      newIndicatorData.rsi = calculateRSI(candles, 14);
      
      const macd = calculateMACD(candles);
      newIndicatorData.macdLine = macd.macdLine;
      newIndicatorData.macdSignal = macd.signalLine;
      newIndicatorData.macdHistogram = macd.histogram;
    }
    
    setIndicatorData(newIndicatorData);
  };

  const toggleIndicator = (key) => {
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

        {/* Indicators Panel */}
        <Card className="bg-slate-900/50 border-slate-800 mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-400 mr-2">Indicators:</span>
              
              <button
                onClick={() => toggleIndicator('sma20')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.sma20
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                SMA(20)
              </button>
              
              <button
                onClick={() => toggleIndicator('sma50')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.sma50
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                SMA(50)
              </button>
              
              <button
                onClick={() => toggleIndicator('ema12')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.ema12
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                EMA(12)
              </button>
              
              <button
                onClick={() => toggleIndicator('ema26')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.ema26
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                EMA(26)
              </button>
              
              <button
                onClick={() => toggleIndicator('bb')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.bb
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Bollinger Bands
              </button>
              
              <button
                onClick={() => toggleIndicator('rsi')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.rsi
                    ? 'bg-pink-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                RSI(14)
              </button>
              
              <button
                onClick={() => toggleIndicator('macd')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                  indicators.macd
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                MACD
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Main Chart */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-0">
            <div className="w-full h-[600px]">
              <iframe
                src={`https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=CRYPTO:${selectedPair.replace('X:', '').replace('USD', 'USD')}&interval=${timeframe.label === '1m' ? '1' : timeframe.label === '5m' ? '5' : timeframe.label === '15m' ? '15' : timeframe.label === '30m' ? '30' : timeframe.label === '1h' ? '60' : timeframe.label === '6h' ? '360' : 'D'}&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0A0A0F&studies=${indicators.sma20 || indicators.sma50 || indicators.ema12 || indicators.ema26 || indicators.bb || indicators.rsi || indicators.macd ? 
                  JSON.stringify([
                    indicators.sma20 && 'MASimple@tv-basicstudies',
                    indicators.sma50 && 'MASimple@tv-basicstudies',
                    indicators.ema12 && 'MAExp@tv-basicstudies',
                    indicators.ema26 && 'MAExp@tv-basicstudies',
                    indicators.bb && 'BB@tv-basicstudies',
                    indicators.rsi && 'RSI@tv-basicstudies',
                    indicators.macd && 'MACD@tv-basicstudies'
                  ].filter(Boolean)) : '[]'}&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&locale=en`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="TradingView Chart"
              />
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
                        fill="#3b82f6"
                        fillOpacity={0.3}
                        radius={[2, 2, 0, 0]}
                      />
                      
                      {/* Candlestick wicks */}
                      <Bar 
                        yAxisId="price"
                        dataKey={entry => [entry.low, entry.high]}
                        barSize={1}
                      >
                        {candleData.map((entry, index) => (
                          <Cell 
                            key={`wick-${index}`}
                            fill={entry.isGreen ? '#10b981' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                      
                      {/* Candlestick bodies */}
                      <Bar 
                        yAxisId="price"
                        dataKey={entry => [Math.min(entry.open, entry.close), Math.max(entry.open, entry.close)]}
                        barSize={10}
                      >
                        {candleData.map((entry, index) => (
                          <Cell 
                            key={`body-${index}`}
                            fill={entry.isGreen ? '#10b981' : '#ef4444'}
                          />
                        ))}
                      </Bar>

                      {/* Technical Indicators */}
                      {indicators.sma20 && (
                        <Line 
                          yAxisId="price"
                          type="monotone"
                          data={candleData.map((d, i) => ({ ...d, sma20: indicatorData.sma20?.[i] }))}
                          dataKey="sma20"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          name="SMA(20)"
                        />
                      )}

                      {indicators.sma50 && (
                        <Line 
                          yAxisId="price"
                          type="monotone"
                          data={candleData.map((d, i) => ({ ...d, sma50: indicatorData.sma50?.[i] }))}
                          dataKey="sma50"
                          stroke="#fb923c"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          name="SMA(50)"
                        />
                      )}

                      {indicators.ema12 && (
                        <Line 
                          yAxisId="price"
                          type="monotone"
                          data={candleData.map((d, i) => ({ ...d, ema12: indicatorData.ema12?.[i] }))}
                          dataKey="ema12"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          name="EMA(12)"
                        />
                      )}

                      {indicators.ema26 && (
                        <Line 
                          yAxisId="price"
                          type="monotone"
                          data={candleData.map((d, i) => ({ ...d, ema26: indicatorData.ema26?.[i] }))}
                          dataKey="ema26"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          name="EMA(26)"
                        />
                      )}

                      {indicators.bb && (
                        <>
                          <Line 
                            yAxisId="price"
                            type="monotone"
                            data={candleData.map((d, i) => ({ ...d, bbUpper: indicatorData.bbUpper?.[i] }))}
                            dataKey="bbUpper"
                            stroke="#a855f7"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={false}
                            connectNulls
                            name="BB Upper"
                          />
                          <Line 
                            yAxisId="price"
                            type="monotone"
                            data={candleData.map((d, i) => ({ ...d, bbMiddle: indicatorData.bbMiddle?.[i] }))}
                            dataKey="bbMiddle"
                            stroke="#a855f7"
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                            name="BB Middle"
                          />
                          <Line 
                            yAxisId="price"
                            type="monotone"
                            data={candleData.map((d, i) => ({ ...d, bbLower: indicatorData.bbLower?.[i] }))}
                            dataKey="bbLower"
                            stroke="#a855f7"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={false}
                            connectNulls
                            name="BB Lower"
                          />
                        </>
                      )}
                    </ComposedChart>
                  </div>

                  {/* OHLCV Stats */}
                  <div className="grid grid-cols-5 gap-3 p-4"
                {indicators.rsi && indicatorData.rsi && (
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-white mb-2">RSI(14)</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <ComposedChart data={candleData.map((d, i) => ({ ...d, rsi: indicatorData.rsi[i] }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} interval={Math.floor(candleData.length / 15)} />
                        <YAxis domain={[0, 100]} stroke="#64748b" tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="rsi" stroke="#ec4899" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey={() => 70} stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                        <Line type="monotone" dataKey={() => 30} stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* MACD Chart */}
                {indicators.macd && indicatorData.macdLine && (
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-white mb-2">MACD</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <ComposedChart data={candleData.map((d, i) => ({ 
                        ...d, 
                        macd: indicatorData.macdLine[i],
                        signal: indicatorData.macdSignal[i],
                        histogram: indicatorData.macdHistogram[i]
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} interval={Math.floor(candleData.length / 15)} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="histogram" fill="#3b82f6" fillOpacity={0.6} />
                        <Line type="monotone" dataKey="macd" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="signal" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* OHLCV Stats */}
                <div className="grid grid-cols-5 gap-3 mt-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">C</div>
                    <div className="text-sm font-semibold text-white">
                      ${currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Change</div>
                    <div className={`text-sm font-semibold ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </div>
                  </div>
                  </div>
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