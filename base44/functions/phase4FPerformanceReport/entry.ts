/**
 * phase4FPerformanceReport — Phase 4F BTC-Only Performance Report
 *
 * Analyzes ONLY trades created under PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE.
 * Ignores ETH/SOL/DOGE/XRP entirely.
 * Read-only. No real trades. Kill switch enforced.
 *
 * Safety (hardcoded):
 *   realTradeAllowed          = false
 *   realTradeUnlockAllowed    = false
 *   killSwitchActive          = true
 *   noOKXOrderEndpointCalled  = true
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REAL_TRADE_ALLOWED        = false;
const REAL_TRADE_UNLOCK_ALLOWED = false;
const KILL_SWITCH_ACTIVE        = true;
const NO_OKX_ORDER_ENDPOINT     = true;
const PHASE                     = 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE';

const CONFIG = {
  activePair:      'BTC-USDT',
  tpPercent:       1.30,
  slPercent:       0.65,
  riskReward:      2.0,
  expiryMinutes:   60,
  requiredScore:   75,
  minTickScore:    15,
  maxOpenTrades:   1,
};

function decideStatus(total, netPnL, winRate, feeDrag) {
  if (total < 10)  return { status: 'COLLECTING_BTC_ONLY_DATA',   color: 'blue',   emoji: '🔵', note: 'Need at least 10 BTC trades to evaluate.' };
  if (total >= 50 && netPnL > 0 && winRate >= 55 && feeDrag < 50)
    return { status: 'BTC_ONLY_STRONG_PAPER_EDGE',  color: 'green',  emoji: '🟢', note: 'Strong edge confirmed — net positive, high win rate, low fee drag.' };
  if (total >= 20 && netPnL > 0 && winRate >= 50 && feeDrag < 60)
    return { status: 'BTC_ONLY_PROMISING',           color: 'yellow', emoji: '🟡', note: 'Early positive signal — continue collecting data.' };
  return   { status: 'BTC_ONLY_NOT_PROFITABLE_YET', color: 'red',    emoji: '🔴', note: 'Not profitable yet with current constants.' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4F_REPORT] requested by ${user.email}`);

    // ── Load all Phase 4F BTC-USDT paper trades ─────────────────────────
    const allTrades = await base44.entities.PaperTrade.filter({
      phase:   PHASE,
      instId:  'BTC-USDT',
    });

    console.log(`[PHASE4F_REPORT] found ${allTrades.length} BTC trades under ${PHASE}`);

    const openTrades   = allTrades.filter(t => t.status === 'OPEN');
    const closedTrades = allTrades.filter(t => t.status !== 'OPEN');

    const tpHits  = closedTrades.filter(t => t.status === 'CLOSED_TP').length;
    const slHits  = closedTrades.filter(t => t.status === 'CLOSED_SL').length;
    const expired = closedTrades.filter(t => t.status === 'EXPIRED').length;
    const manual  = closedTrades.filter(t => t.status === 'CLOSED_MANUAL').length;

    const wins = closedTrades.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const winRate = closedTrades.length > 0
      ? parseFloat((wins / closedTrades.length * 100).toFixed(2))
      : 0;

    // ── Aggregate financials ─────────────────────────────────────────────
    const grossPnL   = closedTrades.reduce((s, t) => s + (t.grossPnL   || t.grossPnLUSDT   || 0), 0);
    const netPnL     = closedTrades.reduce((s, t) => s + (t.netPnL     || t.netPnLUSDT     || 0), 0);
    const fees       = closedTrades.reduce((s, t) => s + (t.fees       || 0), 0);
    const spreadCost = closedTrades.reduce((s, t) => s + (t.spreadCost || t.spreadCostUSDT || 0), 0);

    const n = closedTrades.length;
    const avgGross    = n > 0 ? parseFloat((grossPnL   / n).toFixed(6)) : 0;
    const avgFee      = n > 0 ? parseFloat((fees       / n).toFixed(6)) : 0;
    const avgNet      = n > 0 ? parseFloat((netPnL     / n).toFixed(6)) : 0;

    // Duration
    const durations = closedTrades
      .filter(t => t.holdingMs && t.holdingMs > 0)
      .map(t => t.holdingMs / 60000);
    const avgDurationMinutes = durations.length > 0
      ? parseFloat((durations.reduce((s, v) => s + v, 0) / durations.length).toFixed(2))
      : 0;

    // Signal score
    const scores = closedTrades
      .filter(t => t.signalScore || t.entryScore)
      .map(t => t.signalScore || t.entryScore);
    const avgSignalScore = scores.length > 0
      ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1))
      : 0;

    // Fee drag = (fees + spreadCost) / grossPnL * 100
    const feeDragPercent = grossPnL > 0
      ? parseFloat(((fees + spreadCost) / grossPnL * 100).toFixed(2))
      : 0;

    // ── Decision ─────────────────────────────────────────────────────────
    const decision = decideStatus(allTrades.length, netPnL, winRate, feeDragPercent);

    // ── Best & worst trades ───────────────────────────────────────────────
    const sortedByNet = [...closedTrades].sort((a, b) =>
      (b.netPnL || b.netPnLUSDT || 0) - (a.netPnL || a.netPnLUSDT || 0));
    const bestTrade  = sortedByNet[0] ?? null;
    const worstTrade = sortedByNet[sortedByNet.length - 1] ?? null;

    const summarize = t => t ? {
      id:           t.id,
      entryPrice:   t.entryPrice,
      tpPrice:      t.tpPrice || t.targetPrice,
      slPrice:      t.slPrice || t.stopLossPrice,
      exitPrice:    t.exitPrice,
      grossPnL:     parseFloat((t.grossPnL || t.grossPnLUSDT || 0).toFixed(6)),
      netPnL:       parseFloat((t.netPnL   || t.netPnLUSDT   || 0).toFixed(6)),
      fees:         parseFloat((t.fees     || 0).toFixed(6)),
      status:       t.status,
      signalScore:  t.signalScore || t.entryScore,
      holdingMin:   t.holdingMs ? parseFloat((t.holdingMs / 60000).toFixed(2)) : null,
      openedAt:     t.openedAt,
      closedAt:     t.closedAt,
    } : null;

    // ── Recent 5 closed trades ────────────────────────────────────────────
    const recent5 = sortedByNet.slice(-5).reverse().map(summarize);

    // ── Break-even math ───────────────────────────────────────────────────
    const avgTotalFeePerTrade = avgFee; // already includes entry+exit fee
    const breakEvenTPPct = avgFee > 0 && n > 0
      ? parseFloat((avgFee / (CONFIG.activePair === 'BTC-USDT' ? 10 : 10) * 100 * 2.2).toFixed(4))
      : null;

    const verdict = parseFloat(netPnL.toFixed(6)) > 0
      ? `NET POSITIVE after ${n} closed BTC trades — fee drag at ${feeDragPercent}%`
      : `Net loss after ${n} closed BTC trades — fee drag at ${feeDragPercent}%. Avg net/trade: ${avgNet}`;

    console.log(`[PHASE4F_REPORT] status=${decision.status} trades=${n} winRate=${winRate}% netPnL=${netPnL.toFixed(6)}`);

    return Response.json({
      // ── Safety ────────────────────────────────────────────────────────
      realTradeAllowed:         REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:   REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:         KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,

      // ── Mode ─────────────────────────────────────────────────────────
      mode:   PHASE,
      config: CONFIG,

      // ── Metrics ───────────────────────────────────────────────────────
      metrics: {
        totalBTCTrades:         allTrades.length,
        openBTCTrades:          openTrades.length,
        closedBTCTrades:        n,
        tpHits,
        slHits,
        expiredTrades:          expired,
        manualClosed:           manual,
        wins,
        losses:                 n - wins,
        winRate,
        grossPnL:               parseFloat(grossPnL.toFixed(6)),
        fees:                   parseFloat(fees.toFixed(6)),
        spreadCost:             parseFloat(spreadCost.toFixed(6)),
        netPnL:                 parseFloat(netPnL.toFixed(6)),
        averageGrossPerTrade:   avgGross,
        averageFeePerTrade:     avgFee,
        averageNetPerTrade:     avgNet,
        averageDurationMinutes: avgDurationMinutes,
        averageSignalScore:     avgSignalScore,
        feeDragPercent,
        breakEvenTPPct,
      },

      // ── Decision ──────────────────────────────────────────────────────
      decision: {
        status:    decision.status,
        color:     decision.color,
        emoji:     decision.emoji,
        note:      decision.note,
        verdict,
      },

      // ── Trade samples ─────────────────────────────────────────────────
      bestTrade:   summarize(bestTrade),
      worstTrade:  summarize(worstTrade),
      recent5,

      // ── Disabled pairs reminder ───────────────────────────────────────
      disabledPairs: [
        { instId: 'ETH-USDT',  reason: 'DISABLED_NO_VERIFIED_EDGE' },
        { instId: 'SOL-USDT',  reason: 'DISABLED_NO_VERIFIED_EDGE' },
        { instId: 'DOGE-USDT', reason: 'DISABLED_NO_VERIFIED_EDGE' },
        { instId: 'XRP-USDT',  reason: 'DISABLED_NO_VERIFIED_EDGE' },
      ],

      generatedAt:  new Date().toISOString(),
      requestedBy:  user.email,
    });

  } catch (err) {
    console.error('[PHASE4F_REPORT] Error:', err.message);
    return Response.json({
      realTradeAllowed:         false,
      realTradeUnlockAllowed:   false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      error: err.message,
    }, { status: 500 });
  }
});