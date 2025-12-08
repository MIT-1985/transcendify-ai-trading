import { base44 } from '@/api/base44Client';
import calculateStochasticRSI from './StochasticRSI';

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
  const sum = slice.reduce((acc, c) => acc + (typeof c === 'number' ? c : c.close), 0);
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

// Calculate MACD with signal line and histogram
export function calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const ema12 = calculateEMA(candles, fastPeriod);
  const ema26 = calculateEMA(candles, slowPeriod);
  if (!ema12 || !ema26) return null;
  
  const macdLine = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const macdHistory = [];
  for (let i = Math.max(fastPeriod, slowPeriod); i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const e12 = calculateEMA(slice, fastPeriod);
    const e26 = calculateEMA(slice, slowPeriod);
    if (e12 && e26) macdHistory.push({ close: e12 - e26 });
  }
  
  const signalLine = macdHistory.length >= signalPeriod ? calculateEMA(macdHistory, signalPeriod) : macdLine;
  const histogram = macdLine - (signalLine || macdLine);
  
  // Determine crossover signal
  let crossoverSignal = 'HOLD';
  if (histogram > 0 && macdLine > 0) crossoverSignal = 'BUY';
  else if (histogram < 0 && macdLine < 0) crossoverSignal = 'SELL';
  
  return { 
    macd: macdLine, 
    signal: signalLine,
    histogram,
    crossoverSignal,
    strength: Math.abs(histogram)
  };
}

// Calculate Bollinger Bands with %B and bandwidth
export function calculateBollingerBands(candles, period = 20, stdDev = 2) {
  if (candles.length < period) return null;
  
  const sma = calculateSMA(candles, period);
  if (!sma) return null;
  
  const slice = candles.slice(-period);
  const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = sma + (std * stdDev);
  const middle = sma;
  const lower = sma - (std * stdDev);
  const currentPrice = candles[candles.length - 1].close;
  
  // %B indicator (0-1 range, shows where price is within bands)
  const percentB = (currentPrice - lower) / (upper - lower);
  
  // Bandwidth (volatility indicator)
  const bandwidth = ((upper - lower) / middle) * 100;
  
  // Signal based on %B
  let signal = 'HOLD';
  if (percentB < 0.2) signal = 'BUY'; // Price near lower band (oversold)
  else if (percentB > 0.8) signal = 'SELL'; // Price near upper band (overbought)
  
  return {
    upper,
    middle,
    lower,
    percentB,
    bandwidth,
    signal
  };
}

// Analyze trading opportunity based on strategy
export async function analyzeStrategy(symbol, strategy) {
  const candles = await fetchCandles(symbol, 'minute', 5, 100);
  if (candles.length < 20) return { signal: 'HOLD', confidence: 0 };
  
  const currentPrice = candles[candles.length - 1].close;
  const rsi = calculateRSI(candles);
  const stochRSI = calculateStochasticRSI(candles);
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
  
  // Combine signals for better accuracy
  const signals = [signal];
  if (macd?.crossoverSignal !== 'HOLD') signals.push(macd.crossoverSignal);
  if (bb?.signal !== 'HOLD') signals.push(bb.signal);
  if (stochRSI?.signal !== 'HOLD') signals.push(stochRSI.signal);
  
  const buySignals = signals.filter(s => s === 'BUY').length;
  const sellSignals = signals.filter(s => s === 'SELL').length;
  
  // Enhance signal if multiple indicators agree
  if (buySignals >= 2) {
    signal = 'BUY';
    confidence = Math.min(0.95, confidence + (buySignals * 0.08));
  } else if (sellSignals >= 2) {
    signal = 'SELL';
    confidence = Math.min(0.95, confidence + (sellSignals * 0.08));
  }
  
  // Calculate stop-loss and take-profit based on ATR
  const atr = calculateATR(candles);
  const stopLossDistance = atr * 2; // 2x ATR for stop-loss
  const takeProfitDistance = atr * 3; // 3x ATR for take-profit
  
  return {
    signal,
    confidence,
    currentPrice,
    targetPrice,
    stopLoss: signal === 'BUY' ? currentPrice - stopLossDistance : currentPrice + stopLossDistance,
    takeProfit: signal === 'BUY' ? currentPrice + takeProfitDistance : currentPrice - takeProfitDistance,
    atr,
    indicators: {
      rsi: rsi?.toFixed(2),
      stochRSI_K: stochRSI?.k?.toFixed(2),
      stochRSI_D: stochRSI?.d?.toFixed(2),
      stochRSI_signal: stochRSI?.signal,
      macd: macd?.macd?.toFixed(2),
      macd_signal: macd?.signal?.toFixed(2),
      macd_histogram: macd?.histogram?.toFixed(2),
      macd_crossover: macd?.crossoverSignal,
      bb_upper: bb?.upper?.toFixed(2),
      bb_middle: bb?.middle?.toFixed(2),
      bb_lower: bb?.lower?.toFixed(2),
      bb_percentB: bb?.percentB?.toFixed(2),
      bb_signal: bb?.signal,
      sma20: sma20?.toFixed(2),
      sma50: sma50?.toFixed(2)
    },
    candles: candles.slice(-5)
  };
}

// Calculate ATR (Average True Range) for volatility-based stop-loss/take-profit
export function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / period;
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