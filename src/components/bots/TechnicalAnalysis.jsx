import { base44 } from '@/api/base44Client';

// Crypto/Forex Constants
const CONSTANTS = {
  // Forex
  STANDARD_LOT: 100000,
  MINI_LOT: 10000,
  MICRO_LOT: 1000,
  PIP_STANDARD: 0.0001,
  PIP_JPY: 0.01,
  
  // Bitcoin
  BTC_BLOCK_INTERVAL: 600, // 10 minutes
  
  // Ethereum
  WEI_PER_ETH: 1e18,
  GWEI_PER_ETH: 1e9,
  
  // Technical Analysis
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 70,
  BOLLINGER_STD: 2,
  
  // Benford's Law for first digit distribution validation
  BENFORD: {
    1: 0.30103, 2: 0.17609, 3: 0.12494, 4: 0.09691, 5: 0.07918,
    6: 0.06695, 7: 0.05799, 8: 0.05115, 9: 0.04576
  }
};

// Fetch real candle data from Polygon
export async function fetchCandles(symbol, timespan = 'minute', multiplier = 5, limit = 100) {
  try {
    const now = Date.now();
    const from = now - (limit * multiplier * 60 * 1000);
    
    const response = await base44.functions.invoke('polygonMarketData', {
      action: 'aggregates',
      symbol: symbol,
      multiplier: multiplier,
      timespan: timespan,
      from: from,
      to: now
    });

    if (response.data?.success && response.data.data?.results) {
      return response.data.data.results.map(bar => ({
        time: bar.t,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v
      }));
    }
    return [];
  } catch (error) {
    console.error('Error fetching candles:', error);
    return [];
  }
}

// Calculate Simple Moving Average
export function calculateSMA(candles, period) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return sum / period;
}

// Calculate Exponential Moving Average
export function calculateEMA(candles, period) {
  if (candles.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0) / period;
  
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }
  return ema;
}

// Calculate Relative Strength Index
export function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  
  for (let i = candles.length - period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate MACD
export function calculateMACD(candles) {
  const ema12 = calculateEMA(candles, 12);
  const ema26 = calculateEMA(candles, 26);
  if (!ema12 || !ema26) return null;
  
  const macd = ema12 - ema26;
  return { macd, ema12, ema26 };
}

// Calculate Bollinger Bands
export function calculateBollingerBands(candles, period = 20, stdDev = 2) {
  if (candles.length < period) return null;
  
  const sma = calculateSMA(candles, period);
  if (!sma) return null;
  
  const slice = candles.slice(-period);
  const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: sma + (std * stdDev),
    middle: sma,
    lower: sma - (std * stdDev)
  };
}

// Analyze trading opportunity based on strategy
export async function analyzeStrategy(symbol, strategy) {
  const candles = await fetchCandles(symbol, 'minute', 5, 100);
  if (candles.length < 20) return { signal: 'HOLD', confidence: 0 };
  
  const currentPrice = candles[candles.length - 1].close;
  const rsi = calculateRSI(candles);
  const macd = calculateMACD(candles);
  const bb = calculateBollingerBands(candles);
  const sma20 = calculateSMA(candles, 20);
  const sma50 = calculateSMA(candles, 50);
  
  let signal = 'HOLD';
  let confidence = 0;
  let targetPrice = currentPrice;
  
  switch (strategy) {
    case 'scalping':
      // Fast scalping based on RSI + Bollinger Bands
      if (rsi < CONSTANTS.RSI_OVERSOLD && currentPrice < bb.lower) {
        signal = 'BUY';
        confidence = 0.75;
        targetPrice = bb.middle;
      } else if (rsi > CONSTANTS.RSI_OVERBOUGHT && currentPrice > bb.upper) {
        signal = 'SELL';
        confidence = 0.75;
        targetPrice = bb.middle;
      }
      break;
      
    case 'swing':
      // Swing trading based on SMA crossovers
      if (sma20 > sma50 && currentPrice > sma20) {
        signal = 'BUY';
        confidence = 0.70;
        targetPrice = currentPrice * 1.02;
      } else if (sma20 < sma50 && currentPrice < sma20) {
        signal = 'SELL';
        confidence = 0.70;
        targetPrice = currentPrice * 0.98;
      }
      break;
      
    case 'momentum':
      // Momentum based on MACD
      if (macd && macd.macd > 0 && rsi > 50 && rsi < 70) {
        signal = 'BUY';
        confidence = 0.80;
        targetPrice = currentPrice * 1.025;
      } else if (macd && macd.macd < 0 && rsi < 50 && rsi > 30) {
        signal = 'SELL';
        confidence = 0.80;
        targetPrice = currentPrice * 0.975;
      }
      break;
      
    case 'grid':
      // Grid trading - buy on dips, sell on rises
      const priceChange = ((currentPrice - candles[candles.length - 10].close) / candles[candles.length - 10].close) * 100;
      if (priceChange < -1) {
        signal = 'BUY';
        confidence = 0.65;
        targetPrice = currentPrice * 1.01;
      } else if (priceChange > 1) {
        signal = 'SELL';
        confidence = 0.65;
        targetPrice = currentPrice * 0.99;
      }
      break;
      
    case 'dca':
      // Dollar Cost Averaging - regular buys regardless of price
      signal = 'BUY';
      confidence = 0.60;
      targetPrice = currentPrice * 1.015;
      break;
      
    case 'arbitrage':
      // Simple mean reversion
      if (currentPrice < bb.lower) {
        signal = 'BUY';
        confidence = 0.85;
        targetPrice = bb.middle;
      } else if (currentPrice > bb.upper) {
        signal = 'SELL';
        confidence = 0.85;
        targetPrice = bb.middle;
      }
      break;
  }
  
  return {
    signal,
    confidence,
    currentPrice,
    targetPrice,
    indicators: {
      rsi: rsi?.toFixed(2),
      macd: macd?.macd.toFixed(2),
      bb_upper: bb?.upper.toFixed(2),
      bb_lower: bb?.lower.toFixed(2),
      sma20: sma20?.toFixed(2),
      sma50: sma50?.toFixed(2)
    },
    candles: candles.slice(-5) // Last 5 candles for reference
  };
}

// Validate trade distribution using Benford's Law
export function validateTradeDistribution(trades) {
  if (trades.length < 30) return { valid: true, reason: 'Not enough data' };
  
  const firstDigits = trades
    .map(t => Math.abs(t.profit_loss))
    .filter(v => v > 0)
    .map(v => parseInt(v.toString()[0]));
  
  const distribution = {};
  for (let d = 1; d <= 9; d++) {
    distribution[d] = firstDigits.filter(fd => fd === d).length / firstDigits.length;
  }
  
  // Chi-square test against Benford's Law
  let chiSquare = 0;
  for (let d = 1; d <= 9; d++) {
    const expected = CONSTANTS.BENFORD[d] * firstDigits.length;
    const observed = firstDigits.filter(fd => fd === d).length;
    chiSquare += Math.pow(observed - expected, 2) / expected;
  }
  
  // Critical value for 8 degrees of freedom at 95% confidence is ~15.51
  const isValid = chiSquare < 15.51;
  
  return {
    valid: isValid,
    chiSquare: chiSquare.toFixed(2),
    reason: isValid ? 'Distribution follows Benford\'s Law' : 'Suspicious distribution detected'
  };
}

export { CONSTANTS };