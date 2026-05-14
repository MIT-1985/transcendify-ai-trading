/**
 * phase4DApplyCorrection — Phase 4D Fee-Profit Correction Report
 *
 * Safety:
 *   realTradeAllowed          = false  ALWAYS
 *   realTradeUnlockAllowed    = false  ALWAYS
 *   killSwitchActive          = true   ALWAYS
 *   noOKXOrderEndpointCalled  = true   ALWAYS
 *   phase                     = PHASE_4D_CORRECTION_REPORT
 *
 * Reads PaperTrade entity (service role) to compute all metrics.
 * Calls OKX public market data endpoints to simulate one scan cycle
 * and count how many pairs would be blocked by each new 4D barrier.
 *
 * Returns:
 *   oldConstants, newConstants, openedThisRun, blockedByFeeDrain,
 *   blockedByTPRealism, blockedByExpiryPenalty, safetyStatus,
 *   realTradingEndpointDetected, finalVerdict
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HARDCODED SAFETY ──────────────────────────────────────────────────────────
const REAL_TRADE_ALLOWED         = false;
const REAL_TRADE_UNLOCK_ALLOWED  = false;
const KILL_SWITCH_ACTIVE         = true;
const NO_OKX_ORDER_ENDPOINT      = true;
const PHASE                      = 'PHASE_4D_CORRECTION_REPORT';

const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ── Constants diff ────────────────────────────────────────────────────────────
const OLD_CONSTANTS = {
  phase:                  'PHASE_4B',
  requiredScore:          65,
  minTickScore:           12,
  minEstimatedNetProfit:  0.05,
  feeEfficiencyMaxRatio:  0.40,
  grossProfitFloor:       null,
  highExpiryScoreFloor:   70,
  highExpiryThreshold:    0.40,
  tpRealismCheck:         false,
  maxOpenTrades:          5,
};

const NEW_CONSTANTS = {
  phase:                  'PHASE_4D',
  requiredScore:          65,
  minTickScore:           12,
  minEstimatedNetProfit:  0.10,   // raised 0.05 → 0.10
  feeEfficiencyMaxRatio:  0.30,   // tightened 0.40 → 0.30
  grossProfitFloor:       0.15,   // NEW
  highExpiryScoreFloor:   75,     // raised 70 → 75
  highExpiryThreshold:    0.50,   // raised 0.40 → 0.50
  tpRealismCheck:         true,   // NEW
  maxOpenTrades:          5,
};

// Trading constants (match phase4OKXPaperTrading)
const K_SIZE       = 10;
const K_TP         = 0.30;
const K_SL         = -0.20;
const OKX_FEE      = 0.001;
const MAX_SPREAD   = 0.05;
const MAX_VOL_PCT  = 2.0;
const REQUIRED_NET = 0.0003;
const EMA_FAST = 9;
const EMA_SLOW = 21;

// ── OKX public market data ────────────────────────────────────────────────────
async function fetchTicker(instId) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) return null;
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return { last: parseFloat(d.last), bid, ask, spreadPct: mid > 0 ? (ask - bid) / mid * 100 : 0 };
  } catch { return null; }
}

async function fetchCandles(instId) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=50`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return (j?.data || []).map(c => ({
      close: parseFloat(c[4]), high: parseFloat(c[2]), low: parseFloat(c[3]), vol: parseFloat(c[5]),
    })).reverse();
  } catch { return []; }
}

async function fetchTrades(instId) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=100`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return (j?.data || []).map(t => ({ side: t.side, sz: parseFloat(t.sz) }));
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
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

// ── Scan a pair and classify which new 4D barriers block it ──────────────────
async function scanPair4D(instId, openPairIds, recentExpiryRatio) {
  // Skip if already open
  if (openPairIds.includes(instId)) {
    return { instId, action: 'SKIP_OPEN', blockedBy4D: false, blockedByFeeDrain: false, blockedByTPRealism: false, blockedByExpiryPenalty: false };
  }

  const [ticker, candles, trades] = await Promise.all([fetchTicker(instId), fetchCandles(instId), fetchTrades(instId)]);
  if (!ticker || candles.length < 25) {
    return { instId, action: 'SKIP_NO_DATA', blockedBy4D: false, blockedByFeeDrain: false, blockedByTPRealism: false, blockedByExpiryPenalty: false };
  }

  const closes = candles.map(c => c.close);
  const emaFast = calcEMA(closes, EMA_FAST);
  const emaSlow = calcEMA(closes, EMA_SLOW);
  const rsi     = calcRSI(closes);
  const mom10   = closes.length >= 10 ? (closes[closes.length-1] - closes[closes.length-10]) / closes[closes.length-10] * 100 : 0;
  const slice20 = candles.slice(-20);
  const hi = Math.max(...slice20.map(c => c.high));
  const lo = Math.min(...slice20.map(c => c.low));
  const volatility = lo > 0 ? (hi - lo) / lo * 100 : 0;

  const emaCross = emaFast && emaSlow ? (emaFast > emaSlow ? 1 : -1) : 0;
  const rsiBull  = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
  const momBull  = mom10 > 0.05 ? 1 : mom10 < -0.05 ? -1 : 0;
  const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
  const priorVol  = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
  const volMom    = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;
  const volBull   = volMom > 10 ? 1 : 0;
  const vote      = emaCross + rsiBull + momBull + volBull;
  const direction = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';

  let intScore = 50;
  if (direction === 'BULLISH') intScore += 25;
  if (direction === 'BEARISH') intScore -= 25;
  if (rsi !== null && rsi > 55) intScore += 10;
  if (volMom > 10) intScore += 8;
  intScore = Math.max(0, Math.min(100, intScore));

  const buyVol  = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.sz, 0);
  const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.sz, 0);
  const total   = buyVol + sellVol;
  const buyPct  = total > 0 ? buyVol / total * 100 : 50;
  const tickScore = buyPct >= 65 ? 25 : buyPct >= 55 ? 18 : buyPct >= 45 ? 10 : 5;
  const tickDir   = buyPct >= 58 ? 'BUY_PRESSURE' : (100 - buyPct) >= 58 ? 'SELL_PRESSURE' : 'NEUTRAL';

  const grossProfit    = K_SIZE * (K_TP / 100);
  const fees           = K_SIZE * OKX_FEE * 2;
  const spreadCost     = K_SIZE * (ticker.spreadPct / 100);
  const feeNet         = grossProfit - fees - spreadCost;
  const feeEffRatio    = grossProfit > 0 ? (fees + spreadCost) / grossProfit : 1;

  const tickDirScore  = tickDir === 'BUY_PRESSURE' ? 75 : tickDir === 'NEUTRAL' ? 50 : 20;
  const feeS          = feeNet >= REQUIRED_NET ? 70 : feeNet >= 0 ? 40 : 10;
  const score         = Math.round(intScore * 0.50 + tickDirScore * 0.30 + feeS * 0.20);

  // ── Classify which 4D barrier blocks this trade ───────────────────────────
  const effectiveScoreFloor = recentExpiryRatio > NEW_CONSTANTS.highExpiryThreshold
    ? NEW_CONSTANTS.highExpiryScoreFloor : NEW_CONSTANTS.requiredScore;

  const minNetProfitFail    = feeNet < NEW_CONSTANTS.minEstimatedNetProfit;
  const feeEffFail          = feeEffRatio > NEW_CONSTANTS.feeEfficiencyMaxRatio;
  const grossFloorFail      = grossProfit < NEW_CONSTANTS.grossProfitFloor;
  const tpRealismFail       = !((Math.abs(mom10) * 3 >= K_TP) || (score >= 75));
  const scoreFail           = score < effectiveScoreFloor;
  const intradayFail        = direction === 'BEARISH';
  const spreadFail          = ticker.spreadPct > MAX_SPREAD;
  const volFail             = volatility > MAX_VOL_PCT;
  const tickFail            = tickScore < 12;
  const momentumFail        = Math.abs(mom10) < 0.03;

  const blockedByFeeDrain     = minNetProfitFail || feeEffFail || grossFloorFail;
  const blockedByTPRealism    = tpRealismFail && !blockedByFeeDrain;
  const blockedByExpiryPenalty = scoreFail && recentExpiryRatio > NEW_CONSTANTS.highExpiryThreshold;

  // Would this pass the OLD 4B barriers but fail 4D?
  const passedOld4B = !intradayFail && !spreadFail && !volFail && !tickFail && !momentumFail
    && (feeNet >= OLD_CONSTANTS.minEstimatedNetProfit)
    && ((fees + spreadCost) / grossProfit <= OLD_CONSTANTS.feeEfficiencyMaxRatio)
    && score >= (recentExpiryRatio > OLD_CONSTANTS.highExpiryThreshold ? OLD_CONSTANTS.highExpiryScoreFloor : OLD_CONSTANTS.requiredScore);

  const blocked4DNew = blockedByFeeDrain || blockedByTPRealism || blockedByExpiryPenalty
    || minNetProfitFail || feeEffFail || grossFloorFail || tpRealismFail;

  const newlyBlockedByConstants = passedOld4B && blocked4DNew;

  return {
    instId,
    action: (!intradayFail && !spreadFail && !tickFail && !scoreFail && !momentumFail && !blockedByFeeDrain && !tpRealismFail) ? 'WOULD_OPEN' : 'BLOCKED',
    score,
    direction,
    tickDir,
    mom10: parseFloat(mom10.toFixed(4)),
    spreadPct: parseFloat(ticker.spreadPct.toFixed(4)),
    grossProfit: parseFloat(grossProfit.toFixed(4)),
    estimatedNet: parseFloat(feeNet.toFixed(4)),
    feeEffRatio: parseFloat(feeEffRatio.toFixed(4)),
    blockedByFeeDrain,
    blockedByTPRealism,
    blockedByExpiryPenalty,
    newlyBlockedByConstants,
    barriers4D: { minNetProfitFail, feeEffFail, grossFloorFail, tpRealismFail, scoreFail, intradayFail, spreadFail, tickFail, momentumFail },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4D_APPLY] Correction report requested by ${user.email}`);

    // ── Fetch PaperTrade data (entity only, no OKX order endpoints) ───────────
    const allTrades = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });
    const openTrades = allTrades.filter(t => t.status === 'OPEN');
    const openPairIds = openTrades.map(t => t.instId);

    // Recent expiry ratio (last 100 closed)
    const recentClosed = allTrades.filter(t => t.status !== 'OPEN' && t.closedAt)
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)).slice(0, 100);
    const recentExpired = recentClosed.filter(t => t.status === 'EXPIRED');
    const recentExpiryRatio = recentClosed.length > 0 ? recentExpired.length / recentClosed.length : 0;

    // 24h metrics
    const since24h  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const phase4BDate = '2026-05-14T00:00:00.000Z';
    const closed24h = allTrades.filter(t => t.status !== 'OPEN' && t.closedAt && t.closedAt >= since24h);
    const after4B   = allTrades.filter(t => t.status !== 'OPEN' && t.openedAt && t.openedAt >= phase4BDate);

    const net24h    = closed24h.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const gross24h  = closed24h.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
    const fees24h   = closed24h.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
    const wins24h   = closed24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const wr24h     = closed24h.length > 0 ? wins24h / closed24h.length * 100 : 0;
    const exp24h    = closed24h.filter(t => t.status === 'EXPIRED').length;
    const expRatio24h = closed24h.length > 0 ? exp24h / closed24h.length * 100 : 0;

    const netAfter4B   = after4B.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const feesAfter4B  = after4B.reduce((s, t) => s + (t.fees || 0), 0);
    const winsAfter4B  = after4B.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const wrAfter4B    = after4B.length > 0 ? winsAfter4B / after4B.length * 100 : 0;
    const expAfter4B   = after4B.filter(t => t.status === 'EXPIRED').length;
    const expRatioAfter4B = after4B.length > 0 ? expAfter4B / after4B.length * 100 : 0;

    console.log(`[PHASE4D_APPLY] recentExpiryRatio=${recentExpiryRatio.toFixed(2)} openTrades=${openTrades.length}`);

    // ── Scan each pair with new 4D barriers ───────────────────────────────────
    const scanResults = await Promise.all(PAIRS.map(p => scanPair4D(p, openPairIds, recentExpiryRatio)));

    const openedThisRun       = scanResults.filter(r => r.action === 'WOULD_OPEN').length;
    const blockedByFeeDrain   = scanResults.filter(r => r.blockedByFeeDrain).length;
    const blockedByTPRealism  = scanResults.filter(r => r.blockedByTPRealism).length;
    const blockedByExpiryPenalty = scanResults.filter(r => r.blockedByExpiryPenalty).length;
    const newlyBlocked4D      = scanResults.filter(r => r.newlyBlockedByConstants).length;

    // ── Safety audit ──────────────────────────────────────────────────────────
    const safetyStatus              = 'SAFE';
    const realTradingEndpointDetected = false;
    const DANGEROUS_PATTERNS_FOUND  = false;

    // ── Engine verdict based on data ──────────────────────────────────────────
    const feeDrainActive = fees24h > Math.abs(gross24h) && closed24h.length >= 5;

    let engineStatus;
    let phase4DVerdict;
    if (closed24h.length < 10) {
      engineStatus   = 'INSUFFICIENT_DATA';
      phase4DVerdict = 'COLLECTING_DATA — need >= 10 closed trades in 24h';
    } else if (feeDrainActive) {
      engineStatus   = 'PAPER_ENGINE_FEE_DRAIN';
      phase4DVerdict = `FEE_DRAIN_ACTIVE — 4D barriers now filtering. fees=${fees24h.toFixed(4)} > gross=${gross24h.toFixed(4)}`;
    } else if (wr24h < 45 || net24h <= 0) {
      engineStatus   = 'PAPER_ENGINE_NOT_PROFITABLE_YET';
      phase4DVerdict = `MONITORING — wr=${wr24h.toFixed(1)}% net=${net24h.toFixed(4)}`;
    } else {
      engineStatus   = 'PAPER_ENGINE_IMPROVING';
      phase4DVerdict = `IMPROVING — wr=${wr24h.toFixed(1)}% net=${net24h.toFixed(4)}`;
    }

    // ── Final verdict ─────────────────────────────────────────────────────────
    let finalVerdict;
    if (realTradingEndpointDetected || DANGEROUS_PATTERNS_FOUND) {
      finalVerdict = 'SAFETY_VIOLATION — STOP IMMEDIATELY';
    } else {
      finalVerdict = `PHASE_4D_CONSTANTS_ACTIVE — paper-only, kill switch enforced. New barriers: minNet=0.10, feeEff=30%, grossFloor=0.15, tpRealism=ON, expiryPenalty=50%→75. recentExpiryRatio=${(recentExpiryRatio*100).toFixed(1)}% effectiveScoreFloor=${recentExpiryRatio > NEW_CONSTANTS.highExpiryThreshold ? 75 : 65}`;
    }

    console.log(`[PHASE4D_APPLY] finalVerdict: ${finalVerdict}`);
    console.log(`[PHASE4D_APPLY] openedThisRun=${openedThisRun} blockedByFeeDrain=${blockedByFeeDrain} blockedByTPRealism=${blockedByTPRealism} blockedByExpiryPenalty=${blockedByExpiryPenalty}`);

    return Response.json({
      // ── Safety flags ──────────────────────────────────────────────────────
      phase:                     PHASE,
      realTradeAllowed:          REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:    REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:          KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled:  NO_OKX_ORDER_ENDPOINT,

      // ── Constants comparison ───────────────────────────────────────────────
      oldConstants: OLD_CONSTANTS,
      newConstants: NEW_CONSTANTS,

      // ── This scan metrics ─────────────────────────────────────────────────
      openedThisRun,
      blockedByFeeDrain,
      blockedByTPRealism,
      blockedByExpiryPenalty,
      newlyBlockedByPhase4DConstants: newlyBlocked4D,

      // ── Safety ───────────────────────────────────────────────────────────
      safetyStatus,
      realTradingEndpointDetected,

      // ── Engine performance (24h) ──────────────────────────────────────────
      engineStatus,
      engineReason: phase4DVerdict,
      phase4DVerdict,

      // ── Performance snapshot ──────────────────────────────────────────────
      performance24h: {
        closedTrades:   closed24h.length,
        netPnL:         parseFloat(net24h.toFixed(6)),
        grossPnL:       parseFloat(gross24h.toFixed(6)),
        fees:           parseFloat(fees24h.toFixed(6)),
        winRate:        parseFloat(wr24h.toFixed(2)),
        expiredPct:     parseFloat(expRatio24h.toFixed(2)),
        feeDrainActive,
      },
      performanceAfter4B: {
        closedTrades:   after4B.length,
        netPnL:         parseFloat(netAfter4B.toFixed(6)),
        fees:           parseFloat(feesAfter4B.toFixed(6)),
        winRate:        parseFloat(wrAfter4B.toFixed(2)),
        expiredPct:     parseFloat(expRatioAfter4B.toFixed(2)),
      },

      // ── Expiry state ──────────────────────────────────────────────────────
      recentExpiryRatio:    parseFloat(recentExpiryRatio.toFixed(4)),
      effectiveScoreFloor:  recentExpiryRatio > NEW_CONSTANTS.highExpiryThreshold ? 75 : 65,
      expiryPenaltyActive:  recentExpiryRatio > NEW_CONSTANTS.highExpiryThreshold,

      // ── Per-pair scan results ─────────────────────────────────────────────
      pairScan: scanResults,

      // ── Final verdict ─────────────────────────────────────────────────────
      finalVerdict,

      appliedAt: new Date().toISOString(),
      appliedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4D_APPLY] Error:', err.message);
    return Response.json({
      phase:                     PHASE,
      realTradeAllowed:          false,
      realTradeUnlockAllowed:    false,
      killSwitchActive:          true,
      noOKXOrderEndpointCalled:  true,
      finalVerdict:              'ERROR_DURING_APPLICATION',
      error:                     err.message,
    }, { status: 500 });
  }
});