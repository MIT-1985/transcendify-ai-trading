/**
 * phase4PaperReport24h — 24h Paper Trading Performance Report
 *
 * Phase:   PHASE_4_24H_PAPER_REPORT
 * Safety:  READ-ONLY — PaperTrade entity only
 *          tradeAllowed = false ALWAYS
 *          noOKXOrderEndpointCalled = true ALWAYS
 *          killSwitchActive = true ALWAYS
 *
 * No market data fetched. No orders placed. No real funds touched.
 * Pure aggregation of PaperTrade entity records from the last 24 hours.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALL_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ── Pair recommendation rules ─────────────────────────────────────────────────
function pairRecommendation(netPnL, winRate, tradesCount) {
  if (tradesCount < 5) return { recommendation: 'WATCH', reason: 'INSUFFICIENT_DATA — fewer than 5 trades' };
  if (netPnL < 0 && winRate < 45) return { recommendation: 'DISABLE', reason: `NEGATIVE_PNL and winRate=${winRate.toFixed(1)}% < 45%` };
  if (netPnL > 0 && winRate >= 55) return { recommendation: 'KEEP', reason: `PROFITABLE winRate=${winRate.toFixed(1)}% >= 55% netPnL=${netPnL.toFixed(6)}` };
  return { recommendation: 'WATCH', reason: `netPnL=${netPnL.toFixed(6)} winRate=${winRate.toFixed(1)}% — monitoring` };
}

// ── Engine status rules ───────────────────────────────────────────────────────
function calcEngineStatus(totalTrades, netPnL, winRate) {
  // Report verdict: real trade unlock is NEVER allowed from paper results
  const realTradeUnlockAllowed = false; // hardcoded — kill switch governs this, not report

  if (totalTrades < 10) return {
    engineStatus: 'INSUFFICIENT_DATA',
    engineReason: `Only ${totalTrades} trades — need >= 10`,
    realTradeUnlockAllowed,
  };
  if (winRate < 45 || netPnL <= 0) return {
    engineStatus: 'PAPER_ENGINE_NOT_PROFITABLE_YET',
    engineReason: `winRate=${winRate.toFixed(1)}% < 45% or netPnL=${netPnL.toFixed(6)} <= 0 — overtrading/fee drain detected`,
    realTradeUnlockAllowed,
  };
  if (totalTrades >= 20 && netPnL > 0 && winRate >= 55) return {
    engineStatus: 'PAPER_ENGINE_PROMISING',
    engineReason: `${totalTrades} trades, netPnL=${netPnL.toFixed(6)}, wr=${winRate.toFixed(1)}%`,
    realTradeUnlockAllowed,
  };
  return {
    engineStatus: 'PAPER_ENGINE_NOT_PROFITABLE_YET',
    engineReason: `winRate=${winRate.toFixed(1)}% < 55% or totalTrades=${totalTrades} < 20`,
    realTradeUnlockAllowed,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4_REPORT] 24h report requested by ${user.email}`);

    const now      = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now).toISOString();

    // ── Fetch all paper trades (no order endpoints, no market data) ──────────
    const allTrades = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });

    const openTrades   = allTrades.filter(t => t.status === 'OPEN');
    const closed24h    = allTrades.filter(t => t.status !== 'OPEN' && t.closedAt && t.closedAt >= since24h);
    const tpTrades     = closed24h.filter(t => t.status === 'CLOSED_TP');
    const slTrades     = closed24h.filter(t => t.status === 'CLOSED_SL');
    const expiredTrades = closed24h.filter(t => t.status === 'EXPIRED');
    const wins         = closed24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);
    const losses       = closed24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) <= 0);

    const totalPaperTrades = closed24h.length;
    const winRate = totalPaperTrades > 0 ? (wins.length / totalPaperTrades * 100) : 0;

    // ── Aggregate global metrics ─────────────────────────────────────────────
    const grossPnL        = closed24h.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
    const totalFees       = closed24h.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
    const totalSpreadCost = closed24h.reduce((s, t) => s + (t.spreadCost || t.spreadCostUSDT || 0), 0);
    const netPnL          = closed24h.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const averageNetPnLPerTrade = totalPaperTrades > 0 ? netPnL / totalPaperTrades : 0;

    const scoresValid = closed24h.filter(t => (t.signalScore || t.entryScore) != null);
    const averageSignalScore = scoresValid.length > 0
      ? scoresValid.reduce((s, t) => s + (t.signalScore || t.entryScore || 0), 0) / scoresValid.length : 0;

    const durationsValid = closed24h.filter(t => t.holdingMs != null && t.holdingMs > 0);
    const averageDurationMinutes = durationsValid.length > 0
      ? durationsValid.reduce((s, t) => s + t.holdingMs, 0) / durationsValid.length / 60000 : 0;

    // ── Best / worst trade ───────────────────────────────────────────────────
    let bestTrade  = null;
    let worstTrade = null;
    if (closed24h.length > 0) {
      const sorted = [...closed24h].sort((a, b) =>
        (b.netPnL || b.netPnLUSDT || 0) - (a.netPnL || a.netPnLUSDT || 0)
      );
      const bt = sorted[0];
      const wt = sorted[sorted.length - 1];
      bestTrade = {
        id: bt.id, instId: bt.instId, status: bt.status,
        entryPrice: bt.entryPrice, exitPrice: bt.exitPrice,
        netPnL: parseFloat((bt.netPnL || bt.netPnLUSDT || 0).toFixed(6)),
        signalScore: bt.signalScore || bt.entryScore,
        holdingMs: bt.holdingMs,
        closedAt: bt.closedAt,
      };
      worstTrade = {
        id: wt.id, instId: wt.instId, status: wt.status,
        entryPrice: wt.entryPrice, exitPrice: wt.exitPrice,
        netPnL: parseFloat((wt.netPnL || wt.netPnLUSDT || 0).toFixed(6)),
        signalScore: wt.signalScore || wt.entryScore,
        holdingMs: wt.holdingMs,
        closedAt: wt.closedAt,
      };
    }

    // ── Per-pair metrics ─────────────────────────────────────────────────────
    const perPair = ALL_PAIRS.map(instId => {
      const pt         = closed24h.filter(t => t.instId === instId);
      const ptOpen     = openTrades.filter(t => t.instId === instId);
      const ptWins     = pt.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);
      const ptLosses   = pt.filter(t => (t.netPnL || t.netPnLUSDT || 0) <= 0);
      const ptNetPnL   = pt.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
      const ptGross    = pt.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
      const ptFees     = pt.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
      const ptSpread   = pt.reduce((s, t) => s + (t.spreadCost || t.spreadCostUSDT || 0), 0);
      const ptWinRate  = pt.length > 0 ? (ptWins.length / pt.length * 100) : 0;
      const ptScores   = pt.filter(t => (t.signalScore || t.entryScore) != null);
      const ptAvgScore = ptScores.length > 0 ? ptScores.reduce((s, t) => s + (t.signalScore || t.entryScore || 0), 0) / ptScores.length : 0;
      const ptDurs     = pt.filter(t => t.holdingMs != null && t.holdingMs > 0);
      const ptAvgDur   = ptDurs.length > 0 ? ptDurs.reduce((s, t) => s + t.holdingMs, 0) / ptDurs.length / 60000 : 0;
      const { recommendation, reason } = pairRecommendation(ptNetPnL, ptWinRate, pt.length);

      return {
        instId,
        tradesCount:            pt.length,
        openTrades:             ptOpen.length,
        closedTrades:           pt.length,
        wins:                   ptWins.length,
        losses:                 ptLosses.length,
        expired:                pt.filter(t => t.status === 'EXPIRED').length,
        winRate:                parseFloat(ptWinRate.toFixed(2)),
        grossPnL:               parseFloat(ptGross.toFixed(6)),
        fees:                   parseFloat(ptFees.toFixed(6)),
        spreadCost:             parseFloat(ptSpread.toFixed(6)),
        netPnL:                 parseFloat(ptNetPnL.toFixed(6)),
        averageScore:           parseFloat(ptAvgScore.toFixed(2)),
        averageDurationMinutes: parseFloat(ptAvgDur.toFixed(2)),
        recommendation,
        reason,
      };
    });

    // ── Best / worst pair ────────────────────────────────────────────────────
    const pairsWithTrades = perPair.filter(p => p.tradesCount > 0);
    const bestPair  = pairsWithTrades.length > 0
      ? pairsWithTrades.reduce((a, b) => b.netPnL > a.netPnL ? b : a).instId : null;
    const worstPair = pairsWithTrades.length > 0
      ? pairsWithTrades.reduce((a, b) => b.netPnL < a.netPnL ? b : a).instId : null;

    // ── Engine status ────────────────────────────────────────────────────────
    const { engineStatus, engineReason, realTradeUnlockAllowed } = calcEngineStatus(totalPaperTrades, netPnL, winRate);

    console.log(`[PHASE4_REPORT] totalTrades=${totalPaperTrades} netPnL=${netPnL.toFixed(6)} winRate=${winRate.toFixed(1)}% engineStatus=${engineStatus}`);

    return Response.json({
      // ── Safety flags ──────────────────────────────────────────────────────
      phase:                    'PHASE_4_24H_PAPER_REPORT',
      realTradeAllowed:         false,
      safeToTradeNow:           false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      dataSource:               'PaperTrade entity only — no market API calls',
      reportTime:               windowEnd,

      // ── Engine verdict ────────────────────────────────────────────────────
      engineStatus,
      engineReason,
      realTradeUnlockAllowed,

      // ── Global 24h metrics ────────────────────────────────────────────────
      global: {
        windowStart:              since24h,
        windowEnd,
        totalPaperTrades,
        openTrades:               openTrades.length,
        closedTrades:             closed24h.length,
        tpTrades:                 tpTrades.length,
        slTrades:                 slTrades.length,
        expiredTrades:            expiredTrades.length,
        wins:                     wins.length,
        losses:                   losses.length,
        winRate:                  parseFloat(winRate.toFixed(2)),
        grossPnL:                 parseFloat(grossPnL.toFixed(6)),
        totalFees:                parseFloat(totalFees.toFixed(6)),
        totalSpreadCost:          parseFloat(totalSpreadCost.toFixed(6)),
        netPnL:                   parseFloat(netPnL.toFixed(6)),
        averageNetPnLPerTrade:    parseFloat(averageNetPnLPerTrade.toFixed(6)),
        averageSignalScore:       parseFloat(averageSignalScore.toFixed(2)),
        averageDurationMinutes:   parseFloat(averageDurationMinutes.toFixed(2)),
        bestPair,
        worstPair,
        bestTrade,
        worstTrade,
      },

      // ── Per-pair breakdown ────────────────────────────────────────────────
      perPair,

      note: 'READ-ONLY REPORT. No trades executed. No real funds. Kill switch active.',
    });

  } catch (err) {
    console.error('[PHASE4_REPORT] Error:', err.message);
    return Response.json({
      phase:                    'PHASE_4_24H_PAPER_REPORT',
      realTradeAllowed:         false,
      safeToTradeNow:           false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      error:                    err.message,
    }, { status: 500 });
  }
});