import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  fetchOkxTicker, fetchOkxCandles1s, fetchOkxTrades,
  analyzeMicroTick, fetchPolygonDaily, fetchPolygonHistMinute,
  calcEMA, calcRSI, OKX_TAKER_FEE_RATE,
} from '../../shared/microMarketData.ts';

// ============================================================
// CLAUDE SIGNAL ENGINE
// ============================================================
// Gathers OKX 1m candles + tick trades + Polygon macro + last
// 20 VerifiedTrades + current OptimizingConstants + GlobalIntelligenceLaw
// entries → builds a prompt embedding the chart checklist rules →
// calls InvokeLLM (claude_sonnet_4_6) with response_json_schema →
// saves result as SignalSnapshot with mode=CLAUDE_ENGINE.
//
// Admin-only. Read-only (no OKX order endpoints called).
// ============================================================

const PAIR = 'BTC-USDT';
const REQUIRED_SCORE = 75;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const polyApiKey = Deno.env.get('POLYGON_API_KEY') || '';

    // ── 1. Gather market data ────────────────────────────────────
    const [ticker, candles, trades, polyDaily, polyMinute] = await Promise.all([
      fetchOkxTicker(PAIR),
      fetchOkxCandles1s(PAIR),
      fetchOkxTrades(PAIR),
      fetchPolygonDaily(polyApiKey),
      fetchPolygonHistMinute(polyApiKey),
    ]);

    if (!ticker || candles.length < 30) {
      return Response.json({
        error: 'INSUFFICIENT_MARKET_DATA',
        ticker: !!ticker,
        candles: candles.length,
        trades: trades.length,
      }, { status: 502 });
    }

    const closes = candles.map(c => c.close);
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema50 = calcEMA(closes, 50);
    const rsi = calcRSI(closes, 14);
    const mom10 = closes.length >= 10
      ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100
      : 0;
    const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
    const priorVol = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
    const volMom = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;
    const micro = analyzeMicroTick(trades);
    const spreadPct = ticker.spreadPct;

    // ── 2. Gather entity data ────────────────────────────────────
    const [recentTrades, constantsList, laws] = await Promise.all([
      base44.asServiceRole.entities.VerifiedTrade.list('-created_date', 20),
      base44.asServiceRole.entities.OptimizingConstants.list('-created_date', 5),
      base44.asServiceRole.entities.GlobalIntelligenceLaw.list('-created_date', 30),
    ]);

    const constants = constantsList.filter(c => c.botId === 'robot1')[0] || constantsList[0] || null;
    const activeLaws = laws.filter(l => l.kpi_value != null).slice(0, 15);

    // ── 3. Build prompt with chart checklist rules ───────────────
    const tradeStats = computeTradeStats(recentTrades);
    const prompt = buildPrompt({
      ticker, ema9, ema21, ema50, rsi, mom10, volMom, micro, spreadPct,
      polyDaily, polyMinute, tradeStats, constants, activeLaws,
    });

    // ── 4. Call Claude via InvokeLLM ─────────────────────────────
    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['BUY', 'SELL', 'WAIT'] },
          confidence: { type: 'number', minimum: 0, maximum: 100 },
          positionUSDT: { type: 'number' },
          tpPercent: { type: 'number' },
          slPercent: { type: 'number' },
          reasoning: { type: 'string' },
          checklistPass: { type: 'array', items: { type: 'string' } },
          checklistFail: { type: 'array', items: { type: 'string' } },
        },
        required: ['action', 'confidence', 'positionUSDT', 'tpPercent', 'slPercent', 'reasoning', 'checklistPass'],
      },
    });

    const signal = llmRes?.data ?? llmRes;
    const action = signal.action || 'WAIT';
    const confidence = Math.max(0, Math.min(100, Number(signal.confidence) || 0));
    const positionUSDT = Number(signal.positionUSDT) || 0;
    const tpPercent = Number(signal.tpPercent) || 1.2;
    const slPercent = Number(signal.slPercent) || 0.6;
    const checklistPass = Array.isArray(signal.checklistPass) ? signal.checklistPass : [];
    const checklistFail = Array.isArray(signal.checklistFail) ? signal.checklistFail : [];

    // ── 5. Map to alertLevel + composite score ───────────────────
    const alertLevel = action === 'BUY' && confidence >= REQUIRED_SCORE
      ? 'READY'
      : action === 'BUY' && confidence >= 60
        ? 'HOT'
        : action === 'SELL'
          ? 'COLD'
          : confidence >= 40 ? 'WARM' : 'COLD';

    const totalScore = Math.round(confidence);

    // ── 6. Save as SignalSnapshot ─────────────────────────────────
    const now = new Date().toISOString();
    const snapshot = await base44.asServiceRole.entities.SignalSnapshot.create({
      pair: PAIR,
      alertLevel,
      totalScore,
      requiredScore: REQUIRED_SCORE,
      lastPrice: ticker.last,
      rsi: rsi ?? 0,
      momentumPercent: parseFloat(mom10.toFixed(4)),
      buyPressurePercent: micro.buyPressurePercent,
      tickScore: micro.tickScore,
      passedBarriers: checklistPass,
      failedBarriers: checklistFail,
      recommendedAction: action,
      timestamp: now,
      mode: 'CLAUDE_ENGINE',
      realTradeAllowed: action === 'BUY' && confidence >= REQUIRED_SCORE,
      killSwitchActive: true,
      noOKXOrderEndpointCalled: true,
      claudeConfidence: confidence,
      claudeAction: action,
      claudeReasoning: String(signal.reasoning || '').slice(0, 2000),
      checklistPass,
      claudePositionUSDT: positionUSDT,
      claudeTpPercent: tpPercent,
      claudeSlPercent: slPercent,
    });

    console.log(`[CLAUDE_SIGNAL] action=${action} conf=${confidence} pos=${positionUSDT} tp=${tpPercent}% sl=${slPercent}% snapshotId=${snapshot.id}`);

    return Response.json({
      action,
      confidence,
      positionUSDT,
      tpPercent,
      slPercent,
      reasoning: signal.reasoning || '',
      checklistPass,
      checklistFail,
      alertLevel,
      totalScore,
      lastPrice: ticker.last,
      rsi,
      ema9, ema21, ema50,
      momentumPercent: parseFloat(mom10.toFixed(4)),
      buyPressurePercent: micro.buyPressurePercent,
      spreadPct,
      snapshotId: snapshot.id,
      generatedAt: now,
    });
  } catch (error) {
    console.error('[CLAUDE_SIGNAL] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Helpers ──────────────────────────────────────────────────────
function computeTradeStats(trades) {
  if (!trades || trades.length === 0) {
    return { count: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0, avgHoldMs: 0, avgFees: 0 };
  }
  const wins = trades.filter(t => (t.realizedPnL || 0) > 0).length;
  const losses = trades.filter(t => (t.realizedPnL || 0) <= 0).length;
  const totalPnL = trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);
  const holdTimes = trades.map(t => t.holdingMs || 0).filter(h => h > 0);
  const avgHoldMs = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;
  const fees = trades.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);
  return {
    count: trades.length,
    wins,
    losses,
    winRate: trades.length > 0 ? parseFloat((wins / trades.length * 100).toFixed(1)) : 0,
    totalPnL: parseFloat(totalPnL.toFixed(4)),
    avgHoldMs: Math.round(avgHoldMs),
    avgFees: parseFloat((fees / trades.length).toFixed(4)),
  };
}

function buildPrompt(ctx) {
  const { ticker, ema9, ema21, ema50, rsi, mom10, volMom, micro, spreadPct,
    polyDaily, polyMinute, tradeStats, constants, activeLaws } = ctx;

  const polyDailySummary = polyDaily.length >= 21
    ? `Daily bars: ${polyDaily.length}. Last close: ${polyDaily[polyDaily.length - 1].close}. 20-day trend: ${polyDaily[polyDaily.length - 1].close > polyDaily[0].close ? 'UP' : 'DOWN'}.`
    : 'No Polygon daily data available.';

  const polyMinuteSummary = polyMinute.length >= 30
    ? `Minute bars: ${polyMinute.length}. Recent minute momentum: ${((polyMinute[polyMinute.length - 1].close - polyMinute[0].close) / polyMinute[0].close * 100).toFixed(3)}%.`
    : 'No Polygon minute data available.';

  const constantsSummary = constants
    ? `Current TROK constants — K_TP: ${constants.K_TP}, K_SL: ${constants.K_SL}, K_SIZE: ${constants.K_SIZE}, K_COOLDOWN: ${constants.K_COOLDOWN}, K_QUALITY: ${constants.K_QUALITY}, K_HOLD: ${constants.K_HOLD}, epoch: ${constants.epoch || 1}.`
    : 'No TROK constants initialized yet.';

  const lawsSummary = activeLaws.length > 0
    ? activeLaws.map(l => `- ${l.law_principle}: ${l.formula_statement} (KPI: ${l.kpi_value})`).join('\n')
    : 'No GlobalIntelligenceLaw entries with KPI values.';

  return `You are an aggressive BTC-USDT scalping signal engine. Analyze the live market data below using the chart checklist rules and output a structured trading signal.

## CHART CHECKLIST RULES (apply each one):
1. **Multi-timeframe trend (EMA 20/50/200)**: EMA9 > EMA21 > EMA50 = bullish stack. EMA9 < EMA21 < EMA50 = bearish stack. Mixed = neutral.
2. **RSI 14**: >70 = overbought (avoid BUY), <30 = oversold (avoid SELL). 40-60 = neutral zone.
3. **MACD 12/26/9 crossover**: Use EMA9 vs EMA21 as proxy — EMA9 crossing above EMA21 = bullish momentum, below = bearish.
4. **ATR 14 for stop sizing**: Use spreadPct as volatility proxy. Higher spread = wider stop needed.
5. **Volume confirmation**: volMom > 0 = volume increasing (confirms move), < 0 = divergence (weak signal).
6. **Micro-tick pressure**: buyPressurePercent > 58 = buy pressure, < 42 = sell pressure.
7. **Momentum 10-bar**: mom10 > 0 = short-term bullish, < 0 = bearish.
8. **Polygon macro alignment**: Daily trend should align with intraday signal for high confidence.
9. **Spread filter**: spreadPct > 0.08% = high friction, reduce position size or skip.

## LIVE MARKET DATA:
- BTC-USDT price: ${ticker.last}
- Spread: ${spreadPct.toFixed(4)}%
- EMA9: ${ema9?.toFixed(2)}, EMA21: ${ema21?.toFixed(2)}, EMA50: ${ema50?.toFixed(2)}
- RSI(14): ${rsi?.toFixed(2)}
- Momentum 10-bar: ${mom10.toFixed(4)}%
- Volume momentum: ${volMom.toFixed(2)}%
- Micro-tick: buyPressure=${micro.buyPressurePercent}%, direction=${micro.tickDirection}, tickScore=${micro.tickScore}
- ${polyDailySummary}
- ${polyMinuteSummary}

## RECENT TRADE PERFORMANCE (last ${tradeStats.count} trades):
- Wins: ${tradeStats.wins}, Losses: ${tradeStats.losses}, Win rate: ${tradeStats.winRate}%
- Total P&L: ${tradeStats.totalPnL} USDT
- Avg holding time: ${(tradeStats.avgHoldMs / 1000).toFixed(1)}s
- Avg fees per trade: ${tradeStats.avgFees} USDT

## CURRENT TROK CONSTANTS:
${constantsSummary}

## ACTIVE GLOBAL INTELLIGENCE LAWS (TROK knowledge base):
${lawsSummary}

## INSTRUCTIONS:
1. Apply EVERY checklist rule above. List which ones PASS (confirm the trade direction) in checklistPass, and which FAIL in checklistFail.
2. Output action: BUY, SELL, or WAIT.
3. Confidence 0-100: how strongly the checklist supports the action. BUY requires ≥75 confidence.
4. positionUSDT: recommended position size. Aggressive mode — can use up to full available balance. Factor in fee-awareness: net profit after 0.1%×2 fees + spread must be positive.
5. tpPercent and slPercent: take-profit and stop-loss percentages. Use TROK constants as baseline, adjust for current volatility.
6. reasoning: 2-4 sentences explaining the decision, referencing specific checklist items.

Be aggressive but disciplined. A BUY signal at ≥75 confidence means the system will auto-execute a real trade.`;
}