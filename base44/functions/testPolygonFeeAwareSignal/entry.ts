/**
 * testPolygonFeeAwareSignal — PHASE 1: READ ONLY SIGNAL ENGINE
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE
 * Phase:    1 — READ_ONLY_SIGNAL_ENGINE
 * Trading:  DISABLED (Kill switch ACTIVE, tradeAllowed = false)
 *
 * Architecture pillars:
 *   1. Polygon Signal Engine   → trend, candles, momentum, volume, volatility, pair ranking
 *   2. Optimizing Constants    → K_SCORE, K_TP, K_SL, K_SPREAD, K_SIZE, K_HOLD, K_COOLDOWN, K_RESERVE, K_FEE_MIN_NET, K_VOLATILITY
 *   3. OKX Execution Engine    → live bid/ask, spread, liquidity (READ ONLY — no orders)
 *   4. Risk Guard              → no Polygon = no trade, kill switch, fee > profit stop
 *   5. Dashboard               → full signal table, top 3, best pair, tradeAllowed: false
 *
 * If Polygon unavailable → decision = WAIT_POLYGON_UNAVAILABLE, tradeAllowed = false
 * NO fallback to OKX-only trading.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Pairs & ticker map ───────────────────────────────────────────────────────
const PAIRS = [
  'BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT',
  'BNB-USDT', 'ADA-USDT', 'LINK-USDT', 'AVAX-USDT', 'LTC-USDT'
];

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

const OKX_API = 'https://www.okx.com/api/v5';

// ─── Strategy constants (Optimizing Constants Engine — Phase 1 defaults) ──────
const STRATEGY_CONSTANTS = {
  K_TP:           0.45,   // take profit %
  K_SL:          -0.25,   // stop loss %
  K_SPREAD:       0.03,   // max spread % allowed
  K_SCORE:        70,     // min finalScore for BUY_READY
  K_SIZE:         10,     // trade size USDT
  K_HOLD:         10,     // max hold time minutes
  K_COOLDOWN:     90,     // cooldown seconds between trades
  K_RESERVE:      80,     // min free USDT to keep in account
  K_FEE_MIN_NET:  0.03,   // min net profit after fees (USDT)
  K_VOLATILITY:   1.0,    // max volatility % (above = AVOID)
  OKX_TAKER_FEE:  0.001,  // 0.1% taker fee per side
};

// ─── ConstantsScore: rate how well current market conditions match constants ──
function scoreConstants(C, trend, momentum, volatility, netProfit) {
  let score = 0;
  // K_TP viability (30 pts)
  if (netProfit >= C.K_FEE_MIN_NET * 3)     score += 30;
  else if (netProfit >= C.K_FEE_MIN_NET * 2) score += 20;
  else if (netProfit >= C.K_FEE_MIN_NET)     score += 10;
  // K_VOLATILITY fit (25 pts)
  if (volatility.pct < 0.2)                 score += 25;
  else if (volatility.pct < 0.5)            score += 15;
  else if (volatility.pct < C.K_VOLATILITY) score += 8;
  // Trend/momentum alignment with K_TP (25 pts)
  if (trend.label === 'BULLISH' && momentum.value > 0.1) score += 25;
  else if (trend.label === 'BULLISH')                    score += 15;
  else if (trend.label === 'MILD_BULL')                  score += 8;
  // K_SPREAD adequacy (20 pts)
  score += 20; // baseline — deducted by OKX spread score separately

  return Math.min(100, Math.max(0, score));
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) {
      return Response.json({
        success: false,
        engine: 'FEE_AWARE_POLYGON_TRADING_ENGINE',
        phase: 'PHASE_1_READ_ONLY_SIGNAL_ENGINE',
        tradeAllowed: false,
        reason: 'POLYGON_API_KEY_MISSING',
        error: 'POLYGON_API_KEY not configured'
      }, { status: 500 });
    }

    console.log(`[FEE_AWARE_POLYGON_TRADING_ENGINE] Phase 1 READ-ONLY scan. NO TRADING. User: ${user.email}`);

    // Scan all pairs sequentially — 200ms delay between requests (Polygon rate limit)
    const results = [];
    for (const pair of PAIRS) {
      results.push(await scanPair(pair, polygonApiKey, STRATEGY_CONSTANTS));
      await new Promise(r => setTimeout(r, 200));
    }

    // Sort by finalScore descending
    results.sort((a, b) => b.finalScore - a.finalScore);

    const top3       = results.slice(0, 3);
    const bestPair   = results[0] || null;
    const buyReady   = results.filter(r => r.decision === 'BUY_READY');
    const waitCount  = results.filter(r => r.decision === 'WAIT').length;
    const avoidCount = results.filter(r => r.decision === 'AVOID').length;
    const noPolyCount = results.filter(r => r.decision === 'WAIT_POLYGON_UNAVAILABLE').length;

    console.log(`[FEE_AWARE_POLYGON_TRADING_ENGINE] Scan complete. BUY_READY=${buyReady.length} top=${bestPair?.pair} score=${bestPair?.finalScore?.toFixed(1)}`);

    // ─── Risk Guard: Phase 1 always blocks trading ───
    const riskGuard = {
      killSwitchActive:     true,
      polygonRequired:      true,
      polygonAvailable:     noPolyCount < PAIRS.length,
      tradeAllowed:         false,           // PHASE 1: always false
      blockReason:          'READ_ONLY_PHASE',
      noPolygonNoTrade:     true,
      maxDailyLossCheck:    'SKIPPED_PHASE_1',
      consecutiveLossCheck: 'SKIPPED_PHASE_1',
      feeGtProfitCheck:     buyReady.length > 0 ? 'PASS' : 'FAIL_NO_VIABLE_PAIR',
      duplicateOrdIdCheck:  'SKIPPED_PHASE_1',
      positionMismatchCheck:'SKIPPED_PHASE_1',
    };

    return Response.json({
      success: true,
      engine: 'FEE_AWARE_POLYGON_TRADING_ENGINE',
      phase: 'PHASE_1_READ_ONLY_SIGNAL_ENGINE',
      readOnly: true,
      noTrading: true,
      tradeAllowed: false,
      reason: 'READ_ONLY_PHASE',
      scanTime: new Date().toISOString(),
      constants: STRATEGY_CONSTANTS,
      riskGuard,
      summary: {
        pairsScanned: results.length,
        buyReady: buyReady.length,
        wait: waitCount,
        avoid: avoidCount,
        polygonUnavailable: noPolyCount,
        polygonOk: results.length - noPolyCount,
        bestPair: bestPair?.pair || null,
        bestScore: bestPair?.finalScore || 0,
      },
      bestPair: bestPair ? {
        pair:                      bestPair.pair,
        decision:                  bestPair.decision,
        finalScore:                bestPair.finalScore,
        polygonStatus:             bestPair.polygonStatus,
        polygonDataSource:         bestPair.polygonDataSource,
        okxStatus:                 bestPair.okxStatus,
        trend:                     bestPair.trend,
        momentum:                  bestPair.momentum,
        volumeDelta:               bestPair.volumeDelta,
        volatility:                bestPair.volatility,
        PolygonSignalScore:        bestPair.PolygonSignalScore,
        OKXExecutionScore:         bestPair.OKXExecutionScore,
        ConstantsScore:            bestPair.ConstantsScore,
        expectedNetProfitAfterFees: bestPair.expectedNetProfitAfterFees,
        reason:                    bestPair.reason,
      } : null,
      top3Opportunities: top3,
      allPairs: results,
    });

  } catch (err) {
    console.error('[FEE_AWARE_POLYGON_TRADING_ENGINE] Error:', err.message);
    return Response.json({ success: false, engine: 'FEE_AWARE_POLYGON_TRADING_ENGINE', error: err.message }, { status: 500 });
  }
});

// ─── Scan one pair ────────────────────────────────────────────────────────────
async function scanPair(pair, polygonApiKey, C) {
  const polygonTicker = POLYGON_TICKER_MAP[pair];
  const result = {
    pair,
    polygonTicker,
    scanTime:                   new Date().toISOString(),
    // Polygon Signal Engine
    polygonStatus:              'UNKNOWN',
    polygonDataSource:          'NONE',
    candlesCount:               0,
    trend:                      'UNKNOWN',
    momentum:                   0,
    volumeDelta:                0,
    volatility:                 0,
    // OKX Execution Engine
    okxStatus:                  'UNKNOWN',
    okxBid:                     0,
    okxAsk:                     0,
    spreadPct:                  0,
    // Scores (all 3 pillars)
    PolygonSignalScore:         0,
    OKXExecutionScore:          0,
    ConstantsScore:             0,
    finalScore:                 0,
    // Fee-aware profit
    expectedGrossProfit:        0,
    expectedFees:               0,
    expectedNetProfitAfterFees: 0,
    // Decision
    decision:                   'WAIT',
    reason:                     '',
    tradeAllowed:               false,
    // Sub-scores (for dashboard breakdown)
    trendScore:                 0,
    momentumScore:              0,
    volumeScore:                0,
    volatilityScore:            0,
    candleStructureScore:       0,
    spreadScore:                0,
    feeViabilityScore:          0,
  };

  try {
    // ── 1. Polygon Signal Engine ──────────────────────────────────────────────
    const polyData = await buildPolygonData(polygonTicker, polygonApiKey);

    if (!polyData.ok) {
      // RULE: no Polygon = no trade, no OKX fallback
      result.polygonStatus = 'UNAVAILABLE';
      result.polygonDataSource = 'NONE';
      result.okxStatus = 'SKIPPED_NO_POLYGON';
      result.decision  = 'WAIT_POLYGON_UNAVAILABLE';
      result.reason    = `Polygon unavailable: ${polyData.error}`;
      return result;
    }

    result.polygonStatus    = 'OK';
    result.polygonDataSource = '1d_daily_bars';
    result.candlesCount     = polyData.candles.length;

    const candles = polyData.candles;
    const trend      = analyzeTrend(candles);
    const momentum   = analyzeMomentum(candles);
    const volDelta   = analyzeVolume(candles);
    const volatility = analyzeVolatility(candles);
    const candleStr  = analyzeCandleStructure(candles);

    result.trend       = trend.label;
    result.momentum    = parseFloat(momentum.value.toFixed(4));
    result.volumeDelta = parseFloat(volDelta.delta.toFixed(4));
    result.volatility  = parseFloat(volatility.pct.toFixed(4));

    result.trendScore           = trend.score;
    result.momentumScore        = momentum.score;
    result.volumeScore          = volDelta.score;
    result.volatilityScore      = volatility.score;
    result.candleStructureScore = candleStr.score;

    const PolygonSignalScore = result.trendScore + result.momentumScore + result.volumeScore + result.volatilityScore + result.candleStructureScore;
    result.PolygonSignalScore = parseFloat(PolygonSignalScore.toFixed(2));

    // ── 2. OKX Execution Engine (READ ONLY — bid/ask/spread, no orders) ──────
    const okxTicker = await fetchOKXTicker(pair);
    if (!okxTicker.ok) {
      result.okxStatus = 'UNAVAILABLE';
      result.decision  = 'WAIT';
      result.reason    = `OKX ticker unavailable: ${okxTicker.error}`;
      return result;
    }

    result.okxStatus = 'OK';
    result.okxBid    = okxTicker.bid;
    result.okxAsk    = okxTicker.ask;
    result.spreadPct = parseFloat(okxTicker.spreadPct.toFixed(4));

    const spreadScore       = scoreSpread(okxTicker.spreadPct);
    const liquidityScore    = scoreLiquidity(okxTicker);
    const feeViabilityScore = scoreFeeViability(C, okxTicker);
    const execPriceScore    = scoreExecPrice(okxTicker);

    result.spreadScore       = spreadScore;
    result.feeViabilityScore = feeViabilityScore;

    const OKXExecutionScore = spreadScore + liquidityScore + feeViabilityScore + execPriceScore;
    result.OKXExecutionScore = parseFloat(OKXExecutionScore.toFixed(2));

    // ── 3. Fee-aware profit calculation ──────────────────────────────────────
    const tradeSize  = C.K_SIZE;
    const buyFee     = tradeSize * C.OKX_TAKER_FEE;
    const grossAtTP  = tradeSize * (C.K_TP / 100);
    const sellFee    = (tradeSize - buyFee + grossAtTP) * C.OKX_TAKER_FEE;
    const spreadCost = tradeSize * (okxTicker.spreadPct / 100);
    const totalFees  = buyFee + sellFee + spreadCost;
    const netProfit  = grossAtTP - totalFees;

    result.expectedGrossProfit        = parseFloat(grossAtTP.toFixed(6));
    result.expectedFees               = parseFloat(totalFees.toFixed(6));
    result.expectedNetProfitAfterFees = parseFloat(netProfit.toFixed(6));

    // ── 4. Optimizing Constants Score ─────────────────────────────────────────
    const ConstantsScore = scoreConstants(C, trend, momentum, volatility, netProfit);
    result.ConstantsScore = parseFloat(ConstantsScore.toFixed(2));

    // ── 5. Final composite score (3 pillars) ──────────────────────────────────
    // Polygon: 55%, OKX Execution: 30%, Constants fit: 15%
    const finalScore = (PolygonSignalScore * 0.55) + (OKXExecutionScore * 0.30) + (ConstantsScore * 0.15);
    result.finalScore = parseFloat(finalScore.toFixed(2));

    // ── 6. Decision logic — Risk Guard checks ─────────────────────────────────
    const failReasons = [];

    // Polygon Signal checks
    if (trend.label !== 'BULLISH' && trend.label !== 'MILD_BULL') failReasons.push(`trend=${trend.label}`);
    if (momentum.value <= 0)                                      failReasons.push(`momentum=${momentum.value.toFixed(4)}%`);
    if (volDelta.delta <= 0)                                      failReasons.push(`volumeDelta=${volDelta.delta.toFixed(4)}`);
    if (volatility.extreme || volatility.pct > C.K_VOLATILITY)   failReasons.push(`volatility=${volatility.pct.toFixed(3)}%>K_VOLATILITY=${C.K_VOLATILITY}%`);

    // OKX / fee checks
    if (okxTicker.spreadPct > C.K_SPREAD)  failReasons.push(`spread=${okxTicker.spreadPct.toFixed(4)}%>K_SPREAD=${C.K_SPREAD}%`);
    if (netProfit < C.K_FEE_MIN_NET)       failReasons.push(`netProfit=${netProfit.toFixed(6)}<K_FEE_MIN_NET=${C.K_FEE_MIN_NET}`);

    // Score check
    if (finalScore < C.K_SCORE)            failReasons.push(`finalScore=${finalScore.toFixed(1)}<K_SCORE=${C.K_SCORE}`);

    if (failReasons.length === 0) {
      result.decision = 'BUY_READY';
      result.reason   = 'All entry conditions met. Kill switch ACTIVE — tradeAllowed=false. Awaiting Phase 3 approval.';
    } else if (volatility.extreme || volatility.pct > C.K_VOLATILITY || okxTicker.spreadPct > C.K_SPREAD * 3) {
      result.decision = 'AVOID';
      result.reason   = failReasons.join(' | ');
    } else {
      result.decision = 'WAIT';
      result.reason   = failReasons.join(' | ');
    }

    // Phase 1: never allow trading regardless
    result.tradeAllowed = false;

  } catch (err) {
    result.decision = 'WAIT';
    result.reason   = `Scan error: ${err.message}`;
    result.tradeAllowed = false;
  }

  return result;
}

// ─── Polygon: fetch daily bars ────────────────────────────────────────────────
async function buildPolygonData(ticker, apiKey) {
  try {
    const today     = new Date();
    const todayStr  = today.toISOString().split('T')[0];
    const past30    = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const past30Str = past30.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${past30Str}/${todayStr}?adjusted=true&sort=asc&limit=30&apiKey=${apiKey}`;
    const res  = await fetch(url);
    const json = await res.json();

    if (json.results?.length >= 2) {
      return { ok: true, candles: json.results };
    }

    const errMsg = json.error || json.message || `resultsCount=${json.resultsCount ?? 0}`;
    return { ok: false, error: errMsg, candles: [] };
  } catch (err) {
    return { ok: false, error: err.message, candles: [] };
  }
}

// ─── OKX: fetch bid/ask (read-only, no orders) ───────────────────────────────
async function fetchOKXTicker(instId) {
  try {
    const res  = await fetch(`${OKX_API}/market/ticker?instId=${instId}`);
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
      last:       parseFloat(d.last),
      spreadPct,
      vol24h:     parseFloat(d.vol24h   || 0),
      volCcy24h:  parseFloat(d.volCcy24h || 0),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Polygon Signal Engine: analysis helpers ──────────────────────────────────

function analyzeTrend(candles) {
  if (candles.length < 5) return { label: 'UNKNOWN', score: 0 };
  const closes  = candles.map(c => c.c || c.close || 0);
  const n       = closes.length;
  const recent  = closes.slice(n - 5).reduce((a, b) => a + b, 0) / 5;
  const earlier = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const pctChange = ((recent - earlier) / earlier) * 100;

  if (pctChange > 0.15)  return { label: 'BULLISH',   score: 25 };
  if (pctChange > 0.05)  return { label: 'MILD_BULL',  score: 15 };
  if (pctChange < -0.15) return { label: 'BEARISH',   score: 0  };
  if (pctChange < -0.05) return { label: 'MILD_BEAR', score: 5  };
  return                        { label: 'NEUTRAL',   score: 8  };
}

function analyzeMomentum(candles) {
  if (candles.length < 4) return { value: 0, score: 0 };
  const closes = candles.map(c => c.c || c.close || 0);
  const n = closes.length;
  const momentum = closes[n - 4] > 0 ? (closes[n - 1] - closes[n - 4]) / closes[n - 4] * 100 : 0;

  let score = 0;
  if (momentum > 0.1)        score = 25;
  else if (momentum > 0.03)  score = 18;
  else if (momentum > 0)     score = 10;
  else if (momentum > -0.05) score = 3;

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

  return { delta, score };
}

function analyzeVolatility(candles) {
  if (candles.length < 5) return { pct: 0, score: 10, extreme: false };
  const closes = candles.map(c => c.c || c.close || 0);
  const n      = closes.length;
  const slice  = closes.slice(Math.max(0, n - 10));
  const mean   = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / slice.length;
  const pct    = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;

  let score = 0;
  let extreme = false;
  if (pct < 0.05)  { score = 5;  }
  else if (pct < 0.2)  { score = 15; }
  else if (pct < 0.5)  { score = 10; }
  else if (pct < 1.0)  { score = 5;  }
  else                  { score = 0; extreme = true; }

  return { pct, score, extreme };
}

function analyzeCandleStructure(candles) {
  if (candles.length < 3) return { score: 0 };
  const last3  = candles.slice(-3);
  const highs  = last3.map(c => c.h || c.high  || 0);
  const closes = last3.map(c => c.c || c.close || 0);
  const opens  = last3.map(c => c.o || c.open  || 0);

  const higherHighs   = highs[2] > highs[1] && highs[1] > highs[0];
  const bullishBodies = closes.every((c, i) => c > opens[i]);
  const lastBullish   = closes[2] > opens[2];

  let score = 0;
  if (higherHighs && bullishBodies)  score = 15;
  else if (higherHighs && lastBullish) score = 10;
  else if (lastBullish)                score = 5;

  return { score };
}

// ─── OKX Execution Engine: scoring helpers ────────────────────────────────────

function scoreSpread(spreadPct) {
  if (spreadPct < 0.005) return 30;
  if (spreadPct < 0.01)  return 25;
  if (spreadPct < 0.02)  return 18;
  if (spreadPct < 0.03)  return 10;
  if (spreadPct < 0.05)  return 5;
  return 0;
}

function scoreLiquidity(ticker) {
  const vol = ticker.volCcy24h || ticker.vol24h || 0;
  if (vol > 50000000) return 20;
  if (vol > 10000000) return 15;
  if (vol > 1000000)  return 10;
  if (vol > 100000)   return 5;
  return 0;
}

function scoreFeeViability(C, ticker) {
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
  if (!ticker.last || !ticker.bid) return 10;
  const slippage = Math.abs(ticker.ask - ticker.last) / ticker.last * 100;
  if (slippage < 0.005) return 20;
  if (slippage < 0.01)  return 15;
  if (slippage < 0.02)  return 10;
  return 5;
}