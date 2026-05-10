import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Constants
const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
const OKX_API = 'https://www.okx.com/api/v5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch latest adaptive constants
    const constants = await getLatestConstants(base44, 'robot1');

    // Fetch live market data for all pairs (2-5s refresh)
    const marketData = await fetchLiveMarketData(base44);

    // Calculate continuous pair scores
    const pairScores = calculateScoreStream(marketData, constants);

    // Filter qualified setups (ready for execution)
    const qualifiedSetups = pairScores.filter(p => 
      p.scalpQualityScore >= constants.K_QUALITY &&
      p.spread <= constants.K_SPREAD &&
      p.expectedNetProfitAfterFees > 0.01
    );

    // Count rejected setups by reason
    const rejectedReasons = countRejectionReasons(pairScores, constants);

    return Response.json({
      scanTime: new Date().toISOString(),
      scanFrequency: '2-5 seconds',
      executionFrequency: '20-60 seconds',
      pairScores,
      qualifiedSetups: qualifiedSetups.length > 0 ? qualifiedSetups : [],
      signalsDetected: pairScores.length,
      qualifiedCount: qualifiedSetups.length,
      rejectedCount: pairScores.length - qualifiedSetups.length,
      rejectionReasons: rejectedReasons,
      constants,
      liveSignalStream: formatSignalStream(pairScores)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getLatestConstants(base44, botId) {
  const all = await base44.entities.OptimizingConstants.list();
  const latest = all
    .filter(c => c.botId === botId)
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
  
  return latest || {
    K_TP: 0.25,
    K_SL: -0.18,
    K_SPREAD: 0.05,
    K_HOLD: 5,
    K_SIZE: 1.0,
    K_QUALITY: 50,
    K_RESERVE: 0.30,
    K_COOLDOWN: 30
  };
}

async function fetchLiveMarketData(base44) {
  // Fetch from okxMarketData function or direct API
  try {
    const res = await base44.functions.invoke('okxMarketData', { action: 'tickers' });
    return res.data?.tickers || [];
  } catch (e) {
    console.error('Failed to fetch market data:', e.message);
    return [];
  }
}

function calculateScoreStream(marketData, constants) {
  // For each pair, calculate continuous metrics
  return ALLOWED_PAIRS.map(pair => {
    const md = marketData.find(m => m.instId === pair) || {};
    
    // Extract metrics
    const spread = calculateSpread(md);
    const volatility = calculateVolatility(md);
    const momentum = calculateMomentum(md);
    const volume = calculateVolume(md);

    // Composite scalp quality score (0-100)
    const scalpQualityScore = calculateScalpQuality(spread, volatility, momentum, volume);

    // Expected net profit for 20 USDT trade
    const expectedNetProfitAfterFees = calculateExpectedNetProfit(20, spread, constants);

    return {
      pair,
      timestamp: new Date().toISOString(),
      lastPrice: parseFloat(md.last) || 0,
      spread,
      volatility,
      momentum,
      volume,
      scalpQualityScore,
      expectedNetProfitAfterFees,
      executionReady: scalpQualityScore >= constants.K_QUALITY && expectedNetProfitAfterFees > 0.01,
      spreadsWithin: spread <= constants.K_SPREAD,
      volumeGood: volume > 0.85,
      momentumConfirmed: momentum > -0.5
    };
  });
}

function calculateSpread(md) {
  if (!md.bid || !md.ask) return 0.1;
  const mid = (parseFloat(md.bid) + parseFloat(md.ask)) / 2;
  return ((parseFloat(md.ask) - parseFloat(md.bid)) / mid) * 100;
}

function calculateVolatility(md) {
  // Simplified: use bid-ask spread as proxy for volatility
  // Real implementation would use candle data
  if (!md.high || !md.low) return 1.0;
  return ((parseFloat(md.high) - parseFloat(md.low)) / parseFloat(md.low)) * 100;
}

function calculateMomentum(md) {
  // Simplified: use change24h as proxy
  // Real: would calculate RSI, MACD, etc
  return (parseFloat(md.change24h) || 0);
}

function calculateVolume(md) {
  // Normalized volume ratio (0-1)
  // Would compare to moving average in real system
  return Math.min(1, (parseFloat(md.quoteVolume) || 0) / 1000000);
}

function calculateScalpQuality(spread, volatility, momentum, volume) {
  // Score based on ideal scalp conditions
  let score = 50; // baseline

  // Spread: tight spreads = good (score +/-)
  if (spread < 0.02) score += 20;
  else if (spread > 0.1) score -= 20;

  // Volatility: moderate volatility = good
  if (volatility > 0.5 && volatility < 3) score += 15;
  else if (volatility > 5) score -= 10;

  // Momentum: slight positive momentum = good
  if (momentum > 0.1 && momentum < 2) score += 10;
  else if (momentum < -1) score -= 10;

  // Volume: high volume = good
  if (volume > 0.85) score += 15;

  return Math.max(0, Math.min(100, score));
}

function calculateExpectedNetProfit(tradeAmount, spread, constants) {
  // Simplified net profit calculation
  // Real: would use pair-specific fees, slippage, etc
  const OKX_FEE_RATE = 0.001;
  const buyFee = tradeAmount * OKX_FEE_RATE;
  const sellFee = tradeAmount * OKX_FEE_RATE;
  const totalFees = buyFee + sellFee;
  const slippageCost = (tradeAmount * spread / 100);
  
  // Assume we hit K_TP target
  const targetProfit = tradeAmount * (constants.K_TP / 100);
  
  const netProfit = targetProfit - totalFees - slippageCost;
  return Math.max(0, netProfit);
}

function countRejectionReasons(pairScores, constants) {
  const reasons = {
    lowQuality: 0,
    highSpread: 0,
    lowProfitExpected: 0,
    totalRejected: 0
  };

  for (const p of pairScores) {
    let rejected = false;
    
    if (p.scalpQualityScore < constants.K_QUALITY) {
      reasons.lowQuality++;
      rejected = true;
    }
    if (p.spread > constants.K_SPREAD) {
      reasons.highSpread++;
      rejected = true;
    }
    if (p.expectedNetProfitAfterFees <= 0.01) {
      reasons.lowProfitExpected++;
      rejected = true;
    }

    if (rejected) reasons.totalRejected++;
  }

  return reasons;
}

function formatSignalStream(pairScores) {
  // Format for dashboard: LIVE_SCALP_SIGNAL_STREAM
  return pairScores.map(p => ({
    pair: p.pair,
    momentum: p.momentum.toFixed(2),
    spread: p.spread.toFixed(3),
    score: p.scalpQualityScore.toFixed(0),
    expectedNet: `$${p.expectedNetProfitAfterFees.toFixed(4)}`,
    ready: p.executionReady
  }));
}