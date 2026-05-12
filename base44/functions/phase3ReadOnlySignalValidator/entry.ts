/**
 * phase3ReadOnlySignalValidator — OKX-ONLY PHASE 3 READ-ONLY SIGNAL VALIDATOR
 *
 * System:   OKX_ONLY_INTRADAY_TRADING_ENGINE
 * Phase:    PHASE_3_OKX_ONLY_SIGNAL_VALIDATION
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 *
 * Polygon: REMOVED from active engine.
 *
 * Data sources (OKX only):
 *   1. OKX 1m candles (300 bars) — intraday signal
 *   2. OKX ticker                — spread, price, liquidity
 *   3. OKX latest trades (500)   — tick confirmation
 *
 * Engine mode: OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALL_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

const OKX_TAKER_FEE  = 0.001;   // 0.1%
const MIN_NET_PROFIT = 0.0025;  // 0.25% net after both legs
const MIN_SCORE      = 55;

// ── OKX 1m candles ────────────────────────────────────────────────────────────
async function fetchOKX1m(instId, limit = 300) {
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=${limit}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    const data = json?.data || [];
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

// ── OKX ticker ────────────────────────────────────────────────────────────────
async function fetchOKXTicker(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    const json = await res.json();
    const d    = json?.data?.[0];
    if (!d) return { ok: false, error: 'no data' };
    const bid = parseFloat(d.bidPx || d.last || 0);
    const ask = parseFloat(d.askPx || d.last || 0);
    const mid = (bid + ask) / 2;
    return {
      ok:         true,
      last:       parseFloat(d.last || 0),
      bid,
      ask,
      vol24h:     parseFloat(d.vol24h || 0),
      volCcy24h:  parseFloat(d.volCcy24h || 0),
      spreadPct:  mid > 0 ? ((ask - bid) / mid) * 100 : 0,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── OKX recent trades ─────────────────────────────────────────────────────────
async function fetchOKXTrades(instId, limit = 500) {
  const url = `https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=${limit}`;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    const data = json?.data || [];
    const trades = data.map(t => ({
      ts:    Number(t.ts),
      price: parseFloat(t.px),
      size:  parseFloat(t.sz),
      side:  t.side,
    }));
    return { available: trades.length > 0, trades, count: trades.length };
  } catch (err) {
    return { available: false, trades: [], count: 0, error: err.message };
  }
}

// ── Intraday signal from OKX 1m candles ──────────────────────────────────────
function analyzeIntradaySignal(candles) {
  if (candles.length < 10) return { signal: 'INSUFFICIENT_DATA', score: 0, details: {} };

  const last10 = candles.slice(-10);
  const last3  = candles.slice(-3);
  const last   = candles[candles.length - 1];

  const momentum3  = (last3[2].close - last3[0].open) / last3[0].open;
  const avg10      = last10.reduce((s, c) => s + c.close, 0) / 10;
  const microTrend = last.close > avg10 ? 'UP' : 'DOWN';
  const avgVol10   = last10.reduce((s, c) => s + c.vol, 0) / 10;
  const volSpike   = last.vol / (avgVol10 || 1);
  const lastRange  = (last.high - last.low) / last.low;
  const dir3       = last3.map(c => c.close > c.open ? 1 : -1);
  const netDir3    = dir3.reduce((a, b) => a + b, 0);

  // Longer-term OKX momentum — use more bars since we have 300
  const last30     = candles.slice(-30);
  const avg30      = last30.reduce((s, c) => s + c.close, 0) / 30;
  const trendVsAvg30 = last.close > avg30 ? 'ABOVE_30M_AVG' : 'BELOW_30M_AVG';

  let score = 50;
  if (microTrend === 'UP')       score += 12;
  if (momentum3 > 0.002)         score += 12;
  if (momentum3 < -0.003)        score -= 18;
  if (volSpike > 1.5)            score += 8;
  if (netDir3 >= 2)              score += 8;
  if (netDir3 <= -2)             score -= 12;
  if (lastRange > 0.005)         score -= 8;
  if (trendVsAvg30 === 'ABOVE_30M_AVG') score += 5;

  score = Math.max(0, Math.min(100, score));
  const signal = score >= 65 ? 'BULLISH' : score >= 45 ? 'NEUTRAL' : 'BEARISH';

  return {
    signal,
    score,
    details: {
      microTrend,
      trendVsAvg30,
      momentum3:   (momentum3 * 100).toFixed(4) + '%',
      volSpike:    volSpike.toFixed(2),
      lastRange:   (lastRange * 100).toFixed(4) + '%',
      netDir3,
      candlesUsed: candles.length,
      lastClose:   last.close,
      avg10Close:  avg10.toFixed(4),
      avg30Close:  avg30.toFixed(4),
    },
  };
}

// ── Tick confirmation from OKX trades ────────────────────────────────────────
function analyzeTickConfirmation(trades) {
  if (trades.length < 20) return { confirmed: false, signal: 'INSUFFICIENT_DATA', details: {} };

  const buys  = trades.filter(t => t.side === 'buy');
  const sells = trades.filter(t => t.side === 'sell');
  const buyVol   = buys.reduce((s, t) => s + t.size, 0);
  const sellVol  = sells.reduce((s, t) => s + t.size, 0);
  const totalVol = buyVol + sellVol;
  const buyRatio = buyVol / (totalVol || 1);

  const prices     = trades.map(t => t.price);
  const priceFirst = prices[prices.length - 1];
  const priceLast  = prices[0];
  const priceDelta = (priceLast - priceFirst) / priceFirst;

  const confirmed = buyRatio > 0.55 && priceDelta > 0;
  const signal    = confirmed ? 'BUY_PRESSURE' : buyRatio < 0.45 ? 'SELL_PRESSURE' : 'NEUTRAL';

  return {
    confirmed,
    signal,
    details: {
      buyRatio:     (buyRatio * 100).toFixed(1) + '%',
      sellRatio:    ((1 - buyRatio) * 100).toFixed(1) + '%',
      priceDelta:   (priceDelta * 100).toFixed(4) + '%',
      tradesUsed:   trades.length,
      currentPrice: priceLast,
    },
  };
}

// ── Spread / liquidity / fee checks from ticker ───────────────────────────────
function analyzeSpreadAndFees(ticker, intradayScore) {
  const spreadPct = ticker.spreadPct || 0;
  const price     = ticker.last || 0;
  const vol       = ticker.volCcy24h || ticker.vol24h || 0;

  const entryFee = price * OKX_TAKER_FEE;
  const exitFee  = price * OKX_TAKER_FEE;
  const totalFees = entryFee + exitFee;
  const breakEvenMove = price > 0 ? (totalFees / price) * 100 : 0;
  const estimatedMovePct = ((intradayScore - 50) / 50) * 1.0;
  const netProfitEstimate = estimatedMovePct / 100 - OKX_TAKER_FEE * 2;
  const feeViable = netProfitEstimate >= MIN_NET_PROFIT;

  const spreadOK    = spreadPct < 0.05;
  const liquidityOK = vol > 100000;

  let spreadScore = spreadPct < 0.005 ? 30 : spreadPct < 0.01 ? 25 : spreadPct < 0.02 ? 18 : spreadPct < 0.03 ? 10 : spreadPct < 0.05 ? 5 : 0;
  let liqScore    = vol > 50000000 ? 20 : vol > 10000000 ? 15 : vol > 1000000 ? 10 : vol > 100000 ? 5 : 0;

  return {
    spreadPct,
    spreadOK,
    liquidityOK,
    vol24hUSDT:        vol,
    spreadScore,
    liqScore,
    feeViable,
    entryFee:          entryFee.toFixed(6),
    exitFee:           exitFee.toFixed(6),
    totalFees:         totalFees.toFixed(6),
    breakEvenMovePct:  breakEvenMove.toFixed(4) + '%',
    netProfitEstimate: (netProfitEstimate * 100).toFixed(4) + '%',
    minNetProfitRequired: (MIN_NET_PROFIT * 100).toFixed(2) + '%',
  };
}

// ── Composite score (OKX only — no macro weight) ─────────────────────────────
function compositeScore(intraday, tick, fees) {
  const tickScore = tick.confirmed ? 75 : tick.signal === 'NEUTRAL' ? 50 : 30;
  const feeScore  = fees.feeViable ? 70 : fees.netProfitEstimate >= '0.0000%' ? 40 : 20;
  const raw = intraday.score * 0.55 + tickScore * 0.30 + feeScore * 0.15;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ── Barrier checks ────────────────────────────────────────────────────────────
function evaluateBarriers(intraday, tick, fees) {
  const barriers = [
    { name: 'INTRADAY_NOT_BEARISH', pass: intraday.signal !== 'BEARISH',  detail: `intradaySignal=${intraday.signal}` },
    { name: 'INTRADAY_BULLISH',     pass: intraday.signal === 'BULLISH',  detail: `intradaySignal=${intraday.signal} score=${intraday.score}` },
    { name: 'TICK_BUY_PRESSURE',    pass: tick.confirmed,                  detail: `tickSignal=${tick.signal} buyRatio=${tick.details?.buyRatio}` },
    { name: 'FEE_VIABLE',           pass: fees.feeViable,                  detail: `netEstimate=${fees.netProfitEstimate} required=${fees.minNetProfitRequired}` },
    { name: 'SPREAD_OK',            pass: fees.spreadOK,                   detail: `spread=${fees.spreadPct?.toFixed(4)}%` },
    { name: 'MIN_INTRADAY_SCORE',   pass: intraday.score >= MIN_SCORE,     detail: `score=${intraday.score} min=${MIN_SCORE}` },
  ];

  const allPass     = barriers.every(b => b.pass);
  const passCount   = barriers.filter(b => b.pass).length;
  const failedNames = barriers.filter(b => !b.pass).map(b => b.name);

  return { barriers, allPass, passCount, totalBarriers: barriers.length, failedNames };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE3_OKX_VALIDATOR] Started. user=${user.email} tradeAllowed=false killSwitchActive=true polygonRemoved=true`);

    const results = [];

    for (const instId of ALL_PAIRS) {
      console.log(`[PHASE3_OKX_VALIDATOR] Processing ${instId} ...`);

      // Fetch all three OKX sources in parallel
      const [okx1m, ticker, okxTrades] = await Promise.all([
        fetchOKX1m(instId, 300),
        fetchOKXTicker(instId),
        fetchOKXTrades(instId, 500),
      ]);

      const dataReady = okx1m.available && ticker.ok && okxTrades.available;
      const dataMode  = dataReady
        ? 'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION'
        : 'WAIT_DATA_UNAVAILABLE';

      console.log(`[PHASE3_OKX_VALIDATOR] ${instId}: 1m=${okx1m.count} ticker=${ticker.ok} trades=${okxTrades.count} dataReady=${dataReady}`);

      if (!dataReady) {
        results.push({
          pair:      instId,
          dataMode,
          dataReady: false,
          okx1mCandles:  okx1m.count,
          okxTrades:     okxTrades.count,
          tickerAvailable: ticker.ok,
          intradaySignal: null,
          tickConfirmation: null,
          feesDiagnostic: null,
          barriers: null,
          score: null,
          finalDecision: {
            tradeAllowed:      false,
            safeToTradeNow:    false,
            paperSignalOnly:   false,
            recommendedAction: 'WAIT_DATA_UNAVAILABLE',
            reason:            `OKX data unavailable: 1m=${okx1m.available} ticker=${ticker.ok} trades=${okxTrades.available}`,
          },
        });
        continue;
      }

      const intraday = analyzeIntradaySignal(okx1m.candles);
      const tick     = analyzeTickConfirmation(okxTrades.trades);
      const fees     = analyzeSpreadAndFees(ticker, intraday.score);
      const score    = compositeScore(intraday, tick, fees);
      const { barriers, allPass, passCount, totalBarriers, failedNames } = evaluateBarriers(intraday, tick, fees);

      const paperSignalOnly   = allPass && score >= MIN_SCORE;
      const recommendedAction = paperSignalOnly ? 'PAPER_SIGNAL_ONLY' : score >= 50 ? 'WAIT' : 'WATCH';

      console.log(`[PHASE3_OKX_VALIDATOR] ${instId}: intraday=${intraday.signal} tick=${tick.signal} score=${score} allBarriersPass=${allPass} → ${recommendedAction}`);

      results.push({
        pair:      instId,
        dataMode,
        dataReady: true,
        okx1mCandles:    okx1m.count,
        okxTrades:       okxTrades.count,
        lastPrice:       ticker.last,
        spreadPct:       fees.spreadPct,
        vol24hUSDT:      fees.vol24hUSDT,
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
        feesDiagnostic: fees,
        barriers: {
          allPass,
          passCount,
          totalBarriers,
          failedNames,
          checks: barriers,
        },
        score,
        finalDecision: {
          tradeAllowed:      false,
          safeToTradeNow:    false,
          paperSignalOnly,
          recommendedAction,
          reason: !paperSignalOnly
            ? `Failed barriers: [${failedNames.join(', ')}]`
            : `All ${totalBarriers} barriers passed. Score=${score}. Paper signal only — kill switch active.`,
        },
      });
    }

    const readyPairs       = results.filter(r => r.dataReady).map(r => r.pair);
    const paperSignalPairs = results.filter(r => r.finalDecision.paperSignalOnly).map(r => r.pair);
    const waitPairs        = results.filter(r => r.finalDecision.recommendedAction === 'WAIT').map(r => r.pair);
    const watchPairs       = results.filter(r => ['WATCH', 'WAIT_DATA_UNAVAILABLE'].includes(r.finalDecision.recommendedAction)).map(r => r.pair);

    const phase3Verdict = readyPairs.length === ALL_PAIRS.length
      ? 'PHASE3_OKX_ONLY_VALIDATOR_OPERATIONAL'
      : readyPairs.length >= 2
        ? 'PHASE3_OKX_ONLY_VALIDATOR_PARTIAL'
        : 'PHASE3_OKX_ONLY_VALIDATOR_LIMITED_DATA';

    console.log(`[PHASE3_OKX_VALIDATOR] Done. verdict=${phase3Verdict} readyPairs=${readyPairs.length}/${ALL_PAIRS.length} paperSignals=[${paperSignalPairs.join(',')}]`);

    return Response.json({
      diagnostic:               'PHASE3_OKX_ONLY_SIGNAL_VALIDATOR',
      engineMode:               'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      polygonRemoved:           true,
      tradeAllowed:             false,
      safeToTradeNow:           false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      testTime:                 new Date().toISOString(),
      phase3Verdict,
      summary: {
        totalPairs:        results.length,
        readyPairs,
        paperSignalPairs,
        waitPairs,
        watchPairs,
        note: 'paperSignalOnly=true means all barriers passed. Kill switch active — no real orders. OKX-only mode, Polygon removed.',
      },
      pairs: results,
    });

  } catch (err) {
    console.error('[PHASE3_OKX_VALIDATOR] Error:', err.message);
    return Response.json({
      diagnostic:               'PHASE3_OKX_ONLY_SIGNAL_VALIDATOR',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      noOKXOrderEndpointCalled: true,
      killSwitchActive:         true,
      error:                    err.message,
    }, { status: 500 });
  }
});