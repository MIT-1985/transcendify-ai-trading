/**
 * phase4OpportunityDiagnostic
 *
 * Diagnostic tool explaining WHY paper trades are not opening often enough.
 * Runs a full read-only signal analysis for each pair and checks every barrier.
 *
 * SAFETY CONSTANTS — HARDCODED, IMMUTABLE
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── SAFETY CONSTANTS ─────────────────────────────────────────────────────────
const TRADE_ALLOWED           = false;
const REAL_TRADE_ALLOWED      = false;
const KILL_SWITCH_ACTIVE      = true;
const NO_OKX_ORDER_ENDPOINT   = true;
// ─────────────────────────────────────────────────────────────────────────────

const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// Thresholds (mirror phase4OKXPaperTrading — Phase 4B correction)
const REQUIRED_SCORE            = 65;     // Phase 4B correction: raised 55 → 65
const MIN_TICK_SCORE_THRESHOLD  = 12;     // Phase 4B correction: raised 10 → 12
const TP_PCT                    = 0.25;
const SL_PCT                    = 0.18;
const K_SIZE_DIAG               = 10;     // USDT per trade (for fee calc)
const MAX_SPREAD_PCT            = 0.06;
const MAX_OPEN_TRADES           = 5;
const FEE_RATE                  = 0.001;  // 0.1% per leg
const MIN_ESTIMATED_NET_PROFIT  = 0.05;   // NEW: min net profit barrier
const FEE_EFFICIENCY_MAX_RATIO  = 0.40;   // NEW: (fees+spread)/grossProfit <= 40%
const MIN_MOMENTUM_PCT          = 0.03;   // NEW: abs(momentum) >= 0.03%
const HIGH_EXPIRY_SCORE_FLOOR   = 70;     // NEW: score floor when expiry ratio > 40%
const MIN_VOL_USDT              = 500_000;
const CANDLE_LIMIT              = 30;
const TICK_LIMIT                = 50;

// ── OKX public endpoints (read-only, no auth) ────────────────────────────────
const OKX_BASE = 'https://www.okx.com';

async function fetchTicker(instId) {
  const r = await fetch(`${OKX_BASE}/api/v5/market/ticker?instId=${instId}`);
  const j = await r.json();
  return j.data?.[0] ?? null;
}

async function fetchCandles(instId, bar = '1m', limit = CANDLE_LIMIT) {
  const r = await fetch(`${OKX_BASE}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`);
  const j = await r.json();
  // [ts, open, high, low, close, vol, volCcy]
  return (j.data ?? []).map(c => ({
    ts:    Number(c[0]),
    open:  parseFloat(c[1]),
    high:  parseFloat(c[2]),
    low:   parseFloat(c[3]),
    close: parseFloat(c[4]),
    vol:   parseFloat(c[5]),
  }));
}

async function fetchTrades(instId, limit = TICK_LIMIT) {
  const r = await fetch(`${OKX_BASE}/api/v5/market/trades?instId=${instId}&limit=${limit}`);
  const j = await r.json();
  return (j.data ?? []).map(t => ({
    side:  t.side,
    sz:    parseFloat(t.sz),
    px:    parseFloat(t.px),
  }));
}

// ── Technical indicators ─────────────────────────────────────────────────────
function ema(values, period) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcVolatility(candles) {
  if (candles.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100; // in %
}

// ── Signal analysis for a single pair ────────────────────────────────────────
async function analyzePair(instId, openTrades) {
  const result = {
    pair:                     instId,
    currentAction:            'WAIT',
    totalScore:               0,
    requiredScore:            REQUIRED_SCORE,
    missingScore:             REQUIRED_SCORE,
    intradayBarrier:          'FAIL',
    tickBarrier:              'FAIL',
    feeBarrier:               'FAIL',
    spreadBarrier:            'FAIL',
    volatilityBarrier:        'FAIL',
    duplicateOpenTradeBlocked: false,
    maxOpenTradesBlocked:     false,
    mainBlockingReason:       'UNKNOWN',
    recommendedConstantChange: 'none',
    // diagnostics
    spread:          null,
    spreadPct:       null,
    vol24h:          null,
    askPx:           null,
    bidPx:           null,
    rsiValue:        null,
    volatilityPct:   null,
    intradayScore:   0,
    tickScore:       0,
    feeScore:        0,
    spreadScore:     0,
    scoreBreakdown:  {},
  };

  // ── Duplicate / capacity checks ───────────────────────────────────────────
  const alreadyOpen = openTrades.filter(t => t.instId === instId && t.status === 'OPEN');
  if (alreadyOpen.length > 0) {
    result.duplicateOpenTradeBlocked = true;
    result.mainBlockingReason = 'DUPLICATE_OPEN_TRADE';
    result.currentAction = 'WATCH';
    return result;
  }
  if (openTrades.filter(t => t.status === 'OPEN').length >= MAX_OPEN_TRADES) {
    result.maxOpenTradesBlocked = true;
    result.mainBlockingReason = 'MAX_OPEN_TRADES_REACHED';
    result.currentAction = 'WAIT';
    return result;
  }

  // ── Fetch market data ─────────────────────────────────────────────────────
  const [ticker, candles, trades] = await Promise.all([
    fetchTicker(instId),
    fetchCandles(instId, '1m', CANDLE_LIMIT),
    fetchTrades(instId, TICK_LIMIT),
  ]);

  if (!ticker || candles.length < 5) {
    result.mainBlockingReason = 'MARKET_DATA_UNAVAILABLE';
    return result;
  }

  const ask = parseFloat(ticker.askPx);
  const bid = parseFloat(ticker.bidPx);
  const mid = (ask + bid) / 2;
  const spread = ask - bid;
  const spreadPct = (spread / mid) * 100;
  const vol24h = parseFloat(ticker.vol24h) * mid; // in USDT

  result.askPx      = ask;
  result.bidPx      = bid;
  result.spread     = spread;
  result.spreadPct  = Math.round(spreadPct * 10000) / 10000;
  result.vol24h     = Math.round(vol24h);

  // ── SPREAD BARRIER ────────────────────────────────────────────────────────
  const spreadPass = spreadPct <= MAX_SPREAD_PCT;
  result.spreadBarrier = spreadPass ? 'PASS' : 'FAIL';
  result.spreadScore   = spreadPass ? 15 : 0;

  // ── FEE BARRIER ───────────────────────────────────────────────────────────
  const minMoveForProfit = (FEE_RATE * 2 + spreadPct / 100) * 100; // % needed just to break even
  const tpPct = TP_PCT; // 0.25%
  const feePass = tpPct > minMoveForProfit;
  result.feeBarrier = feePass ? 'PASS' : 'FAIL';
  result.feeScore   = feePass ? 20 : 0;

  // ── INTRADAY BARRIER (candle momentum + EMA + RSI) ───────────────────────
  const closes = candles.map(c => c.close).reverse(); // oldest first
  const ema5  = closes.length >= 5  ? ema(closes.slice(-5),  5)  : mid;
  const ema20 = closes.length >= 20 ? ema(closes.slice(-20), 20) : mid;
  const rsiVal = rsi(closes, Math.min(14, closes.length - 1));

  // Momentum: last 5 closes vs 5 closes ago
  const recentClose = closes[closes.length - 1];
  const prevClose   = closes[closes.length - 6] ?? closes[0];
  const momentum    = ((recentClose - prevClose) / prevClose) * 100;

  // Volatility
  const volatility = calcVolatility(candles);
  result.volatilityPct = Math.round(volatility * 10000) / 10000;
  result.rsiValue      = Math.round(rsiVal * 10) / 10;

  // Intraday score (0-40)
  let intradayScore = 0;
  const bullish = ema5 > ema20 && momentum > 0 && rsiVal > 45 && rsiVal < 75;
  const bearish = ema5 < ema20 && momentum < 0 && rsiVal < 55 && rsiVal > 25;
  const neutral = !bullish && !bearish;

  if (bullish)        intradayScore = 35;
  else if (bearish)   intradayScore = 30; // bearish still gives signal for shorts (not used in paper but scored)
  else if (neutral)   intradayScore = 10;

  // RSI bonus
  if (rsiVal > 50 && rsiVal < 70) intradayScore = Math.min(40, intradayScore + 5);
  if (rsiVal < 50 && rsiVal > 30) intradayScore = Math.min(40, intradayScore + 3);

  result.intradayScore   = intradayScore;
  result.intradayBarrier = intradayScore >= 25 ? 'PASS' : 'FAIL';

  // ── VOLATILITY BARRIER ─────────────────────────────────────────────────────
  const volatilityPass = volatility > 0.01 && volatility < 1.5; // not too flat, not too wild
  result.volatilityBarrier = volatilityPass ? 'PASS' : 'FAIL';

  // ── TICK BARRIER (buy/sell pressure) ─────────────────────────────────────
  let buyVol = 0, sellVol = 0;
  for (const t of trades) {
    if (t.side === 'buy')  buyVol  += t.sz * t.px;
    else                   sellVol += t.sz * t.px;
  }
  const totalTickVol = buyVol + sellVol;
  const buyRatio = totalTickVol > 0 ? buyVol / totalTickVol : 0.5;

  let tickScore = 0;
  if      (buyRatio > 0.65) tickScore = 25; // strong buy pressure
  else if (buyRatio > 0.55) tickScore = 18;
  else if (buyRatio > 0.45) tickScore = 10; // neutral
  else                      tickScore = 5;  // sell pressure

  result.tickScore   = tickScore;
  result.tickBarrier = tickScore >= MIN_TICK_SCORE_THRESHOLD ? 'PASS' : 'FAIL'; // Phase 4B correction: 12

  // ── MIN NET PROFIT BARRIER ────────────────────────────────────────────────
  const grossProfit   = K_SIZE_DIAG * (TP_PCT / 100);
  const feesTotal     = K_SIZE_DIAG * FEE_RATE * 2;
  const spreadCostDiag = K_SIZE_DIAG * (spreadPct / 100);
  const estimatedNet  = grossProfit - feesTotal - spreadCostDiag;
  const feeRatio      = grossProfit > 0 ? (feesTotal + spreadCostDiag) / grossProfit : 1;
  result.minNetProfitBarrier  = estimatedNet >= MIN_ESTIMATED_NET_PROFIT ? 'PASS' : 'FAIL';
  result.feeEfficiencyBarrier = feeRatio <= FEE_EFFICIENCY_MAX_RATIO ? 'PASS' : 'FAIL';
  result.estimatedNetProfit   = parseFloat(estimatedNet.toFixed(6));
  result.feeEfficiencyRatio   = parseFloat(feeRatio.toFixed(4));

  // ── MOMENTUM BARRIER ──────────────────────────────────────────────────────
  result.momentumBarrier = Math.abs(momentum) >= MIN_MOMENTUM_PCT ? 'PASS' : 'FAIL';
  result.momentumPct     = parseFloat(momentum.toFixed(4));

  // ── COMPOSITE SCORE ───────────────────────────────────────────────────────
  const totalScore = intradayScore + tickScore + result.spreadScore + result.feeScore;
  result.totalScore    = totalScore;
  result.missingScore  = Math.max(0, REQUIRED_SCORE - totalScore);

  result.scoreBreakdown = {
    intradayScore,
    tickScore,
    spreadScore: result.spreadScore,
    feeScore:    result.feeScore,
    total:       totalScore,
    required:    REQUIRED_SCORE,
    gap:         Math.max(0, REQUIRED_SCORE - totalScore),
  };

  // ── DETERMINE ACTION ──────────────────────────────────────────────────────
  const allNewBarriersPass = result.minNetProfitBarrier === 'PASS'
    && result.feeEfficiencyBarrier === 'PASS'
    && result.momentumBarrier === 'PASS';

  if (totalScore >= REQUIRED_SCORE && spreadPass && feePass && allNewBarriersPass) {
    result.currentAction = 'PAPER_SIGNAL_ONLY';
  } else if (totalScore >= REQUIRED_SCORE - 10) {
    result.currentAction = 'WATCH';
  } else {
    result.currentAction = 'WAIT';
  }

  // ── MAIN BLOCKING REASON ──────────────────────────────────────────────────
  const barriers = [];
  if (!spreadPass)     barriers.push({ name: 'SPREAD_TOO_WIDE',        weight: 4, fix: `Increase MAX_SPREAD_PCT above ${spreadPct.toFixed(4)}%` });
  if (!feePass)        barriers.push({ name: 'FEE_VIABILITY_FAIL',     weight: 3, fix: `Increase TP_PCT above ${minMoveForProfit.toFixed(3)}%` });
  if (result.minNetProfitBarrier === 'FAIL')  barriers.push({ name: 'MIN_NET_PROFIT_TOO_LOW',  weight: 4, fix: `estimatedNet=${estimatedNet.toFixed(4)} USDT < ${MIN_ESTIMATED_NET_PROFIT} USDT minimum` });
  if (result.feeEfficiencyBarrier === 'FAIL') barriers.push({ name: 'FEE_EFFICIENCY_BREACH',   weight: 4, fix: `fees+spread=${(feeRatio*100).toFixed(1)}% of gross > ${FEE_EFFICIENCY_MAX_RATIO*100}% max` });
  if (result.momentumBarrier === 'FAIL')      barriers.push({ name: 'INSUFFICIENT_MOMENTUM',   weight: 3, fix: `momentum=${result.momentumPct}% < ${MIN_MOMENTUM_PCT}% minimum` });
  if (result.intradayBarrier === 'FAIL') barriers.push({ name: 'WEAK_INTRADAY_MOMENTUM',  weight: 3, fix: 'Wait for trend confirmation (EMA cross + RSI + candle momentum)' });
  if (result.tickBarrier === 'FAIL')     barriers.push({ name: 'WEAK_TICK_PRESSURE',       weight: 2, fix: `tickScore < ${MIN_TICK_SCORE_THRESHOLD} — need stronger buy pressure` });
  if (!volatilityPass) barriers.push({ name: 'VOLATILITY_OUT_OF_RANGE', weight: 2, fix: 'Adjust volatility window or min/max thresholds' });
  if (totalScore < REQUIRED_SCORE) barriers.push({ name: `SCORE_TOO_LOW (${totalScore}/${REQUIRED_SCORE})`, weight: 5, fix: `Score ${totalScore} below required ${REQUIRED_SCORE}` });

  if (barriers.length === 0 && result.currentAction !== 'PAPER_SIGNAL_ONLY') {
    barriers.push({ name: 'UNKNOWN_BARRIER', weight: 1, fix: 'Review raw market data' });
  }

  barriers.sort((a, b) => b.weight - a.weight);
  result.mainBlockingReason        = barriers[0]?.name ?? 'NONE';
  result.recommendedConstantChange = barriers[0]?.fix  ?? 'No change needed';
  result.allBarriers               = barriers;

  return result;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log('[PHASE4_DIAG] Starting opportunity diagnostic...');

    // ── Fetch open paper trades + expiry ratio ────────────────────────────
    const openTrades = await base44.entities.PaperTrade.filter({ status: 'OPEN' });
    console.log(`[PHASE4_DIAG] Open trades: ${openTrades.length}`);

    // Compute recent expiry ratio (last 100 closed)
    const recentClosed = await base44.entities.PaperTrade.list('-closedAt', 100);
    const recentClosedValid = recentClosed.filter(t => t.status !== 'OPEN' && t.closedAt);
    const recentExpired = recentClosedValid.filter(t => t.status === 'EXPIRED');
    const recentExpiryRatio = recentClosedValid.length > 0 ? recentExpired.length / recentClosedValid.length : 0;
    const expiryFilterActive = recentExpiryRatio > 0.40;

    // ── Fetch last 24h closed trades ─────────────────────────────────────
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allRecent = await base44.entities.PaperTrade.list('-created_date', 200);
    const closed24h = allRecent.filter(t =>
      t.status !== 'OPEN' && t.openedAt && t.openedAt >= since24h
    );
    const opened24h = allRecent.filter(t => t.openedAt && t.openedAt >= since24h);

    // ── Analyze each pair in parallel ─────────────────────────────────────
    console.log('[PHASE4_DIAG] Analyzing pairs in parallel...');
    const pairResults = await Promise.all(
      PAIRS.map(pair => analyzePair(pair, openTrades))
    );

    // ── Global summary ────────────────────────────────────────────────────
    const blockingReasons = pairResults
      .map(p => p.mainBlockingReason)
      .filter(r => r && r !== 'NONE' && r !== 'UNKNOWN');

    const reasonCounts = {};
    for (const r of blockingReasons) {
      reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
    }
    const mostCommonBlockingReason = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'NONE';

    const paperSignalsFound24h = pairResults.filter(p => p.currentAction === 'PAPER_SIGNAL_ONLY').length;
    const isStrategyTooStrict  = pairResults.filter(p => p.currentAction === 'WAIT' || p.currentAction === 'WATCH').length >= 3;

    const globalSummary = {
      openTrades:              openTrades.length,
      closedTrades24h:         closed24h.length,
      scansLast24h:            'N/A — use PaperTrade history',
      paperSignalsFound24h,
      tradesOpened24h:         opened24h.length,
      mostCommonBlockingReason,
      isStrategyTooStrict,
      pairsReady:              paperSignalsFound24h,
      pairsBlocked:            PAIRS.length - paperSignalsFound24h,
      recentExpiryRatio:       parseFloat(recentExpiryRatio.toFixed(3)),
      expiryFilterActive,
    };

    console.log(`[PHASE4_DIAG] Summary: openTrades=${openTrades.length}, signals=${paperSignalsFound24h}, tooStrict=${isStrategyTooStrict}`);

    // ── Threshold reference ───────────────────────────────────────────────
    const currentThresholds = {
      REQUIRED_SCORE,
      MIN_TICK_SCORE_THRESHOLD,
      TP_PCT,
      SL_PCT,
      MAX_SPREAD_PCT,
      MAX_OPEN_TRADES,
      FEE_RATE,
      MIN_ESTIMATED_NET_PROFIT,
      FEE_EFFICIENCY_MAX_RATIO,
      MIN_MOMENTUM_PCT,
      HIGH_EXPIRY_SCORE_FLOOR,
      MIN_VOL_USDT,
      recentExpiryRatio:   parseFloat(recentExpiryRatio.toFixed(3)),
      expiryFilterActive,
      effectiveScoreFloor: expiryFilterActive ? HIGH_EXPIRY_SCORE_FLOOR : REQUIRED_SCORE,
    };

    // ── Suggestions ───────────────────────────────────────────────────────
    const suggestions = [];
    if (isStrategyTooStrict) {
      const avgScore = pairResults.reduce((a, p) => a + p.totalScore, 0) / pairResults.length;
      if (avgScore < REQUIRED_SCORE - 15) {
        suggestions.push(`Lower REQUIRED_SCORE from ${REQUIRED_SCORE} to ${Math.round(avgScore + 5)} to capture more signals`);
      }
      const spreadFails = pairResults.filter(p => p.spreadBarrier === 'FAIL').length;
      if (spreadFails >= 2) {
        suggestions.push(`${spreadFails} pairs failing spread — consider increasing MAX_SPREAD_PCT from ${MAX_SPREAD_PCT}% to 0.08%`);
      }
      const tickFails = pairResults.filter(p => p.tickBarrier === 'FAIL').length;
      if (tickFails >= 2) {
        suggestions.push(`${tickFails} pairs failing tick pressure — consider lowering tick threshold`);
      }
      const intradayFails = pairResults.filter(p => p.intradayBarrier === 'FAIL').length;
      if (intradayFails >= 3) {
        suggestions.push(`${intradayFails} pairs failing intraday momentum — market may be ranging, consider shorter EMA window`);
      }
    }
    if (suggestions.length === 0) suggestions.push('Strategy thresholds appear reasonable for current market conditions');

    return Response.json({
      // ── SAFETY FLAGS (hardcoded, immutable) ──
      safety: {
        tradeAllowed:           TRADE_ALLOWED,
        realTradeAllowed:       REAL_TRADE_ALLOWED,
        killSwitchActive:       KILL_SWITCH_ACTIVE,
        noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,
        mode:                   'PAPER_ONLY_DIAGNOSTIC',
      },

      // ── Per-pair results ──
      pairs: pairResults.map(p => ({
        pair:                      p.pair,
        currentAction:             p.currentAction,
        totalScore:                p.totalScore,
        requiredScore:             p.requiredScore,
        missingScore:              p.missingScore,
        intradayBarrier:           p.intradayBarrier,
        tickBarrier:               p.tickBarrier,
        feeBarrier:                p.feeBarrier,
        minNetProfitBarrier:       p.minNetProfitBarrier,
        feeEfficiencyBarrier:      p.feeEfficiencyBarrier,
        momentumBarrier:           p.momentumBarrier,
        spreadBarrier:             p.spreadBarrier,
        volatilityBarrier:         p.volatilityBarrier,
        duplicateOpenTradeBlocked: p.duplicateOpenTradeBlocked,
        maxOpenTradesBlocked:      p.maxOpenTradesBlocked,
        mainBlockingReason:        p.mainBlockingReason,
        recommendedConstantChange: p.recommendedConstantChange,
        scoreBreakdown:            p.scoreBreakdown,
        marketData: {
          spreadPct:            p.spreadPct,
          vol24hUSDT:           p.vol24h,
          rsi:                  p.rsiValue,
          volatilityPct:        p.volatilityPct,
          askPx:                p.askPx,
          bidPx:                p.bidPx,
          momentumPct:          p.momentumPct,
          estimatedNetProfit:   p.estimatedNetProfit,
          feeEfficiencyRatio:   p.feeEfficiencyRatio,
        },
        allBarriers: p.allBarriers,
      })),

      // ── Global summary ──
      globalSummary,

      // ── Suggestions ──
      suggestions,

      // ── Current thresholds ──
      currentThresholds,

      diagnosedAt: new Date().toISOString(),
      diagnosedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4_DIAG] Error:', err.message);
    return Response.json({
      error: err.message,
      safety: {
        tradeAllowed:             false,
        realTradeAllowed:         false,
        killSwitchActive:         true,
        noOKXOrderEndpointCalled: true,
      },
    }, { status: 500 });
  }
});