/**
 * testPolygonSecondMinuteAccess — READ-ONLY DATA ACCESS TEST
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE
 * Phase:    DATA_ACCESS_DIAGNOSTIC
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

// ── Polygon aggregate tester ──────────────────────────────────────────────────
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

// ── OKX 1m candle tester ──────────────────────────────────────────────────────
async function testOKX1m(instId) {
  const endpoint = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=120`;
  try {
    const res  = await fetch(endpoint);
    const json = await res.json();
    const data = json?.data || [];
    return {
      available:    data.length > 0,
      candlesCount: data.length,
      httpStatus:   res.status,
      endpoint,
      errorMessage: data.length === 0 ? (json?.msg || `HTTP ${res.status} no data`) : null,
    };
  } catch (err) {
    return { available: false, candlesCount: 0, httpStatus: 0, endpoint, errorMessage: err.message };
  }
}

// ── OKX tick / index candle tester ───────────────────────────────────────────
async function testOKXTickOrSecond(instId) {
  // OKX doesn't have true 1-second candles, but offers index candles and trades
  // Try: index candles (1m), then index tickers, then recent trades as tick proxy
  const endpoints = [
    { label: 'OKX_INDEX_1M',    url: `https://www.okx.com/api/v5/market/index-candles?instId=${instId.replace('-USDT', '-USDT')}&bar=1m&limit=10` },
    { label: 'OKX_MARK_1M',     url: `https://www.okx.com/api/v5/market/mark-price-candles?instId=${instId}&bar=1m&limit=10` },
    { label: 'OKX_TRADES_TICK', url: `https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=50` },
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

// ── Determine recommended data mode ──────────────────────────────────────────
function recommendDataMode(poly1s, poly1m, polyDaily, okx1m, okxTick) {
  let recommendedIntradaySource;
  let recommendedMacroSource;
  let engineRule;

  if (poly1s.available) {
    recommendedIntradaySource = 'POLYGON_1S';
    engineRule = 'POLYGON_1S_MICRO_SIGNAL';
  } else if (poly1m.available) {
    recommendedIntradaySource = 'POLYGON_1M';
    engineRule = 'POLYGON_1M_INTRADAY_SIGNAL';
  } else if (polyDaily.available && okx1m.available) {
    recommendedIntradaySource = 'OKX_1M';
    engineRule = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY';
  } else if (okxTick.available) {
    recommendedIntradaySource = 'OKX_TICK';
    engineRule = 'OKX_TICK_ONLY_LIMITED';
  } else {
    recommendedIntradaySource = 'NONE';
    engineRule = 'WAIT_DATA_UNAVAILABLE';
  }

  recommendedMacroSource = polyDaily.available ? 'POLYGON_DAILY' : 'NONE';

  return { recommendedIntradaySource, recommendedMacroSource, engineRule };
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
    const from30d  = now - 30  * 24 * 60 * 60 * 1000; // last 30 days

    const pairResults = [];

    for (const pair of PRIMARY_PAIRS) {
      console.log(`[DATA_ACCESS_TEST] Testing ${pair.okx} / ${pair.poly} ...`);

      // Run Polygon tests sequentially with delay (avoid rate limit)
      const poly1s    = await testPolygonAgg(pair.poly, 1, 'second', from10m,  now,    polygonApiKey);
      await sleep(600);
      const poly1m    = await testPolygonAgg(pair.poly, 1, 'minute', from120m, now,    polygonApiKey);
      await sleep(600);
      const polyDaily = await testPolygonAgg(pair.poly, 1, 'day',    from30d,  now,    polygonApiKey);
      await sleep(400);

      // OKX tests (no rate limit concerns)
      const okx1m   = await testOKX1m(pair.okx);
      const okxTick = await testOKXTickOrSecond(pair.okx);

      const { recommendedIntradaySource, recommendedMacroSource, engineRule } = recommendDataMode(poly1s, poly1m, polyDaily, okx1m, okxTick);

      console.log(`[DATA_ACCESS_TEST] ${pair.okx}: poly1s=${poly1s.available}(${poly1s.candlesCount}) poly1m=${poly1m.available}(${poly1m.candlesCount}) polyDaily=${polyDaily.available}(${polyDaily.candlesCount}) okx1m=${okx1m.available} → ${engineRule}`);

      pairResults.push({
        pair:       pair.okx,
        polyTicker: pair.poly,

        // Summary flags
        polygonSecondAvailable:  poly1s.available,
        polygonMinuteAvailable:  poly1m.available,
        polygonDailyAvailable:   polyDaily.available,
        okx1mAvailable:          okx1m.available,
        okxTickOrSecondAvailable: okxTick.available,

        // Recommended sources
        recommendedIntradaySource,
        recommendedMacroSource,
        engineRule,

        // Raw test results
        tests: {
          polygon1s:    poly1s,
          polygon1m:    poly1m,
          polygonDaily: polyDaily,
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

    let globalEngineRule;
    if (anyPoly1s) {
      globalEngineRule = 'POLYGON_1S_MICRO_SIGNAL';
    } else if (anyPoly1m) {
      globalEngineRule = 'POLYGON_1M_INTRADAY_SIGNAL';
    } else if (anyPolyDaily && anyOKX1m) {
      globalEngineRule = 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY';
    } else {
      globalEngineRule = 'WAIT_DATA_UNAVAILABLE';
    }

    const bestIntradayModes = [...new Set(pairResults.map(r => r.recommendedIntradaySource))].filter(Boolean);

    console.log(`[DATA_ACCESS_TEST] Complete. globalEngineRule=${globalEngineRule} poly1s=${anyPoly1s} poly1m=${anyPoly1m} polyDaily=${anyPolyDaily} okx1m=${anyOKX1m}`);

    return Response.json({
      diagnostic:               'DATA_ACCESS_TEST',
      tradeAllowed:             false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      testTime:                 new Date().toISOString(),
      globalSummary: {
        polygonSecondAvailable:  anyPoly1s,
        polygonMinuteAvailable:  anyPoly1m,
        polygonDailyAvailable:   anyPolyDaily,
        okx1mAvailable:          anyOKX1m,
        okxTickOrSecondAvailable: anyOKXTick,
        globalEngineRule,
        bestIntradayModes,
        recommendation: anyPoly1s
          ? '✅ Polygon 1s available — upgrade engine to MICRO_SIGNAL mode'
          : anyPoly1m
          ? '✅ Polygon 1m available — upgrade engine to 1M_INTRADAY mode'
          : anyPolyDaily && anyOKX1m
          ? '⚠️ Only daily+OKX1m — current engine mode is correct (DAILY_MACRO + OKX_INTRADAY)'
          : '❌ Insufficient data — keep WAIT_DATA_UNAVAILABLE, do not trade',
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