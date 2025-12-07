import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function TechnicalIndicators({ symbol = 'X:BTCUSD' }) {
  const [indicators, setIndicators] = useState({
    rsi: 50,
    rsiData: [],
    macd: { value: 0, signal: 0, histogram: 0, data: [] },
    bollingerBands: { upper: 0, middle: 0, lower: 0 }
  });
  const [loading, setLoading] = useState(true);

  const calculateRSI = (prices, period = 14) => {
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateMACD = (prices) => {
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
    
    const macdValues = ema12.map((val, i) => val - ema26[i]);
    const signal = calculateEMA(macdValues, 9);
    const signalValue = signal[signal.length - 1];
    
    return {
      value: macdLine,
      signal: signalValue,
      histogram: macdLine - signalValue
    };
  };

  const calculateEMA = (prices, period) => {
    const k = 2 / (period + 1);
    const emaArray = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      emaArray.push(prices[i] * k + emaArray[i - 1] * (1 - k));
    }
    
    return emaArray;
  };

  const calculateBollingerBands = (prices, period = 20) => {
    const sma = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
    const squaredDiffs = prices.slice(-period).map(p => Math.pow(p - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + (stdDev * 2),
      middle: sma,
      lower: sma - (stdDev * 2)
    };
  };

  useEffect(() => {
    const fetchIndicators = async () => {
      try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const response = await base44.functions.invoke('polygonMarketData', {
          action: 'aggregates',
          symbol: symbol,
          from: from,
          to: to,
          timespan: 'hour',
          limit: 100
        });

        if (response.data?.success && response.data.data?.results) {
          const results = response.data.data.results;
          const closes = results.map(r => r.c);

          const rsi = calculateRSI(closes);
          const rsiHistory = closes.slice(-20).map((_, idx) => ({
            index: idx,
            rsi: calculateRSI(closes.slice(0, closes.length - 20 + idx + 1))
          }));

          const macd = calculateMACD(closes);
          const bollingerBands = calculateBollingerBands(closes);

          setIndicators({
            rsi,
            rsiData: rsiHistory,
            macd,
            bollingerBands
          });
        }
      } catch (error) {
        console.error('Error fetching indicators:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchIndicators();
    const interval = setInterval(fetchIndicators, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-6">
          <div className="text-center text-slate-400">Loading indicators...</div>
        </CardContent>
      </Card>
    );
  }

  const getRSISignal = (rsi) => {
    if (rsi > 70) return { text: 'Overbought', color: 'text-red-400', bg: 'bg-red-500/20' };
    if (rsi < 30) return { text: 'Oversold', color: 'text-green-400', bg: 'bg-green-500/20' };
    return { text: 'Neutral', color: 'text-slate-400', bg: 'bg-slate-500/20' };
  };

  const getMACDSignal = (macd) => {
    if (macd.histogram > 0) return { text: 'Bullish', color: 'text-green-400' };
    return { text: 'Bearish', color: 'text-red-400' };
  };

  const rsiSignal = getRSISignal(indicators.rsi);
  const macdSignal = getMACDSignal(indicators.macd);

  return (
    <div className="space-y-4">
      {/* RSI */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-400" />
            RSI (Relative Strength Index)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-3xl font-bold text-white mb-1">
                {indicators.rsi.toFixed(1)}
              </div>
              <div className={`text-sm ${rsiSignal.color}`}>{rsiSignal.text}</div>
            </div>
            <div className="flex items-center justify-end">
              <div className={`px-3 py-1 rounded-lg ${rsiSignal.bg}`}>
                <span className={`text-sm font-medium ${rsiSignal.color}`}>
                  {indicators.rsi > 70 ? 'SELL Signal' : indicators.rsi < 30 ? 'BUY Signal' : 'HOLD'}
                </span>
              </div>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={indicators.rsiData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="index" stroke="#64748b" hide />
              <YAxis domain={[0, 100]} stroke="#64748b" />
              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
              <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="rsi" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* MACD */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            MACD (Moving Average Convergence Divergence)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">MACD Line</div>
              <div className="text-lg font-bold text-white">
                {indicators.macd.value.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Signal Line</div>
              <div className="text-lg font-bold text-white">
                {indicators.macd.signal.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Histogram</div>
              <div className={`text-lg font-bold ${indicators.macd.histogram > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {indicators.macd.histogram.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            {indicators.macd.histogram > 0 ? (
              <TrendingUp className="w-5 h-5 text-green-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
            <span className={`text-sm font-medium ${macdSignal.color}`}>
              {macdSignal.text} Momentum
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Bollinger Bands */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            Bollinger Bands
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Upper Band</div>
              <div className="text-lg font-bold text-red-400">
                ${indicators.bollingerBands.upper.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Middle (SMA)</div>
              <div className="text-lg font-bold text-white">
                ${indicators.bollingerBands.middle.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Lower Band</div>
              <div className="text-lg font-bold text-green-400">
                ${indicators.bollingerBands.lower.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400">
            Price touching upper band may indicate overbought conditions. Lower band touch may signal oversold.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}