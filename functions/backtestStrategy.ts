import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      strategy, 
      symbol, 
      startDate, 
      endDate, 
      initialCapital,
      parameters 
    } = await req.json();

    // Fetch historical data from Polygon
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    const from = new Date(startDate).toISOString().split('T')[0];
    const to = new Date(endDate).toISOString().split('T')[0];
    
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?apiKey=${polygonApiKey}`
    );
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return Response.json({ error: 'No historical data found' }, { status: 404 });
    }

    const candles = data.results.map(r => ({
      timestamp: r.t,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v
    }));

    // Run backtest based on strategy
    let result;
    switch(strategy) {
      case 'sma_crossover':
        result = backtestSMACrossover(candles, initialCapital, parameters);
        break;
      case 'rsi':
        result = backtestRSI(candles, initialCapital, parameters);
        break;
      case 'bollinger_bands':
        result = backtestBollingerBands(candles, initialCapital, parameters);
        break;
      case 'macd':
        result = backtestMACD(candles, initialCapital, parameters);
        break;
      default:
        return Response.json({ error: 'Unknown strategy' }, { status: 400 });
    }

    // Save result to database
    await base44.entities.BacktestResult.create({
      strategy_name: strategy,
      symbol: symbol,
      start_date: startDate,
      end_date: endDate,
      initial_capital: initialCapital,
      final_capital: result.finalCapital,
      total_return: result.totalReturn,
      total_trades: result.totalTrades,
      winning_trades: result.winningTrades,
      losing_trades: result.losingTrades,
      win_rate: result.winRate,
      avg_win: result.avgWin,
      avg_loss: result.avgLoss,
      max_drawdown: result.maxDrawdown,
      sharpe_ratio: result.sharpeRatio,
      profit_factor: result.profitFactor,
      total_fees: result.totalFees,
      parameters: parameters,
      equity_curve: result.equityCurve
    });

    return Response.json({ success: true, result });

  } catch (error) {
    console.error('Backtest error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// SMA Crossover Strategy
function backtestSMACrossover(candles, initialCapital, params) {
  const { shortPeriod = 20, longPeriod = 50, feeRate = 0.001 } = params;
  
  let capital = initialCapital;
  let position = 0;
  let trades = [];
  let equity = [{ timestamp: candles[0].timestamp, value: capital }];
  
  // Calculate SMAs
  const shortSMA = calculateSMA(candles, shortPeriod);
  const longSMA = calculateSMA(candles, longPeriod);
  
  for (let i = longPeriod; i < candles.length; i++) {
    const prevShort = shortSMA[i - 1];
    const prevLong = longSMA[i - 1];
    const currShort = shortSMA[i];
    const currLong = longSMA[i];
    const price = candles[i].close;
    
    // Buy signal: short crosses above long
    if (prevShort <= prevLong && currShort > currLong && position === 0) {
      const quantity = capital / price;
      const fee = capital * feeRate;
      capital -= fee;
      position = quantity;
      trades.push({
        type: 'BUY',
        price: price,
        quantity: quantity,
        timestamp: candles[i].timestamp,
        fee: fee
      });
    }
    // Sell signal: short crosses below long
    else if (prevShort >= prevLong && currShort < currLong && position > 0) {
      const value = position * price;
      const fee = value * feeRate;
      capital = value - fee;
      trades.push({
        type: 'SELL',
        price: price,
        quantity: position,
        timestamp: candles[i].timestamp,
        fee: fee,
        pnl: value - (capital + fee)
      });
      position = 0;
    }
    
    const currentValue = capital + (position * price);
    equity.push({ timestamp: candles[i].timestamp, value: currentValue });
  }
  
  // Close any open position
  if (position > 0) {
    const lastPrice = candles[candles.length - 1].close;
    capital = position * lastPrice * (1 - feeRate);
    position = 0;
  }
  
  return calculateMetrics(trades, initialCapital, capital, equity);
}

// RSI Strategy
function backtestRSI(candles, initialCapital, params) {
  const { period = 14, oversold = 30, overbought = 70, feeRate = 0.001 } = params;
  
  let capital = initialCapital;
  let position = 0;
  let trades = [];
  let equity = [{ timestamp: candles[0].timestamp, value: capital }];
  
  const rsi = calculateRSI(candles, period);
  
  for (let i = period + 1; i < candles.length; i++) {
    const price = candles[i].close;
    const currentRSI = rsi[i];
    
    // Buy signal: RSI crosses above oversold
    if (currentRSI < oversold && position === 0) {
      const quantity = capital / price;
      const fee = capital * feeRate;
      capital -= fee;
      position = quantity;
      trades.push({
        type: 'BUY',
        price: price,
        quantity: quantity,
        timestamp: candles[i].timestamp,
        fee: fee
      });
    }
    // Sell signal: RSI crosses above overbought
    else if (currentRSI > overbought && position > 0) {
      const value = position * price;
      const fee = value * feeRate;
      capital = value - fee;
      trades.push({
        type: 'SELL',
        price: price,
        quantity: position,
        timestamp: candles[i].timestamp,
        fee: fee,
        pnl: value - (capital + fee)
      });
      position = 0;
    }
    
    const currentValue = capital + (position * price);
    equity.push({ timestamp: candles[i].timestamp, value: currentValue });
  }
  
  if (position > 0) {
    const lastPrice = candles[candles.length - 1].close;
    capital = position * lastPrice * (1 - feeRate);
    position = 0;
  }
  
  return calculateMetrics(trades, initialCapital, capital, equity);
}

// Bollinger Bands Strategy
function backtestBollingerBands(candles, initialCapital, params) {
  const { period = 20, stdDev = 2, feeRate = 0.001 } = params;
  
  let capital = initialCapital;
  let position = 0;
  let trades = [];
  let equity = [{ timestamp: candles[0].timestamp, value: capital }];
  
  const bb = calculateBollingerBands(candles, period, stdDev);
  
  for (let i = period; i < candles.length; i++) {
    const price = candles[i].close;
    const lower = bb.lower[i];
    const upper = bb.upper[i];
    
    // Buy signal: price touches lower band
    if (price <= lower && position === 0) {
      const quantity = capital / price;
      const fee = capital * feeRate;
      capital -= fee;
      position = quantity;
      trades.push({
        type: 'BUY',
        price: price,
        quantity: quantity,
        timestamp: candles[i].timestamp,
        fee: fee
      });
    }
    // Sell signal: price touches upper band
    else if (price >= upper && position > 0) {
      const value = position * price;
      const fee = value * feeRate;
      capital = value - fee;
      trades.push({
        type: 'SELL',
        price: price,
        quantity: position,
        timestamp: candles[i].timestamp,
        fee: fee,
        pnl: value - (capital + fee)
      });
      position = 0;
    }
    
    const currentValue = capital + (position * price);
    equity.push({ timestamp: candles[i].timestamp, value: currentValue });
  }
  
  if (position > 0) {
    const lastPrice = candles[candles.length - 1].close;
    capital = position * lastPrice * (1 - feeRate);
    position = 0;
  }
  
  return calculateMetrics(trades, initialCapital, capital, equity);
}

// MACD Strategy
function backtestMACD(candles, initialCapital, params) {
  const { feeRate = 0.001 } = params;
  
  let capital = initialCapital;
  let position = 0;
  let trades = [];
  let equity = [{ timestamp: candles[0].timestamp, value: capital }];
  
  const macd = calculateMACD(candles);
  
  for (let i = 35; i < candles.length; i++) {
    const price = candles[i].close;
    const prevMACD = macd.line[i - 1];
    const prevSignal = macd.signal[i - 1];
    const currMACD = macd.line[i];
    const currSignal = macd.signal[i];
    
    // Buy signal: MACD crosses above signal
    if (prevMACD <= prevSignal && currMACD > currSignal && position === 0) {
      const quantity = capital / price;
      const fee = capital * feeRate;
      capital -= fee;
      position = quantity;
      trades.push({
        type: 'BUY',
        price: price,
        quantity: quantity,
        timestamp: candles[i].timestamp,
        fee: fee
      });
    }
    // Sell signal: MACD crosses below signal
    else if (prevMACD >= prevSignal && currMACD < currSignal && position > 0) {
      const value = position * price;
      const fee = value * feeRate;
      capital = value - fee;
      trades.push({
        type: 'SELL',
        price: price,
        quantity: position,
        timestamp: candles[i].timestamp,
        fee: fee,
        pnl: value - (capital + fee)
      });
      position = 0;
    }
    
    const currentValue = capital + (position * price);
    equity.push({ timestamp: candles[i].timestamp, value: currentValue });
  }
  
  if (position > 0) {
    const lastPrice = candles[candles.length - 1].close;
    capital = position * lastPrice * (1 - feeRate);
    position = 0;
  }
  
  return calculateMetrics(trades, initialCapital, capital, equity);
}

// Helper functions
function calculateSMA(candles, period) {
  const sma = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const sum = candles.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
      sma.push(sum / period);
    }
  }
  return sma;
}

function calculateRSI(candles, period) {
  const rsi = Array(period).fill(null);
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rs = avgGain / avgLoss;
  rsi.push(100 - (100 / (1 + rs)));
  
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
}

function calculateBollingerBands(candles, period, stdDevMultiplier) {
  const sma = calculateSMA(candles, period);
  const upper = [];
  const lower = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      upper.push(mean + stdDevMultiplier * std);
      lower.push(mean - stdDevMultiplier * std);
    }
  }
  
  return { upper, lower, middle: sma };
}

function calculateEMA(candles, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  let emaPrev = candles.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
  ema.push(...Array(period - 1).fill(null));
  ema.push(emaPrev);
  
  for (let i = period; i < candles.length; i++) {
    emaPrev = (candles[i].close - emaPrev) * multiplier + emaPrev;
    ema.push(emaPrev);
  }
  
  return ema;
}

function calculateMACD(candles) {
  const ema12 = calculateEMA(candles, 12);
  const ema26 = calculateEMA(candles, 26);
  const line = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (ema12[i] === null || ema26[i] === null) {
      line.push(null);
    } else {
      line.push(ema12[i] - ema26[i]);
    }
  }
  
  const validMACD = line.filter(v => v !== null);
  const signal = [];
  const multiplier = 2 / 10;
  let emaSignal = validMACD.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  
  signal.push(...Array(line.indexOf(validMACD[0]) + 8).fill(null));
  signal.push(emaSignal);
  
  for (let i = line.indexOf(validMACD[0]) + 9; i < line.length; i++) {
    if (line[i] !== null) {
      emaSignal = (line[i] - emaSignal) * multiplier + emaSignal;
      signal.push(emaSignal);
    } else {
      signal.push(null);
    }
  }
  
  return { line, signal };
}

function calculateMetrics(trades, initialCapital, finalCapital, equity) {
  const buyTrades = trades.filter(t => t.type === 'BUY');
  const sellTrades = trades.filter(t => t.type === 'SELL');
  
  const totalTrades = sellTrades.length;
  const winningTrades = sellTrades.filter(t => t.pnl > 0).length;
  const losingTrades = sellTrades.filter(t => t.pnl <= 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  const wins = sellTrades.filter(t => t.pnl > 0).map(t => t.pnl);
  const losses = sellTrades.filter(t => t.pnl <= 0).map(t => Math.abs(t.pnl));
  
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  
  const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
  
  // Calculate max drawdown
  let maxDrawdown = 0;
  let peak = equity[0].value;
  for (const point of equity) {
    if (point.value > peak) peak = point.value;
    const drawdown = ((peak - point.value) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Calculate Sharpe ratio (simplified)
  const returns = [];
  for (let i = 1; i < equity.length; i++) {
    returns.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  const totalFees = trades.reduce((sum, t) => sum + t.fee, 0);
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades) / (avgLoss * losingTrades) : 0;
  
  return {
    finalCapital,
    totalReturn,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    avgWin,
    avgLoss,
    maxDrawdown,
    sharpeRatio,
    profitFactor,
    totalFees,
    equityCurve: equity
  };
}