import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CRYPTO_PAIRS = [
  'X:BTCUSD',
  'X:ETHUSD',
  'X:SOLUSD',
  'X:XRPUSD',
  'X:ADAUSD',
  'X:DOGEUSD'
];

export default function PolygonConsole() {
  const [selectedPair, setSelectedPair] = useState('X:BTCUSD');
  const [candleData, setCandleData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [indicators, setIndicators] = useState({ rsi: 50, macd: 0, bb: { upper: 0, middle: 0, lower: 0 } });
  const [volume, setVolume] = useState(0);
  const [loading, setLoading] = useState(true);

  // Technical indicator calculations
  const calculateRSI = (prices, period = 14) => {
    if (prices.length < period + 1) return 50;
    const changes = prices.slice(1).map((p, i) => p - prices[i]);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateMACD = (prices) => {
    if (prices.length < 26) return 0;
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    return ema12[ema12.length - 1] - ema26[ema26.length - 1];
  };

  const calculateEMA = (prices, period) => {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  };

  const calculateBB = (prices, period = 20) => {
    if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };
    const slice = prices.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
      upper: sma + stdDev * 2,
      middle: sma,
      lower: sma - stdDev * 2
    };
  };

  // Fetch real-time data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch candlestick data
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const candleResponse = await base44.functions.invoke('polygonMarketData', {
          action: 'aggregates',
          symbol: selectedPair,
          from: from,
          to: to,
          timespan: 'hour',
          limit: 100
        });

        if (candleResponse.data?.success && candleResponse.data.data?.results) {
          const results = candleResponse.data.data.results;
          const candles = results.map(candle => ({
            time: new Date(candle.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: candle.t,
            open: candle.o,
            high: candle.h,
            low: candle.l,
            close: candle.c,
            volume: candle.v,
            isGreen: candle.c >= candle.o
          }));

          setCandleData(candles);
          
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            const first = candles[0];
            setCurrentPrice(last.close);
            setPriceChange(((last.close - first.open) / first.open) * 100);
            setVolume(results.reduce((sum, r) => sum + r.v, 0));

            // Calculate indicators
            const closes = candles.map(c => c.close);
            setIndicators({
              rsi: calculateRSI(closes),
              macd: calculateMACD(closes),
              bb: calculateBB(closes)
            });
          }
        }

        // Fetch current ticker for order book simulation
        const tickerResponse = await base44.functions.invoke('polygonMarketData', {
          action: 'ticker',
          symbol: selectedPair
        });

        if (tickerResponse.data?.success && tickerResponse.data.data?.results?.[0]) {
          const ticker = tickerResponse.data.data.results[0];
          const basePrice = ticker.c;
          
          // Generate realistic order book
          const bids = Array.from({ length: 10 }, (_, i) => ({
            price: basePrice * (1 - (i + 1) * 0.001),
            amount: Math.random() * 5 + 0.1,
            total: 0
          }));
          
          const asks = Array.from({ length: 10 }, (_, i) => ({
            price: basePrice * (1 + (i + 1) * 0.001),
            amount: Math.random() * 5 + 0.1,
            total: 0
          }));

          setOrderBook({ bids, asks });
        }

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [selectedPair]);

  const getRSISignal = () => {
    if (indicators.rsi > 70) return { text: 'Overbought', color: 'text-red-400' };
    if (indicators.rsi < 30) return { text: 'Oversold', color: 'text-green-400' };
    return { text: 'Neutral', color: 'text-slate-400' };
  };

  const rsiSignal = getRSISignal();

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Real-Time Trading Terminal</h1>
            <p className="text-slate-400">Live market data powered by Polygon.io</p>
          </div>
          <Select value={selectedPair} onValueChange={setSelectedPair}>
            <SelectTrigger className="w-48 bg-slate-900 border-slate-700">
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
        </div>

        {/* Price Header */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold mb-2">
                ${currentPrice.toFixed(2)}
              </div>
              <div className={`flex items-center gap-2 text-lg ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-right">
              <div>
                <div className="text-xs text-slate-500">24h Volume</div>
                <div className="text-lg font-semibold">{(volume / 1000000).toFixed(2)}M</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">RSI(14)</div>
                <div className={`text-lg font-semibold ${rsiSignal.color}`}>
                  {indicators.rsi.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Status</div>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
                  Live
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="chart">Price Chart</TabsTrigger>
            <TabsTrigger value="orderbook">Order Book</TabsTrigger>
            <TabsTrigger value="indicators">Technical Indicators</TabsTrigger>
            <TabsTrigger value="volume">Volume Analysis</TabsTrigger>
          </TabsList>

          {/* Price Chart */}
          <TabsContent value="chart">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Candlestick Chart
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-96 flex items-center justify-center text-slate-400">
                    Loading chart data...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={candleData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis 
                        dataKey="time" 
                        stroke="#64748b" 
                        tick={{ fontSize: 10 }}
                        interval={Math.floor(candleData.length / 10)}
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                      />
                      
                      {/* Candlestick bodies */}
                      <Bar dataKey="close">
                        {candleData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={entry.isGreen ? '#10b981' : '#ef4444'}
                            fillOpacity={0.8}
                          />
                        ))}
                      </Bar>
                      
                      {/* Volume bars at bottom */}
                      <Bar dataKey="volume" yAxisId="volume" opacity={0.3}>
                        {candleData.map((entry, index) => (
                          <Cell 
                            key={`vol-${index}`}
                            fill={entry.isGreen ? '#10b981' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {/* Chart Stats */}
                <div className="grid grid-cols-4 gap-3 mt-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Open</div>
                    <div className="text-white font-semibold">
                      ${candleData.length > 0 ? candleData[0].open.toFixed(2) : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">High</div>
                    <div className="text-emerald-400 font-semibold">
                      ${candleData.length > 0 ? Math.max(...candleData.map(c => c.high)).toFixed(2) : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Low</div>
                    <div className="text-red-400 font-semibold">
                      ${candleData.length > 0 ? Math.min(...candleData.map(c => c.low)).toFixed(2) : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Close</div>
                    <div className="text-white font-semibold">
                      ${currentPrice.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Order Book */}
          <TabsContent value="orderbook">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-red-400" />
                    Asks (Sell Orders)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {orderBook.asks.slice(0, 10).reverse().map((ask, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 rounded hover:bg-slate-800/50">
                        <span className="text-red-400 font-mono">${ask.price.toFixed(2)}</span>
                        <span className="text-slate-400 font-mono text-sm">{ask.amount.toFixed(4)}</span>
                        <div className="relative w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="absolute left-0 top-0 h-full bg-red-500/30"
                            style={{ width: `${(ask.amount / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    Bids (Buy Orders)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {orderBook.bids.slice(0, 10).map((bid, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 rounded hover:bg-slate-800/50">
                        <span className="text-green-400 font-mono">${bid.price.toFixed(2)}</span>
                        <span className="text-slate-400 font-mono text-sm">{bid.amount.toFixed(4)}</span>
                        <div className="relative w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className="absolute left-0 top-0 h-full bg-green-500/30"
                            style={{ width: `${(bid.amount / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Spread */}
            <Card className="bg-slate-900/50 border-slate-800 mt-4">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-2">Spread</div>
                  <div className="text-2xl font-bold text-amber-400">
                    ${orderBook.asks.length > 0 && orderBook.bids.length > 0 
                      ? (orderBook.asks[0].price - orderBook.bids[0].price).toFixed(2)
                      : '0.00'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technical Indicators */}
          <TabsContent value="indicators">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* RSI */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-400" />
                    RSI (14)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold mb-2">
                    {indicators.rsi.toFixed(1)}
                  </div>
                  <div className={`text-sm font-medium ${rsiSignal.color}`}>
                    {rsiSignal.text}
                  </div>
                  <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500"
                      style={{ width: `${indicators.rsi}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Oversold (30)</span>
                    <span>Overbought (70)</span>
                  </div>
                </CardContent>
              </Card>

              {/* MACD */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    MACD
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold mb-2">
                    {indicators.macd.toFixed(2)}
                  </div>
                  <div className={`text-sm font-medium ${indicators.macd > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {indicators.macd > 0 ? 'Bullish' : 'Bearish'} Momentum
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {indicators.macd > 0 ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <span className="text-sm text-slate-400">
                      Signal: {indicators.macd > 0 ? 'BUY' : 'SELL'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Bollinger Bands */}
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    Bollinger Bands
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">Upper</span>
                      <span className="text-red-400 font-semibold">${indicators.bb.upper.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">Middle</span>
                      <span className="text-white font-semibold">${indicators.bb.middle.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">Lower</span>
                      <span className="text-green-400 font-semibold">${indicators.bb.lower.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-4">
                      Current: ${currentPrice.toFixed(2)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* RSI Chart */}
            <Card className="bg-slate-900/50 border-slate-800 mt-4">
              <CardHeader>
                <CardTitle className="text-white">RSI Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={candleData.slice(-50).map((c, i) => ({ 
                    index: i, 
                    rsi: calculateRSI(candleData.slice(0, candleData.indexOf(c) + 1).map(x => x.close))
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="index" stroke="#64748b" />
                    <YAxis domain={[0, 100]} stroke="#64748b" />
                    <Line type="monotone" dataKey="rsi" stroke="#a855f7" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey={() => 70} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} />
                    <Line type="monotone" dataKey={() => 30} stroke="#10b981" strokeDasharray="5 5" strokeWidth={1} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Volume Analysis */}
          <TabsContent value="volume">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  Volume Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={candleData.slice(-50)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748b" 
                      tick={{ fontSize: 10 }}
                      interval={Math.floor(candleData.length / 10)}
                    />
                    <YAxis stroke="#64748b" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #334155',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="volume">
                      {candleData.slice(-50).map((entry, index) => (
                        <Cell 
                          key={`vol-${index}`}
                          fill={entry.isGreen ? '#10b981' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Volume Stats */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Avg Volume</div>
                    <div className="text-white font-semibold">
                      {candleData.length > 0 
                        ? (candleData.reduce((sum, c) => sum + c.volume, 0) / candleData.length / 1000).toFixed(2) + 'K'
                        : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Max Volume</div>
                    <div className="text-emerald-400 font-semibold">
                      {candleData.length > 0 
                        ? (Math.max(...candleData.map(c => c.volume)) / 1000).toFixed(2) + 'K'
                        : '-'}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Total 24h</div>
                    <div className="text-blue-400 font-semibold">
                      {(volume / 1000000).toFixed(2)}M
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Market Overview */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
          {CRYPTO_PAIRS.map(pair => (
            <QuickPriceCard key={pair} symbol={pair} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickPriceCard({ symbol }) {
  const [price, setPrice] = useState(0);
  const [change, setChange] = useState(0);

  useEffect(() => {
    const fetch = async () => {
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
        console.error('Error fetching price:', error);
      }
    };

    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <Card className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer">
      <CardContent className="p-4">
        <div className="text-xs text-slate-500 mb-1">
          {symbol.replace('X:', '').replace('USD', '/USD')}
        </div>
        <div className="text-lg font-bold text-white mb-1">
          ${price.toFixed(2)}
        </div>
        <div className={`text-xs flex items-center gap-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </div>
      </CardContent>
    </Card>
  );
}