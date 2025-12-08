import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Scatter } from 'recharts';
import { TrendingUp, TrendingDown, Activity, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const CustomTooltip = ({ active, payload }) => {
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
          <span className="text-blue-400 font-semibold">{data.volume?.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default function CandlestickChart({ symbol = 'X:BTCUSD', trades = [] }) {
  const [chartData, setChartData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [sma20, setSma20] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeMarkers, setTradeMarkers] = useState([]);

  const calculateSMA = (values, period) => {
    const result = [];
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const now = Date.now();
        const fromMs = now - (100 * 60 * 60 * 1000); // 100 hours
        const from = new Date(fromMs).toISOString().split('T')[0];
        const to = new Date(now).toISOString().split('T')[0];

        console.log('Fetching chart data for', symbol, 'from', from, 'to', to);

        const response = await base44.functions.invoke('polygonMarketData', {
          action: 'aggregates',
          symbol: symbol,
          from: from,
          to: to,
          timespan: 'hour',
          multiplier: 1,
          limit: 100
        });

        console.log('Chart API response:', response.data);

        if (response.data?.success && response.data.data?.results) {
          const results = response.data.data.results;
          console.log('Got', results.length, 'candles');
          const candles = results.map(candle => {
            const time = new Date(candle.t);
            return {
              time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
            };
          });

          setChartData(candles);
          if (candles.length > 0) {
            setCurrentPrice(candles[candles.length - 1].close);
            setPriceChange(((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100);
            
            const closes = candles.map(c => c.close);
            const sma = calculateSMA(closes, 20);
            setSma20(sma);
            console.log('Chart updated with real data, price:', candles[candles.length - 1].close);
            
            // Map trades to chart
            if (trades && trades.length > 0) {
              const markers = trades.map(trade => {
                const tradeTime = new Date(trade.timestamp).getTime();
                const candle = candles.find(c => Math.abs(c.timestamp - tradeTime) < 3600000); // Within 1 hour
                if (candle) {
                  return {
                    time: candle.time,
                    price: trade.price,
                    side: trade.side,
                    profit: trade.profit_loss
                  };
                }
                return null;
              }).filter(m => m !== null);
              setTradeMarkers(markers);
            }
          }
        } else {
          console.error('No results in response:', response.data);
        }
      } catch (error) {
        console.error('Error fetching chart data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRealData();
  }, [symbol, trades]);

  if (loading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6">
          <div className="text-center text-slate-400">Loading real-time data...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              {symbol} Chart
            </CardTitle>
            <div className="flex items-center gap-3 mt-2">
              <div className="text-2xl font-bold text-white">
                ${currentPrice.toFixed(2)}
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {priceChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="text-xs text-slate-400">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-500 rounded" />
                <span>Bullish</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500/30 border border-red-500 rounded" />
                <span>Bearish</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              tick={{ fontSize: 10 }}
              interval={Math.floor(chartData.length / 10)}
            />
            <YAxis 
              domain={['auto', 'auto']} 
              stroke="#64748b"
              tick={{ fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Candlesticks */}
            <Bar 
              dataKey="high"
              shape={(props) => {
                const { x, width, payload } = props;
                if (!payload || !payload.high) return null;
                
                const yScale = props.yAxisMap?.yAxis?.scale;
                if (!yScale) return null;
                
                const highY = yScale(payload.high);
                const lowY = yScale(payload.low);
                const openY = yScale(payload.open);
                const closeY = yScale(payload.close);
                
                const centerX = x + width / 2;
                const bodyWidth = Math.max(6, Math.min(10, 600 / chartData.length));
                const bodyX = centerX - bodyWidth / 2;
                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.abs(closeY - openY) || 1;
                
                return (
                  <g>
                    {/* Wick */}
                    <line
                      x1={centerX}
                      y1={highY}
                      x2={centerX}
                      y2={lowY}
                      stroke={payload.isGreen ? '#10b981' : '#ef4444'}
                      strokeWidth={1.5}
                    />
                    {/* Body */}
                    <rect
                      x={bodyX}
                      y={bodyTop}
                      width={bodyWidth}
                      height={bodyHeight}
                      fill={payload.isGreen ? '#10b981' : '#ef4444'}
                      stroke={payload.isGreen ? '#059669' : '#dc2626'}
                      strokeWidth={1}
                    />
                  </g>
                );
              }}
            >
              {chartData.map((entry, index) => (
                <Cell key={`candle-${index}`} />
              ))}
            </Bar>
            
            {/* SMA Line */}
            <Line 
              type="monotone" 
              data={chartData.map((d, i) => ({ ...d, sma: sma20[i] }))}
              dataKey="sma" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
              connectNulls
            />

            {/* Trade Markers */}
            {tradeMarkers.length > 0 && (
              <Scatter 
                data={tradeMarkers} 
                dataKey="price"
                shape={(props) => {
                  const { cx, cy, payload } = props;
                  const isBuy = payload.side === 'BUY';
                  const isProfit = payload.profit >= 0;
                  return (
                    <g>
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={8} 
                        fill={isBuy ? '#10b981' : '#ef4444'}
                        opacity={0.8}
                      />
                      {isBuy ? (
                        <path 
                          d={`M ${cx} ${cy - 3} L ${cx} ${cy + 3} M ${cx - 3} ${cy} L ${cx + 3} ${cy}`} 
                          stroke="white" 
                          strokeWidth={2}
                        />
                      ) : (
                        <path 
                          d={`M ${cx - 3} ${cy} L ${cx + 3} ${cy}`} 
                          stroke="white" 
                          strokeWidth={2}
                        />
                      )}
                    </g>
                  );
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        
        {/* Technical Indicators */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">SMA(20)</div>
            <div className="text-white font-semibold">
              ${sma20[sma20.length - 1]?.toFixed(2) || '-'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">24h High</div>
            <div className="text-emerald-400 font-semibold">
              ${chartData.length > 0 ? Math.max(...chartData.map(c => c.high)).toFixed(2) : '-'}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">24h Low</div>
            <div className="text-red-400 font-semibold">
              ${chartData.length > 0 ? Math.min(...chartData.map(c => c.low)).toFixed(2) : '-'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}