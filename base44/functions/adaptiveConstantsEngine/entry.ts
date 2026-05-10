import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { 
      pair, spread, volatility, momentum, volume, 
      holdTimeMs, entryPx, exitPx, fees, realizedPnL, 
      win, exitMode, tradeAmountUSDT 
    } = body;

    // Fetch or initialize constants from database
    let constants = await getOrInitializeConstants(base44, 'robot1');

    // Calculate component scores (0-1 scale)
    const winRateScore = win ? 1.0 : 0.0;
    const feeEfficiencyScore = calculateFeeEfficiency(realizedPnL, fees, tradeAmountUSDT);
    const speedScore = calculateSpeedScore(holdTimeMs); // faster = better
    const drawdownProtectionScore = calculateDrawdownProtection(exitMode, spread);
    const capitalEfficiencyScore = calculateCapitalEfficiency(realizedPnL, tradeAmountUSDT);

    // Composite KPI (weighted average)
    const weights = {
      winRate: 0.25,
      feeEfficiency: 0.25,
      speed: 0.20,
      drawdown: 0.15,
      capital: 0.15
    };

    const kpi = 
      (winRateScore * weights.winRate) +
      (feeEfficiencyScore * weights.feeEfficiency) +
      (speedScore * weights.speed) +
      (drawdownProtectionScore * weights.drawdown) +
      (capitalEfficiencyScore * weights.capital);

    // Feedback-driven constant adjustments
    let changes = {};

    if (win && feeEfficiencyScore > 0.8) {
      // Good win with low fees: increase size and reduce cooldown
      constants.K_SIZE = Math.min(2.0, constants.K_SIZE * 1.05);
      constants.K_COOLDOWN = Math.max(15, constants.K_COOLDOWN * 0.95);
      changes.sizeIncrease = true;
      changes.cooldownDecrease = true;
    }

    if (!win) {
      // Loss: reduce size, increase quality requirement, increase cooldown
      constants.K_SIZE = Math.max(0.5, constants.K_SIZE * 0.90);
      constants.K_QUALITY = Math.min(80, constants.K_QUALITY + 2);
      constants.K_COOLDOWN = Math.min(120, constants.K_COOLDOWN * 1.10);
      changes.sizeDecrease = true;
      changes.qualityIncrease = true;
      changes.cooldownIncrease = true;
    }

    if (exitMode === 'DEAD_POSITION' || holdTimeMs > constants.K_HOLD * 60000) {
      // Dead position: reduce hold time, increase momentum requirement
      constants.K_HOLD = Math.max(2, constants.K_HOLD * 0.85);
      constants.K_QUALITY = Math.min(85, constants.K_QUALITY + 1);
      changes.holdTimeDecrease = true;
      changes.momentumRequirementIncrease = true;
    }

    if (feeEfficiencyScore < 0.5 && realizedPnL < 0.01) {
      // Fees too high: increase TP, avoid small trades
      constants.K_TP = Math.min(1.0, constants.K_TP * 1.08);
      constants.K_SIZE = Math.max(0.3, constants.K_SIZE * 0.92);
      changes.tpIncrease = true;
      changes.smallTradesFiltered = true;
    }

    // Save updated constants
    await saveConstants(base44, 'robot1', constants);

    // Log the KPI and changes
    await logKPIFeedback(base44, {
      pair, 
      kpi, 
      win, 
      realizedPnL,
      exitMode,
      scores: { winRateScore, feeEfficiencyScore, speedScore, drawdownProtectionScore, capitalEfficiencyScore },
      constantsChanged: changes,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      kpi,
      scores: {
        winRate: winRateScore,
        feeEfficiency: feeEfficiencyScore,
        speed: speedScore,
        drawdown: drawdownProtectionScore,
        capital: capitalEfficiencyScore
      },
      constantsUpdated: constants,
      changesApplied: changes
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getOrInitializeConstants(base44, botId) {
  // Try to fetch latest constants from database
  const existing = await base44.entities.OptimizingConstants.list();
  const latest = existing.filter(c => c.botId === botId).sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  )[0];

  if (latest) return latest;

  // Initialize defaults
  const defaults = {
    botId,
    K_TP: 0.25,        // takeProfitPercent
    K_SL: -0.18,       // stopLossPercent
    K_SPREAD: 0.05,    // maxSpreadPercent
    K_HOLD: 5,         // maxHoldMinutes
    K_SIZE: 1.0,       // tradeAmountMultiplier
    K_QUALITY: 50,     // minimumScalpQualityScore
    K_RESERVE: 0.30,   // minimumFreeCapitalPercent
    K_COOLDOWN: 30,    // cooldownSeconds
    epoch: 1,
    isActive: true
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
  // Faster = better (120s = 0.8, 30s = 1.0)
  const holdSec = holdTimeMs / 1000;
  if (holdSec > 120) return Math.max(0, 1 - (holdSec - 120) / 240);
  if (holdSec < 30) return 0.9;
  return Math.min(1, 1 - (holdSec - 30) / 90);
}

function calculateDrawdownProtection(exitMode, spread) {
  // TP/SL exits = good, dead positions = bad, trail = neutral
  const modeScores = {
    'TP': 1.0,
    'SL': 0.6,
    'TRAIL': 0.8,
    'MICRO_TRAIL': 0.85,
    'DEAD_POSITION': 0.2
  };
  const mode = modeScores[exitMode] || 0.5;
  const spreadPenalty = Math.max(0, 1 - spread / 0.1);
  return (mode + spreadPenalty) / 2;
}

function calculateCapitalEfficiency(pnl, tradeAmount) {
  if (tradeAmount === 0) return 0;
  const roi = pnl / tradeAmount;
  return Math.max(0, Math.min(1, roi / 0.01)); // 1% ROI = max score
}