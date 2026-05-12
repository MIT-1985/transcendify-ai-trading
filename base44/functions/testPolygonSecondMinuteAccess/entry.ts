/**
 * testPolygonSecondMinuteAccess — ⚠️ DEPRECATED — READ-ONLY DIAGNOSTIC ONLY
 *
 * STATUS:   DEPRECATED — NOT PART OF ACTIVE ENGINE
 * Replaced: testOKXOnlyDataAccess (OKX-only engine, no Polygon dependency)
 * Kept:     For reference / historical Polygon data comparison only
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE (archived)
 * Phase:    DATA_ACCESS_DIAGNOSTIC (archived)
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 *
 * Tests exactly what data Polygon.io and OKX give us:
 *   - Polygon 1-second aggregates (last 10 min)
 *   - Polygon 1-minute aggregates (last 120 min)
 *   - Polygon daily aggregates    (last 30 days)
 *   - OKX 1m candles
 *   - OKX tick/1s endpoint (if available)
 *
 * Returns raw endpoint, status, candleCount, errorBody, and
 * a recommended data mode per pair.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PRIMARY_PAIRS = [
  { okx: 'BTC-USDT',  poly: 'X:BTCUSD'  },
  { okx: 'ETH-USDT',  poly: 'X:ETHUSD'  },
  { okx: 'SOL-USDT',  poly: 'X:SOLUSD'  },
  { okx: 'DOGE-USDT', poly: 'X:DOGEUSD' },
  { okx: 'XRP-USDT',  poly: 'X:XRPUSD'  },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Polygon daily macro cache (15-minute TTL, stale fallback) ─────────────────
const _polyDailyCache = {};
const CACHE_TTL_MS = 15 * 60 * 1000;

async function getCachedPolygonDaily(okxPair, polyTicker, polygonApiKey) {
  const now      = Date.now();
  const cached   = _polyDailyCache[okxPair];
  const cacheAge = cached ? Math.floor((now - cached.fetchedAt) / 1000) : null;
  const isFresh  = cached && (now - cached.fetchedAt) < CACHE_TTL_MS;

  if (isFresh) {
    return { available: true, candlesCount: cached.candlesCount, bars: cached.bars,
      source: 'CACHE', cacheAgeSeconds: cacheAge, degraded: false, httpStatus: 200, errorBody: null };
  }

  const from30d  = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toToday  = new Date(now).toISOString().split('T')[0];
  const endpoint = `https://api.polygon.io/v2/aggs/ticker/${polyTicker}/range/1/day/${from30d}/${toToday}?adjusted=true&sort=asc&limit=50&apiKey=${polygonApiKey}`;

  try {
    const res    = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    const body   = await res.text();
    let json;
    try { json = JSON.parse(body); } catch { json = null; }

    const httpStatus   = res.status;
    const bars         = json?.results || [];
    const candlesCount = bars.length;
    const success      = httpStatus === 200 && candlesCount > 0;

    if (success) {
      _polyDailyCache[okxPair] = { bars, candlesCount, fetchedAt: now };
      return { available: true, candlesCount, bars, source: 'POLYGON_API',
        cacheAgeSeconds: 0, degraded: false, httpStatus, errorBody: null };
    }

    const errorBody = json
      ? { status: json.status, message: json.message, resultsCount: candlesCount }
      : body.slice(0, 300);

    if (cached) {
      return { available: true, candlesCount: cached.candlesCount, bars: cached.bars,
        source: 'STALE_CACHE', cacheAgeSeconds: cacheAge, degraded: true, httpStatus, errorBody,
        reason: 'Polygon unavailable, using stale daily macro cache' };
    }

    return { available: false, candlesCount: 0, bars: [], source: 'NONE',
      cacheAgeSeconds: null, degraded: false, httpStatus, errorBody,
      reason: json?.message || `Polygon HTTP ${httpStatus}` };

  } catch (err) {
    if (cached) {
      return { available: true, candlesCount: cached.candlesCount, bars: cached.bars,
        source: 'STALE_CACHE', cacheAgeSeconds: cacheAge, degraded: true, httpStatus: 0,
        errorBody: { message: err.message }, reason: 'Polygon unavailable, using stale daily macro cache' };
    }
    return { available: false, candlesCount: 0, bars: [], source: 'NONE',
      cacheAgeSeconds: null, degraded: false, httpStatus: 0,
      errorBody: { message: err.message }, reason: err.message };
  }
}

// ── Polygon aggregate tester (1s / 1m only — daily uses cache above) ──────────
async function testPolygonAgg(ticker, multiplier, timespan, fromMs, toMs, apiKey) {
  const from = new Date(fromMs).toISOString().replace('T', ' ').slice(0, 19);
  const to   = new Date(toMs).toISOString().replace('T', ' ').slice(0, 19);

  // Polygon requires ISO date strings or unix ms for /range endpoint
  const fromStr = new Date(fromMs).toISOString().split('T')[0];
  const toStr   = new Date(toMs).toISOString().split('T')[0];

  // For second/minute we need full datetime stamps (unix ms)
  const fromUnix = fromMs;
  const toUnix   = toMs;

  let endpoint;
  if (timespan === 'day') {
    endpoint = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=50&apiKey=${apiKey}`;
  } else {
    // For second/minute, use unix ms timestamps
    endpoint = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromUnix}/${toUnix}?adjusted=true&sort=asc&limit=500&apiKey=${apiKey}`;
  }

  try {
    const res  = await fetch(endpoint);
    const body = await res.text();
    let json;
    try { json = JSON.parse(body); } catch { json = null; }

    const status       = res.status;
    const resultsCount = json?.resultsCount ?? json?.results?.length ?? 0;
    const available    = status === 200 && resultsCount > 0;

    let errorBody = null;
    if (!available) {
      errorBody = json ? { status: json.status, error: json.error, message: json.message, resultsCount } : body.slice(0, 300);
    }

    return {
      available,
      candlesCount:  resultsCount,
      httpStatus:    status,
      endpoint:      endpoint.replace(apiKey, '***'),
      errorMessage:  !available ? (json?.error || json?.message || `HTTP ${status}`) : null,
      errorBody,
    };
  } catch (err) {
    return {
      available:    false,
      candlesCount: 0,
      httpStatus:   0,
      endpoint:     endpoint.replace(apiKey, '***'),
      errorMessage: err.message,
      errorBody:    null,
    };
  }
}

// ── OKX candle constants (correct values) ────────────────────────────────────
// OKX does NOT have 1s candle bars. Smallest bar = 1m.
// /market/candles max limit = 300 per request
// /market/history-candles max limit = 100 per request
// /market/trades max = 500 (tick confirmation, not candles)
const OKX_CANDLE_LIMIT  = 300;
const OKX_HISTORY_LIMIT = 100;
const OKX_TRADES_LIMIT  = 500;

// ── OKX 1m candle tester ──────────────────────────────────────────────────────
async function testOKX1m(instId) {
  // Use 120 candles (well within 300 limit) — covers 2 hours of 1m data
  const limit   = Math.min(120, OKX_CANDLE_LIMIT);
  const endpoint = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=${limit}`;
  try {
    const res  = await fetch(endpoint);
    const json = await res.json();
    const data = json?.data || [];
    return {
      available:    data.length > 0,
      candlesCount: data.length,
      httpStatus:   res.status,
      endpoint,
      note:         `OKX /market/candles max=${OKX_CANDLE_LIMIT}. No 1s bars on OKX — 1m is smallest.`,
      errorMessage: data.length === 0 ? (json?.msg || `HTTP ${res.status} no data`) : null,
    };
  } catch (err) {
    return { available: false, candlesCount: 0, httpStatus: 0, endpoint, errorMessage: err.message };
  }
}

// ── OKX tick / trades tester (NOT candles — trade confirmation) ───────────────
// OKX has NO 1s candle endpoint. For near-realtime confirmation use /market/trades.
// Also test /market/history-candles (paginatable, 100/req) for extended history.
async function testOKXTickOrSecond(instId) {
  const endpoints = [
    // Recent trades — tick confirmation (max 500)
    { label: 'OKX_TRADES_TICK',    url: `https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=100` },
    // History candles — paginated 1m history (max 100/req)
    { label: 'OKX_HISTORY_1M',     url: `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1m&limit=${OKX_HISTORY_LIMIT}` },
    // Mark price 1m candles
    { label: 'OKX_MARK_PRICE_1M',  url: `https://www.okx.com/api/v5/market/mark-price-candles?instId=${instId}&bar=1m&limit=10` },
  ];

  const results = [];
  for (const ep of endpoints) {
    try {
      const res  = await fetch(ep.url);
      const json = await res.json();
      const data = json?.data || [];
      results.push({
        label:        ep.label,
        available:    data.length > 0,
        dataCount:    data.length,
        httpStatus:   res.status,
        endpoint:     ep.url,
        errorMessage: data.length === 0 ? (json?.msg || `HTTP ${res.status}`) : null,
      });
    } catch (err) {
      results.push({ label: ep.label, available: false, dataCount: 0, httpStatus: 0, endpoint: ep.url, errorMessage: err.message });
    }
  }

  const bestWorking = results.find(r => r.available);
  return {
    available:    !!bestWorking,
    bestEndpoint: bestWorking?.label || 'NONE',
    results,
  };
}

// ── Determine recommended data mode per pair ──────────────────────────────────
function recommendDataMode(poly1s, poly1m, polyDaily, okx1m, okxTick) {
  let recommendedIntradaySource;
  let recommendedMacroSource;
  let engineRule;
  let dataMode;
  let tradeAllowed = false;
  let recommendedAction;
  let reason;

  if (poly1s.available) {
    recommendedIntradaySource = 'POLYGON_1S';
    engineRule = 'POLYGON_1S_MICRO_SIGNAL';
    dataMode = 'POLYGON_1S_MICRO_SIGNAL';
  } else if (poly1m.available) {
    recommendedIntradaySource = 'POLYGON_1M';
    engineRule = 'POLYGON_1M_INTRADAY_SIGNAL';
    dataMode = 'POLYGON_1M_INTRADAY_SIGNAL';
  } else if (polyDaily.available && okx1m.available && okxTick.available) {
    // Full confirmed engine mode
    recommendedIntradaySource = 'OKX_1M';
    engineRule = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION';
    dataMode = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION';
    recommendedAction = 'TRADE_READY';
  } else if (polyDaily.available && okx1m.available) {
    recommendedIntradaySource = 'OKX_1M';
    engineRule = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY';
    dataMode = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY';
    recommendedAction = 'WATCH_ONLY';
    reason = 'OKX trades/tick unavailable';
  } else if (okx1m.available && okxTick.available) {
    // Polygon macro unavailable — limited mode
    recommendedIntradaySource = 'OKX_1M';
    engineRule = 'OKX_INTRADAY_ONLY_LIMITED';
    dataMode = 'OKX_INTRADAY_ONLY_LIMITED';
    recommendedAction = 'WATCH_ONLY';
    reason = 'Polygon macro unavailable for this pair';
  } else if (okxTick.available) {
    recommendedIntradaySource = 'OKX_TICK';
    engineRule = 'OKX_TICK_ONLY_LIMITED';
    dataMode = 'OKX_TICK_ONLY_LIMITED';
    recommendedAction = 'WATCH_ONLY';
    reason = 'Polygon macro unavailable and OKX 1m unavailable';
  } else {
    recommendedIntradaySource = 'NONE';
    engineRule = 'WAIT_DATA_UNAVAILABLE';
    dataMode = 'WAIT_DATA_UNAVAILABLE';
    recommendedAction = 'SKIP';
    reason = 'No usable data source';
  }

  recommendedMacroSource = polyDaily.available ? 'POLYGON_DAILY' : 'NONE';

  return { recommendedIntradaySource, recommendedMacroSource, engineRule, dataMode, tradeAllowed, recommendedAction, reason };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) return Response.json({
      tradeAllowed: false,
      error: 'POLYGON_API_KEY not configured'
    }, { status: 500 });

    console.log(`[DATA_ACCESS_TEST] Started. User: ${user.email}. tradeAllowed=false. noOKXOrderEndpointCalled=true.`);

    const now      = Date.now();
    const from10m  = now - 10  * 60 * 1000;   // last 10 minutes
    const from120m = now - 120 * 60 * 1000;   // last 120 minutes

    const pairResults = [];

    for (const pair of PRIMARY_PAIRS) {
      console.log(`[DATA_ACCESS_TEST] Testing ${pair.okx} / ${pair.poly} ...`);

      // Run Polygon 1s / 1m tests sequentially with delay
      const poly1s    = await testPolygonAgg(pair.poly, 1, 'second', from10m,  now, polygonApiKey);
      await sleep(600);
      const poly1m    = await testPolygonAgg(pair.poly, 1, 'minute', from120m, now, polygonApiKey);
      await sleep(600);
      // Daily uses cache layer — no extra sleep needed if cache hit
      const polyDaily = await getCachedPolygonDaily(pair.okx, pair.poly, polygonApiKey);
      if (polyDaily.source === 'POLYGON_API') await sleep(700); // only delay if we actually hit Polygon

      // OKX tests (no rate limit concerns)
      const okx1m   = await testOKX1m(pair.okx);
      const okxTick = await testOKXTickOrSecond(pair.okx);

      const { recommendedIntradaySource, recommendedMacroSource, engineRule, dataMode, tradeAllowed: pairTradeAllowed, recommendedAction, reason } = recommendDataMode(poly1s, poly1m, polyDaily, okx1m, okxTick);

      // Classify pair coverage
      const isStaleData = polyDaily.available && polyDaily.source === 'STALE_CACHE' && okx1m.available && okxTick.available;
      const isFullData  = polyDaily.available && !isStaleData && okx1m.available && okxTick.available;
      const isLimited   = !polyDaily.available && (okx1m.available || okxTick.available);

      console.log(`[DATA_ACCESS_TEST] ${pair.okx}: poly1s=${poly1s.available}(${poly1s.candlesCount}) poly1m=${poly1m.available}(${poly1m.candlesCount}) polyDaily=${polyDaily.available}(${polyDaily.candlesCount}) okx1m=${okx1m.available} → ${engineRule}`);

      pairResults.push({
        pair:       pair.okx,
        polyTicker: pair.poly,

        // Coverage classification
        isFullData,
        isStaleData,
        isLimited,
        isUnavailable: !okx1m.available && !okxTick.available,

        // Summary flags
        polygonSecondAvailable:   poly1s.available,
        polygonMinuteAvailable:   poly1m.available,
        polygonDailyAvailable:    polyDaily.available,
        okx1mAvailable:           okx1m.available,
        okxTickOrSecondAvailable: okxTick.available,

        // Recommended sources
        recommendedIntradaySource,
        recommendedMacroSource,
        engineRule,
        dataMode: isStaleData
          ? 'POLYGON_DAILY_MACRO_STALE_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION'
          : dataMode,
        tradeAllowed: false, // always false — kill switch
        realTradeAllowed: false,
        recommendedAction: recommendedAction || (isFullData ? 'TRADE_READY' : 'WATCH_ONLY'),
        reason: reason || (isStaleData ? `Stale macro cache (age=${polyDaily.cacheAgeSeconds}s). Paper signal may proceed if barriers pass.` : null),

        // Raw test results
        tests: {
          polygon1s:       poly1s,
          polygon1m:       poly1m,
          polygonDaily:    polyDaily,
          okx1m,
          okxTickOrSecond: okxTick,
        },
      });

      // Delay between pairs to avoid Polygon rate limits
      await sleep(700);
    }

    // ── Global summary ──
    const anyPoly1s    = pairResults.some(r => r.polygonSecondAvailable);
    const anyPoly1m    = pairResults.some(r => r.polygonMinuteAvailable);
    const anyPolyDaily = pairResults.some(r => r.polygonDailyAvailable);
    const anyOKX1m     = pairResults.some(r => r.okx1mAvailable);
    const anyOKXTick   = pairResults.some(r => r.okxTickOrSecondAvailable);

    // Per-pair coverage counts
    const fullDataPairs    = pairResults.filter(r => r.isFullData).map(r => r.pair);
    const staleMacroPairs  = pairResults.filter(r => r.isStaleData).map(r => r.pair);
    const limitedDataPairs = pairResults.filter(r => r.isLimited).map(r => r.pair);
    const unavailablePairs = pairResults.filter(r => r.isUnavailable).map(r => r.pair);
    const requestedPairs   = PRIMARY_PAIRS.map(p => p.okx);
    const returnedPairs    = pairResults.map(r => r.pair);
    const missingPairs     = requestedPairs.filter(p => !returnedPairs.includes(p));

    const pairCoverage = {
      totalPairsRequested: requestedPairs.length,
      fullDataPairs,
      staleMacroPairs,
      limitedDataPairs,
      unavailablePairs,
      missingPairs,
    };

    // Global engine rule — based on full pair set (any == true for poly is fine since it's per-pair)
    let globalEngineRule;
    if (anyPoly1s) {
      globalEngineRule = 'POLYGON_1S_MICRO_SIGNAL';
    } else if (anyPoly1m) {
      globalEngineRule = 'POLYGON_1M_INTRADAY_SIGNAL';
    } else if (anyPolyDaily && anyOKX1m && anyOKXTick) {
      globalEngineRule = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION';
    } else if (anyPolyDaily && anyOKX1m) {
      globalEngineRule = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY';
    } else {
      globalEngineRule = 'WAIT_DATA_UNAVAILABLE';
    }

    // Final phase 3 readiness verdict
    // BTC/ETH core: full OR stale both count as "has macro"
    const btcResult = pairResults.find(r => r.pair === 'BTC-USDT');
    const ethResult = pairResults.find(r => r.pair === 'ETH-USDT');
    const btcHasMacro = btcResult?.isFullData || btcResult?.isStaleData || false;
    const ethHasMacro = ethResult?.isFullData || ethResult?.isStaleData || false;
    const primaryCoreReady = btcHasMacro && ethHasMacro;

    const freshOrStalePairs = [...fullDataPairs, ...staleMacroPairs];

    let finalVerdict;
    let finalVerdictReason;
    if (!primaryCoreReady) {
      finalVerdict = 'ENGINE_NOT_READY';
      finalVerdictReason = `BTC hasMacro=${btcHasMacro}, ETH hasMacro=${ethHasMacro} — primary core pairs must both have Polygon daily (fresh, cache, or stale)`;
    } else if (freshOrStalePairs.length === requestedPairs.length) {
      finalVerdict = staleMacroPairs.length === 0 ? 'ENGINE_FULLY_READY_FOR_PHASE_3' : 'ENGINE_FULLY_READY_FOR_PHASE_3';
      finalVerdictReason = staleMacroPairs.length === 0
        ? 'All pairs have fresh Polygon daily + OKX 1m + OKX trades'
        : `All pairs have macro data (stale: [${staleMacroPairs.join(', ')}]). realTradeAllowed=false. paperSignalOnly may proceed if barriers pass.`;
    } else {
      finalVerdict = 'ENGINE_PARTIALLY_READY_FOR_PHASE_3';
      finalVerdictReason = `BTC/ETH have macro data. Limited (no macro): [${limitedDataPairs.join(', ')}].`;
    }

    const bestIntradayModes = [...new Set(pairResults.map(r => r.recommendedIntradaySource))].filter(Boolean);

    console.log(`[DATA_ACCESS_TEST] Complete. verdict=${finalVerdict} globalEngineRule=${globalEngineRule} btcHasMacro=${btcHasMacro} ethHasMacro=${ethHasMacro} fullPairs=${fullDataPairs.length} stalePairs=${staleMacroPairs.length} limitedPairs=${limitedDataPairs.length}`);

    return Response.json({
      diagnostic:               'DATA_ACCESS_TEST',
      tradeAllowed:             false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      testTime:                 new Date().toISOString(),
      finalVerdict,
      finalVerdictReason,
      globalSummary: {
        polygonSecondAvailable:   anyPoly1s,
        polygonMinuteAvailable:   anyPoly1m,
        polygonDailyAvailable:    anyPolyDaily,
        okx1mAvailable:           anyOKX1m,
        okxTickOrSecondAvailable: anyOKXTick,
        globalEngineRule,
        bestIntradayModes,
        pairCoverage,
        recommendation: finalVerdict === 'ENGINE_FULLY_READY_FOR_PHASE_3' && staleMacroPairs.length === 0
          ? '✅ All pairs have fresh Polygon daily. Engine fully ready for Phase 3.'
          : finalVerdict === 'ENGINE_FULLY_READY_FOR_PHASE_3' && staleMacroPairs.length > 0
          ? `⚠️ All pairs have macro data but stale cache used for: [${staleMacroPairs.join(', ')}]. realTradeAllowed=false. Paper signal only.`
          : finalVerdict === 'ENGINE_PARTIALLY_READY_FOR_PHASE_3'
          ? `⚠️ BTC/ETH have macro data. Alt pairs limited (no Polygon macro): [${limitedDataPairs.join(', ')}]. Partial Phase 3 ready.`
          : '❌ Engine NOT ready. BTC/ETH missing Polygon daily macro (no cache available).',
        okxLimitsNote: `OKX: no 1s candle bars. /market/candles max=${OKX_CANDLE_LIMIT}/req. /market/history-candles max=${OKX_HISTORY_LIMIT}/req (paginate). /market/trades max=${OKX_TRADES_LIMIT} (tick confirmation).`,
      },
      pairs: pairResults,
      note: 'Read-only data access test. No orders placed. Kill switch active.',
    });

  } catch (err) {
    console.error('[DATA_ACCESS_TEST] Error:', err.message);
    return Response.json({
      diagnostic:               'DATA_ACCESS_TEST',
      tradeAllowed:             false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      error:                    err.message,
    }, { status: 500 });
  }
});