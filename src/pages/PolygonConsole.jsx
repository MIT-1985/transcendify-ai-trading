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

export default function PolygonConsole() {
  const [selectedPair, setSelectedPair] = useState('X:BTCUSD');
  const [candleData, setCandleData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [loading, setLoading] = useState(true);

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
            wickTop: candle.h,
            wickBottom: candle.l,
            candleTop: Math.max(candle.o, candle.c),
            candleBottom: Math.min(candle.o, candle.c),
            isGreen: candle.c >= candle.o
          }));

          setCandleData(candles);
          
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            const first = candles[0];
            setCurrentPrice(last.close);
            setPriceChange(((last.close - first.open) / first.open) * 100);
          }
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

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Live Trading Charts</h1>
            <p className="text-slate-400">Real-time Polygon.io data</p>
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
              <div className="text-sm text-slate-500 mb-1">
                {selectedPair.replace('X:', '').replace('USD', '/USD')}
              </div>
              <div className="text-4xl font-bold mb-2">
                ${currentPrice.toFixed(2)}
              </div>
              <div className={`flex items-center gap-2 text-lg ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
              Live Data
            </Badge>
          </div>
        </div>

        {/* Main Chart */}
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
                Loading real-time data from Polygon...
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={500}>
                  <ComposedChart data={candleData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#64748b" 
                      tick={{ fontSize: 11 }}
                      interval={Math.floor(candleData.length / 12)}
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      formatter={(value) => `$${value.toFixed(2)}`}
                    />
                    
                    {/* Wicks */}
                    <Bar dataKey="high" stackId="wick" barSize={1}>
                      {candleData.map((entry, index) => (
                        <Cell 
                          key={`wick-${index}`}
                          fill={entry.isGreen ? '#10b981' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                    
                    {/* Candle bodies */}
                    <Bar dataKey="candleTop" stackId="candle" barSize={12}>
                      {candleData.map((entry, index) => (
                        <Cell 
                          key={`candle-${index}`}
                          fill={entry.isGreen ? '#10b981' : '#ef4444'}
                          fillOpacity={0.9}
                        />
                      ))}
                    </Bar>
                    
                    {/* SMA 20 */}
                    <Line 
                      type="monotone" 
                      dataKey="close"
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>

                {/* OHLC Stats */}
                <div className="grid grid-cols-4 gap-3 mt-6">
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick Price Grid */}
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-4">Market Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CRYPTO_PAIRS.map(pair => (
              <QuickPriceCard key={pair} symbol={pair} onSelect={setSelectedPair} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickPriceCard({ symbol, onSelect }) {
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
    <Card 
      className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer"
      onClick={() => onSelect(symbol)}
    >
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