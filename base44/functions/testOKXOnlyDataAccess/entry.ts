/**
 * testOKXOnlyDataAccess — OKX-ONLY READ-ONLY DATA ACCESS TEST
 *
 * System:   OKX_ONLY_INTRADAY_TRADING_ENGINE
 * Phase:    PHASE_3_OKX_ONLY_DATA_DIAGNOSTIC
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 *
 * Polygon: REMOVED from active engine. No Polygon calls here.
 *
 * Tests for each pair:
 *   1. OKX ticker endpoint
 *   2. OKX 1m candles (limit 300)
 *   3. OKX latest trades (limit 500)
 *
 * Engine mode: OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PRIMARY_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ── OKX ticker ────────────────────────────────────────────────────────────────
async function testOKXTicker(instId) {
  const url = `https://www.okx.com/api/v5/market/ticker?instId=${instId}`;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const d    = json?.data?.[0];
    if (!d) return { tickerAvailable: false, lastPrice: null, httpStatus: res.status, errorBody: json?.msg || 'no data' };
    return {
      tickerAvailable: true,
      lastPrice:       parseFloat(d.last || 0),
      bid:             parseFloat(d.bidPx || d.last || 0),
      ask:             parseFloat(d.askPx || d.last || 0),
      vol24h:          parseFloat(d.vol24h || 0),
      volCcy24h:       parseFloat(d.volCcy24h || 0),
      httpStatus:      res.status,
      errorBody:       null,
    };
  } catch (err) {
    return { tickerAvailable: false, lastPrice: null, httpStatus: 0, errorBody: err.message };
  }
}

// ── OKX 1m candles ────────────────────────────────────────────────────────────
async function testOKX1m(instId) {
  const limit = 300;
  const url   = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=${limit}`;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = json?.data || [];
    return {
      okx1mAvailable: data.length > 0,
      candlesCount:   data.length,
      httpStatus:     res.status,
      errorBody:      data.length === 0 ? (json?.msg || `HTTP ${res.status} no data`) : null,
    };
  } catch (err) {
    return { okx1mAvailable: false, candlesCount: 0, httpStatus: 0, errorBody: err.message };
  }
}

// ── OKX latest trades ─────────────────────────────────────────────────────────
async function testOKXTrades(instId) {
  const limit = 500;
  const url   = `https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=${limit}`;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = json?.data || [];
    return {
      okxTradesAvailable: data.length > 0,
      tradesCount:        data.length,
      httpStatus:         res.status,
      errorBody:          data.length === 0 ? (json?.msg || `HTTP ${res.status} no data`) : null,
    };
  } catch (err) {
    return { okxTradesAvailable: false, tradesCount: 0, httpStatus: 0, errorBody: err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[OKX_ONLY_TEST] Started. user=${user.email} tradeAllowed=false noOKXOrderEndpointCalled=true`);

    const pairResults = [];

    for (const instId of PRIMARY_PAIRS) {
      console.log(`[OKX_ONLY_TEST] Testing ${instId} ...`);

      const [ticker, candles, trades] = await Promise.all([
        testOKXTicker(instId),
        testOKX1m(instId),
        testOKXTrades(instId),
      ]);

      const allThreeOK = ticker.tickerAvailable && candles.okx1mAvailable && trades.okxTradesAvailable;

      const result = {
        pair:               instId,
        tickerAvailable:    ticker.tickerAvailable,
        okx1mAvailable:     candles.okx1mAvailable,
        okxTradesAvailable: trades.okxTradesAvailable,
        lastPrice:          ticker.lastPrice,
        bid:                ticker.bid,
        ask:                ticker.ask,
        vol24h:             ticker.vol24h,
        candlesCount:       candles.candlesCount,
        tradesCount:        trades.tradesCount,
        dataReady:          allThreeOK,
        dataMode:           allThreeOK ? 'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION' : 'WAIT_DATA_UNAVAILABLE',
        recommendedAction:  allThreeOK ? 'READY_FOR_PHASE_3_OKX_ONLY' : 'WAIT_DATA_UNAVAILABLE',
        httpStatus: {
          ticker: ticker.httpStatus,
          candles: candles.httpStatus,
          trades:  trades.httpStatus,
        },
        errorBody: {
          ticker: ticker.errorBody,
          candles: candles.errorBody,
          trades:  trades.errorBody,
        },
      };

      console.log(`[OKX_ONLY_TEST] ${instId}: ticker=${ticker.tickerAvailable} candles=${candles.candlesCount} trades=${trades.tradesCount} dataReady=${allThreeOK}`);
      pairResults.push(result);
    }

    const readyPairs    = pairResults.filter(r => r.dataReady).map(r => r.pair);
    const notReadyPairs = pairResults.filter(r => !r.dataReady).map(r => r.pair);
    const allReady      = readyPairs.length === PRIMARY_PAIRS.length;

    const finalVerdict = allReady
      ? 'ENGINE_FULLY_READY_FOR_PHASE_3_OKX_ONLY'
      : readyPairs.length > 0
        ? 'ENGINE_PARTIALLY_READY'
        : 'ENGINE_NOT_READY';

    const recommendation = allReady
      ? `✅ All ${PRIMARY_PAIRS.length} pairs have OKX ticker + 1m candles + trades. OKX-only engine ready.`
      : readyPairs.length > 0
        ? `⚠️ ${readyPairs.length}/${PRIMARY_PAIRS.length} pairs ready. Not ready: [${notReadyPairs.join(', ')}]`
        : '❌ No pairs have full OKX data. Engine not ready.';

    console.log(`[OKX_ONLY_TEST] Done. verdict=${finalVerdict} readyPairs=${readyPairs.length}/${PRIMARY_PAIRS.length}`);

    return Response.json({
      diagnostic:               'OKX_ONLY_DATA_ACCESS_TEST',
      engineMode:               'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      polygonRemoved:           true,
      testTime:                 new Date().toISOString(),
      finalVerdict,
      summary: {
        totalPairsRequested: PRIMARY_PAIRS.length,
        readyPairs,
        notReadyPairs,
        recommendation,
        dataSources: ['OKX_TICKER', 'OKX_1M_CANDLES_300', 'OKX_TRADES_500'],
      },
      pairs: pairResults,
      note: 'OKX-only read-only diagnostic. No orders placed. Kill switch active. Polygon removed from active engine.',
    });

  } catch (err) {
    console.error('[OKX_ONLY_TEST] Error:', err.message);
    return Response.json({
      diagnostic:               'OKX_ONLY_DATA_ACCESS_TEST',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      error:                    err.message,
    }, { status: 500 });
  }
});