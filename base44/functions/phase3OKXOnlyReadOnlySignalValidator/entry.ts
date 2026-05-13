/**
 * phase3OKXOnlyReadOnlySignalValidator — PHASE 3 OKX-ONLY READ-ONLY SIGNAL VALIDATOR
 *
 * System:   OKX_ONLY_INTRADAY_TRADING_ENGINE
 * Phase:    PHASE_3_OKX_ONLY_READ_ONLY
 * Trading:  DISABLED — tradeAllowed = false always
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 * Polygon:  REMOVED
 *
 * Data sources:
 *   1. OKX ticker  — price, spread, liquidity
 *   2. OKX 1m candles (300 bars) — EMA, RSI, momentum, volume
 *   3. OKX latest trades (500)   — tick confirmation, buy/sell pressure
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALL_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ── Constants ─────────────────────────────────────────────────────────────────
const OKX_TAKER_FEE      = 0.001;   // 0.1% per leg
const REQUIRED_NET_PROFIT = 0.0003; // in USDT per unit (absolute, scaled by K_SIZE)
const K_SIZE              = 10;     // USDT trade size for fee calc
const K_TP                = 0.30;   // % take profit target
const REQUIRED_SCORE      = 55;     // Phase 4B: lowered from 60 → 55 (tick threshold adjustment)
const EMA_FAST_PERIOD     = 9;
const EMA_SLOW_PERIOD     = 21;
const RSI_PERIOD          = 14;
const MAX_SPREAD_PCT      = 0.05;   // 0.05%
const MAX_VOLATILITY_PCT  = 2.0;    // 2% intraday range considered too volatile

// ── OKX data fetchers ─────────────────────────────────────────────────────────
async function fetchTicker(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const d    = json?.data?.[0];
    if (!d) return { ok: false, error: 'no data', httpStatus: res.status };
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return {
      ok:         true,
      last:       parseFloat(d.last),
      bid,
      ask,
      spreadPct:  mid > 0 ? ((ask - bid) / mid) * 100 : 0,
      vol24h:     parseFloat(d.vol24h || 0),
      volCcy24h:  parseFloat(d.volCcy24h || 0),
      httpStatus: res.status,
    };
  } catch (err) {
    return { ok: false, error: err.message, httpStatus: 0 };
  }
}

async function fetchCandles(instId, limit = 300) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=${limit}`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = json?.data || [];
    // OKX: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
    const candles = data.map(c => ({
      ts:    Number(c[0]),
      open:  parseFloat(c[1]),
      high:  parseFloat(c[2]),
      low:   parseFloat(c[3]),
      close: parseFloat(c[4]),
      vol:   parseFloat(c[5]),
    })).reverse(); // oldest first
    return { ok: candles.length > 0, candles, count: candles.length, httpStatus: res.status };
  } catch (err) {
    return { ok: false, candles: [], count: 0, error: err.message, httpStatus: 0 };
  }
}

async function fetchTrades(instId, limit = 500) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=${limit}`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = json?.data || [];
    const trades = data.map(t => ({
      ts:    Number(t.ts),
      price: parseFloat(t.px),
      size:  parseFloat(t.sz),
      side:  t.side, // 'buy' | 'sell'
    }));
    return { ok: trades.length > 0, trades, count: trades.length, httpStatus: res.status };
  } catch (err) {
    return { ok: false, trades: [], count: 0, error: err.message, httpStatus: 0 };
  }
}

// ── Technical indicators ──────────────────────────────────────────────────────

// EMA calculation
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// RSI calculation
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let gains = 0, losses = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) gains += changes[i];
    else losses += Math.abs(changes[i]);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (changes[i] < 0 ? Math.abs(changes[i]) : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// Candle momentum % over last N candles
function calcCandleMomentum(candles, n = 10) {
  if (candles.length < n) return 0;
  const slice = candles.slice(-n);
  const start = slice[0].open;
  const end   = slice[slice.length - 1].close;
  return start > 0 ? parseFloat(((end - start) / start * 100).toFixed(4)) : 0;
}

// Volume momentum: last 5 candles avg vs prior 5 candles avg
function calcVolumeMomentum(candles) {
  if (candles.length < 10) return 0;
  const recent = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
  const prior  = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
  return prior > 0 ? parseFloat(((recent - prior) / prior * 100).toFixed(2)) : 0;
}

// Intraday volatility: max range over last 20 candles
function calcIntradayVolatility(candles) {
  if (candles.length < 5) return 0;
  const slice = candles.slice(-20);
  const high  = Math.max(...slice.map(c => c.high));
  const low   = Math.min(...slice.map(c => c.low));
  return low > 0 ? parseFloat(((high - low) / low * 100).toFixed(4)) : 0;
}

// ── Intraday signal ───────────────────────────────────────────────────────────
function analyzeIntraday(candles, ticker) {
  const closes = candles.map(c => c.close);
  const last   = candles[candles.length - 1];

  const emaFast        = calcEMA(closes, EMA_FAST_PERIOD);
  const emaSlow        = calcEMA(closes, EMA_SLOW_PERIOD);
  const rsi            = calcRSI(closes, RSI_PERIOD);
  const momentum       = calcCandleMomentum(candles, 10);
  const volumeMomentum = calcVolumeMomentum(candles);
  const volatility     = calcIntradayVolatility(candles);

  const lastPrice = ticker?.last || last.close;

  // Direction signals
  const emaCross    = emaFast !== null && emaSlow !== null ? (emaFast > emaSlow ? 1 : -1) : 0;
  const rsiBull     = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
  const momBull     = momentum > 0.05 ? 1 : momentum < -0.05 ? -1 : 0;
  const volBull     = volumeMomentum > 10 ? 1 : 0;

  const rawVote = emaCross + rsiBull + momBull + volBull;
  const direction = rawVote >= 2 ? 'BULLISH' : rawVote <= -2 ? 'BEARISH' : 'NEUTRAL';

  // Confidence 0–100
  let confidence = 50;
  if (emaCross ===  1) confidence += 15;
  if (emaCross === -1) confidence -= 15;
  if (rsiBull  ===  1) confidence += 12;
  if (rsiBull  === -1) confidence -= 12;
  if (momBull  ===  1) confidence += 10;
  if (momBull  === -1) confidence -= 10;
  if (volBull  ===  1) confidence += 8;
  confidence = Math.max(0, Math.min(100, confidence));

  const reasons = [];
  if (emaFast && emaSlow) reasons.push(`EMA${EMA_FAST_PERIOD}=${emaFast?.toFixed(4)} ${emaCross > 0 ? '>' : '<'} EMA${EMA_SLOW_PERIOD}=${emaSlow?.toFixed(4)}`);
  if (rsi !== null) reasons.push(`RSI=${rsi}`);
  reasons.push(`momentum=${momentum}%`);
  reasons.push(`volMom=${volumeMomentum}%`);

  return {
    direction,
    lastPrice,
    emaFast:                 emaFast !== null ? parseFloat(emaFast.toFixed(6)) : null,
    emaSlow:                 emaSlow !== null ? parseFloat(emaSlow.toFixed(6)) : null,
    rsi,
    candleMomentumPercent:   momentum,
    volumeMomentum,
    volatilityPct:           volatility,
    confidence,
    reason:                  reasons.join(' | '),
  };
}

// ── Tick confirmation ─────────────────────────────────────────────────────────
function analyzeTickConfirmation(trades) {
  if (trades.length < 10) return {
    buyPressurePercent:  0, sellPressurePercent: 0, tradeCount: trades.length,
    tickDirection: 'NEUTRAL', confidence: 0, reason: 'Insufficient trades',
  };

  const buys  = trades.filter(t => t.side === 'buy');
  const sells = trades.filter(t => t.side === 'sell');

  const buyVol   = buys.reduce((s, t) => s + t.size, 0);
  const sellVol  = sells.reduce((s, t) => s + t.size, 0);
  const totalVol = buyVol + sellVol;

  const buyPct  = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
  const sellPct = 100 - buyPct;

  // Price drift: oldest vs newest
  const oldest = trades[trades.length - 1].price;
  const newest = trades[0].price;
  const priceDrift = oldest > 0 ? ((newest - oldest) / oldest) * 100 : 0;

  const tickDirection =
    buyPct >= 58 && priceDrift > 0 ? 'BUY_PRESSURE' :
    sellPct >= 58 && priceDrift < 0 ? 'SELL_PRESSURE' :
    'NEUTRAL';

  let confidence = 50;
  if (tickDirection === 'BUY_PRESSURE')  confidence = Math.min(100, 50 + (buyPct - 50) * 2.5);
  if (tickDirection === 'SELL_PRESSURE') confidence = Math.min(100, 50 + (sellPct - 50) * 2.5);

  return {
    buyPressurePercent:  parseFloat(buyPct.toFixed(2)),
    sellPressurePercent: parseFloat(sellPct.toFixed(2)),
    tradeCount:          trades.length,
    tickDirection,
    confidence:          parseFloat(confidence.toFixed(1)),
    reason:              `buyVol=${buyVol.toFixed(4)} sellVol=${sellVol.toFixed(4)} priceDrift=${priceDrift.toFixed(4)}%`,
  };
}

// ── Fee-aware diagnostic ──────────────────────────────────────────────────────
function calcFeeAwareDiagnostic(ticker, intraday) {
  const entry       = ticker.last;
  const tpDecimal   = K_TP / 100;
  const target      = parseFloat((entry * (1 + tpDecimal)).toFixed(8));
  const grossProfit = K_SIZE * tpDecimal;
  const entryFee    = K_SIZE * OKX_TAKER_FEE;
  const exitFee     = (K_SIZE + grossProfit) * OKX_TAKER_FEE;
  const spreadCost  = K_SIZE * (ticker.spreadPct / 100);
  const netProfit   = grossProfit - entryFee - exitFee - spreadCost;

  // Required TP to break MIN_NET_PROFIT threshold
  // netProfit = K_SIZE*(tp/100) - K_SIZE*fee - (K_SIZE + K_SIZE*(tp/100))*fee - spreadCost >= REQUIRED_NET_PROFIT
  // Solving for tp:
  const fee         = OKX_TAKER_FEE;
  const spread      = ticker.spreadPct / 100;
  const reqTPDec    = (REQUIRED_NET_PROFIT + K_SIZE * fee + K_SIZE * spread) / (K_SIZE * (1 - fee));
  const reqTPPct    = parseFloat((reqTPDec * 100).toFixed(4));
  const missing     = Math.max(0, parseFloat((REQUIRED_NET_PROFIT - netProfit).toFixed(6)));

  return {
    estimatedEntry:          entry,
    targetPrice:             target,
    tpPercent:               K_TP,
    grossProfitUSDT:         parseFloat(grossProfit.toFixed(6)),
    estimatedFeesUSDT:       parseFloat((entryFee + exitFee).toFixed(6)),
    estimatedSpreadCostUSDT: parseFloat(spreadCost.toFixed(6)),
    estimatedNetProfitUSDT:  parseFloat(netProfit.toFixed(6)),
    requiredNetProfitUSDT:   REQUIRED_NET_PROFIT,
    missingNetProfitUSDT:    missing,
    requiredTPPercent:       reqTPPct,
  };
}

// ── Barriers ──────────────────────────────────────────────────────────────────
function evaluateBarriers(intraday, tick, fee, ticker) {
  const intradayBarrier  = intraday.direction !== 'BEARISH';
  const tickBarrier      = tick.tickDirection !== 'SELL_PRESSURE';
  const feeBarrier       = fee.estimatedNetProfitUSDT >= REQUIRED_NET_PROFIT;
  const spreadBarrier    = ticker.spreadPct <= MAX_SPREAD_PCT;
  const volatilityBarrier = intraday.volatilityPct <= MAX_VOLATILITY_PCT;
  const scoreBarrier     = false; // evaluated after score is calculated

  return {
    intradayBarrier:   { pass: intradayBarrier,   detail: `direction=${intraday.direction}` },
    tickBarrier:       { pass: tickBarrier,        detail: `tickDirection=${tick.tickDirection}` },
    feeBarrier:        { pass: feeBarrier,         detail: `netProfit=${fee.estimatedNetProfitUSDT} required=${REQUIRED_NET_PROFIT}` },
    spreadBarrier:     { pass: spreadBarrier,      detail: `spread=${ticker.spreadPct?.toFixed(4)}% max=${MAX_SPREAD_PCT}%` },
    volatilityBarrier: { pass: volatilityBarrier,  detail: `volatility=${intraday.volatilityPct}% max=${MAX_VOLATILITY_PCT}%` },
    scoreBarrier:      { pass: scoreBarrier,       detail: `pending score evaluation` }, // updated below
  };
}

// ── Scores ────────────────────────────────────────────────────────────────────
function calcScores(intraday, tick, fee) {
  const intradayScore =
    intraday.direction === 'BULLISH' ? 75 :
    intraday.direction === 'NEUTRAL' ? 45 : 20;

  const tickScore =
    tick.tickDirection === 'BUY_PRESSURE'  ? 75 :
    tick.tickDirection === 'NEUTRAL'       ? 50 : 20;

  const feeScore = fee.estimatedNetProfitUSDT >= REQUIRED_NET_PROFIT ? 70 :
    fee.estimatedNetProfitUSDT >= 0 ? 40 : 10;

  const totalScore = Math.round(intradayScore * 0.50 + tickScore * 0.30 + feeScore * 0.20);

  return { intradayScore, tickScore, feeScore, totalScore, requiredScore: REQUIRED_SCORE };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE3_OKX_ONLY] Started. user=${user.email} tradeAllowed=false killSwitchActive=true`);

    const pairs = [];

    for (const instId of ALL_PAIRS) {
      console.log(`[PHASE3_OKX_ONLY] Processing ${instId} ...`);

      const [tickerRes, candlesRes, tradesRes] = await Promise.all([
        fetchTicker(instId),
        fetchCandles(instId, 300),
        fetchTrades(instId, 500),
      ]);

      const dataStatus = {
        tickerAvailable:    tickerRes.ok,
        okx1mAvailable:     candlesRes.ok,
        okxTradesAvailable: tradesRes.ok,
      };

      const dataReady = tickerRes.ok && candlesRes.ok && tradesRes.ok;

      if (!dataReady) {
        console.log(`[PHASE3_OKX_ONLY] ${instId}: data not ready — ticker=${tickerRes.ok} candles=${candlesRes.ok} trades=${tradesRes.ok}`);
        pairs.push({
          pair:     instId,
          dataMode: 'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
          dataStatus,
          intradaySignal:      null,
          tickConfirmation:    null,
          feeAwareDiagnostic:  null,
          barriers:            null,
          score:               null,
          finalDecision: {
            tradeAllowed:      false,
            safeToTradeNow:    false,
            paperSignalOnly:   false,
            recommendedAction: 'WAIT_DATA_UNAVAILABLE',
            reason:            `Data not ready: ticker=${tickerRes.ok} candles=${candlesRes.ok} trades=${tradesRes.ok}`,
          },
        });
        continue;
      }

      // ── Compute all signals ──
      const intraday = analyzeIntraday(candlesRes.candles, tickerRes);
      const tick     = analyzeTickConfirmation(tradesRes.trades);
      const fee      = calcFeeAwareDiagnostic(tickerRes, intraday);
      const barriers = evaluateBarriers(intraday, tick, fee, tickerRes);
      const score    = calcScores(intraday, tick, fee);

      // Now resolve scoreBarrier with actual score
      barriers.scoreBarrier = {
        pass:   score.totalScore >= REQUIRED_SCORE,
        detail: `totalScore=${score.totalScore} required=${REQUIRED_SCORE}`,
      };

      const allBarriersPass = Object.values(barriers).every(b => b.pass);
      const paperSignalOnly = allBarriersPass && score.totalScore >= REQUIRED_SCORE;

      const recommendedAction = paperSignalOnly
        ? 'PAPER_SIGNAL_ONLY'
        : score.totalScore >= 50
          ? 'WAIT'
          : 'WATCH';

      const failedBarriers = Object.entries(barriers)
        .filter(([, b]) => !b.pass)
        .map(([name]) => name);

      console.log(`[PHASE3_OKX_ONLY] ${instId}: intraday=${intraday.direction} tick=${tick.tickDirection} score=${score.totalScore} barriers=${allBarriersPass ? 'ALL_PASS' : failedBarriers.join(',')} → ${recommendedAction}`);

      pairs.push({
        pair:     instId,
        dataMode: 'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
        dataStatus,

        intradaySignal: {
          direction:              intraday.direction,
          lastPrice:              intraday.lastPrice,
          emaFast:                intraday.emaFast,
          emaSlow:                intraday.emaSlow,
          rsi:                    intraday.rsi,
          candleMomentumPercent:  intraday.candleMomentumPercent,
          volumeMomentum:         intraday.volumeMomentum,
          confidence:             intraday.confidence,
          reason:                 intraday.reason,
        },

        tickConfirmation: {
          buyPressurePercent:  tick.buyPressurePercent,
          sellPressurePercent: tick.sellPressurePercent,
          tradeCount:          tick.tradeCount,
          tickDirection:       tick.tickDirection,
          confidence:          tick.confidence,
          reason:              tick.reason,
        },

        feeAwareDiagnostic: {
          estimatedEntry:          fee.estimatedEntry,
          targetPrice:             fee.targetPrice,
          tpPercent:               fee.tpPercent,
          grossProfitUSDT:         fee.grossProfitUSDT,
          estimatedFeesUSDT:       fee.estimatedFeesUSDT,
          estimatedSpreadCostUSDT: fee.estimatedSpreadCostUSDT,
          estimatedNetProfitUSDT:  fee.estimatedNetProfitUSDT,
          requiredNetProfitUSDT:   fee.requiredNetProfitUSDT,
          missingNetProfitUSDT:    fee.missingNetProfitUSDT,
          requiredTPPercent:       fee.requiredTPPercent,
        },

        barriers: {
          intradayBarrier:   barriers.intradayBarrier,
          tickBarrier:       barriers.tickBarrier,
          feeBarrier:        barriers.feeBarrier,
          spreadBarrier:     barriers.spreadBarrier,
          volatilityBarrier: barriers.volatilityBarrier,
          scoreBarrier:      barriers.scoreBarrier,
          allPass:           allBarriersPass,
          failedBarriers,
        },

        score: {
          intradayScore: score.intradayScore,
          tickScore:     score.tickScore,
          feeScore:      score.feeScore,
          totalScore:    score.totalScore,
          requiredScore: score.requiredScore,
        },

        finalDecision: {
          tradeAllowed:      false,
          safeToTradeNow:    false,
          paperSignalOnly,
          recommendedAction,
          reason: paperSignalOnly
            ? `All ${Object.keys(barriers).length - 2} barriers passed. Score=${score.totalScore}≥${REQUIRED_SCORE}. PAPER_SIGNAL_ONLY — kill switch active.`
            : `Failed: [${failedBarriers.join(', ')}]. Score=${score.totalScore}.`,
        },
      });
    }

    // ── Global summary ──
    const readyPairs       = pairs.filter(p => p.dataStatus?.tickerAvailable && p.dataStatus?.okx1mAvailable && p.dataStatus?.okxTradesAvailable).map(p => p.pair);
    const paperSignalPairs = pairs.filter(p => p.finalDecision.paperSignalOnly).map(p => p.pair);
    const waitPairs        = pairs.filter(p => p.finalDecision.recommendedAction === 'WAIT').map(p => p.pair);
    const watchPairs       = pairs.filter(p => p.finalDecision.recommendedAction === 'WATCH').map(p => p.pair);

    const engineVerdict = readyPairs.length === ALL_PAIRS.length
      ? 'READY_FOR_PAPER_TRADING'
      : 'NOT_READY';

    console.log(`[PHASE3_OKX_ONLY] Done. engineVerdict=${engineVerdict} ready=${readyPairs.length}/${ALL_PAIRS.length} paperSignals=[${paperSignalPairs.join(',')}]`);

    return Response.json({
      phase:                    'PHASE_3_OKX_ONLY_READ_ONLY',
      globalEngineMode:         'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      killSwitchActive:         true,
      tradeAllowed:             false,
      safeToTradeNow:           false,
      noOKXOrderEndpointCalled: true,
      polygonRemoved:           true,
      testTime:                 new Date().toISOString(),
      engineVerdict,
      summary: {
        totalPairs:        ALL_PAIRS.length,
        readyPairs,
        paperSignalPairs,
        waitPairs,
        watchPairs,
        constants: {
          OKX_TAKER_FEE,
          REQUIRED_NET_PROFIT,
          K_SIZE,
          K_TP,
          REQUIRED_SCORE,
          EMA_FAST_PERIOD,
          EMA_SLOW_PERIOD,
          RSI_PERIOD,
          MAX_SPREAD_PCT,
          MAX_VOLATILITY_PCT,
        },
      },
      pairs,
    });

  } catch (err) {
    console.error('[PHASE3_OKX_ONLY] Error:', err.message);
    return Response.json({
      phase:                    'PHASE_3_OKX_ONLY_READ_ONLY',
      globalEngineMode:         'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      killSwitchActive:         true,
      tradeAllowed:             false,
      safeToTradeNow:           false,
      noOKXOrderEndpointCalled: true,
      error:                    err.message,
    }, { status: 500 });
  }
});