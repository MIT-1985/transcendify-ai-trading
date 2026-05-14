/**
 * phase4EPositionSizeDiagnostic — Phase 4E Position Size Calibration
 *
 * Safety:
 *   realTradeAllowed          = false  ALWAYS
 *   realTradeUnlockAllowed    = false  ALWAYS
 *   killSwitchActive          = true   ALWAYS
 *   noOKXOrderEndpointCalled  = true   ALWAYS
 *   phase                     = PHASE_4E_POSITION_SIZE_DIAGNOSTIC_ONLY
 *
 * READ-ONLY: Reads PaperTrade entity + OKX public market data only.
 * Goal: Determine if FEE_DRAIN is caused by too small position size
 *       or by weak market movement.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HARDCODED SAFETY ──────────────────────────────────────────────────────────
const REAL_TRADE_ALLOWED        = false;
const REAL_TRADE_UNLOCK_ALLOWED = false;
const KILL_SWITCH_ACTIVE        = true;
const NO_OKX_ORDER_ENDPOINT     = true;
const PHASE                     = 'PHASE_4E_POSITION_SIZE_DIAGNOSTIC_ONLY';

// ── Phase 4D constants (unchanged) ───────────────────────────────────────────
const K_TP                     = 0.30;    // take-profit %
const K_SL                     = 0.20;    // stop-loss % (abs)
const OKX_TAKER_FEE            = 0.001;   // 0.1% per side
const CURRENT_PAPER_SIZE_USDT  = 10;      // current default
const MIN_ESTIMATED_NET_PROFIT = 0.10;    // Phase 4D
const FEE_EFFICIENCY_MAX_RATIO = 0.30;    // Phase 4D — 30%
const GROSS_PROFIT_FLOOR       = 0.15;    // Phase 4D NEW
const HIGH_EXPIRY_THRESHOLD    = 0.50;    // Phase 4D — 50%
const HIGH_EXPIRY_SCORE_FLOOR  = 75;      // Phase 4D — raised from 70
const BASE_SCORE_FLOOR         = 65;

const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ── OKX public market data ────────────────────────────────────────────────────
async function fetchTicker(instId) {
  try {
    const r = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) return null;
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return {
      last:      parseFloat(d.last),
      bid,
      ask,
      spreadPct: mid > 0 ? (ask - bid) / mid * 100 : 0,
    };
  } catch { return null; }
}

async function fetchCandles(instId) {
  try {
    const r = await fetch(
      `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=60`,
      { signal: AbortSignal.timeout(5000) }
    );
    const j = await r.json();
    return (j?.data || []).map(c => ({
      close: parseFloat(c[4]),
      high:  parseFloat(c[2]),
      low:   parseFloat(c[3]),
      vol:   parseFloat(c[5]),
    })).reverse();
  } catch { return []; }
}

// ── Per-pair calibration ──────────────────────────────────────────────────────
async function calibratePair(instId) {
  const [ticker, candles] = await Promise.all([fetchTicker(instId), fetchCandles(instId)]);

  if (!ticker) {
    return {
      instId,
      error: 'TICKER_UNAVAILABLE',
      lastPrice: null,
      currentPaperSizeUSDT: CURRENT_PAPER_SIZE_USDT,
    };
  }

  const lastPrice  = ticker.last;
  const spreadPct  = ticker.spreadPct;

  // ── Market movement assessment ────────────────────────────────────────────
  // 20-candle ATR as proxy for expected movement
  let avgRangePct = 0;
  let avgMom10Pct = 0;
  let marketMovementEnough = false;

  if (candles.length >= 20) {
    const slice20 = candles.slice(-20);
    const ranges  = slice20.map(c => c.high > 0 ? (c.high - c.low) / c.high * 100 : 0);
    avgRangePct   = ranges.reduce((a, b) => a + b, 0) / ranges.length;
    const closes  = candles.map(c => c.close);
    if (closes.length >= 10) {
      avgMom10Pct = Math.abs(
        (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100
      );
    }
    // Market movement is sufficient if avg candle range covers TP with some headroom
    marketMovementEnough = avgRangePct >= (K_TP * 0.5); // at least half of TP as avg range
  }

  // ── Current size calculations ──────────────────────────────────────────────
  const sz = CURRENT_PAPER_SIZE_USDT;

  const expectedGrossProfitUSDT    = parseFloat((sz * K_TP / 100).toFixed(6));
  const estimatedFeesUSDT          = parseFloat((sz * OKX_TAKER_FEE * 2).toFixed(6));
  const estimatedSpreadCostUSDT    = parseFloat((sz * spreadPct / 100).toFixed(6));
  const estimatedNetProfitUSDT     = parseFloat(
    (expectedGrossProfitUSDT - estimatedFeesUSDT - estimatedSpreadCostUSDT).toFixed(6)
  );
  const feeToGrossRatio            = expectedGrossProfitUSDT > 0
    ? parseFloat(((estimatedFeesUSDT + estimatedSpreadCostUSDT) / expectedGrossProfitUSDT).toFixed(4))
    : 1;

  const passesGrossFloor           = expectedGrossProfitUSDT >= GROSS_PROFIT_FLOOR;
  const passesNetProfit            = estimatedNetProfitUSDT >= MIN_ESTIMATED_NET_PROFIT;
  const passesFeeEfficiency        = feeToGrossRatio <= FEE_EFFICIENCY_MAX_RATIO;
  const passesCurrentFeeFilter     = passesGrossFloor && passesNetProfit && passesFeeEfficiency;

  // ── Minimum size calculations ─────────────────────────────────────────────
  // 1. Gross floor: size * TP% >= GROSS_PROFIT_FLOOR
  const minimumSizeForGrossFloorUSDT = parseFloat(
    (GROSS_PROFIT_FLOOR / (K_TP / 100)).toFixed(2)
  );

  // 2. Net profit: size * TP% - size*(2*fee + spread%) >= MIN_NET
  //    size * (TP% - 2*fee - spread%) >= MIN_NET
  const netMarginRate = (K_TP / 100) - (OKX_TAKER_FEE * 2) - (spreadPct / 100);
  const minimumSizeForNetProfitUSDT = netMarginRate > 0
    ? parseFloat(((MIN_ESTIMATED_NET_PROFIT) / netMarginRate).toFixed(2))
    : 9999; // can't reach net profit with current TP/spread

  // 3. Fee efficiency: (2*fee + spread%) / TP% <= FEE_EFFICIENCY_MAX_RATIO
  //    This is independent of size — it's a ratio, so either always passes or never passes.
  const feeEfficiencyAchievable = ((OKX_TAKER_FEE * 2 + spreadPct / 100) / (K_TP / 100)) <= FEE_EFFICIENCY_MAX_RATIO;

  // ── Recommended size ──────────────────────────────────────────────────────
  const rawRecommended = Math.max(minimumSizeForGrossFloorUSDT, minimumSizeForNetProfitUSDT);
  // Round up to nearest 5
  const recommendedPaperSizeUSDT = feeEfficiencyAchievable
    ? parseFloat((Math.ceil(rawRecommended / 5) * 5).toFixed(2))
    : 9999; // fee efficiency is a ratio — increasing size won't help

  // ── Reason ────────────────────────────────────────────────────────────────
  let reason;
  if (!feeEfficiencyAchievable) {
    reason = `FEE_DRAIN_INTRINSIC: fee+spread ratio (${((OKX_TAKER_FEE * 2 + spreadPct / 100) / (K_TP / 100) * 100).toFixed(1)}%) > FEE_EFFICIENCY_MAX (${FEE_EFFICIENCY_MAX_RATIO * 100}%) — increasing size cannot fix ratio. Must widen TP or tighten spread filter.`;
  } else if (!marketMovementEnough) {
    reason = `WEAK_MARKET_MOVEMENT: avgCandleRange=${avgRangePct.toFixed(3)}% < TP*0.5=${(K_TP * 0.5).toFixed(3)}%. Trades unlikely to reach TP before expiry.`;
  } else if (!passesGrossFloor) {
    reason = `SIZE_TOO_SMALL: grossProfit=${expectedGrossProfitUSDT} < grossFloor=${GROSS_PROFIT_FLOOR}. Increase to ${recommendedPaperSizeUSDT} USDT.`;
  } else if (!passesNetProfit) {
    reason = `SIZE_TOO_SMALL: netProfit=${estimatedNetProfitUSDT} < minNetProfit=${MIN_ESTIMATED_NET_PROFIT}. Increase to ${recommendedPaperSizeUSDT} USDT.`;
  } else if (!passesFeeEfficiency) {
    reason = `FEE_RATIO_FAIL: feeToGross=${(feeToGrossRatio * 100).toFixed(1)}% > max=${FEE_EFFICIENCY_MAX_RATIO * 100}%. Spread likely too high for this TP.`;
  } else {
    reason = `ALL_FILTERS_PASS: size=${sz} USDT is adequate for ${instId}. grossProfit=${expectedGrossProfitUSDT}, netProfit=${estimatedNetProfitUSDT}.`;
  }

  return {
    instId,
    lastPrice,
    spreadPct:                    parseFloat(spreadPct.toFixed(6)),
    currentPaperSizeUSDT:         sz,
    tpPercent:                    K_TP,
    expectedGrossProfitUSDT,
    estimatedFeesUSDT,
    estimatedSpreadCostUSDT,
    estimatedNetProfitUSDT,
    feeToGrossRatio,
    passesGrossFloor,
    passesNetProfit,
    passesFeeEfficiency,
    passesCurrentFeeFilter,
    feeEfficiencyAchievable,
    minimumSizeForGrossFloorUSDT,
    minimumSizeForNetProfitUSDT,
    recommendedPaperSizeUSDT,
    marketMovementEnough,
    avgCandleRangePct:            parseFloat(avgRangePct.toFixed(4)),
    avgMom10Pct:                  parseFloat(avgMom10Pct.toFixed(4)),
    reason,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4E] Position size diagnostic requested by ${user.email}`);

    // ── Fetch recent expiry ratio from PaperTrade entity ─────────────────────
    const allTrades     = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });
    const recentClosed  = allTrades
      .filter(t => t.status !== 'OPEN' && t.closedAt)
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
      .slice(0, 100);
    const recentExpired     = recentClosed.filter(t => t.status === 'EXPIRED');
    const recentExpiryRatio = recentClosed.length > 0 ? recentExpired.length / recentClosed.length : 0;
    const effectiveScoreFloor = recentExpiryRatio > HIGH_EXPIRY_THRESHOLD
      ? HIGH_EXPIRY_SCORE_FLOOR : BASE_SCORE_FLOOR;

    console.log(`[PHASE4E] recentExpiryRatio=${recentExpiryRatio.toFixed(2)} effectiveScoreFloor=${effectiveScoreFloor}`);

    // ── 24h fee drain check from entity ──────────────────────────────────────
    const since24h  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const closed24h = allTrades.filter(t => t.status !== 'OPEN' && t.closedAt && t.closedAt >= since24h);
    const net24h    = closed24h.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const gross24h  = closed24h.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
    const fees24h   = closed24h.reduce((s, t) => s + (t.fees || 0), 0);
    const feeDrainConfirmed = closed24h.length >= 5 && fees24h > Math.abs(gross24h);

    // ── Per-pair calibration (parallel) ──────────────────────────────────────
    const pairResults = await Promise.all(PAIRS.map(p => calibratePair(p)));

    // ── Global analysis ───────────────────────────────────────────────────────
    const validPairs = pairResults.filter(p => !p.error);

    const maxRecommendedSize = validPairs.length > 0
      ? Math.max(...validPairs.map(p => p.recommendedPaperSizeUSDT).filter(v => v < 9999))
      : CURRENT_PAPER_SIZE_USDT;

    const recommendedDefaultPaperSizeUSDT = isFinite(maxRecommendedSize)
      ? parseFloat((Math.ceil(maxRecommendedSize / 5) * 5).toFixed(2))
      : CURRENT_PAPER_SIZE_USDT;

    // Fee drain due to size: all pairs have current size < recommended
    const feeDrainDueToSmallPosition = validPairs.some(p =>
      p.recommendedPaperSizeUSDT > CURRENT_PAPER_SIZE_USDT && p.recommendedPaperSizeUSDT < 9999
    );

    // Fee drain due to weak movement: most pairs fail movement check
    const weakMovementPairs = validPairs.filter(p => !p.marketMovementEnough).length;
    const feeDrainDueToWeakMovement = weakMovementPairs >= Math.ceil(validPairs.length / 2);

    // Fee drain due to intrinsic ratio (can't be fixed with size)
    const intrinsicPairs = validPairs.filter(p => !p.feeEfficiencyAchievable).length;

    let recommendation;
    if (intrinsicPairs >= Math.ceil(validPairs.length / 2)) {
      recommendation = 'ADJUST_TP_OR_SKIP_WEAK_MARKET';
    } else if (feeDrainDueToSmallPosition && !feeDrainDueToWeakMovement) {
      recommendation = 'INCREASE_PAPER_SIZE';
    } else if (feeDrainDueToWeakMovement && !feeDrainDueToSmallPosition) {
      recommendation = 'ADJUST_TP_OR_SKIP_WEAK_MARKET';
    } else if (feeDrainDueToSmallPosition && feeDrainDueToWeakMovement) {
      recommendation = 'INCREASE_PAPER_SIZE';
    } else {
      recommendation = 'KEEP_SIZE';
    }

    const summaryReason = recommendation === 'INCREASE_PAPER_SIZE'
      ? `Current ${CURRENT_PAPER_SIZE_USDT} USDT is too small. Recommended: ${recommendedDefaultPaperSizeUSDT} USDT to meet grossFloor=${GROSS_PROFIT_FLOOR} and minNetProfit=${MIN_ESTIMATED_NET_PROFIT}.`
      : recommendation === 'ADJUST_TP_OR_SKIP_WEAK_MARKET'
      ? `Fee-to-gross ratio is structurally too high for current TP=${K_TP}%. Increasing size won't fix the ratio. Consider raising TP% or skip low-momentum pairs.`
      : `Current size ${CURRENT_PAPER_SIZE_USDT} USDT is sufficient. Fee filters should pass with current constants.`;

    console.log(`[PHASE4E] recommendation=${recommendation} feeDrainSmallPos=${feeDrainDueToSmallPosition} feeDrainWeakMove=${feeDrainDueToWeakMovement} recommended=${recommendedDefaultPaperSizeUSDT}`);

    return Response.json({
      // ── Safety ──────────────────────────────────────────────────────────────
      phase:                      PHASE,
      realTradeAllowed:           REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:     REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:           KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled:   NO_OKX_ORDER_ENDPOINT,

      // ── Context ──────────────────────────────────────────────────────────────
      recentExpiryRatio:          parseFloat(recentExpiryRatio.toFixed(4)),
      effectiveScoreFloor,
      expiryPenaltyActive:        recentExpiryRatio > HIGH_EXPIRY_THRESHOLD,
      feeDrainConfirmed,
      performance24h: {
        closedTrades:  closed24h.length,
        netPnL:        parseFloat(net24h.toFixed(6)),
        grossPnL:      parseFloat(gross24h.toFixed(6)),
        fees:          parseFloat(fees24h.toFixed(6)),
      },

      // ── Per-pair results ─────────────────────────────────────────────────────
      pairDiagnostics: pairResults,

      // ── Global summary ───────────────────────────────────────────────────────
      global: {
        currentDefaultPaperSizeUSDT:   CURRENT_PAPER_SIZE_USDT,
        recommendedDefaultPaperSizeUSDT,
        feeDrainDueToSmallPosition,
        feeDrainDueToWeakMovement,
        intrinsicFeePairCount:         intrinsicPairs,
        recommendation,
        summaryReason,
        phase4DConstants: {
          K_TP,
          K_SL,
          OKX_TAKER_FEE,
          MIN_ESTIMATED_NET_PROFIT,
          FEE_EFFICIENCY_MAX_RATIO,
          GROSS_PROFIT_FLOOR,
          HIGH_EXPIRY_THRESHOLD,
          HIGH_EXPIRY_SCORE_FLOOR,
        },
      },

      runAt: new Date().toISOString(),
      requestedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4E] Error:', err.message);
    return Response.json({
      phase:                    PHASE,
      realTradeAllowed:         false,
      realTradeUnlockAllowed:   false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      error:                    err.message,
    }, { status: 500 });
  }
});