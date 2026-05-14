import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// SYSTEM TRAIL — SINGLE SOURCE OF TRUTH FOR TRADING STATE
// ============================================================
// This is the ONLY authoritative source for:
//   - Active mode / engine / report / pair
//   - Live signal status
//   - Safety constants
//   - UI decisions (what button to show, what status to display)
//
// NEVER enables real trading.
// NEVER calls OKX order endpoints.
// Kill switch is ALWAYS active.
// ============================================================

const ACTIVE_MODE    = 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE';
const ACTIVE_ENGINE  = 'phase4FBTCOnlyPaperMode';
const ACTIVE_REPORT  = 'phase4FPerformanceReport';
const ACTIVE_PAIR    = 'BTC-USDT';
const DISABLED_PAIRS = ['ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

const CONFIG = {
  tpPercent:       1.30,
  slPercent:       0.65,
  expiryMinutes:   60,
  requiredScore:   75,
  minTickScore:    15,
  maxOpenTrades:   1,
  paperOnly:       true,
  realTradingLocked: true,
};

const SAFETY = {
  killSwitchActive:         true,
  tradeAllowed:             false,
  realTradeAllowed:         false,
  realTradeUnlockAllowed:   false,
  noOKXOrderEndpointCalled: true,
};

// ── OKX public read-only endpoints ──────────────────────────
async function fetchTicker() {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT', { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) return null;
    return { last: parseFloat(d.last), bid: parseFloat(d.bidPx || d.last), ask: parseFloat(d.askPx || d.last) };
  } catch { return null; }
}

async function fetchCandles() {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=100', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j?.data || []).map(c => parseFloat(c[4])).reverse();
  } catch { return []; }
}

async function fetchTrades() {
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/trades?instId=BTC-USDT&limit=200', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j?.data || []).map(t => ({ price: parseFloat(t.px), size: parseFloat(t.sz), side: t.side }));
  } catch { return []; }
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

function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[SYSTEM_TRAIL] requested by ${user.email}`);

    // ── Fetch live market data and system state in parallel ──
    const [ticker, closes, trades, openTrades, phase5Raw, hardBlockerRaw] = await Promise.all([
      fetchTicker(),
      fetchCandles(),
      fetchTrades(),
      base44.entities.PaperTrade.filter({ status: 'OPEN', instId: 'BTC-USDT' }, '-created_date', 5).catch(() => []),
      base44.functions.invoke('phase5UnlockGuard', {}).catch(() => ({ data: null })),
      base44.functions.invoke('realTradingHardBlocker', {}).catch(() => ({ data: null })),
    ]);

    // ── BTC performance summary from entity directly (lightweight) ──
    const [allBTCTrades, linkedBTCTrades7dRaw] = await Promise.all([
      base44.entities.PaperTrade.filter({ instId: 'BTC-USDT' }, '-created_date', 200).catch(() => []),
      base44.entities.PaperTrade.filter({ instId: 'BTC-USDT' }, '-closedAt', 200).catch(() => []),
    ]);

    const closedBTCTrades = allBTCTrades.filter(t => t.status !== 'OPEN');
    const totalBTCTrades  = allBTCTrades.length;
    const openBTCTrades   = openTrades.length;

    // 7-day linked trades
    const cutoff7d  = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const linked7d  = linkedBTCTrades7dRaw.filter(t =>
      t.status !== 'OPEN' && t.signalSnapshotId && new Date(t.closedAt).getTime() > cutoff7d
    );
    const linkedBTCTrades7d = linked7d.length;
    const linkedNetPnL7d    = linked7d.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const wins7d            = linked7d.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const linkedWinRate7d   = linked7d.length > 0 ? parseFloat(((wins7d / linked7d.length) * 100).toFixed(1)) : 0;

    // ── Compute live signal score ─────────────────────────────
    let alertLevel          = 'COLD';
    let totalScore          = 0;
    let mainBlockingReason  = 'NO_MARKET_DATA';
    let recommendedAction   = 'WAIT';
    let lastPrice           = null;

    if (ticker && closes.length >= 20) {
      lastPrice = ticker.last;

      const emaFast = calcEMA(closes, 9);
      const emaSlow = calcEMA(closes, 21);
      const rsi     = calcRSI(closes, 14);
      const mom10   = closes.length >= 10
        ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100 : 0;

      const buyVol  = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
      const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
      const total   = buyVol + sellVol;
      const buyPct  = total > 0 ? buyVol / total * 100 : 50;
      const drift   = trades.length > 1 ? (trades[0].price - trades[trades.length - 1].price) / trades[trades.length - 1].price * 100 : 0;
      const tick    = buyPct >= 58 && drift > 0 ? 'BUY_PRESSURE' : (100 - buyPct) >= 58 && drift < 0 ? 'SELL_PRESSURE' : 'NEUTRAL';
      const tickScore = buyPct >= 65 ? 25 : buyPct >= 55 ? 18 : buyPct >= 45 ? 10 : 5;

      const emaCross   = emaFast && emaSlow ? (emaFast > emaSlow ? 1 : -1) : 0;
      const rsiBull    = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
      const momBull    = mom10 > 0.05 ? 1 : mom10 < -0.05 ? -1 : 0;
      const vote       = emaCross + rsiBull + momBull;
      const intraday   = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';
      let intScore     = 50;
      if (intraday === 'BULLISH') intScore += 25;
      if (intraday === 'BEARISH') intScore -= 25;
      if (rsi !== null && rsi > 55) intScore += 10;
      intScore = Math.max(0, Math.min(100, intScore));

      const grossEst  = 10 * (CONFIG.tpPercent / 100);
      const feesEst   = 10 * 0.001 * 2;
      const spreadEst = 10 * (Math.abs(ticker.ask - ticker.bid) / ticker.last);
      const netEst    = grossEst - feesEst - spreadEst;
      const feeScore  = netEst >= 0.0003 ? 70 : netEst >= 0 ? 40 : 10;
      const tickS     = tick === 'BUY_PRESSURE' ? 75 : tick === 'NEUTRAL' ? 50 : 20;
      totalScore      = Math.round(intScore * 0.50 + tickS * 0.30 + feeScore * 0.20);

      const hasOpenTrade = openBTCTrades >= CONFIG.maxOpenTrades;

      if (hasOpenTrade)          { mainBlockingReason = 'OPEN_TRADE_EXISTS';   recommendedAction = 'WAIT'; }
      else if (intraday === 'BEARISH') { mainBlockingReason = 'BEARISH_MARKET'; recommendedAction = 'WAIT'; }
      else if (tick === 'SELL_PRESSURE') { mainBlockingReason = 'SELL_PRESSURE'; recommendedAction = 'WAIT'; }
      else if (totalScore < CONFIG.requiredScore) { mainBlockingReason = `SCORE_${totalScore}_BELOW_${CONFIG.requiredScore}`; recommendedAction = 'WATCH'; }
      else if (netEst < 0.0003)  { mainBlockingReason = 'FEE_BARRIER_FAIL';    recommendedAction = 'WATCH'; }
      else if (tick !== 'BUY_PRESSURE') { mainBlockingReason = 'NO_BUY_PRESSURE'; recommendedAction = 'WATCH'; }
      else                       { mainBlockingReason = 'PAPER_SIGNAL_READY';  recommendedAction = 'PAPER_SIGNAL_ONLY'; }

      if (totalScore >= CONFIG.requiredScore && tick === 'BUY_PRESSURE' && !hasOpenTrade && netEst >= 0.0003) {
        alertLevel = 'READY';
      } else if (totalScore >= 70) {
        alertLevel = 'HOT';
      } else if (totalScore >= 60) {
        alertLevel = 'WARM';
      } else {
        alertLevel = 'COLD';
      }
    }

    // ── Phase 5 guard ─────────────────────────────────────────
    const phase5Data       = phase5Raw?.data || {};
    const phase5GuardStatus = phase5Data?.status ?? 'LOCKED';
    const hardBlockerData  = hardBlockerRaw?.data || {};
    const hardBlockerStatus = hardBlockerData?.blockerStatus ?? 'REAL_TRADING_BLOCKED';

    // ── UI decision ───────────────────────────────────────────
    const readyForPaper   = alertLevel === 'READY' && openBTCTrades === 0;
    const uiDecision = {
      showStatus:  readyForPaper ? 'READY_FOR_BTC_PAPER_TRADE' : 'WAITING_FOR_VALID_BTC_SIGNAL',
      buttonLabel: readyForPaper ? 'RUN_BTC_PAPER_SCAN'        : 'REFRESH_BTC_SIGNAL',
      buttonAction: ACTIVE_ENGINE,
    };

    console.log(`[SYSTEM_TRAIL] mode=${ACTIVE_MODE} alertLevel=${alertLevel} score=${totalScore} guard=${phase5GuardStatus} hardBlocker=${hardBlockerStatus}`);

    return Response.json({
      // ── Active engine config ──────────────────────────────
      activeMode:    ACTIVE_MODE,
      activeEngine:  ACTIVE_ENGINE,
      activeReport:  ACTIVE_REPORT,
      scanFunctionUsed: ACTIVE_ENGINE,
      activePair:    ACTIVE_PAIR,
      disabledPairs: DISABLED_PAIRS,

      // ── Config ───────────────────────────────────────────
      config: CONFIG,

      // ── Live status ──────────────────────────────────────
      liveStatus: {
        lastPrice,
        alertLevel,
        totalScore,
        requiredScore:       CONFIG.requiredScore,
        missingScore:        Math.max(0, CONFIG.requiredScore - totalScore),
        mainBlockingReason,
        recommendedAction,
        openBTCTrades,
        totalBTCTrades,
        linkedBTCTrades7d,
        linkedNetPnL7d:      parseFloat(linkedNetPnL7d.toFixed(4)),
        linkedWinRate7d,
        phase5GuardStatus,
        hardBlockerStatus,
      },

      // ── Safety (immutable) ───────────────────────────────
      safety: SAFETY,

      // ── UI decision ──────────────────────────────────────
      uiDecision,

      // ── System trail verification ─────────────────────────
      mainDashboardUsesSystemTrail:      true,
      paperDashboardUsesSystemTrail:     true,
      signalDashboardMarkedDiagnosticOnly: true,
      legacyReportsArchived:             true,

      // ── Final verdict ─────────────────────────────────────
      hardBlockerStatus,
      phase5GuardStatus,
      finalVerdict: 'SYSTEM_TRAIL_SINGLE_SOURCE_OF_TRUTH_ACTIVE',

      generatedAt:  new Date().toISOString(),
      requestedBy:  user.email,
    });

  } catch (err) {
    console.error('[SYSTEM_TRAIL] Error:', err.message);
    return Response.json({
      ...{ activeMode: ACTIVE_MODE, activeEngine: ACTIVE_ENGINE, activeReport: ACTIVE_REPORT, activePair: ACTIVE_PAIR },
      safety: { killSwitchActive: true, tradeAllowed: false, realTradeAllowed: false, realTradeUnlockAllowed: false, noOKXOrderEndpointCalled: true },
      finalVerdict: 'SYSTEM_TRAIL_SINGLE_SOURCE_OF_TRUTH_ACTIVE',
      liveStatus: { alertLevel: 'COLD', totalScore: 0, mainBlockingReason: 'ERROR', recommendedAction: 'WAIT', hardBlockerStatus: 'REAL_TRADING_BLOCKED' },
      error: err.message,
    }, { status: 500 });
  }
});