/**
 * phase4FWhyNoTrade — Phase 4F BTC-Only No-Trade Diagnostic
 *
 * Explains exactly why no BTC paper trade is opening right now.
 * Fetches live BTC-USDT market data, runs all Phase 4F barriers,
 * returns a per-barrier pass/fail with the primary blocking reason.
 *
 * Read-only. No orders. Kill switch enforced.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REAL_TRADE_ALLOWED        = false;
const REAL_TRADE_UNLOCK_ALLOWED = false;
const KILL_SWITCH_ACTIVE        = true;
const NO_OKX_ORDER_ENDPOINT     = true;
const PHASE                     = 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE';

const CFG = {
  tpPercent:             1.30,
  slPercent:             0.65,
  expiryMinutes:         60,
  requiredScore:         75,
  minTickScore:          15,
  maxOpenTrades:         1,
  maxOpenTradesPerPair:  1,
  sizeUSDT:              10,
  takerFee:              0.001,
  maxSpreadPct:          0.05,
  maxVolatilityPct:      2.0,
  grossProfitFloor:      0.15,
  feeEfficiencyMaxRatio: 0.30,
  minNetProfit:          0.0003,
  minMomentumPct:        0.03,
};

// ── OKX public endpoints (read-only) ─────────────────────────────────────────
async function fetchTicker() {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT', { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) return null;
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return { last: parseFloat(d.last), bid, ask, spreadPct: mid > 0 ? (ask - bid) / mid * 100 : 0 };
  } catch { return null; }
}

async function fetchCandles() {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=100', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j?.data || []).map(c => ({
      ts: Number(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]), vol: parseFloat(c[5]),
    })).reverse();
  } catch { return []; }
}

async function fetchTrades() {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/trades?instId=BTC-USDT&limit=200', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j?.data || []).map(t => ({ ts: Number(t.ts), price: parseFloat(t.px), size: parseFloat(t.sz), side: t.side }));
  } catch { return []; }
}

// ── Indicators ────────────────────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let ag = 0, al = 0;
  for (let i = 0; i < period; i++) { if (changes[i] > 0) ag += changes[i]; else al += Math.abs(changes[i]); }
  ag /= period; al /= period;
  for (let i = period; i < changes.length; i++) {
    ag = (ag * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
    al = (al * (period - 1) + (changes[i] < 0 ? Math.abs(changes[i]) : 0)) / period;
  }
  return al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4F_WHY] BTC no-trade diagnostic requested by ${user.email}`);

    // ── Fetch market data ─────────────────────────────────────────────────
    const [ticker, candles, trades] = await Promise.all([fetchTicker(), fetchCandles(), fetchTrades()]);

    if (!ticker) {
      return Response.json({
        realTradeAllowed: false, killSwitchActive: true, noOKXOrderEndpointCalled: true,
        mainBlockingReason: 'NO_MARKET_DATA',
        recommendedAction:  'WAIT',
        error: 'Could not fetch BTC-USDT ticker',
      });
    }

    const closes = candles.map(c => c.close);

    // ── Indicators ────────────────────────────────────────────────────────
    const emaFast  = calcEMA(closes, 9);
    const emaSlow  = calcEMA(closes, 21);
    const rsi      = calcRSI(closes, 14);
    const mom10    = closes.length >= 10
      ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100
      : 0;

    const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
    const priorVol  = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
    const volMom    = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;

    const slice20  = candles.slice(-20);
    const hi       = slice20.length ? Math.max(...slice20.map(c => c.high)) : 0;
    const lo       = slice20.length ? Math.min(...slice20.map(c => c.low))  : 0;
    const volatilityPct = lo > 0 ? (hi - lo) / lo * 100 : 0;

    // Intraday direction
    const emaCross = emaFast && emaSlow ? (emaFast > emaSlow ? 1 : -1) : 0;
    const rsiBull  = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
    const momBull  = mom10 > 0.05 ? 1 : mom10 < -0.05 ? -1 : 0;
    const volBull  = volMom > 10 ? 1 : 0;
    const vote     = emaCross + rsiBull + momBull + volBull;
    const intradayDirection = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';

    let intradayScore = 50;
    if (intradayDirection === 'BULLISH') intradayScore += 25;
    if (intradayDirection === 'BEARISH') intradayScore -= 25;
    if (rsi !== null && rsi > 55) intradayScore += 10;
    if (volMom > 10) intradayScore += 8;
    intradayScore = Math.max(0, Math.min(100, intradayScore));

    // Tick confirmation
    const buyVol  = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
    const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
    const total   = buyVol + sellVol;
    const buyPct  = total > 0 ? buyVol / total * 100 : 50;
    const drift   = trades.length > 1 ? (trades[0].price - trades[trades.length - 1].price) / trades[trades.length - 1].price * 100 : 0;
    const tickDirection = buyPct >= 58 && drift > 0 ? 'BUY_PRESSURE' : (100 - buyPct) >= 58 && drift < 0 ? 'SELL_PRESSURE' : 'NEUTRAL';
    const tickScore     = buyPct >= 65 ? 25 : buyPct >= 55 ? 18 : buyPct >= 45 ? 10 : 5;

    // Composite score
    const tickS      = tickDirection === 'BUY_PRESSURE' ? 75 : tickDirection === 'NEUTRAL' ? 50 : 20;
    const grossEst   = CFG.sizeUSDT * (CFG.tpPercent / 100);
    const feesEst    = CFG.sizeUSDT * CFG.takerFee * 2;
    const spreadEst  = CFG.sizeUSDT * (ticker.spreadPct / 100);
    const netEst     = grossEst - feesEst - spreadEst;
    const feeS       = netEst >= CFG.minNetProfit ? 70 : netEst >= 0 ? 40 : 10;
    const totalScore = Math.round(intradayScore * 0.50 + tickS * 0.30 + feeS * 0.20);

    // ── Fee math ──────────────────────────────────────────────────────────
    const feeEffRatio    = grossEst > 0 ? (feesEst + spreadEst) / grossEst : 1;
    const tpRealismPass  = (Math.abs(mom10) * 3 >= CFG.tpPercent) || (totalScore >= 85);

    // ── Barrier evaluation ────────────────────────────────────────────────
    const barriers = {
      intradayBarrier:      intradayDirection !== 'BEARISH',
      tickBarrier:          tickScore >= CFG.minTickScore,
      feeBarrier:           netEst >= CFG.minNetProfit,
      grossProfitBarrier:   grossEst >= CFG.grossProfitFloor,
      feeEfficiencyBarrier: feeEffRatio <= CFG.feeEfficiencyMaxRatio,
      spreadBarrier:        ticker.spreadPct <= CFG.maxSpreadPct,
      volatilityBarrier:    volatilityPct <= CFG.maxVolatilityPct,
      scoreBarrier:         totalScore >= CFG.requiredScore,
      momentumBarrier:      Math.abs(mom10) >= CFG.minMomentumPct,
      tpRealismBarrier:     tpRealismPass,
    };

    // ── Open trade check ─────────────────────────────────────────────────
    const openTrades    = await base44.entities.PaperTrade.filter({ status: 'OPEN' });
    const openBTC       = openTrades.filter(t => t.instId === 'BTC-USDT');
    const duplicateBlocked  = openBTC.length > 0;
    const maxOpenBlocked    = openTrades.length >= CFG.maxOpenTrades;

    const allBarriersPass = Object.values(barriers).every(Boolean) && !duplicateBlocked && !maxOpenBlocked;

    // ── Primary blocking reason ───────────────────────────────────────────
    let mainBlockingReason = 'ALL_CLEAR_WAITING_FOR_SIGNAL';
    let recommendedAction  = 'WATCH';

    if (duplicateBlocked)                    { mainBlockingReason = 'OPEN_TRADE_ALREADY_EXISTS';  recommendedAction = 'WAIT'; }
    else if (maxOpenBlocked)                 { mainBlockingReason = 'MAX_OPEN_TRADES_REACHED';     recommendedAction = 'WAIT'; }
    else if (!barriers.intradayBarrier)      { mainBlockingReason = 'BEARISH_MARKET';              recommendedAction = 'WAIT'; }
    else if (!barriers.scoreBarrier)         { mainBlockingReason = 'SCORE_TOO_LOW';               recommendedAction = 'WATCH'; }
    else if (!barriers.tickBarrier)          { mainBlockingReason = 'WEAK_TICK_PRESSURE';          recommendedAction = 'WATCH'; }
    else if (!barriers.tpRealismBarrier)     { mainBlockingReason = 'TP_NOT_REALISTIC';            recommendedAction = 'WATCH'; }
    else if (!barriers.feeEfficiencyBarrier) { mainBlockingReason = 'FEE_EFFICIENCY_FAIL';         recommendedAction = 'WATCH'; }
    else if (!barriers.feeBarrier)           { mainBlockingReason = 'NET_PROFIT_BELOW_MINIMUM';    recommendedAction = 'WATCH'; }
    else if (!barriers.momentumBarrier)      { mainBlockingReason = 'INSUFFICIENT_MOMENTUM';       recommendedAction = 'WATCH'; }
    else if (!barriers.spreadBarrier)        { mainBlockingReason = 'SPREAD_TOO_WIDE';             recommendedAction = 'WAIT'; }
    else if (!barriers.volatilityBarrier)    { mainBlockingReason = 'VOLATILITY_TOO_HIGH';         recommendedAction = 'WAIT'; }
    else if (!barriers.grossProfitBarrier)   { mainBlockingReason = 'GROSS_PROFIT_BELOW_FLOOR';    recommendedAction = 'WATCH'; }
    else if (allBarriersPass)                { mainBlockingReason = 'PAPER_SIGNAL_READY';          recommendedAction = 'PAPER_SIGNAL_ONLY'; }

    // ── Phase 4F data collection progress ────────────────────────────────
    const phase4fTrades = await base44.entities.PaperTrade.filter({ phase: PHASE, instId: 'BTC-USDT' });
    const progress      = phase4fTrades.length;

    const collectionStatus =
      progress < 10  ? 'COLLECTING_BTC_ONLY_DATA' :
      progress < 20  ? 'FIRST_EVALUATION_POSSIBLE' :
      progress < 50  ? 'NORMAL_EVALUATION' :
                       'SERIOUS_PAPER_EVALUATION';

    const failedBarrierNames = [
      ...Object.entries(barriers).filter(([, v]) => !v).map(([k]) => k),
      ...(duplicateBlocked ? ['duplicateOpenTrade'] : []),
      ...(maxOpenBlocked   ? ['maxOpenTrades']      : []),
    ];

    // ── Alert level ───────────────────────────────────────────────────────
    let alertLevel;
    let alertRecommendedAction;
    let alertMessage;

    if (allBarriersPass) {
      alertLevel              = 'READY';
      alertRecommendedAction  = 'PAPER_SIGNAL_ONLY';
      alertMessage            = `🟢 BTC score ${totalScore}/75 — all barriers PASS. Paper signal ready. No real trading.`;
    } else if (totalScore >= 70) {
      alertLevel              = 'HOT';
      alertRecommendedAction  = 'WATCH_CLOSELY';
      alertMessage            = `🔥 BTC score ${totalScore}/75 — ${CFG.requiredScore - totalScore} points away. Barriers failing: ${failedBarrierNames.slice(0, 2).join(', ')}. Watch closely.`;
    } else if (totalScore >= 60) {
      alertLevel              = 'WARM';
      alertRecommendedAction  = 'WATCH';
      alertMessage            = `🟡 BTC score ${totalScore}/75 — warming up. Signal: ${intradayDirection}. Tick: ${tickDirection}. Keep watching.`;
    } else {
      alertLevel              = 'COLD';
      alertRecommendedAction  = 'WAIT';
      alertMessage            = `🔵 BTC score ${totalScore}/75 — market cold. Signal: ${intradayDirection}. Wait for BULLISH setup.`;
    }

    // ── Nearest barrier to pass ───────────────────────────────────────────
    // Rank barriers by how close they are to passing (score-based heuristic)
    const barrierProximity = [];
    if (!barriers.scoreBarrier)         barrierProximity.push({ name: 'scoreBarrier',         missing: CFG.requiredScore - totalScore, hint: `Need ${CFG.requiredScore - totalScore} more points` });
    if (!barriers.tickBarrier)          barrierProximity.push({ name: 'tickBarrier',           missing: CFG.minTickScore - tickScore,   hint: `Need tickScore ≥ ${CFG.minTickScore} (now ${tickScore})` });
    if (!barriers.tpRealismBarrier)     barrierProximity.push({ name: 'tpRealismBarrier',      missing: 1,                              hint: `Need |momentum|×3 ≥ 1.3% or score ≥ 85` });
    if (!barriers.intradayBarrier)      barrierProximity.push({ name: 'intradayBarrier',       missing: 2,                              hint: 'Need BULLISH or NEUTRAL signal' });
    if (!barriers.momentumBarrier)      barrierProximity.push({ name: 'momentumBarrier',       missing: 1,                              hint: `Need |momentum| ≥ 0.03% (now ${Math.abs(mom10).toFixed(4)}%)` });
    if (!barriers.grossProfitBarrier)   barrierProximity.push({ name: 'grossProfitBarrier',    missing: 1,                              hint: `Gross est ${grossEst.toFixed(4)} < floor ${CFG.grossProfitFloor}` });
    if (!barriers.feeEfficiencyBarrier) barrierProximity.push({ name: 'feeEfficiencyBarrier',  missing: 1,                              hint: `Fee ratio ${(feeEffRatio*100).toFixed(1)}% > 30%` });
    if (!barriers.spreadBarrier)        barrierProximity.push({ name: 'spreadBarrier',         missing: 1,                              hint: `Spread ${ticker.spreadPct.toFixed(4)}% > 0.05%` });

    const nearestBarrierToPass = barrierProximity.length > 0
      ? barrierProximity.sort((a, b) => a.missing - b.missing)[0]
      : null;

    // ── What's needed estimates ───────────────────────────────────────────
    // How much momentum % needed for tpRealismBarrier: |mom| * 3 >= 1.3 → |mom| >= 0.4333
    const estimatedNeededMomentumPercent = parseFloat((CFG.tpPercent / 3).toFixed(4));
    // Tick score needed: ≥ minTickScore (25 = buyPct ≥ 65%)
    const estimatedNeededTickScore = CFG.minTickScore;

    console.log(`[PHASE4F_WHY] score=${totalScore} alert=${alertLevel} intraday=${intradayDirection} tick=${tickDirection} blocking=${mainBlockingReason}`);

    return Response.json({
      // ── Safety ────────────────────────────────────────────────────────
      realTradeAllowed:         REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:   REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:         KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,
      mode:                     PHASE,

      // ── Config reminder ───────────────────────────────────────────────
      tpPercent:     CFG.tpPercent,
      slPercent:     CFG.slPercent,
      expiryMinutes: CFG.expiryMinutes,

      // ── Live market ───────────────────────────────────────────────────
      lastPrice:    ticker.last,
      bid:          ticker.bid,
      ask:          ticker.ask,
      spreadPct:    parseFloat(ticker.spreadPct.toFixed(6)),

      // ── Signal ────────────────────────────────────────────────────────
      currentSignal:    intradayDirection,
      tickDirection,
      buyPressurePct:   parseFloat(buyPct.toFixed(2)),
      rsi,
      emaFast:          emaFast ? parseFloat(emaFast.toFixed(2)) : null,
      emaSlow:          emaSlow ? parseFloat(emaSlow.toFixed(2)) : null,
      momentum10:       parseFloat(mom10.toFixed(4)),
      volumeMomentum:   parseFloat(volMom.toFixed(2)),
      volatilityPct:    parseFloat(volatilityPct.toFixed(4)),

      // ── Score ─────────────────────────────────────────────────────────
      totalScore,
      intradayScore,
      tickScore,
      feeScore:      feeS,
      requiredScore: CFG.requiredScore,
      missingScore:  Math.max(0, CFG.requiredScore - totalScore),
      minTickScore:  CFG.minTickScore,

      // ── Fee math ──────────────────────────────────────────────────────
      grossEstimate:    parseFloat(grossEst.toFixed(6)),
      feesEstimate:     parseFloat(feesEst.toFixed(6)),
      spreadEstimate:   parseFloat(spreadEst.toFixed(6)),
      netEstimate:      parseFloat(netEst.toFixed(6)),
      feeEffRatio:      parseFloat(feeEffRatio.toFixed(4)),

      // ── Barriers ──────────────────────────────────────────────────────
      intradayBarrier:      barriers.intradayBarrier,
      tickBarrier:          barriers.tickBarrier,
      feeBarrier:           barriers.feeBarrier,
      grossProfitBarrier:   barriers.grossProfitBarrier,
      feeEfficiencyBarrier: barriers.feeEfficiencyBarrier,
      spreadBarrier:        barriers.spreadBarrier,
      volatilityBarrier:    barriers.volatilityBarrier,
      scoreBarrier:         barriers.scoreBarrier,
      momentumBarrier:      barriers.momentumBarrier,
      tpRealismBarrier:     barriers.tpRealismBarrier,

      // ── Open trade state ──────────────────────────────────────────────
      duplicateOpenTradeBlocked: duplicateBlocked,
      maxOpenTradesBlocked:      maxOpenBlocked,
      currentOpenBTCTrades:      openBTC.length,
      currentOpenAllTrades:      openTrades.length,

      // ── Diagnosis ─────────────────────────────────────────────────────
      allBarriersPass,
      failedBarriers:     failedBarrierNames,
      mainBlockingReason,
      recommendedAction,

      // ── Alert level ───────────────────────────────────────────────────────
      alertLevel,
      alertRecommendedAction,
      alertMessage,
      nearestBarrierToPass,
      estimatedNeededMomentumPercent,
      estimatedNeededTickScore,

      // ── Data collection status ────────────────────────────────────────
      dataCollection: {
        btcTradesCollected: progress,
        collectionStatus,
        firstEvalAt:        10,
        normalEvalAt:       20,
        seriousEvalAt:      50,
        pctTo10:            Math.min(100, Math.round(progress / 10 * 100)),
        pctTo50:            Math.min(100, Math.round(progress / 50 * 100)),
        doNotUnlock:        'DO_NOT_UNLOCK_PHASE_5',
        realTradingLocked:  true,
      },

      checkedAt:   new Date().toISOString(),
      requestedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4F_WHY] Error:', err.message);
    return Response.json({
      realTradeAllowed:         false,
      realTradeUnlockAllowed:   false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      mainBlockingReason:       'DIAGNOSTIC_ERROR',
      recommendedAction:        'WAIT',
      error: err.message,
    }, { status: 500 });
  }
});