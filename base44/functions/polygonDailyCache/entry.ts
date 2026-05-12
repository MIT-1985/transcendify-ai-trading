/**
 * polygonDailyCache — POLYGON DAILY MACRO CANDLE CACHE LAYER
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE
 * Purpose:  Prevent Polygon rate-limit cascades by caching daily macro candles.
 *           Cache TTL = 15 minutes. Stale cache used as fallback on 403/429/timeout.
 *
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NONE
 *
 * Can be called as a standalone diagnostic endpoint OR imported as a module pattern.
 * Frontend invokes via: base44.functions.invoke('polygonDailyCache', { pair: 'BTC-USDT' })
 *
 * Cache structure (in-memory, per isolate lifetime):
 *   _cache[okxPair] = { bars, fetchedAt, candlesCount, httpStatus }
 *
 * Output fields:
 *   available, candlesCount, bars, source, cacheAgeSeconds, degraded, httpStatus, errorBody
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Pair map ──────────────────────────────────────────────────────────────────
const PAIR_MAP = {
  'BTC-USDT':  'X:BTCUSD',
  'ETH-USDT':  'X:ETHUSD',
  'SOL-USDT':  'X:SOLUSD',
  'DOGE-USDT': 'X:DOGEUSD',
  'XRP-USDT':  'X:XRPUSD',
};

// ── Cache config ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache — lives for the isolate lifetime
const _cache = {};

// ── Core cache getter (exported pattern for inline use in other functions) ────
export async function getCachedPolygonDaily(okxPair, polygonApiKey) {
  const polyTicker = PAIR_MAP[okxPair];
  if (!polyTicker) {
    return {
      available:       false,
      candlesCount:    0,
      bars:            [],
      source:          'NONE',
      cacheAgeSeconds: null,
      degraded:        false,
      httpStatus:      null,
      errorBody:       { message: `Unknown pair: ${okxPair}` },
    };
  }

  const now      = Date.now();
  const cached   = _cache[okxPair];
  const cacheAge = cached ? Math.floor((now - cached.fetchedAt) / 1000) : null;
  const isFresh  = cached && (now - cached.fetchedAt) < CACHE_TTL_MS;

  // ── Return fresh cache immediately — do NOT call Polygon ──
  if (isFresh) {
    return {
      available:       true,
      candlesCount:    cached.candlesCount,
      bars:            cached.bars,
      source:          'CACHE',
      cacheAgeSeconds: cacheAge,
      degraded:        false,
      httpStatus:      200,
      errorBody:       null,
    };
  }

  // ── Call Polygon daily endpoint ──
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
      // Save to cache
      _cache[okxPair] = { bars, candlesCount, fetchedAt: now, httpStatus };
      return {
        available:       true,
        candlesCount,
        bars,
        source:          'POLYGON_API',
        cacheAgeSeconds: 0,
        degraded:        false,
        httpStatus,
        errorBody:       null,
      };
    }

    // Polygon returned error (403 / 429 / empty) — check stale cache
    const errorBody = json
      ? { status: json.status, message: json.message, resultsCount: candlesCount }
      : body.slice(0, 300);

    if (cached) {
      // Return stale cache as fallback
      return {
        available:       true,
        candlesCount:    cached.candlesCount,
        bars:            cached.bars,
        source:          'STALE_CACHE',
        cacheAgeSeconds: cacheAge,
        degraded:        true,
        httpStatus,
        errorBody,
        reason:          'Polygon unavailable, using stale daily macro cache',
      };
    }

    // No cache at all
    return {
      available:       false,
      candlesCount:    0,
      bars:            [],
      source:          'NONE',
      cacheAgeSeconds: null,
      degraded:        false,
      httpStatus,
      errorBody,
      reason:          json?.message || `Polygon HTTP ${httpStatus}`,
    };

  } catch (err) {
    // Network error / timeout — check stale cache
    if (cached) {
      return {
        available:       true,
        candlesCount:    cached.candlesCount,
        bars:            cached.bars,
        source:          'STALE_CACHE',
        cacheAgeSeconds: cacheAge,
        degraded:        true,
        httpStatus:      0,
        errorBody:       { message: err.message },
        reason:          'Polygon unavailable, using stale daily macro cache',
      };
    }

    return {
      available:       false,
      candlesCount:    0,
      bars:            [],
      source:          'NONE',
      cacheAgeSeconds: null,
      degraded:        false,
      httpStatus:      0,
      errorBody:       { message: err.message },
      reason:          err.message,
    };
  }
}

// ── Standalone HTTP diagnostic endpoint ──────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) return Response.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });

    const body   = await req.json().catch(() => ({}));
    const pairs  = body.pairs || Object.keys(PAIR_MAP);

    console.log(`[POLYGON_DAILY_CACHE] Diagnostic run. user=${user.email} pairs=${pairs.join(',')}`);

    const results = {};
    for (const pair of pairs) {
      const result = await getCachedPolygonDaily(pair, polygonApiKey);
      results[pair] = result;
      console.log(`[POLYGON_DAILY_CACHE] ${pair}: source=${result.source} available=${result.available} bars=${result.candlesCount} cacheAge=${result.cacheAgeSeconds}s degraded=${result.degraded}`);
      // Small delay between API calls to respect rate limit
      if (result.source === 'POLYGON_API') await new Promise(r => setTimeout(r, 700));
    }

    const cacheStatus = Object.entries(results).map(([pair, r]) => ({
      pair,
      source:          r.source,
      available:       r.available,
      candlesCount:    r.candlesCount,
      cacheAgeSeconds: r.cacheAgeSeconds,
      degraded:        r.degraded,
      httpStatus:      r.httpStatus,
    }));

    return Response.json({
      diagnostic:       'POLYGON_DAILY_CACHE',
      tradeAllowed:     false,
      killSwitchActive: true,
      testTime:         new Date().toISOString(),
      cacheTTLSeconds:  CACHE_TTL_MS / 1000,
      cacheStatus,
      pairs:            results,
    });

  } catch (err) {
    console.error('[POLYGON_DAILY_CACHE] Error:', err.message);
    return Response.json({ error: err.message, tradeAllowed: false }, { status: 500 });
  }
});