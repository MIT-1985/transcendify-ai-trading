/**
 * testPolygonFeeAwareSignal — PHASE 1: READ ONLY SIGNAL ENGINE
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE
 * Phase:    PHASE_1_READ_ONLY_SIGNAL_ENGINE
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NO OKX ORDER ENDPOINT CALLED — noOKXOrderEndpointCalled = true
 *
 * Features:
 *   - Daily aggregates only (30 candles, 1/day)
 *   - 900ms delay between Polygon requests
 *   - 2 retries with 2500ms wait on rate limit
 *   - 5-minute in-memory cache per polygon symbol
 *   - Primary/secondary pair scanning with scanQuality rating
 *   - Risk Guard: DEGRADED_SCAN/BLOCKED → all WAIT_POLYGON_UNAVAILABLE
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Pairs config ─────────────────────────────────────────────────────────────
const PRIMARY_PAIRS = [
  { okx: 'BTC-USDT',  poly: 'X:BTCUSD'  },
  { okx: 'ETH-USDT',  poly: 'X:ETHUSD'  },
  { okx: 'SOL-USDT',  poly: 'X:SOLUSD'  },
  { okx: 'DOGE-USDT', poly: 'X:DOGEUSD' },
  { okx: 'XRP-USDT',  poly: 'X:XRPUSD'  },
];

const SECONDARY_PAIRS = [
  { okx: 'BNB-USDT',  poly: 'X:BNBUSD'  },
  { okx: 'ADA-USDT',  poly: 'X:ADAUSD'  },
  { okx: 'LINK-USDT', poly: 'X:LINKUSD' },
  { okx: 'AVAX-USDT', poly: 'X:AVAXUSD' },
  { okx: 'LTC-USDT',  poly: 'X:LTCUSD'  },
];

const ALL_PAIRS = [...PRIMARY_PAIRS, ...SECONDARY_PAIRS];

// ─── Constants (Optimizing Constants Engine) ──────────────────────────────────
const C = {
  K_TP:             0.45,
  K_SL:            -0.25,
  K_SPREAD:         0.03,
  K_SCORE:          70,
  K_SIZE:           10,
  K_RESERVE:        80,
  K_FEE_MIN_NET:    0.03,
  K_VOLATILITY_MAX: 1.5,
  OKX_TAKER_FEE:    0.001,
};

// ─── In-memory cache (5-minute TTL) ──────────────────────────────────────────
const CACHE = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(polySymbol) {
  const entry = CACHE[polySymbol];
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  if (ageMs > CACHE_TTL_MS) { delete CACHE[polySymbol]; return null; }
  return { candles: entry.candles, ageSeconds: Math.floor(ageMs / 1000) };
}

function setCache(polySymbol, candles) {
  CACHE[polySymbol] = { candles, fetchedAt: Date.now() };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPolygonDailyBars(ticker, apiKey) {
  const today   = new Date().toISOString().split('T')[0];
  const past30  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${past30}/${today}?adjusted=true&sort=asc&limit=30&apiKey=${apiKey}`;

  const MAX_RETRIES = 2;
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res  = await fetch(url);
      const json = await res.json();

      // Rate limited
      if (res.status === 429 || json?.status === 'ERROR' && json?.error?.includes('rate')) {
        console.log(`[POLYGON] Rate limited for ${ticker} attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
        if (attempt < MAX_RETRIES) { await sleep(2500); continue; }
        return { ok: false, error: 'RATE_LIMITED', candles: [] };
      }

      if (json.results?.length >= 2) {
        return { ok: true, candles: json.results };
      }

      lastError = json.error || json.message || `resultsCount=${json.resultsCount ?? 0}`;
      // Don't retry on data errors, only rate limit
      return { ok: false, error: lastError, candles: [] };

    } catch (err) {
      lastError = err.message;
      if (attempt < MAX_RETRIES) { await sleep(2500); continue; }
    }
  }

  return { ok: false, error: lastError, candles: [] };
}

async function fetchOKXTicker(instId) {
  // NOTE: This is market ticker ONLY — no order endpoint called
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    const json = await res.json();
    const d = json.data?.[0];
    if (!d) return { ok: false, error: 'no data' };
    const bid = parseFloat(d.bidPx || d.last || 0);
    const ask = parseFloat(d.askPx || d.last || 0);
    const mid = (bid + ask) / 2;
    const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 0;
    return {
      ok: true, bid, ask,
      last:      parseFloat(d.last      || 0),
      vol24h:    parseFloat(d.vol24h    || 0),
      volCcy24h: parseFloat(d.volCcy24h || 0),
      spreadPct,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Polygon Signal Engine ────────────────────────────────────────────────────
function analyzeTrend(candles) {
  if (candles.length < 5) return { label: 'UNKNOWN', score: 0 };
  const closes  = candles.map(c => c.c || 0);
  const n = closes.length;
  const recent  = closes.slice(n - 5).reduce((a, b) => a + b, 0) / 5;
  const earlier = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const pct = earlier > 0 ? ((recent - earlier) / earlier) * 100 : 0;
  if (pct > 0.15)  return { label: 'BULLISH',   score: 25 };
  if (pct > 0.05)  return { label: 'MILD_BULL',  score: 15 };
  if (pct < -0.15) return { label: 'BEARISH',   score: 0  };
  if (pct < -0.05) return { label: 'MILD_BEAR', score: 5  };
  return               { label: 'NEUTRAL',   score: 8  };
}

function analyzeMomentum(candles) {
  if (candles.length < 4) return { value: 0, score: 0 };
  const closes = candles.map(c => c.c || 0);
  const n = closes.length;
  const mom = closes[n - 4] > 0 ? (closes[n - 1] - closes[n - 4]) / closes[n - 4] * 100 : 0;
  let score = 0;
  if (mom > 0.1)       score = 25;
  else if (mom > 0.03) score = 18;
  else if (mom > 0)    score = 10;
  else if (mom > -0.05)score = 3;
  return { value: mom, score };
}

function analyzeVolume(candles) {
  if (candles.length < 6) return { delta: 0, score: 0 };
  const vols = candles.map(c => c.v || 0);
  const n = vols.length;
  const recentAvg  = vols.slice(n - 3).reduce((a, b) => a + b, 0) / 3;
  const earlierAvg = vols.slice(n - 6, n - 3).reduce((a, b) => a + b, 0) / 3;
  const delta = earlierAvg > 0 ? (recentAvg - earlierAvg) / earlierAvg : 0;
  let score = 0;
  if (delta > 0.3)      score = 20;
  else if (delta > 0.1) score = 14;
  else if (delta > 0)   score = 8;
  // volume collapsing check
  const collapsing = delta < -0.3;
  return { delta, score, collapsing };
}

function analyzeVolatility(candles) {
  if (candles.length < 5) return { pct: 0, score: 10, extreme: false };
  const closes = candles.map(c => c.c || 0);
  const n = closes.length;
  const slice = closes.slice(Math.max(0, n - 10));
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / slice.length;
  const pct = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
  let score = 0, extreme = false;
  if (pct < 0.05)              score = 5;
  else if (pct < 0.2)          score = 15;
  else if (pct < 0.5)          score = 10;
  else if (pct < C.K_VOLATILITY_MAX) score = 5;
  else                         { score = 0; extreme = true; }
  return { pct, score, extreme };
}

function analyzeCandleStructure(candles) {
  if (candles.length < 3) return { score: 0 };
  const last3  = candles.slice(-3);
  const highs  = last3.map(c => c.h || 0);
  const closes = last3.map(c => c.c || 0);
  const opens  = last3.map(c => c.o || 0);
  const higherHighs   = highs[2] > highs[1] && highs[1] > highs[0];
  const bullishBodies = closes.every((c, i) => c > opens[i]);
  const lastBullish   = closes[2] > opens[2];
  let score = 0;
  if (higherHighs && bullishBodies)   score = 15;
  else if (higherHighs && lastBullish) score = 10;
  else if (lastBullish)                score = 5;
  return { score };
}

// ─── OKX Execution Engine (READ ONLY — market ticker only) ───────────────────
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

function scoreFeeViability(ticker) {
  const tradeSize  = C.K_SIZE;
  const grossAtTP  = tradeSize * (C.K_TP / 100);
  const buyFee     = tradeSize * C.OKX_TAKER_FEE;
  const sellFee    = tradeSize * C.OKX_TAKER_FEE;
  const spreadCost = tradeSize * (ticker.spreadPct / 100);
  const net = grossAtTP - buyFee - sellFee - spreadCost;
  if (net >= C.K_FEE_MIN_NET * 3) return 30;
  if (net >= C.K_FEE_MIN_NET * 2) return 22;
  if (net >= C.K_FEE_MIN_NET)     return 15;
  if (net >= 0)                   return 5;
  return 0;
}

function scoreExecPrice(ticker) {
  if (!ticker.last || !ticker.bid) return 10;
  const slip = Math.abs(ticker.ask - ticker.last) / ticker.last * 100;
  if (slip < 0.005) return 20;
  if (slip < 0.01)  return 15;
  if (slip < 0.02)  return 10;
  return 5;
}

function computeConstantsScore(trend, momentum, volatility, netProfit) {
  let score = 0;
  // K_FEE_MIN_NET alignment (30 pts)
  if (netProfit >= C.K_FEE_MIN_NET * 3)      score += 30;
  else if (netProfit >= C.K_FEE_MIN_NET * 2) score += 20;
  else if (netProfit >= C.K_FEE_MIN_NET)     score += 10;
  // K_VOLATILITY_MAX alignment (30 pts)
  if (volatility.pct < 0.3)                  score += 30;
  else if (volatility.pct < 0.8)             score += 20;
  else if (volatility.pct < C.K_VOLATILITY_MAX) score += 10;
  // Trend/momentum fit (25 pts)
  if (trend.label === 'BULLISH' && momentum.value > 0.1) score += 25;
  else if (trend.label === 'BULLISH')                    score += 15;
  else if (trend.label === 'MILD_BULL')                  score += 8;
  // K_SPREAD baseline (15 pts)
  score += 15;
  return Math.min(100, Math.max(0, score));
}

// ─── Score one pair ───────────────────────────────────────────────────────────
async function scorePair(pairConfig, polygonApiKey, degraded) {
  const { okx: pair, poly: polygonSymbol } = pairConfig;

  const base = {
    pair,
    polygonSymbol,
    polygonStatus:   'UNKNOWN',
    polygonDataSource: 'NONE',
    cacheAgeSeconds: null,
    candlesCount:    0,
    okxStatus:       'UNKNOWN',
    bid: 0, ask: 0, spreadPct: 0, lastClose: 0,
    trend: 'UNKNOWN', momentum: 0, volumeDelta: 0, volatility: 0,
    PolygonSignalScore: 0, OKXExecutionScore: 0, ConstantsScore: 0,
    finalScore: 0,
    expectedNetProfitAfterFees: 0,
    decision: 'WAIT_POLYGON_UNAVAILABLE',
    reason: '',
    blockers: [],
    tradeAllowed: false,
  };

  // If scan quality is too low, skip scoring
  if (degraded) {
    base.decision = 'WAIT_POLYGON_UNAVAILABLE';
    base.reason   = 'scanQuality=DEGRADED_SCAN — Polygon data insufficient for reliable signals';
    return base;
  }

  // ── Polygon: try cache first ──
  let candles = null;
  const cached = getCached(polygonSymbol);
  if (cached) {
    candles = cached.candles;
    base.polygonDataSource = 'CACHE_DAILY_BARS';
    base.cacheAgeSeconds   = cached.ageSeconds;
    base.polygonStatus     = 'OK';
    base.candlesCount      = candles.length;
  } else {
    const polyRes = await fetchPolygonDailyBars(polygonSymbol, polygonApiKey);
    if (!polyRes.ok) {
      base.polygonStatus   = 'UNAVAILABLE';
      base.polygonDataSource = 'NONE';
      base.okxStatus        = 'SKIPPED_NO_POLYGON';
      base.decision         = 'WAIT_POLYGON_UNAVAILABLE';
      base.reason           = `Polygon unavailable: ${polyRes.error}`;
      base.blockers         = [`POLYGON_UNAVAILABLE: ${polyRes.error}`];
      return base;
    }
    candles = polyRes.candles;
    setCache(polygonSymbol, candles);
    base.polygonDataSource = 'POLYGON_DAILY_BARS';
    base.polygonStatus     = 'OK';
    base.candlesCount      = candles.length;
  }

  base.lastClose = candles[candles.length - 1]?.c || 0;

  // ── Polygon Signal Engine ──
  const trend      = analyzeTrend(candles);
  const momentum   = analyzeMomentum(candles);
  const volDelta   = analyzeVolume(candles);
  const volatility = analyzeVolatility(candles);
  const candleStr  = analyzeCandleStructure(candles);

  base.trend       = trend.label;
  base.momentum    = parseFloat(momentum.value.toFixed(4));
  base.volumeDelta = parseFloat(volDelta.delta.toFixed(4));
  base.volatility  = parseFloat(volatility.pct.toFixed(4));

  const PolygonSignalScore = trend.score + momentum.score + volDelta.score + volatility.score + candleStr.score;
  base.PolygonSignalScore = parseFloat(PolygonSignalScore.toFixed(2));

  // ── OKX Execution Engine (READ ONLY — ticker only, no orders) ──
  const okx = await fetchOKXTicker(pair);
  if (!okx.ok) {
    base.okxStatus = 'UNAVAILABLE';
    base.decision  = 'WAIT';
    base.reason    = `OKX ticker unavailable: ${okx.error}`;
    base.blockers  = ['OKX_TICKER_UNAVAILABLE'];
    return base;
  }
  base.okxStatus  = 'OK';
  base.bid        = okx.bid;
  base.ask        = okx.ask;
  base.spreadPct  = parseFloat(okx.spreadPct.toFixed(6));

  const spreadScore    = scoreSpread(okx.spreadPct);
  const liquidScore    = scoreLiquidity(okx);
  const feeViaScore    = scoreFeeViability(okx);
  const execPriceScore = scoreExecPrice(okx);
  const OKXExecutionScore = spreadScore + liquidScore + feeViaScore + execPriceScore;
  base.OKXExecutionScore = parseFloat(OKXExecutionScore.toFixed(2));

  // ── Fee-aware net profit ──
  const tradeSize  = C.K_SIZE;
  const grossAtTP  = tradeSize * (C.K_TP / 100);
  const buyFee     = tradeSize * C.OKX_TAKER_FEE;
  const sellFee    = (tradeSize + grossAtTP) * C.OKX_TAKER_FEE;
  const spreadCost = tradeSize * (okx.spreadPct / 100);
  const netProfit  = grossAtTP - buyFee - sellFee - spreadCost;
  base.expectedNetProfitAfterFees = parseFloat(netProfit.toFixed(6));

  // ── Constants Score ──
  const ConstantsScore = computeConstantsScore(trend, momentum, volatility, netProfit);
  base.ConstantsScore = parseFloat(ConstantsScore.toFixed(2));

  // ── Final Score: Polygon 65% + OKX 35% ──
  const finalScore = (PolygonSignalScore * 0.65) + (OKXExecutionScore * 0.35);
  base.finalScore = parseFloat(finalScore.toFixed(2));

  // ── Decision ──
  const blockers = [];
  if (trend.label !== 'BULLISH' && trend.label !== 'MILD_BULL') blockers.push(`trend=${trend.label}`);
  if (momentum.value <= 0)               blockers.push(`momentum=${momentum.value.toFixed(4)}%`);
  if (volDelta.collapsing)               blockers.push(`volumeCollapsing=${volDelta.delta.toFixed(3)}`);
  if (volatility.extreme || volatility.pct > C.K_VOLATILITY_MAX) blockers.push(`volatility=${volatility.pct.toFixed(3)}%>K_VOLATILITY_MAX=${C.K_VOLATILITY_MAX}%`);
  if (okx.spreadPct > C.K_SPREAD)       blockers.push(`spread=${okx.spreadPct.toFixed(4)}%>K_SPREAD=${C.K_SPREAD}%`);
  if (netProfit < C.K_FEE_MIN_NET)      blockers.push(`netProfit=${netProfit.toFixed(4)}<K_FEE_MIN_NET=${C.K_FEE_MIN_NET}`);
  if (finalScore < C.K_SCORE)           blockers.push(`finalScore=${finalScore.toFixed(1)}<K_SCORE=${C.K_SCORE}`);

  base.blockers = blockers;

  if (blockers.length === 0) {
    base.decision = 'BUY_READY';
    base.reason   = 'All Phase 1 entry conditions met. tradeAllowed=false (READ_ONLY_PHASE).';
  } else if (
    volatility.extreme ||
    volatility.pct > C.K_VOLATILITY_MAX ||
    okx.spreadPct > C.K_SPREAD * 3 ||
    volDelta.collapsing
  ) {
    base.decision = 'AVOID';
    base.reason   = blockers.join(' | ');
  } else {
    base.decision = 'WAIT';
    base.reason   = blockers.join(' | ');
  }

  return base;
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
        engine: 'FEE_AWARE_POLYGON_TRADING_ENGINE',
        phase: 'PHASE_1_READ_ONLY_SIGNAL_ENGINE',
        tradeAllowed: false,
        reason: 'POLYGON_API_KEY_MISSING',
        error: 'POLYGON_API_KEY not configured'
      }, { status: 500 });
    }

    console.log(`[FEE_AWARE_POLYGON_TRADING_ENGINE] Phase 1 READ-ONLY scan started. User: ${user.email}`);

    // ── Step 1: Scan PRIMARY pairs first (with 900ms delay between each) ──
    const primaryResults = [];
    for (const pair of PRIMARY_PAIRS) {
      const result = await scorePair(pair, polygonApiKey, false);
      primaryResults.push(result);
      console.log(`[POLYGON] ${pair.okx}: ${result.polygonStatus} source=${result.polygonDataSource} decision=${result.decision}`);
      // 900ms delay between Polygon requests (skip last one before secondary)
      await sleep(900);
    }

    // ── Step 2: Evaluate primary scan quality ──
    const primaryOK = primaryResults.filter(r => r.polygonStatus === 'OK').length;
    let scanQuality;
    if (primaryOK >= 5) {
      scanQuality = 'PRIMARY_OK'; // will upgrade to FULL_SCAN after secondary
    } else if (primaryOK >= 3) {
      scanQuality = 'PARTIAL_PRIMARY';
    } else if (primaryOK > 0) {
      scanQuality = 'DEGRADED_SCAN';
    } else {
      scanQuality = 'BLOCKED';
    }

    const degraded = scanQuality === 'DEGRADED_SCAN' || scanQuality === 'BLOCKED';

    // ── Step 3: Scan SECONDARY pairs ──
    const secondaryResults = [];
    for (const pair of SECONDARY_PAIRS) {
      const result = await scorePair(pair, polygonApiKey, degraded);
      secondaryResults.push(result);
      console.log(`[POLYGON] ${pair.okx}: ${result.polygonStatus} source=${result.polygonDataSource} decision=${result.decision}`);
      if (!degraded) await sleep(900);
    }

    const allResults = [...primaryResults, ...secondaryResults];
    const totalPolyOK = allResults.filter(r => r.polygonStatus === 'OK').length;

    // Upgrade scan quality if all 10 pairs ok
    if (totalPolyOK === 10) scanQuality = 'FULL_SCAN';

    // ── Step 4: Sort by finalScore ──
    const sorted = [...allResults].sort((a, b) => b.finalScore - a.finalScore);
    const top3   = sorted.slice(0, 3);
    const best   = sorted[0] || null;

    // ── Step 5: Build summary counts ──
    const pairsRequested    = allResults.length;
    const pairsPolygonOK    = totalPolyOK;
    const pairsFromCache    = allResults.filter(r => r.polygonDataSource === 'CACHE_DAILY_BARS').length;
    const pairsUnavailable  = allResults.filter(r => r.polygonStatus !== 'OK').length;

    console.log(`[FEE_AWARE_POLYGON_TRADING_ENGINE] Scan complete. scanQuality=${scanQuality} polyOK=${pairsPolygonOK}/${pairsRequested} cache=${pairsFromCache} best=${best?.pair} score=${best?.finalScore}`);

    return Response.json({
      success: true,
      engine:  'FEE_AWARE_POLYGON_TRADING_ENGINE',
      phase:   'PHASE_1_READ_ONLY_SIGNAL_ENGINE',
      tradeAllowed:             false,
      reason:                   degraded ? 'POLYGON_DATA_INSUFFICIENT' : 'READ_ONLY_PHASE',
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      scanQuality,
      scanTime:                 new Date().toISOString(),
      pairsRequested,
      pairsPolygonOK,
      pairsFromCache,
      pairsUnavailable,
      constants: C,
      bestPair: best ? {
        pair:                      best.pair,
        decision:                  best.decision,
        finalScore:                best.finalScore,
        polygonStatus:             best.polygonStatus,
        polygonDataSource:         best.polygonDataSource,
        okxStatus:                 best.okxStatus,
        trend:                     best.trend,
        momentum:                  best.momentum,
        volumeDelta:               best.volumeDelta,
        volatility:                best.volatility,
        PolygonSignalScore:        best.PolygonSignalScore,
        OKXExecutionScore:         best.OKXExecutionScore,
        ConstantsScore:            best.ConstantsScore,
        expectedNetProfitAfterFees: best.expectedNetProfitAfterFees,
        reason:                    best.reason,
        blockers:                  best.blockers,
      } : null,
      top3: top3.map(p => ({
        pair: p.pair, decision: p.decision, finalScore: p.finalScore,
        polygonStatus: p.polygonStatus, polygonDataSource: p.polygonDataSource,
        okxStatus: p.okxStatus, trend: p.trend, momentum: p.momentum,
        PolygonSignalScore: p.PolygonSignalScore, OKXExecutionScore: p.OKXExecutionScore,
        ConstantsScore: p.ConstantsScore, expectedNetProfitAfterFees: p.expectedNetProfitAfterFees,
        blockers: p.blockers, reason: p.reason,
      })),
      results: sorted,
    });

  } catch (err) {
    console.error('[FEE_AWARE_POLYGON_TRADING_ENGINE] Error:', err.message);
    return Response.json({
      success: false,
      engine: 'FEE_AWARE_POLYGON_TRADING_ENGINE',
      tradeAllowed: false,
      error: err.message
    }, { status: 500 });
  }
});