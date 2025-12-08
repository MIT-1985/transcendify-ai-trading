// Stochastic RSI - Advanced momentum oscillator

export function calculateStochasticRSI(candles, rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3) {
  if (candles.length < rsiPeriod + stochPeriod) return null;
  
  // Calculate RSI values
  const rsiValues = [];
  for (let i = rsiPeriod; i < candles.length; i++) {
    const slice = candles.slice(i - rsiPeriod, i + 1);
    let gains = 0, losses = 0;
    
    for (let j = 1; j < slice.length; j++) {
      const change = slice[j].close - slice[j - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / rsiPeriod;
    const avgLoss = losses / rsiPeriod;
    const rs = avgGain / (avgLoss || 1);
    const rsi = 100 - (100 / (1 + rs));
    rsiValues.push(rsi);
  }
  
  // Calculate Stochastic of RSI
  const stochRSIValues = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const minRSI = Math.min(...slice);
    const maxRSI = Math.max(...slice);
    
    if (maxRSI === minRSI) {
      stochRSIValues.push(0.5);
    } else {
      stochRSIValues.push((rsiValues[i] - minRSI) / (maxRSI - minRSI));
    }
  }
  
  // Calculate %K (smoothed Stochastic RSI)
  const kValues = [];
  for (let i = kSmooth - 1; i < stochRSIValues.length; i++) {
    const slice = stochRSIValues.slice(i - kSmooth + 1, i + 1);
    const k = slice.reduce((a, b) => a + b, 0) / kSmooth;
    kValues.push(k * 100); // Convert to percentage
  }
  
  // Calculate %D (smoothed %K)
  const dValues = [];
  for (let i = dSmooth - 1; i < kValues.length; i++) {
    const slice = kValues.slice(i - dSmooth + 1, i + 1);
    const d = slice.reduce((a, b) => a + b, 0) / dSmooth;
    dValues.push(d);
  }
  
  const k = kValues[kValues.length - 1];
  const d = dValues[dValues.length - 1] || k;
  const prevK = kValues[kValues.length - 2] || k;
  const prevD = dValues[dValues.length - 2] || d;
  
  // Generate signals
  let signal = 'HOLD';
  
  // Oversold/Overbought conditions with crossover
  if (k < 20 && d < 20 && k > d && prevK <= prevD) {
    signal = 'BUY'; // Bullish crossover in oversold zone
  } else if (k > 80 && d > 80 && k < d && prevK >= prevD) {
    signal = 'SELL'; // Bearish crossover in overbought zone
  } else if (k < 20) {
    signal = 'BUY'; // Simple oversold
  } else if (k > 80) {
    signal = 'SELL'; // Simple overbought
  }
  
  return {
    k,
    d,
    signal,
    isOversold: k < 20,
    isOverbought: k > 80,
    divergence: Math.abs(k - d)
  };
}

export default calculateStochasticRSI;