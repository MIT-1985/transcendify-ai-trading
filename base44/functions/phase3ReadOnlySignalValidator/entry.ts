/**
 * phase3ReadOnlySignalValidator — PHASE 3 READ-ONLY SIGNAL VALIDATION
 *
 * System:   FEE_AWARE_POLYGON_TRADING_ENGINE
 * Phase:    PHASE_3_SIGNAL_VALIDATION
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 *
 * Only processes pairs with full data mode:
 *   POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION
 *
 * Pairs with OKX_INTRADAY_ONLY_LIMITED → WATCH_ONLY, no signal generated.
 *
 * Returns per pair:
 *   dataMode, macroSignal, intradaySignal, tickConfirmation,
 *   feeAwareDiagnostic, barriers, score, finalDecision
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Pairs (BTC + ETH only for Phase 3 full data mode) ────────────────────────
const ALL_PAIRS = [
  { okx: 'BTC-USDT', poly: 'X:BTCUSD' },
  { okx: 'ETH-USDT', poly: 'X:ETHUSD' },
  { okx: 'XRP-USDT', poly: 'X:XRPUSD' },
  { okx: 'SOL-USDT', poly: 'X:SOLUSD' },
  { okx: 'DOGE-USDT', poly: 'X:DOGEUSD' },
];

// ── Fee constants ─────────────────────────────────────────────────────────────
const OKX_TAKER_FEE  = 0.001;   // 0.1%
const MIN_NET_PROFIT = 0.0025;  // 0.25% net after both legs
const MIN_SCORE      = 55;      // minimum composite score to flag PAPER_SIGNAL_ONLY

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Polygon daily bars ────────────────────────────────────────────────────────
async function fetchPolygonDaily(ticker, apiKey) {
  const now    = Date.now();
  const from   = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to     = new Date(now).toISOString().split('T')[0];
  const url    = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${apiKey}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    const bars = json?.results || [];
    return { available: bars.length > 0, bars, httpStatus: res.status, errorBody: bars.length === 0 ? { status: json?.status, message: json?.message } : null };
  } catch (err) {
    return { available: false, bars: [], httpStatus: 0, errorBody: { message: err.message } };
  }
}

// ── OKX 1m candles ───────────────────────────────────────────────────────────
async function fetchOKX1m(instId, limit = 120) {
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=${limit}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    const data = json?.data || [];
    // OKX candle: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
    const candles = data.map(c => ({
      ts:    Number(c[0]),
      open:  parseFloat(c[1]),
      high:  parseFloat(c[2]),
      low:   parseFloat(c[3]),
      close: parseFloat(c[4]),
      vol:   parseFloat(c[5]),
    })).reverse(); // oldest first
    return { available: candles.length > 0, candles, count: candles.length };
  } catch (err) {
    return { available: false, candles: [], count: 0, error: err.message };
  }
}

// ── OKX recent trades ────────────────────────────────────────────────────────
async function fetchOKXTrades(instId, limit = 200) {
  const url = `https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=${limit}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    const data = json?.data || [];
    const trades = data.map(t => ({
      ts:    Number(t.ts),
      price: parseFloat(t.px),
      size:  parseFloat(t.sz),
      side:  t.side, // buy/sell
    }));
    return { available: trades.length > 0, trades, count: trades.length };
  } catch (err) {
    return { available: false, trades: [], count: 0, error: err.message };
  }
}

// ── Macro signal from Polygon daily bars ─────────────────────────────────────
function analyzeMacroSignal(bars) {
  if (bars.length < 5) return { signal: 'INSUFFICIENT_DATA', score: 0, details: {} };

  const last    = bars[bars.length - 1];
  const prev    = bars[bars.length - 2];
  const recent5 = bars.slice(-5);

  // Simple trend: close vs 5d avg
  const avg5 = recent5.reduce((s, b) => s + b.c, 0) / 5;
  const trend = last.c > avg5 ? 'UP' : 'DOWN';

  // Momentum: last day close vs open
  const dayReturn = (last.c - last.o) / last.o;

  // Volume ratio: last day vs 5d avg
  const avgVol5  = recent5.reduce((s, b) => s + b.v, 0) / 5;
  const volRatio = last.v / (avgVol5 || 1);

  // Day range volatility
  const dayRange = (last.h - last.l) / last.l;

  // Previous day direction
  const prevDir = prev.c > prev.o ? 'GREEN' : 'RED';
  const lastDir = last.c > last.o ? 'GREEN' : 'RED';

  let score = 50;
  if (trend === 'UP')     score += 15;
  if (dayReturn > 0.005)  score += 10;
  if (dayReturn < -0.01)  score -= 15;
  if (volRatio > 1.2)     score += 8;
  if (dayRange > 0.04)    score -= 10; // too volatile for macro
  if (lastDir === 'GREEN' && prevDir === 'GREEN') score += 7;

  score = Math.max(0, Math.min(100, score));

  const signal = score >= 65 ? 'BULLISH' : score >= 45 ? 'NEUTRAL' : 'BEARISH';

  return {
    signal,
    score,
    details: {
      trend,
      dayReturn: (dayReturn * 100).toFixed(3) + '%',
      volRatio:  volRatio.toFixed(2),
      dayRange:  (dayRange * 100).toFixed(3) + '%',
      lastDir,
      prevDir,
      barsUsed:  bars.length,
      lastClose: last.c,
      avg5Close: avg5.toFixed(4),
    },
  };
}

// ── Intraday signal from OKX 1m candles ──────────────────────────────────────
function analyzeIntradaySignal(candles) {
  if (candles.length < 10) return { signal: 'INSUFFICIENT_DATA', score: 0, details: {} };

  const last10 = candles.slice(-10);
  const last3  = candles.slice(-3);
  const last   = candles[candles.length - 1];

  // Short-term momentum: last 3 candles
  const momentum3 = (last3[2].close - last3[0].open) / last3[0].open;

  // Micro trend: close vs 10-candle avg
  const avg10    = last10.reduce((s, c) => s + c.close, 0) / 10;
  const microTrend = last.close > avg10 ? 'UP' : 'DOWN';

  // Volume spike: last candle vs 10-candle avg
  const avgVol10  = last10.reduce((s, c) => s + c.vol, 0) / 10;
  const volSpike  = last.vol / (avgVol10 || 1);

  // Range of last candle (spread proxy)
  const lastRange = (last.high - last.low) / last.low;

  // Consecutive direction
  const dir3 = last3.map(c => c.close > c.open ? 1 : -1);
  const netDir3 = dir3.reduce((a, b) => a + b, 0);

  let score = 50;
  if (microTrend === 'UP')     score += 12;
  if (momentum3 > 0.002)       score += 12;
  if (momentum3 < -0.003)      score -= 18;
  if (volSpike > 1.5)          score += 8;
  if (netDir3 >= 2)            score += 8;
  if (netDir3 <= -2)           score -= 12;
  if (lastRange > 0.005)       score -= 8; // very choppy last candle

  score = Math.max(0, Math.min(100, score));

  const signal = score >= 65 ? 'BULLISH' : score >= 45 ? 'NEUTRAL' : 'BEARISH';

  return {
    signal,
    score,
    details: {
      microTrend,
      momentum3:   (momentum3 * 100).toFixed(4) + '%',
      volSpike:    volSpike.toFixed(2),
      lastRange:   (lastRange * 100).toFixed(4) + '%',
      netDir3,
      candlesUsed: candles.length,
      lastClose:   last.close,
      avg10Close:  avg10.toFixed(4),
    },
  };
}

// ── Tick confirmation from OKX recent trades ─────────────────────────────────
function analyzeTickConfirmation(trades) {
  if (trades.length < 20) return { confirmed: false, signal: 'INSUFFICIENT_DATA', details: {} };

  const buys  = trades.filter(t => t.side === 'buy');
  const sells = trades.filter(t => t.side === 'sell');

  const buyVol  = buys.reduce((s, t) => s + t.size, 0);
  const sellVol = sells.reduce((s, t) => s + t.size, 0);
  const totalVol = buyVol + sellVol;

  const buyRatio  = buyVol / (totalVol || 1);
  const sellRatio = sellVol / (totalVol || 1);

  // Price momentum from trades
  const prices     = trades.map(t => t.price);
  const priceFirst = prices[prices.length - 1]; // oldest in array (desc order from OKX)
  const priceLast  = prices[0];                 // most recent
  const priceDelta = (priceLast - priceFirst) / priceFirst;

  const confirmed = buyRatio > 0.55 && priceDelta > 0;
  const signal    = confirmed ? 'BUY_PRESSURE' : buyRatio < 0.45 ? 'SELL_PRESSURE' : 'NEUTRAL';

  return {
    confirmed,
    signal,
    details: {
      buyRatio:   (buyRatio * 100).toFixed(1) + '%',
      sellRatio:  (sellRatio * 100).toFixed(1) + '%',
      priceDelta: (priceDelta * 100).toFixed(4) + '%',
      tradesUsed: trades.length,
      currentPrice: priceLast,
    },
  };
}

// ── Fee-aware diagnostic ──────────────────────────────────────────────────────
function feeAwareDiagnostic(currentPrice, intradayScore, macroScore) {
  const entryFee  = currentPrice * OKX_TAKER_FEE;
  const exitFee   = currentPrice * OKX_TAKER_FEE;
  const totalFees = entryFee + exitFee;

  // Minimum price move needed to break even
  const breakEvenMove = (totalFees / currentPrice) * 100;

  // Estimated target move based on signal strength
  const estimatedMovePct = ((intradayScore - 50) / 50) * 1.0; // up to 1% based on score

  const netProfitEstimate = estimatedMovePct / 100 - OKX_TAKER_FEE * 2;
  const feeViable = netProfitEstimate >= MIN_NET_PROFIT;

  return {
    feeViable,
    currentPrice,
    entryFee:        entryFee.toFixed(6),
    exitFee:         exitFee.toFixed(6),
    totalFees:       totalFees.toFixed(6),
    breakEvenMovePct: breakEvenMove.toFixed(4) + '%',
    estimatedMovePct: (estimatedMovePct).toFixed(4) + '%',
    netProfitEstimate: (netProfitEstimate * 100).toFixed(4) + '%',
    minNetProfitRequired: (MIN_NET_PROFIT * 100).toFixed(2) + '%',
  };
}

// ── Barrier checks ────────────────────────────────────────────────────────────
function evaluateBarriers(macro, intraday, tick, fee) {
  const barriers = [
    {
      name:   'MACRO_NOT_BEARISH',
      pass:   macro.signal !== 'BEARISH',
      detail: `macroSignal=${macro.signal}`,
    },
    {
      name:   'INTRADAY_BULLISH',
      pass:   intraday.signal === 'BULLISH',
      detail: `intradaySignal=${intraday.signal} score=${intraday.score}`,
    },
    {
      name:   'TICK_BUY_PRESSURE',
      pass:   tick.confirmed,
      detail: `tickSignal=${tick.signal} buyRatio=${tick.details?.buyRatio}`,
    },
    {
      name:   'FEE_VIABLE',
      pass:   fee.feeViable,
      detail: `netEstimate=${fee.netProfitEstimate} required=${fee.minNetProfitRequired}`,
    },
    {
      name:   'MIN_INTRADAY_SCORE',
      pass:   intraday.score >= MIN_SCORE,
      detail: `score=${intraday.score} min=${MIN_SCORE}`,
    },
  ];

  const allPass     = barriers.every(b => b.pass);
  const passCount   = barriers.filter(b => b.pass).length;
  const failedNames = barriers.filter(b => !b.pass).map(b => b.name);

  return { barriers, allPass, passCount, totalBarriers: barriers.length, failedNames };
}

// ── Composite score ───────────────────────────────────────────────────────────
function compositeScore(macro, intraday, tick) {
  const macroW   = 0.35;
  const intradayW = 0.45;
  const tickW    = 0.20;

  const tickScore = tick.confirmed ? 75 : tick.signal === 'NEUTRAL' ? 50 : 30;
  const raw = macro.score * macroW + intraday.score * intradayW + tickScore * tickW;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (!polygonApiKey) return Response.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });

    console.log(`[PHASE3_VALIDATOR] Started. user=${user.email} tradeAllowed=false killSwitchActive=true`);

    const results = [];

    for (const pair of ALL_PAIRS) {
      console.log(`[PHASE3_VALIDATOR] Processing ${pair.okx} ...`);

      // Step 1: Determine data mode — fetch Polygon daily first
      const polyDaily = await fetchPolygonDaily(pair.poly, polygonApiKey);
      await sleep(700);

      // Step 2: Always fetch OKX data regardless
      const [okx1m, okxTrades] = await Promise.all([
        fetchOKX1m(pair.okx, 120),
        fetchOKXTrades(pair.okx, 200),
      ]);

      const hasFullData = polyDaily.available && okx1m.available && okxTrades.available;
      const dataMode = hasFullData
        ? 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION'
        : (okx1m.available && okxTrades.available)
          ? 'OKX_INTRADAY_ONLY_LIMITED'
          : 'WAIT_DATA_UNAVAILABLE';

      console.log(`[PHASE3_VALIDATOR] ${pair.okx}: dataMode=${dataMode} polyBars=${polyDaily.bars.length} okx1m=${okx1m.count} trades=${okxTrades.count}`);

      // ── Limited or unavailable pairs → WATCH_ONLY, no signal ──
      if (dataMode !== 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION') {
        results.push({
          pair:      pair.okx,
          dataMode,
          polyDailyBars: polyDaily.bars.length,
          okx1mCandles:  okx1m.count,
          okxTrades:     okxTrades.count,
          macroSignal:       null,
          intradaySignal:    null,
          tickConfirmation:  null,
          feeAwareDiagnostic: null,
          barriers:          null,
          score:             null,
          finalDecision: {
            tradeAllowed:     false,
            safeToTradeNow:   false,
            paperSignalOnly:  false,
            recommendedAction: 'WATCH_ONLY',
            reason:           dataMode === 'OKX_INTRADAY_ONLY_LIMITED'
              ? 'Polygon macro unavailable — cannot generate validated signal'
              : 'Insufficient data — no usable source',
          },
        });
        await sleep(500);
        continue;
      }

      // ── Full data mode — generate signal ──
      const currentPrice = okx1m.candles.length > 0
        ? okx1m.candles[okx1m.candles.length - 1].close
        : 0;

      const macro    = analyzeMacroSignal(polyDaily.bars);
      const intraday = analyzeIntradaySignal(okx1m.candles);
      const tick     = analyzeTickConfirmation(okxTrades.trades);
      const fee      = feeAwareDiagnostic(currentPrice, intraday.score, macro.score);
      const { barriers, allPass, passCount, totalBarriers, failedNames } = evaluateBarriers(macro, intraday, tick, fee);
      const score    = compositeScore(macro, intraday, tick);

      const paperSignalOnly = allPass && score >= MIN_SCORE;
      const recommendedAction = paperSignalOnly
        ? 'PAPER_SIGNAL_ONLY'
        : score >= 55
          ? 'WAIT'
          : 'WATCH';

      console.log(`[PHASE3_VALIDATOR] ${pair.okx}: macro=${macro.signal} intraday=${intraday.signal} tick=${tick.signal} score=${score} allBarriersPass=${allPass} → ${recommendedAction}`);

      results.push({
        pair:      pair.okx,
        dataMode,
        polyDailyBars: polyDaily.bars.length,
        okx1mCandles:  okx1m.count,
        okxTrades:     okxTrades.count,
        macroSignal: {
          signal:  macro.signal,
          score:   macro.score,
          details: macro.details,
        },
        intradaySignal: {
          signal:  intraday.signal,
          score:   intraday.score,
          details: intraday.details,
        },
        tickConfirmation: {
          confirmed: tick.confirmed,
          signal:    tick.signal,
          details:   tick.details,
        },
        feeAwareDiagnostic: fee,
        barriers: {
          allPass,
          passCount,
          totalBarriers,
          failedNames,
          checks: barriers,
        },
        score,
        finalDecision: {
          tradeAllowed:      false,        // always false — kill switch
          safeToTradeNow:    false,        // always false — Phase 3 read-only
          paperSignalOnly,
          recommendedAction,
          reason: !paperSignalOnly
            ? `Failed barriers: [${failedNames.join(', ')}]`
            : `All ${totalBarriers} barriers passed. Score=${score}. Paper signal only — kill switch active.`,
        },
      });

      await sleep(600);
    }

    // ── Summary ──
    const fullDataPairs    = results.filter(r => r.dataMode === 'POLYGON_DAILY_MACRO_PLUS_OKX_1M_INTRADAY_PLUS_OKX_TRADES_CONFIRMATION');
    const limitedPairs     = results.filter(r => r.dataMode === 'OKX_INTRADAY_ONLY_LIMITED');
    const paperSignalPairs = results.filter(r => r.finalDecision.paperSignalOnly).map(r => r.pair);
    const waitPairs        = results.filter(r => r.finalDecision.recommendedAction === 'WAIT').map(r => r.pair);
    const watchPairs       = results.filter(r => r.finalDecision.recommendedAction === 'WATCH' || r.finalDecision.recommendedAction === 'WATCH_ONLY').map(r => r.pair);

    const phase3Verdict = fullDataPairs.length >= 2 && fullDataPairs.some(r => r.pair === 'BTC-USDT') && fullDataPairs.some(r => r.pair === 'ETH-USDT')
      ? 'PHASE3_VALIDATOR_OPERATIONAL'
      : 'PHASE3_VALIDATOR_LIMITED_DATA';

    console.log(`[PHASE3_VALIDATOR] Done. verdict=${phase3Verdict} fullData=${fullDataPairs.length} paperSignals=[${paperSignalPairs.join(',')}]`);

    return Response.json({
      diagnostic:               'PHASE3_READ_ONLY_SIGNAL_VALIDATOR',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      testTime:                 new Date().toISOString(),
      phase3Verdict,
      summary: {
        totalPairs:        results.length,
        fullDataPairs:     fullDataPairs.map(r => r.pair),
        limitedDataPairs:  limitedPairs.map(r => r.pair),
        paperSignalPairs,
        waitPairs,
        watchPairs,
        note: 'paperSignalOnly=true means all barriers passed. Kill switch active — no real orders. Phase 3 read-only only.',
      },
      pairs: results,
    });

  } catch (err) {
    console.error('[PHASE3_VALIDATOR] Error:', err.message);
    return Response.json({
      diagnostic:               'PHASE3_READ_ONLY_SIGNAL_VALIDATOR',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      error:                    err.message,
    }, { status: 500 });
  }
});