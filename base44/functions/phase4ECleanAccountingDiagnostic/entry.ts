/**
 * phase4ECleanAccountingDiagnostic — Phase 4E Clean Accounting Fee Break-Even
 *
 * Safety:
 *   realTradeAllowed          = false  ALWAYS
 *   realTradeUnlockAllowed    = false  ALWAYS
 *   killSwitchActive          = true   ALWAYS
 *   noOKXOrderEndpointCalled  = true   ALWAYS
 *   phase                     = PHASE_4E_CLEAN_ACCOUNTING_DIAGNOSTIC
 *
 * READ-ONLY: Uses clean deduped verified trades from VerifiedTrade entity.
 * Goal: Determine why high win rate still produces negative net P&L.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HARDCODED SAFETY ──────────────────────────────────────────────────────────
const REAL_TRADE_ALLOWED        = false;
const REAL_TRADE_UNLOCK_ALLOWED = false;
const KILL_SWITCH_ACTIVE        = true;
const NO_OKX_ORDER_ENDPOINT     = true;
const PHASE                     = 'PHASE_4E_CLEAN_ACCOUNTING_DIAGNOSTIC';

// ── Known clean accounting inputs (from getCleanAccountingMetrics) ────────────
const KNOWN_CLEAN = {
  uniqueOrders:        752,
  uniqueTrades:        524,
  netPnL:              -2.0806,
  winRate:             69.3,
  wins:                363,
  losses:              157,
  duplicatesExcluded:  67,
  suspectExcluded:     82,
  feesClean:           -4.7995,
};

const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ── OKX taker fee rate (0.1% per side = 0.2% round-trip) ─────────────────────
const OKX_TAKER_FEE_RATE = 0.001;

// ── Per-pair recommendation logic ─────────────────────────────────────────────
function pairRecommendation(winRate, grossPnL, netPnL, feeDragPct) {
  if (netPnL > 0) return { rec: 'KEEP', reason: 'Net profitable — keep trading this pair.' };
  if (grossPnL <= 0) return { rec: 'DISABLE', reason: 'Gross P&L negative — no directional edge. Disable.' };
  if (feeDragPct > 80) return { rec: 'NEEDS_LARGER_TP', reason: `Fee drag ${feeDragPct.toFixed(1)}% of gross — TP too tight relative to fee cost.` };
  if (winRate < 50) return { rec: 'DISABLE', reason: `Win rate ${winRate.toFixed(1)}% — below 50%, no edge.` };
  if (winRate >= 60 && grossPnL > 0) return { rec: 'NEEDS_LARGER_TP', reason: `Edge exists (wr=${winRate.toFixed(1)}%, gross>0) but fees consume ${feeDragPct.toFixed(1)}% of gross.` };
  return { rec: 'REDUCE', reason: `Marginal edge — win rate ${winRate.toFixed(1)}%, fee drag ${feeDragPct.toFixed(1)}%.` };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4E_CLEAN] Diagnostic requested by ${user.email}`);

    // ── Fetch VerifiedTrade (clean, deduped) ──────────────────────────────────
    const allVerified = await base44.entities.VerifiedTrade.list('-buyTime', 1000);
    // Filter out archived
    const cleanTrades = allVerified.filter(t => t.status !== 'archived');

    console.log(`[PHASE4E_CLEAN] VerifiedTrade records (non-archived): ${cleanTrades.length}`);

    // ── Use known clean accounting values as the authoritative baseline ────────
    // (getCleanAccountingMetrics already deduped + excluded suspect records)
    const uniqueTrades    = KNOWN_CLEAN.uniqueTrades;
    const wins            = KNOWN_CLEAN.wins;
    const losses          = KNOWN_CLEAN.losses;
    const winRate         = KNOWN_CLEAN.winRate;
    const feesClean       = Math.abs(KNOWN_CLEAN.feesClean); // positive for display
    const netPnL          = KNOWN_CLEAN.netPnL;

    // Gross = net + fees (fees were subtracted to produce net)
    const grossPnLBeforeFees       = parseFloat((netPnL + feesClean).toFixed(6));
    const averageFeePerTrade        = parseFloat((feesClean / uniqueTrades).toFixed(6));
    const averageGrossPnLPerTrade   = parseFloat((grossPnLBeforeFees / uniqueTrades).toFixed(6));
    const averageNetPnLPerTrade     = parseFloat((netPnL / uniqueTrades).toFixed(6));

    // Break-even: gross needed = fees (i.e. grossPnL must cover all fees)
    const breakEvenGrossRequired    = parseFloat(feesClean.toFixed(6));

    // Current fee drag as % of gross
    const currentFeeDragPercent     = grossPnLBeforeFees > 0
      ? parseFloat((feesClean / grossPnLBeforeFees * 100).toFixed(2))
      : null; // if gross is negative, fee drag is moot

    let feeDragReason;
    if (netPnL > 0) {
      feeDragReason = 'Net P&L positive — no fee drain issue.';
    } else if (grossPnLBeforeFees > 0 && netPnL < 0) {
      feeDragReason = `EDGE_EXISTS_BUT_FEE_DRAIN: Gross is +${grossPnLBeforeFees.toFixed(4)} USDT but fees (-${feesClean.toFixed(4)} USDT) consume ${currentFeeDragPercent?.toFixed(1)}% of gross, flipping net to ${netPnL.toFixed(4)} USDT. Average fee per trade (${averageFeePerTrade.toFixed(4)} USDT) exceeds average gross gain (${averageGrossPnLPerTrade.toFixed(4)} USDT).`;
    } else {
      feeDragReason = `NO_GROSS_PROFIT: Gross P&L (${grossPnLBeforeFees.toFixed(4)}) is negative — directional edge insufficient even before fees.`;
    }

    // ── Engine status ─────────────────────────────────────────────────────────
    let engineStatus;
    if (netPnL > 0) {
      engineStatus = 'PAPER_ENGINE_PROFITABLE';
    } else if (winRate >= 60 && grossPnLBeforeFees > 0 && netPnL < 0) {
      engineStatus = 'EDGE_EXISTS_BUT_FEE_DRAIN';
    } else if (winRate < 50) {
      engineStatus = 'NO_DIRECTIONAL_EDGE';
    } else {
      engineStatus = 'MARGINAL_EDGE_FEE_DRAIN';
    }

    // ── Per-pair breakdown from VerifiedTrade ─────────────────────────────────
    const perPair = PAIRS.map(pair => {
      const pt = cleanTrades.filter(t => t.instId === pair);

      if (pt.length === 0) {
        return {
          instId: pair,
          trades: 0,
          wins: 0, losses: 0, winRate: 0,
          grossPnLBeforeFees: 0, fees: 0, netPnL: 0,
          averageGrossWin: 0, averageGrossLoss: 0,
          averageFeePerTrade: 0, averageNetPerTrade: 0,
          feeDragPercent: null,
          recommendation: 'DISABLE',
          reason: 'No verified trades found for this pair.',
        };
      }

      const pWins   = pt.filter(t => (t.realizedPnL || 0) > 0);
      const pLosses = pt.filter(t => (t.realizedPnL || 0) <= 0);
      const pWinRate = pt.length > 0 ? pWins.length / pt.length * 100 : 0;

      // realizedPnL is already net (after fees per OXX schema)
      const pNetPnL  = pt.reduce((s, t) => s + (t.realizedPnL || 0), 0);
      const pFees    = pt.reduce((s, t) => s + Math.abs(t.buyFee || 0) + Math.abs(t.sellFee || 0), 0);
      const pGross   = pNetPnL + pFees;

      const avgGrossWin  = pWins.length > 0
        ? pWins.reduce((s, t) => s + (t.realizedPnL || 0) + Math.abs(t.buyFee || 0) + Math.abs(t.sellFee || 0), 0) / pWins.length
        : 0;
      const avgGrossLoss = pLosses.length > 0
        ? pLosses.reduce((s, t) => s + (t.realizedPnL || 0) + Math.abs(t.buyFee || 0) + Math.abs(t.sellFee || 0), 0) / pLosses.length
        : 0;

      const avgFeePerTrade = pt.length > 0 ? pFees / pt.length : 0;
      const avgNetPerTrade = pt.length > 0 ? pNetPnL / pt.length : 0;
      const feeDragPct     = pGross > 0 ? pFees / pGross * 100 : null;

      const { rec, reason } = pairRecommendation(pWinRate, pGross, pNetPnL, feeDragPct ?? 0);

      return {
        instId: pair,
        trades:                pt.length,
        wins:                  pWins.length,
        losses:                pLosses.length,
        winRate:               parseFloat(pWinRate.toFixed(2)),
        grossPnLBeforeFees:    parseFloat(pGross.toFixed(6)),
        fees:                  parseFloat(pFees.toFixed(6)),
        netPnL:                parseFloat(pNetPnL.toFixed(6)),
        averageGrossWin:       parseFloat(avgGrossWin.toFixed(6)),
        averageGrossLoss:      parseFloat(avgGrossLoss.toFixed(6)),
        averageFeePerTrade:    parseFloat(avgFeePerTrade.toFixed(6)),
        averageNetPerTrade:    parseFloat(avgNetPerTrade.toFixed(6)),
        feeDragPercent:        feeDragPct !== null ? parseFloat(feeDragPct.toFixed(2)) : null,
        recommendation:        rec,
        reason,
      };
    });

    // ── Optimization suggestions ──────────────────────────────────────────────
    // How much average gross per trade is needed to cover avg fee?
    const requiredAverageGrossPerTradeToBreakEven = parseFloat(averageFeePerTrade.toFixed(6));

    // Current TP implied from gross/size — estimate 0.30% TP at 10 USDT = 0.03 gross
    // To get avg gross = avg fee, we need TP * size = avg fee
    // If size=10: requiredTP = avgFee / size * 100
    const currentTPPercent      = 0.30;
    const currentPositionSize   = 10;
    const currentImpliedAvgGross = currentPositionSize * currentTPPercent / 100;

    // Required TP to cover fees: avgFee / positionSize * 100
    const rawRequiredTP = averageFeePerTrade / currentPositionSize * 100;
    // Add minNetProfit margin on top
    const recommendedTPPercent = parseFloat(
      ((averageFeePerTrade + 0.10) / currentPositionSize * 100).toFixed(4)
    );

    const requiredTPIncreasePercent = parseFloat(
      ((recommendedTPPercent - currentTPPercent) / currentTPPercent * 100).toFixed(2)
    );

    // Minimum position size to make current TP work with grossFloor=0.15
    const minimumPositionSizeForCurrentTP = parseFloat(
      (0.15 / (currentTPPercent / 100)).toFixed(2)
    );

    const pairsToDisable = perPair.filter(p => p.recommendation === 'DISABLE').map(p => p.instId);
    const pairsToKeep    = perPair.filter(p => p.recommendation === 'KEEP').map(p => p.instId);

    // Recommended fee efficiency ratio — back-calculate from TP and fee structure
    // At TP=currentTP, fee round-trip = 0.2%, so ratio = 0.2/TP
    const recommendedFeeEfficiencyRatio = parseFloat(
      (OKX_TAKER_FEE_RATE * 2 / (recommendedTPPercent / 100)).toFixed(4)
    );

    const optimizationSuggestions = {
      requiredAverageGrossPerTradeToBreakEven,
      requiredTPIncreasePercent,
      minimumPositionSizeForCurrentTP,
      recommendedTPPercent,
      recommendedMinNetProfitUSDT:   0.10,
      recommendedFeeEfficiencyRatio,
      pairsToDisable,
      pairsToKeep,
    };

    console.log(`[PHASE4E_CLEAN] engineStatus=${engineStatus} grossPnL=${grossPnLBeforeFees.toFixed(4)} fees=${feesClean.toFixed(4)} netPnL=${netPnL}`);

    return Response.json({
      // ── Safety ──────────────────────────────────────────────────────────────
      phase:                    PHASE,
      realTradeAllowed:         REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:   REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:         KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,

      // ── Data provenance ──────────────────────────────────────────────────────
      dataSource:               'VerifiedTrade entity (clean deduped) + known clean accounting baseline',
      verifiedTradeRecordsRead: cleanTrades.length,
      knownCleanAccounting:     KNOWN_CLEAN,

      // ── Engine status ─────────────────────────────────────────────────────────
      engineStatus,

      // ── Global metrics ───────────────────────────────────────────────────────
      global: {
        uniqueTrades,
        wins,
        losses,
        winRate,
        grossPnLBeforeFees,
        fees:                   parseFloat(feesClean.toFixed(6)),
        netPnL,
        averageGrossPnLPerTrade,
        averageFeePerTrade,
        averageNetPnLPerTrade,
        breakEvenGrossRequired,
        currentFeeDragPercent,
        feeDragReason,
      },

      // ── Per-pair breakdown ───────────────────────────────────────────────────
      perPair,

      // ── Optimization suggestions ─────────────────────────────────────────────
      optimizationSuggestions,

      runAt:       new Date().toISOString(),
      requestedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4E_CLEAN] Error:', err.message);
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