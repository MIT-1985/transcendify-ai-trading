/**
 * testPolygonFeeAwareSignal
 * READ-ONLY diagnostic. NO trading, NO orders, NO BUY/SELL.
 * Strategy mode: FEE_AWARE_POLYGON_SCALP
 *
 * For each pair: fetch Polygon candles/trend/momentum/volume/volatility,
 * fetch OKX bid/ask/spread, score everything, return decision.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAIRS = [
  'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT',
  'BNB-USDT', 'ADA-USDT', 'LINK-USDT', 'AVAX-USDT', 'LTC-USDT'
];

// OKX ticker symbols that exist on Polygon (OKX pairs → Polygon tickers)
const POLYGON_TICKER_MAP = {
  'BTC-USDT':  'X:BTCUSD',
  'ETH-USDT':  'X:ETHUSD',
  'SOL-USDT':  'X:SOLUSD',
  'DOGE-USDT': 'X:DOGEUSD',
  'XRP-USDT':  'X:XRPUSD',
  'BNB-USDT':  'X:BNBUSD',
  'ADA-USDT':  'X:ADAUSD',
  'LINK-USDT': 'X:LINKUSD',
  'AVAX-USDT': 'X:AVAXUSD',
  'LTC-USDT':  'X:LTCUSD'
};

const OKX_API   = 'https://www.okx.com/api/v5';
const POLY_API  = 'https://api.polygon.io/v2';

// Fee-aware strategy constants (initial values per architecture)
const STRATEGY_CONSTANTS = {
  K_TP:             0.45,   // take profit %
  K_SL:            -0.25,   // stop loss %
  K_SPREAD:         0.03,   // max spread % to enter
  K_SCORE:         70,      // min finalScore to consider BUY_READY
  K_SIZE:          10,      // trade size USDT
  K_HOLD:          10,      // max hold minutes
  K_COOLDOWN:      90,      // cooldown seconds
  K_RESERVE:       80,      // min free USDT to keep
  K_FEE_MIN_NET:    0.03,   // min net profit after fees (USDT)
  OKX_TAKER_FEE:   0.001,  // 0.1% taker fee each side
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) {
      return Response.json({ error: 'POLYGON_API_KEY not set', status: 'WAIT_POLYGON_UNAVAILABLE' }, { status: 500 });
    }

    console.log(`[testPolygonFeeAwareSignal] READ-ONLY scan started. NO TRADING. User: ${user.email}`);

    // Scan all pairs sequentially with small delay to respect Polygon rate limit
    const results = [];
    for (const pair of PAIRS) {
      results.push(await scanPair(pair, polygonApiKey, STRATEGY_CONSTANTS));
      await new Promise(r => setTimeout(r, 200)); // 200ms between requests
    }

    // Sort by finalScore descending
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Top 3 opportunities
    const top3 = results.slice(0, 3);
    const buyReady = results.filter(r => r.decision === 'BUY_READY');

    console.log(`[testPolygonFeeAwareSignal] Scan complete. BUY_READY: ${buyReady.length}. Top pair: ${results[0]?.pair} score=${results[0]?.finalScore?.toFixed(1)}`);

    return Response.json({
      success: true,
      mode: 'FEE_AWARE_POLYGON_SCALP',
      readOnly: true,
      noTrading: true,
      scanTime: new Date().toISOString(),
      constants: STRATEGY_CONSTANTS,
      allPairs: results,
      top3Opportunities: top3,
      buyReadyCount: buyReady.length,
      buyReadyPairs: buyReady.map(r => r.pair),
      summary: {
        scanned: results.length,
        buyReady: buyReady.length,
        wait: results.filter(r => r.decision === 'WAIT').length,
        avoid: results.filter(r => r.decision === 'AVOID').length,
        polygonUnavailable: results.filter(r => r.decision === 'WAIT_POLYGON_UNAVAILABLE').length,
      }
    });

  } catch (err) {
    console.error('[testPolygonFeeAwareSignal] Error:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});

// ─── Scan a single pair ───────────────────────────────────────────────────────
async function scanPair(pair, polygonApiKey, C) {
  const polygonTicker = POLYGON_TICKER_MAP[pair];
  const result = {
    pair,
    polygonTicker,
    scanTime: new Date().toISOString(),
    polygonStatus: 'UNKNOWN',
    candlesCount: 0,
    trend: 'UNKNOWN',
    momentum: 0,
    volumeDelta: 0,
    volatility: 0,
    okxBid: 0,
    okxAsk: 0,
    spreadPct: 0,
    expectedGrossProfit: 0,
    expectedFees: 0,
    expectedNetProfitAfterFees: 0,
    PolygonSignalScore: 0,
    OKXExecutionScore: 0,
    finalScore: 0,
    decision: 'WAIT',
    reason: '',
    // sub-scores
    trendScore: 0,
    momentumScore: 0,
    volumeScore: 0,
    volatilityScore: 0,
    candleStructureScore: 0,
    spreadScore: 0,
    feeViabilityScore: 0,
  };

  try {
    // ── 1. Fetch Polygon daily bars ──
    const polyData = await buildPolygonData(polygonTicker, polygonApiKey);
    if (!polyData.ok) {
      result.polygonStatus = 'UNAVAILABLE';
      result.decision = 'WAIT_POLYGON_UNAVAILABLE';
      result.reason = `Polygon unavailable: ${polyData.error}`;
      return result;
    }

    result.polygonStatus = 'OK';
    result.candlesCount = polyData.candles.length;
    if (polyData.todayChangePct !== undefined) {
      result.todayChangePct = parseFloat(polyData.todayChangePct?.toFixed(4) || 0);
    }

    const candles = polyData.candles;

    // ── 2. Polygon signal analysis ──
    const trend      = analyzeTrend(candles);
    const momentum   = analyzeMomentum(candles);
    const volDelta   = analyzeVolume(candles);
    const volatility = analyzeVolatility(candles);
    const candleStr  = analyzeCandleStructure(candles);

    result.trend       = trend.label;
    result.momentum    = parseFloat(momentum.value.toFixed(4));
    result.volumeDelta = parseFloat(volDelta.delta.toFixed(4));
    result.volatility  = parseFloat(volatility.pct.toFixed(4));

    // Polygon sub-scores
    result.trendScore          = trend.score;       // 0-25
    result.momentumScore       = momentum.score;    // 0-25
    result.volumeScore         = volDelta.score;    // 0-20
    result.volatilityScore     = volatility.score;  // 0-15
    result.candleStructureScore = candleStr.score;  // 0-15

    const PolygonSignalScore = result.trendScore + result.momentumScore + result.volumeScore + result.volatilityScore + result.candleStructureScore;
    result.PolygonSignalScore = parseFloat(PolygonSignalScore.toFixed(2));

    // ── 3. OKX ticker (bid/ask/spread) ──
    const okxTicker = await fetchOKXTicker(pair);
    if (!okxTicker.ok) {
      result.decision = 'WAIT';
      result.reason = `OKX ticker unavailable: ${okxTicker.error}`;
      return result;
    }

    result.okxBid    = okxTicker.bid;
    result.okxAsk    = okxTicker.ask;
    result.spreadPct = parseFloat(okxTicker.spreadPct.toFixed(4));

    // OKX Execution sub-scores
    const spreadScore      = scoreSpread(okxTicker.spreadPct);        // 0-30
    const liquidityScore   = scoreLiquidity(okxTicker);               // 0-20
    const feeViabilityScore = scoreFeeViability(C, okxTicker);        // 0-30
    const execPriceScore   = scoreExecPrice(okxTicker);               // 0-20

    result.spreadScore       = spreadScore;
    result.feeViabilityScore = feeViabilityScore;

    const OKXExecutionScore = spreadScore + liquidityScore + feeViabilityScore + execPriceScore;
    result.OKXExecutionScore = parseFloat(OKXExecutionScore.toFixed(2));

    // ── 4. Final composite score ──
    const finalScore = (PolygonSignalScore * 0.65) + (OKXExecutionScore * 0.35);
    result.finalScore = parseFloat(finalScore.toFixed(2));

    // ── 5. Fee-aware profit calculation ──
    const tradeSize      = C.K_SIZE;  // 10 USDT
    const buyFee         = tradeSize * C.OKX_TAKER_FEE;
    const grossAtTP      = tradeSize * (C.K_TP / 100);
    const afterBuyAmount = tradeSize - buyFee;
    const sellFee        = (afterBuyAmount + grossAtTP) * C.OKX_TAKER_FEE;
    const spreadCost     = tradeSize * (okxTicker.spreadPct / 100);
    const totalFees      = buyFee + sellFee + spreadCost;
    const netProfit      = grossAtTP - totalFees;

    result.expectedGrossProfit        = parseFloat(grossAtTP.toFixed(6));
    result.expectedFees               = parseFloat(totalFees.toFixed(6));
    result.expectedNetProfitAfterFees = parseFloat(netProfit.toFixed(6));

    // ── 6. Decision logic ──
    const failReasons = [];

    if (trend.label !== 'BULLISH')              failReasons.push(`trend=${trend.label}`);
    if (momentum.value <= 0)                    failReasons.push(`momentum=${momentum.value.toFixed(4)}`);
    if (volDelta.delta <= 0)                    failReasons.push(`volumeDelta=${volDelta.delta.toFixed(4)}`);
    if (okxTicker.spreadPct > C.K_SPREAD)       failReasons.push(`spread=${okxTicker.spreadPct.toFixed(4)}%>limit${C.K_SPREAD}%`);
    if (netProfit < C.K_FEE_MIN_NET)            failReasons.push(`netProfit=${netProfit.toFixed(6)}<min${C.K_FEE_MIN_NET}`);
    if (finalScore < C.K_SCORE)                 failReasons.push(`score=${finalScore.toFixed(1)}<${C.K_SCORE}`);
    if (volatility.extreme)                     failReasons.push('volatility=EXTREME');

    if (failReasons.length === 0) {
      result.decision = 'BUY_READY';
      result.reason   = 'All entry conditions met. Awaiting manual kill switch disable.';
    } else if (volatility.extreme || okxTicker.spreadPct > C.K_SPREAD * 3) {
      result.decision = 'AVOID';
      result.reason   = failReasons.join(' | ');
    } else {
      result.decision = 'WAIT';
      result.reason   = failReasons.join(' | ');
    }

  } catch (err) {
    result.decision = 'WAIT';
    result.reason   = `Scan error: ${err.message}`;
  }

  return result;
}

// ─── Fetch Polygon daily bars (free plan compatible) ─────────────────────────
async function buildPolygonData(ticker, apiKey) {
  try {
    const today    = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const past30   = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const past30Str = past30.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${past30Str}/${todayStr}?adjusted=true&sort=asc&limit=30&apiKey=${apiKey}`;
    const res  = await fetch(url);
    const json = await res.json();

    if (json.results?.length >= 2) {
      return { ok: true, candles: json.results, resolution: '1d' };
    }

    const errMsg = json.error || json.message || `resultsCount=${json.resultsCount ?? 0}`;
    return { ok: false, error: errMsg, candles: [] };
  } catch (err) {
    return { ok: false, error: err.message, candles: [] };
  }
}

// ─── OKX: fetch bid/ask ticker ───────────────────────────────────────────────
async function fetchOKXTicker(instId) {
  try {
    const res = await fetch(`${OKX_API}/market/ticker?instId=${instId}`);
    const json = await res.json();
    const d = json.data?.[0];
    if (!d) return { ok: false, error: 'no ticker data' };
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 0;
    return {
      ok: true,
      bid,
      ask,
      last: parseFloat(d.last),
      spreadPct,
      vol24h: parseFloat(d.vol24h || 0),
      volCcy24h: parseFloat(d.volCcy24h || 0),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Signal analysis helpers ──────────────────────────────────────────────────

function analyzeTrend(candles) {
  if (candles.length < 5) return { label: 'UNKNOWN', score: 0 };
  const closes = candles.map(c => c.c || c.close || 0);
  const n = closes.length;
  const recent  = closes.slice(n - 5).reduce((a, b) => a + b, 0) / 5;
  const earlier = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const pctChange = ((recent - earlier) / earlier) * 100;

  if (pctChange > 0.15)       return { label: 'BULLISH',  score: 25 };
  if (pctChange > 0.05)       return { label: 'MILD_BULL', score: 15 };
  if (pctChange < -0.15)      return { label: 'BEARISH',  score: 0  };
  if (pctChange < -0.05)      return { label: 'MILD_BEAR', score: 5  };
  return                             { label: 'NEUTRAL',  score: 8  };
}

function analyzeMomentum(candles) {
  if (candles.length < 3) return { value: 0, score: 0 };
  const closes = candles.map(c => c.c || c.close || 0);
  const n = closes.length;
  // Simple momentum: last close vs 3-bar ago close
  const momentum = (closes[n - 1] - closes[n - 4]) / closes[n - 4] * 100;

  let score = 0;
  if (momentum > 0.1)       score = 25;
  else if (momentum > 0.03) score = 18;
  else if (momentum > 0)    score = 10;
  else if (momentum > -0.05) score = 3;
  else                       score = 0;

  return { value: momentum, score };
}

function analyzeVolume(candles) {
  if (candles.length < 6) return { delta: 0, score: 0 };
  const vols = candles.map(c => c.v || c.volume || 0);
  const n = vols.length;
  const recentAvg  = vols.slice(n - 3).reduce((a, b) => a + b, 0) / 3;
  const earlierAvg = vols.slice(n - 6, n - 3).reduce((a, b) => a + b, 0) / 3;
  const delta = earlierAvg > 0 ? (recentAvg - earlierAvg) / earlierAvg : 0;

  let score = 0;
  if (delta > 0.3)       score = 20;
  else if (delta > 0.1)  score = 14;
  else if (delta > 0)    score = 8;
  else                   score = 0;

  return { delta, score };
}

function analyzeVolatility(candles) {
  if (candles.length < 5) return { pct: 0, score: 10, extreme: false };
  const closes = candles.map(c => c.c || c.close || 0);
  const n = closes.length;
  // Std dev of last 10 closes
  const slice = closes.slice(Math.max(0, n - 10));
  const mean  = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  const pct = mean > 0 ? (stdDev / mean) * 100 : 0;

  let score = 0;
  let extreme = false;
  if (pct < 0.05)       { score = 5;  }  // too flat
  else if (pct < 0.2)   { score = 15; }  // ideal
  else if (pct < 0.5)   { score = 10; }  // moderate
  else if (pct < 1.0)   { score = 5;  }  // high
  else                  { score = 0; extreme = true; }  // extreme

  return { pct, score, extreme };
}

function analyzeCandleStructure(candles) {
  if (candles.length < 3) return { score: 0 };
  // Check last 3 candles: bullish engulfing pattern or higher highs
  const last3 = candles.slice(-3);
  const highs  = last3.map(c => c.h || c.high || 0);
  const closes = last3.map(c => c.c || c.close || 0);
  const opens  = last3.map(c => c.o || c.open || 0);

  const higherHighs   = highs[2] > highs[1] && highs[1] > highs[0];
  const bullishBodies = closes.every((c, i) => c > opens[i]);
  const lastBullish   = closes[2] > opens[2];

  let score = 0;
  if (higherHighs && bullishBodies) score = 15;
  else if (higherHighs && lastBullish) score = 10;
  else if (lastBullish) score = 5;
  else score = 0;

  return { score };
}

// ─── OKX Execution scoring ────────────────────────────────────────────────────

function scoreSpread(spreadPct) {
  // Max 30 points
  if (spreadPct < 0.005)      return 30;
  if (spreadPct < 0.01)       return 25;
  if (spreadPct < 0.02)       return 18;
  if (spreadPct < 0.03)       return 10;
  if (spreadPct < 0.05)       return 5;
  return 0;
}

function scoreLiquidity(ticker) {
  // Max 20 points — based on 24h volume
  const vol = ticker.volCcy24h || ticker.vol24h || 0;
  if (vol > 50000000) return 20;
  if (vol > 10000000) return 15;
  if (vol > 1000000)  return 10;
  if (vol > 100000)   return 5;
  return 0;
}

function scoreFeeViability(C, ticker) {
  // Max 30 points — can we make min net profit at TP?
  const tradeSize  = C.K_SIZE;
  const grossAtTP  = tradeSize * (C.K_TP / 100);
  const buyFee     = tradeSize * C.OKX_TAKER_FEE;
  const sellFee    = tradeSize * C.OKX_TAKER_FEE;
  const spreadCost = tradeSize * (ticker.spreadPct / 100);
  const netProfit  = grossAtTP - buyFee - sellFee - spreadCost;

  if (netProfit >= C.K_FEE_MIN_NET * 3)  return 30;
  if (netProfit >= C.K_FEE_MIN_NET * 2)  return 22;
  if (netProfit >= C.K_FEE_MIN_NET)      return 15;
  if (netProfit >= 0)                    return 5;
  return 0;
}

function scoreExecPrice(ticker) {
  // Max 20 points — bid/ask tightness relative to last price
  if (!ticker.last || !ticker.bid) return 10;
  const slippage = Math.abs(ticker.ask - ticker.last) / ticker.last * 100;
  if (slippage < 0.005) return 20;
  if (slippage < 0.01)  return 15;
  if (slippage < 0.02)  return 10;
  return 5;
}