import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ============================================================
// ADAPTIVE CONSTANTS ENGINE (enriched with TROK Claude optimization)
// ============================================================
// Two modes:
//   1. Single-trade feedback (legacy): body contains trade params →
//      heuristic constant adjustment.
//   2. TROK auto-optimize: body.trokAutoOptimize === true → reads last
//      N VerifiedTrades + active GlobalIntelligenceLaw entries → Claude
//      analyzes win rate, fee efficiency, drawdown, speed → proposes
//      new K_TP/K_SL/K_SIZE/K_COOLDOWN/K_QUALITY → writes new
//      OptimizingConstants record with epoch+1, deactivating previous.
// ============================================================

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // ── TROK Claude auto-optimize path ───────────────────────────
    if (body.trokAutoOptimize === true) {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
      return await trokAutoOptimize(base44, body);
    }

    // ── Legacy single-trade feedback path ────────────────────────
    return await singleTradeFeedback(base44, body);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ============================================================
// TROK CLAUDE AUTO-OPTIMIZE
// ============================================================
async function trokAutoOptimize(base44, body) {
  const botId = body.botId || 'robot1';
  const lookback = body.lookback || 20;

  // ── 1. Gather data ────────────────────────────────────────────
  const [recentTrades, constantsList, laws] = await Promise.all([
    base44.asServiceRole.entities.VerifiedTrade.list('-created_date', lookback),
    base44.asServiceRole.entities.OptimizingConstants.list('-created_date', 10),
    base44.asServiceRole.entities.GlobalIntelligenceLaw.list('-created_date', 30),
  ]);

  const currentConstants = constantsList.filter(c => c.botId === botId).sort((a, b) =>
    new Date(b.created_date) - new Date(a.created_date)
  )[0] || constantsList[0] || null;

  const activeLaws = laws.filter(l => l.kpi_value != null).slice(0, 15);

  // ── 2. Compute performance metrics ────────────────────────────
  const stats = computeStats(recentTrades);

  // ── 3. Build prompt for Claude ────────────────────────────────
  const prompt = buildTrokPrompt(stats, currentConstants, activeLaws);

  // ── 4. Call Claude ─────────────────────────────────────────────
  const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    model: 'claude_sonnet_4_6',
    response_json_schema: {
      type: 'object',
      properties: {
        K_TP: { type: 'number' },
        K_SL: { type: 'number' },
        K_SIZE: { type: 'number' },
        K_COOLDOWN: { type: 'number' },
        K_QUALITY: { type: 'number' },
        K_HOLD: { type: 'number' },
        reasoning: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['K_TP', 'K_SL', 'K_SIZE', 'K_COOLDOWN', 'K_QUALITY', 'K_HOLD', 'reasoning'],
    },
  });

  const proposal = llmRes?.data ?? llmRes;

  // ── 5. Clamp proposed values to safe bounds ──────────────────
  const newConstants = {
    botId,
    K_TP: clamp(Number(proposal.K_TP) || (currentConstants?.K_TP || 0.25), 0.05, 2.0),
    K_SL: clamp(Number(proposal.K_SL) || (currentConstants?.K_SL || -0.18), -1.0, -0.02),
    K_SPREAD: currentConstants?.K_SPREAD ?? 0.05,
    K_HOLD: clamp(Number(proposal.K_HOLD) || (currentConstants?.K_HOLD || 5), 1, 60),
    K_SIZE: clamp(Number(proposal.K_SIZE) || (currentConstants?.K_SIZE || 1.0), 0.1, 3.0),
    K_QUALITY: clamp(Number(proposal.K_QUALITY) || (currentConstants?.K_QUALITY || 50), 20, 90),
    K_RESERVE: currentConstants?.K_RESERVE ?? 0.30,
    K_COOLDOWN: clamp(Number(proposal.K_COOLDOWN) || (currentConstants?.K_COOLDOWN || 30), 5, 300),
    epoch: (currentConstants?.epoch || 1) + 1,
    isActive: true,
  };

  // ── 6. Deactivate previous, write new ─────────────────────────
  if (currentConstants?.id) {
    await base44.asServiceRole.entities.OptimizingConstants.update(currentConstants.id, { isActive: false });
  }
  const saved = await base44.asServiceRole.entities.OptimizingConstants.create(newConstants);

  // ── 7. Log KPI ────────────────────────────────────────────────
  await base44.asServiceRole.entities.RobotKPILog.create({
    pair: 'BTC-USDT',
    kpi: stats.winRate / 100,
    win: stats.winRate >= 50,
    realizedPnL: stats.totalPnL,
    exitMode: 'TROK_OPTIMIZE',
    scores: {
      winRate: stats.winRate / 100,
      feeEfficiency: stats.feeEfficiency,
      speed: stats.speedScore,
      drawdown: stats.drawdownScore,
      capital: stats.capitalScore,
    },
    constantsChanged: {
      K_TP: { from: currentConstants?.K_TP, to: newConstants.K_TP },
      K_SL: { from: currentConstants?.K_SL, to: newConstants.K_SL },
      K_SIZE: { from: currentConstants?.K_SIZE, to: newConstants.K_SIZE },
      K_COOLDOWN: { from: currentConstants?.K_COOLDOWN, to: newConstants.K_COOLDOWN },
      K_QUALITY: { from: currentConstants?.K_QUALITY, to: newConstants.K_QUALITY },
    },
    timestamp: new Date().toISOString(),
  });

  console.log(`[TROK_OPTIMIZE] epoch ${newConstants.epoch} — winRate=${stats.winRate}% K_TP=${newConstants.K_TP} K_SL=${newConstants.K_SL} K_SIZE=${newConstants.K_SIZE}`);

  return Response.json({
    success: true,
    mode: 'TROK_CLAUDE_AUTO_OPTIMIZE',
    epoch: newConstants.epoch,
    previousConstants: currentConstants ? {
      K_TP: currentConstants.K_TP, K_SL: currentConstants.K_SL, K_SIZE: currentConstants.K_SIZE,
      K_COOLDOWN: currentConstants.K_COOLDOWN, K_QUALITY: currentConstants.K_QUALITY,
      epoch: currentConstants.epoch || 1,
    } : null,
    newConstants,
    performance: stats,
    reasoning: proposal.reasoning || '',
    confidence: proposal.confidence || 0,
    savedId: saved.id,
  });
}

// ============================================================
// LEGACY SINGLE-TRADE FEEDBACK PATH (unchanged)
// ============================================================
async function singleTradeFeedback(base44, body) {
  const {
    pair, spread, volatility, momentum, volume,
    holdTimeMs, entryPx, exitPx, fees, realizedPnL,
    win, exitMode, tradeAmountUSDT
  } = body;

  let constants = await getOrInitializeConstants(base44, 'robot1');

  const winRateScore = win ? 1.0 : 0.0;
  const feeEfficiencyScore = calculateFeeEfficiency(realizedPnL, fees, tradeAmountUSDT);
  const speedScore = calculateSpeedScore(holdTimeMs);
  const drawdownProtectionScore = calculateDrawdownProtection(exitMode, spread);
  const capitalEfficiencyScore = calculateCapitalEfficiency(realizedPnL, tradeAmountUSDT);

  const weights = {
    winRate: 0.25, feeEfficiency: 0.25, speed: 0.20,
    drawdown: 0.15, capital: 0.15
  };

  const kpi =
    (winRateScore * weights.winRate) +
    (feeEfficiencyScore * weights.feeEfficiency) +
    (speedScore * weights.speed) +
    (drawdownProtectionScore * weights.drawdown) +
    (capitalEfficiencyScore * weights.capital);

  let changes = {};

  if (win && feeEfficiencyScore > 0.8) {
    constants.K_SIZE = Math.min(2.0, constants.K_SIZE * 1.05);
    constants.K_COOLDOWN = Math.max(15, constants.K_COOLDOWN * 0.95);
    changes.sizeIncrease = true;
    changes.cooldownDecrease = true;
  }

  if (!win) {
    constants.K_SIZE = Math.max(0.5, constants.K_SIZE * 0.90);
    constants.K_QUALITY = Math.min(80, constants.K_QUALITY + 2);
    constants.K_COOLDOWN = Math.min(120, constants.K_COOLDOWN * 1.10);
    changes.sizeDecrease = true;
    changes.qualityIncrease = true;
    changes.cooldownIncrease = true;
  }

  if (exitMode === 'DEAD_POSITION' || holdTimeMs > constants.K_HOLD * 60000) {
    constants.K_HOLD = Math.max(2, constants.K_HOLD * 0.85);
    constants.K_QUALITY = Math.min(85, constants.K_QUALITY + 1);
    changes.holdTimeDecrease = true;
    changes.momentumRequirementIncrease = true;
  }

  if (feeEfficiencyScore < 0.5 && realizedPnL < 0.01) {
    constants.K_TP = Math.min(1.0, constants.K_TP * 1.08);
    constants.K_SIZE = Math.max(0.3, constants.K_SIZE * 0.92);
    changes.tpIncrease = true;
    changes.smallTradesFiltered = true;
  }

  await saveConstants(base44, 'robot1', constants);

  await logKPIFeedback(base44, {
    pair, kpi, win, realizedPnL, exitMode,
    scores: { winRateScore, feeEfficiencyScore, speedScore, drawdownProtectionScore, capitalEfficiencyScore },
    constantsChanged: changes,
    timestamp: new Date().toISOString()
  });

  return Response.json({
    success: true, kpi,
    scores: {
      winRate: winRateScore, feeEfficiency: feeEfficiencyScore,
      speed: speedScore, drawdown: drawdownProtectionScore, capital: capitalEfficiencyScore
    },
    constantsUpdated: constants,
    changesApplied: changes
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function computeStats(trades) {
  if (!trades || trades.length === 0) {
    return { count: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0, avgHoldMs: 0,
      avgFees: 0, feeEfficiency: 0, speedScore: 0.5, drawdownScore: 0.5, capitalScore: 0.5 };
  }
  const wins = trades.filter(t => (t.realizedPnL || 0) > 0).length;
  const losses = trades.filter(t => (t.realizedPnL || 0) <= 0).length;
  const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const holdTimes = trades.map(t => t.holdingMs || 0).filter(h => h > 0);
  const avgHoldMs = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;
  const totalFees = trades.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);
  const avgFees = totalFees / trades.length;

  // Fee efficiency: how much of gross profit survived fees
  const grossProfit = trades.reduce((s, t) => s + Math.max(0, t.realizedPnL || 0), 0);
  const feeEfficiency = grossProfit > 0 ? Math.max(0, 1 - totalFees / grossProfit) : 0;

  // Speed score: faster holds = better (scalping)
  const avgHoldSec = avgHoldMs / 1000;
  const speedScore = avgHoldSec > 300 ? 0.2 : avgHoldSec < 30 ? 1.0 : Math.max(0, 1 - (avgHoldSec - 30) / 270);

  // Drawdown: worst single trade
  const worstLoss = Math.min(...trades.map(t => t.realizedPnL || 0));
  const drawdownScore = worstLoss >= 0 ? 1.0 : Math.max(0, 1 + worstLoss / 10);

  // Capital efficiency: avg ROI per trade
  const avgROI = trades.reduce((s, t) => {
    const size = t.buyValue || 0;
    return s + (size > 0 ? (t.realizedPnL || 0) / size : 0);
  }, 0) / trades.length;
  const capitalScore = Math.max(0, Math.min(1, avgROI / 0.01));

  return {
    count: trades.length, wins, losses,
    winRate: parseFloat((wins / trades.length * 100).toFixed(1)),
    totalPnL: parseFloat(totalPnL.toFixed(4)),
    avgHoldMs: Math.round(avgHoldMs),
    avgHoldSec: Math.round(avgHoldSec),
    avgFees: parseFloat(avgFees.toFixed(4)),
    totalFees: parseFloat(totalFees.toFixed(4)),
    feeEfficiency: parseFloat(feeEfficiency.toFixed(3)),
    speedScore: parseFloat(speedScore.toFixed(3)),
    drawdownScore: parseFloat(drawdownScore.toFixed(3)),
    capitalScore: parseFloat(capitalScore.toFixed(3)),
  };
}

function buildTrokPrompt(stats, currentConstants, activeLaws) {
  const constantsSummary = currentConstants
    ? `Current constants (epoch ${currentConstants.epoch || 1}):
  K_TP: ${currentConstants.K_TP} (take profit %)
  K_SL: ${currentConstants.K_SL} (stop loss %)
  K_SIZE: ${currentConstants.K_SIZE} (position multiplier)
  K_COOLDOWN: ${currentConstants.K_COOLDOWN} (seconds between trades)
  K_QUALITY: ${currentConstants.K_QUALITY} (min signal quality 0-100)
  K_HOLD: ${currentConstants.K_HOLD} (max hold minutes)`
    : 'No constants initialized yet. Propose initial values.';

  const lawsSummary = activeLaws.length > 0
    ? activeLaws.map(l => `- ${l.law_principle}: ${l.formula_statement} (KPI weight: ${l.kpi_value})`).join('\n')
    : 'No TROK law entries available.';

  return `You are the TROK (Transcendental Relativistic Optimization Kernel) self-learning engine. Your job is to analyze recent trade performance and propose optimized trading constants for the next epoch.

## RECENT TRADE PERFORMANCE (last ${stats.count} trades):
- Wins: ${stats.wins}, Losses: ${stats.losses}, Win rate: ${stats.winRate}%
- Total P&L: ${stats.totalPnL} USDT
- Avg holding time: ${stats.avgHoldSec}s
- Total fees paid: ${stats.totalFees} USDT
- Fee efficiency (profit kept after fees): ${(stats.feeEfficiency * 100).toFixed(1)}%
- Speed score: ${stats.speedScore} (1.0 = fast scalp, 0.2 = slow)
- Drawdown score: ${stats.drawdownScore} (1.0 = no bad losses, 0 = large loss)
- Capital efficiency: ${stats.capitalScore} (ROI per trade)

## ${constantsSummary}

## ACTIVE TROK KNOWLEDGE BASE LAWS:
${lawsSummary}

## OPTIMIZATION RULES (self-learning):
1. If winRate > 60% AND feeEfficiency > 0.7: increase K_SIZE (more aggressive), decrease K_COOLDOWN (trade faster).
2. If winRate < 40%: decrease K_SIZE (less aggressive), increase K_QUALITY (stricter entry), increase K_COOLDOWN (slow down).
3. If feeEfficiency < 0.5: increase K_TP (bigger targets to beat fees), decrease K_SIZE.
4. If speedScore < 0.4 (slow holds): decrease K_HOLD (force faster exits), increase K_QUALITY.
5. If drawdownScore < 0.5 (large loss): tighten K_SL (smaller stop), increase K_QUALITY.
6. Use the TROK laws above as guidance — laws with higher KPI values should influence the constants more.
7. Keep changes incremental (max 20% change per epoch) to avoid overfitting to recent noise.

## OUTPUT:
Propose new values for K_TP, K_SL, K_SIZE, K_COOLDOWN, K_QUALITY, K_HOLD.
- K_TP: 0.05 to 2.0 (take profit %)
- K_SL: -1.0 to -0.02 (stop loss %, negative)
- K_SIZE: 0.1 to 3.0 (position multiplier)
- K_COOLDOWN: 5 to 300 (seconds)
- K_QUALITY: 20 to 90 (min signal quality)
- K_HOLD: 1 to 60 (max hold minutes)
Provide reasoning explaining what changed and why, referencing the performance metrics and TROK laws.`;
}

async function getOrInitializeConstants(base44, botId) {
  const existing = await base44.entities.OptimizingConstants.list();
  const latest = existing.filter(c => c.botId === botId).sort((a, b) =>
    new Date(b.created_date) - new Date(a.created_date)
  )[0];
  if (latest) return latest;

  const defaults = {
    botId, K_TP: 0.25, K_SL: -0.18, K_SPREAD: 0.05, K_HOLD: 5,
    K_SIZE: 1.0, K_QUALITY: 50, K_RESERVE: 0.30, K_COOLDOWN: 30,
    epoch: 1, isActive: true
  };
  await base44.entities.OptimizingConstants.create(defaults);
  return defaults;
}

async function saveConstants(base44, botId, constants) {
  await base44.entities.OptimizingConstants.create(constants);
}

async function logKPIFeedback(base44, feedback) {
  await base44.entities.RobotKPILog.create(feedback);
}

function calculateFeeEfficiency(pnl, fees, tradeAmount) {
  if (tradeAmount === 0) return 0;
  const feeRatio = fees / tradeAmount;
  const profitRatio = pnl / tradeAmount;
  if (profitRatio <= 0) return 0;
  return Math.max(0, Math.min(1, profitRatio / (profitRatio + feeRatio)));
}

function calculateSpeedScore(holdTimeMs) {
  const holdSec = holdTimeMs / 1000;
  if (holdSec > 120) return Math.max(0, 1 - (holdSec - 120) / 240);
  if (holdSec < 30) return 0.9;
  return Math.min(1, 1 - (holdSec - 30) / 90);
}

function calculateDrawdownProtection(exitMode, spread) {
  const modeScores = { 'TP': 1.0, 'SL': 0.6, 'TRAIL': 0.8, 'MICRO_TRAIL': 0.85, 'DEAD_POSITION': 0.2 };
  const mode = modeScores[exitMode] || 0.5;
  const spreadPenalty = Math.max(0, 1 - spread / 0.1);
  return (mode + spreadPenalty) / 2;
}

function calculateCapitalEfficiency(pnl, tradeAmount) {
  if (tradeAmount === 0) return 0;
  const roi = pnl / tradeAmount;
  return Math.max(0, Math.min(1, roi / 0.01));
}