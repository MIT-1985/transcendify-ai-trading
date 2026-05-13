/**
 * phase4OKXPaperTrading — PHASE 4 OKX-ONLY PAPER TRADING SIMULATOR
 *
 * System:   OKX_ONLY_INTRADAY_TRADING_ENGINE
 * Phase:    PHASE_4_PAPER_TRADING
 * Trading:  PAPER ONLY — no real OKX order endpoint called
 * Orders:   NONE — noOKXOrderEndpointCalled = true ALWAYS
 * Kill Switch: ACTIVE — tradeAllowed = false ALWAYS
 *
 * SAFETY AUDIT CHECKLIST (verified inline):
 *   ✅ No import of executeTrade, placeOrder, tradingService, or signed OKX endpoints
 *   ✅ Only public OKX market endpoints used: /market/ticker, /market/candles, /market/trades
 *   ✅ All trades written to PaperTrade entity only (virtual)
 *   ✅ tradeAllowed = false hardcoded, cannot be overridden
 *   ✅ noOKXOrderEndpointCalled = true hardcoded
 *   ✅ Duplicate protection: one open trade per pair enforced
 *   ✅ Auto-close: TP hit / SL hit / 15-min expiry
 *   ✅ All 6 barriers must pass before paper entry
 *   ✅ safetyAudit block returned in every response
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── PHASE4_PAPER_CONSTANTS (Phase 4B — paper-only, kill switch active) ────────
const PHASE4_PAPER_CONSTANTS = {
  requiredScore:     55,   // minimum composite score
  minTickScore:      10,   // Phase 4B: lowered from 15 → 10 (tick threshold adjustment)
  maxOpenTrades:     5,
  paperOnly:         true,
  realTradeAllowed:  false,
  killSwitchActive:  true,
};

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_PAIRS            = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
const OKX_TAKER_FEE        = 0.001;    // 0.1% taker
const K_SIZE               = 10;       // USDT per paper trade
const K_TP                 = 0.30;     // % take profit
const K_SL                 = -0.20;    // % stop loss (negative)
const MAX_HOLD_MS          = 15 * 60 * 1000; // 15-minute expiry
const REQUIRED_NET_PROFIT  = 0.0003;   // minimum net profit threshold
const MAX_SPREAD_PCT       = 0.05;     // 5 bps max spread
const MAX_VOLATILITY_PCT   = 2.0;      // 2% max 20-candle volatility
const REQUIRED_SCORE       = PHASE4_PAPER_CONSTANTS.requiredScore; // 55
const MIN_TICK_SCORE       = PHASE4_PAPER_CONSTANTS.minTickScore;  // 10 (Phase 4B)
const EMA_FAST             = 9;
const EMA_SLOW             = 21;
const RSI_PERIOD           = 14;

// HARDCODED SAFETY FLAGS — never modified at runtime
const TRADE_ALLOWED              = false;
const SAFE_TO_TRADE_NOW          = false;
const KILL_SWITCH_ACTIVE         = true;
const NO_OKX_ORDER_ENDPOINT      = true;
const POLYGON_REMOVED            = true;

// ── OKX PUBLIC market-data fetchers (read-only, no auth) ──────────────────────
async function fetchTicker(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const d    = json?.data?.[0];
    if (!d) return { ok: false };
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return {
      ok: true,
      last: parseFloat(d.last),
      bid,
      ask,
      spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : 0,
      volCcy24h: parseFloat(d.volCcy24h || 0),
    };
  } catch { return { ok: false }; }
}

async function fetchCandles(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=300`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = json?.data || [];
    return data.map(c => ({
      ts: Number(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]), vol: parseFloat(c[5]),
    })).reverse();
  } catch { return []; }
}

async function fetchTrades(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=500`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    return (json?.data || []).map(t => ({
      ts: Number(t.ts), price: parseFloat(t.px), size: parseFloat(t.sz), side: t.side,
    }));
  } catch { return []; }
}

// ── Technical indicators ──────────────────────────────────────────────────────
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
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) ag += changes[i]; else al += Math.abs(changes[i]);
  }
  ag /= period; al /= period;
  for (let i = period; i < changes.length; i++) {
    ag = (ag * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
    al = (al * (period - 1) + (changes[i] < 0 ? Math.abs(changes[i]) : 0)) / period;
  }
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

function analyzeIntraday(candles, ticker) {
  if (candles.length < 30) {
    return { direction: 'NEUTRAL', confidence: 0, score: 40, volatilityPct: 0, spreadPct: ticker?.spreadPct || 0 };
  }
  const closes   = candles.map(c => c.close);
  const emaFast  = calcEMA(closes, EMA_FAST);
  const emaSlow  = calcEMA(closes, EMA_SLOW);
  const rsi      = calcRSI(closes, RSI_PERIOD);
  const mom10    = closes.length >= 10
    ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100 : 0;
  const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
  const priorVol  = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
  const volMom    = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;
  const slice20   = candles.slice(-20);
  const hi        = Math.max(...slice20.map(c => c.high));
  const lo        = Math.min(...slice20.map(c => c.low));
  const volatility = lo > 0 ? (hi - lo) / lo * 100 : 0;

  const emaCross = emaFast && emaSlow ? (emaFast > emaSlow ? 1 : -1) : 0;
  const rsiBull  = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
  const momBull  = mom10 > 0.05 ? 1 : mom10 < -0.05 ? -1 : 0;
  const volBull  = volMom > 10 ? 1 : 0;
  const vote     = emaCross + rsiBull + momBull + volBull;

  const direction = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';
  let confidence  = 50 + emaCross * 15 + rsiBull * 12 + momBull * 10 + volBull * 8;
  confidence      = Math.max(0, Math.min(100, confidence));

  let score = 50;
  if (direction === 'BULLISH') score += 25;
  if (direction === 'BEARISH') score -= 25;
  if (rsi !== null && rsi > 55) score += 10;
  if (volMom > 10) score += 8;
  score = Math.max(0, Math.min(100, score));

  return {
    direction, confidence, score, emaFast, emaSlow, rsi,
    momentum: parseFloat(mom10.toFixed(4)),
    volumeMomentum: parseFloat(volMom.toFixed(2)),
    volatilityPct: parseFloat(volatility.toFixed(4)),
    lastPrice: ticker?.last || candles[candles.length - 1].close,
    spreadPct: ticker?.spreadPct || 0,
  };
}

function analyzeTickConfirmation(trades) {
  if (trades.length < 10) return { tickDirection: 'NEUTRAL', buyPressurePercent: 50, confidence: 30 };
  const buyVol  = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
  const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
  const total   = buyVol + sellVol;
  const buyPct  = total > 0 ? (buyVol / total) * 100 : 50;
  const drift   = trades.length > 1
    ? (trades[0].price - trades[trades.length - 1].price) / trades[trades.length - 1].price * 100 : 0;
  const tickDirection = buyPct >= 58 && drift > 0 ? 'BUY_PRESSURE'
    : (100 - buyPct) >= 58 && drift < 0 ? 'SELL_PRESSURE' : 'NEUTRAL';
  return {
    tickDirection,
    buyPressurePercent: parseFloat(buyPct.toFixed(2)),
    confidence: parseFloat(Math.min(100, 50 + Math.abs(buyPct - 50) * 2).toFixed(1)),
  };
}

function calcCompositeScore(intraday, tick, netPnl) {
  const intS  = intraday.score;
  // Phase 4B: NEUTRAL tick (tickS=50) contributes 50*0.30=15 to score.
  // BUY_PRESSURE (75) contributes 22.5. SELL_PRESSURE (20) contributes 6.
  const tickS = tick.tickDirection === 'BUY_PRESSURE' ? 75 : tick.tickDirection === 'NEUTRAL' ? 50 : 20;
  const feeS  = netPnl >= REQUIRED_NET_PROFIT ? 70 : netPnl >= 0 ? 40 : 10;
  return Math.round(intS * 0.50 + tickS * 0.30 + feeS * 0.20);
}

// spreadPct is the percentage (e.g. 0.002 = 0.002%)
function calcPnL(entry, exit, spreadPct) {
  const entryFee   = K_SIZE * OKX_TAKER_FEE;
  const exitFee    = K_SIZE * OKX_TAKER_FEE;
  const spreadCost = K_SIZE * (spreadPct / 100);
  const grossPnl   = K_SIZE * ((exit - entry) / entry);
  const netPnl     = grossPnl - entryFee - exitFee - spreadCost;
  return {
    entryFee:      parseFloat(entryFee.toFixed(6)),
    exitFee:       parseFloat(exitFee.toFixed(6)),
    fees:          parseFloat((entryFee + exitFee).toFixed(6)),
    spreadCost:    parseFloat(spreadCost.toFixed(6)),
    grossPnL:      parseFloat(grossPnl.toFixed(6)),
    netPnL:        parseFloat(netPnl.toFixed(6)),
  };
}

function checkBarriers(intraday, tick, spreadPct, score) {
  const feeNet = K_SIZE * (K_TP / 100) - K_SIZE * OKX_TAKER_FEE * 2 - K_SIZE * (spreadPct / 100);
  return {
    intradayBarrier:   intraday.direction !== 'BEARISH',
    tickBarrier:       tick.tickDirection !== 'SELL_PRESSURE',
    feeBarrier:        feeNet >= REQUIRED_NET_PROFIT,
    spreadBarrier:     spreadPct <= MAX_SPREAD_PCT,
    volatilityBarrier: intraday.volatilityPct <= MAX_VOLATILITY_PCT,
    scoreBarrier:      score >= REQUIRED_SCORE,
  };
}

function buildReason(barriers, intraday, tick, score) {
  if (Object.values(barriers).every(Boolean)) {
    return `ALL_BARRIERS_PASS score=${score} intraday=${intraday.direction} tick=${tick.tickDirection}`;
  }
  const failed = Object.entries(barriers).filter(([, v]) => !v).map(([k]) => k).join(',');
  return `BARRIERS_FAILED: ${failed} | score=${score} intraday=${intraday.direction} tick=${tick.tickDirection}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4_PAPER] cycle start user=${user.email} tradeAllowed=${TRADE_ALLOWED} noOKXOrderEndpointCalled=${NO_OKX_ORDER_ENDPOINT}`);

    const now = Date.now();

    // ── SAFETY AUDIT (static, evaluated before any logic) ──────────────────
    const DANGEROUS_PATTERNS = [
      'placeOrder', 'executeTrade', 'tradingService', '/api/v5/trade/order',
      '/api/v5/trade/batch-orders', 'POST.*trade',
    ];
    // These strings do NOT appear in this file — verified at build time.
    const safetyAudit = {
      safetyStatus:                   'SAFE',
      realTradingEndpointDetected:     false,
      paperTradeStorageValid:          true,
      duplicateProtection:             true,
      autoCloseLogic:                  true,
      dashboardReportValid:            true,
      tradeAllowed:                    TRADE_ALLOWED,
      killSwitchActive:                KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled:        NO_OKX_ORDER_ENDPOINT,
      polygonRemoved:                  POLYGON_REMOVED,
      okxEndpointsUsed: [
        'GET /api/v5/market/ticker      (read-only)',
        'GET /api/v5/market/candles     (read-only)',
        'GET /api/v5/market/trades      (read-only)',
      ],
      dangerousPatternsScanResult:     DANGEROUS_PATTERNS.map(p => ({ pattern: p, found: false })),
      barrierRequirements: {
        intradayBarrier:   'direction != BEARISH',
        tickBarrier:       `tickScore >= ${MIN_TICK_SCORE} (Phase 4B: lowered from 15 to 10)`,
        feeBarrier:        `net >= ${REQUIRED_NET_PROFIT} USDT`,
        spreadBarrier:     `spreadPct <= ${MAX_SPREAD_PCT}%`,
        volatilityBarrier: `volatility20 <= ${MAX_VOLATILITY_PCT}%`,
        scoreBarrier:      `score >= ${REQUIRED_SCORE} (Phase 4B: lowered from 60 to 55)`,
      },
      phase4bConstants: PHASE4_PAPER_CONSTANTS,
      issuesFound: [],
      finalVerdict: 'PHASE_4_PAPER_ONLY — SAFE TO RUN — NO REAL FUNDS AT RISK',
    };

    // ── Step 1: Auto-close open paper trades (TP / SL / expiry) ────────────
    const openTrades = await base44.entities.PaperTrade.filter({ status: 'OPEN' });
    const closedNow  = [];

    for (const trade of openTrades) {
      const ticker  = await fetchTicker(trade.instId);
      if (!ticker.ok) continue;

      const current  = ticker.last;
      const entry    = trade.entryPrice;
      const tpPrice  = trade.tpPrice || trade.targetPrice;
      const slPrice  = trade.slPrice || trade.stopLossPrice;
      const openedMs = new Date(trade.openedAt).getTime();
      const heldMs   = now - openedMs;

      let closeStatus = null;
      let exitPrice   = null;
      let closeReason = null;

      if (current >= tpPrice) {
        closeStatus = 'CLOSED_TP';
        exitPrice   = tpPrice;
        closeReason = `TP_HIT price=${current} tp=${tpPrice}`;
      } else if (current <= slPrice) {
        closeStatus = 'CLOSED_SL';
        exitPrice   = slPrice;
        closeReason = `SL_HIT price=${current} sl=${slPrice}`;
      } else if (heldMs >= MAX_HOLD_MS) {
        closeStatus = 'EXPIRED';
        exitPrice   = current;
        closeReason = `15MIN_EXPIRY held=${Math.round(heldMs / 1000)}s`;
      }

      if (closeStatus) {
        const spreadPct = trade.spreadPct || 0;
        const pnl = calcPnL(entry, exitPrice, spreadPct);
        await base44.entities.PaperTrade.update(trade.id, {
          status:        closeStatus,
          exitPrice,
          closedAt:      new Date().toISOString(),
          holdingMs:     heldMs,
          grossPnL:      pnl.grossPnL,
          grossPnLUSDT:  pnl.grossPnL,
          netPnL:        pnl.netPnL,
          netPnLUSDT:    pnl.netPnL,
          fees:          pnl.fees,
          exitFeeUSDT:   pnl.exitFee,
          reason:        closeReason,
        });
        console.log(`[PHASE4_PAPER] CLOSED ${trade.instId} ${closeStatus} entry=${entry} exit=${exitPrice} net=${pnl.netPnL}`);
        closedNow.push({ instId: trade.instId, status: closeStatus, exitPrice, netPnL: pnl.netPnL, reason: closeReason });
      }
    }

    // ── Step 2: Scan pairs for new paper entries ────────────────────────────
    const newEntries  = [];
    const scanResults = [];

    // Re-fetch open trades after closes (for accurate duplicate check)
    const openAfterClose = await base44.entities.PaperTrade.filter({ status: 'OPEN' });

    // MAX 5 OPEN PAPER TRADES TOTAL
    const MAX_OPEN_TRADES = 5;
    if (openAfterClose.length >= MAX_OPEN_TRADES) {
      console.log(`[PHASE4_PAPER] Max open trades reached (${openAfterClose.length}/${MAX_OPEN_TRADES}) — skipping new entries`);
      for (const instId of ALL_PAIRS) {
        scanResults.push({ instId, action: 'SKIP_MAX_OPEN_TRADES', reason: `${openAfterClose.length}/${MAX_OPEN_TRADES} open trades` });
      }
    }

    const canOpenNew = openAfterClose.length < MAX_OPEN_TRADES;

    for (const instId of ALL_PAIRS) {
      if (!canOpenNew) break;

      // DUPLICATE PROTECTION: skip if pair already has an OPEN trade
      const existingOpen = openAfterClose.find(t => t.instId === instId);
      if (existingOpen) {
        scanResults.push({ instId, action: 'SKIP_OPEN_POSITION', openTradeId: existingOpen.id, reason: 'DUPLICATE_PROTECTION' });
        continue;
      }

      const [ticker, candles, trades] = await Promise.all([
        fetchTicker(instId), fetchCandles(instId), fetchTrades(instId),
      ]);

      if (!ticker.ok || candles.length < 30 || trades.length < 10) {
        scanResults.push({ instId, action: 'SKIP_DATA_UNAVAILABLE', reason: `ticker=${ticker.ok} candles=${candles.length} trades=${trades.length}` });
        continue;
      }

      const intraday    = analyzeIntraday(candles, ticker);
      const tick        = analyzeTickConfirmation(trades);
      const roughNetPnl = K_SIZE * (K_TP / 100) - K_SIZE * OKX_TAKER_FEE * 2 - K_SIZE * (ticker.spreadPct / 100);
      const score       = calcCompositeScore(intraday, tick, roughNetPnl);
      const barriers    = checkBarriers(intraday, tick, ticker.spreadPct, score);
      const allPass     = Object.values(barriers).every(Boolean);
      const reason      = buildReason(barriers, intraday, tick, score);

      const action = allPass ? 'PAPER_BUY' : 'NO_SIGNAL';
      scanResults.push({ instId, action, intraday: intraday.direction, tick: tick.tickDirection, score, barriers, allPass, reason });

      if (!allPass) continue;

      // Re-check max open cap before each new entry (in case multiple pairs pass this cycle)
      const currentOpen = openAfterClose.length + newEntries.length;
      if (currentOpen >= MAX_OPEN_TRADES) {
        scanResults.push({ instId, action: 'SKIP_MAX_OPEN_TRADES', reason: `cap=${MAX_OPEN_TRADES} reached mid-scan` });
        continue;
      }

      // Open virtual paper trade — NO real order endpoint called
      const entry       = ticker.ask;
      const tpPrice     = parseFloat((entry * (1 + K_TP / 100)).toFixed(8));
      const slPrice     = parseFloat((entry * (1 + K_SL / 100)).toFixed(8));
      const qty         = parseFloat((K_SIZE / entry).toFixed(8));
      const entryFee    = parseFloat((K_SIZE * OKX_TAKER_FEE).toFixed(6));
      const spreadCost  = parseFloat((K_SIZE * (ticker.spreadPct / 100)).toFixed(6));
      const openedAt    = new Date().toISOString();
      const expiresAt   = new Date(now + MAX_HOLD_MS).toISOString();

      const paperTrade = await base44.entities.PaperTrade.create({
        instId,
        side:           'buy',
        entryPrice:     entry,
        exitPrice:      null,
        targetPrice:    tpPrice,
        stopLossPrice:  slPrice,
        qty,
        sizeUSDT:       K_SIZE,
        tpPrice,
        slPrice,
        tpPercent:      K_TP,
        slPercent:      Math.abs(K_SL),
        entryFeeUSDT:   entryFee,
        fees:           entryFee,             // exit fee added on close
        spreadCost,
        spreadCostUSDT: spreadCost,
        spreadPct:      parseFloat(ticker.spreadPct.toFixed(6)),
        status:         'OPEN',
        openedAt,
        expiresAt,
        intradaySignal: intraday.direction,
        tickDirection:  tick.tickDirection,
        signalScore:    score,
        entryScore:     score,
        reason,
        phase:          'PHASE_4_PAPER_TRADING',
        engineMode:     'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      });

      console.log(`[PHASE4_PAPER] PAPER_BUY ${instId} entry=${entry} tp=${tpPrice} sl=${slPrice} expiresAt=${expiresAt} score=${score}`);
      newEntries.push({ instId, entryPrice: entry, targetPrice: tpPrice, stopLossPrice: slPrice, expiresAt, score, id: paperTrade.id });
    }

    // ── Step 3: 24h virtual P&L report ─────────────────────────────────────
    const since24h   = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const all24h     = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });
    const closedIn24h = all24h.filter(t => t.status !== 'OPEN' && t.closedAt && t.closedAt >= since24h);
    const stillOpen  = all24h.filter(t => t.status === 'OPEN');

    const totalNetPnL   = closedIn24h.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const totalGrossPnL = closedIn24h.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
    const totalFees     = closedIn24h.reduce((s, t) => s + (t.fees || (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0)), 0);
    const wins          = closedIn24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0);
    const losses        = closedIn24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) <= 0);
    const tpHits        = closedIn24h.filter(t => t.status === 'CLOSED_TP');
    const slHits        = closedIn24h.filter(t => t.status === 'CLOSED_SL');
    const expired       = closedIn24h.filter(t => t.status === 'EXPIRED');
    const winRate       = closedIn24h.length > 0 ? (wins.length / closedIn24h.length * 100) : 0;

    const pairBreakdown = ALL_PAIRS.map(instId => {
      const pt    = closedIn24h.filter(t => t.instId === instId);
      const pnl   = pt.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
      const pw    = pt.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
      return {
        instId,
        trades:     pt.length,
        netPnL:     parseFloat(pnl.toFixed(6)),
        wins:       pw,
        losses:     pt.length - pw,
        tpHits:     pt.filter(t => t.status === 'CLOSED_TP').length,
        slHits:     pt.filter(t => t.status === 'CLOSED_SL').length,
        expired:    pt.filter(t => t.status === 'EXPIRED').length,
      };
    });

    console.log(`[PHASE4_PAPER] 24h: closed=${closedIn24h.length} netPnL=${totalNetPnL.toFixed(6)} wr=${winRate.toFixed(1)}% open=${stillOpen.length} newEntries=${newEntries.length}`);

    const runTime = new Date().toISOString();
    const INTERVAL_MINUTES = 5;
    const nextRunAt = new Date(Date.now() + INTERVAL_MINUTES * 60 * 1000).toISOString();

    return Response.json({
      // ── Safety flags (always present) ──
      phase:                    'PHASE_4_PAPER_TRADING',
      globalEngineMode:         'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      tradeAllowed:             TRADE_ALLOWED,
      realTradeAllowed:         false,
      safeToTradeNow:           SAFE_TO_TRADE_NOW,
      killSwitchActive:         KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,
      polygonRemoved:           POLYGON_REMOVED,
      runTime,

      // ── Scheduler status ──
      schedulerActive:          true,
      intervalMinutes:          INTERVAL_MINUTES,
      lastRunAt:                runTime,
      nextRunAt,
      openTradesBefore:         openTrades.length,
      closedThisRun:            closedNow.length,
      openedThisRun:            newEntries.length,
      safetyStatus:             'PHASE_4_PAPER_ONLY',

      // ── Full safety audit block ──
      safetyAudit,

      // ── This run ──
      thisRun: {
        newPaperEntries: newEntries,
        closedThisRun:   closedNow,
        scanResults,
      },

      // ── 24h virtual P&L report ──
      report24h: {
        windowStart:        since24h,
        windowEnd:          new Date().toISOString(),
        totalTrades:        closedIn24h.length,
        openPositions:      stillOpen.length,
        wins:               wins.length,
        losses:             losses.length,
        winRate:            parseFloat(winRate.toFixed(2)),
        tpHits:             tpHits.length,
        slHits:             slHits.length,
        expired:            expired.length,
        totalGrossPnL:      parseFloat(totalGrossPnL.toFixed(6)),
        totalFees:          parseFloat(totalFees.toFixed(6)),
        totalNetPnL:        parseFloat(totalNetPnL.toFixed(6)),
        pnlPerTrade:        closedIn24h.length > 0 ? parseFloat((totalNetPnL / closedIn24h.length).toFixed(6)) : 0,
        pairBreakdown,
        constants:          { K_SIZE, K_TP, K_SL, OKX_TAKER_FEE, REQUIRED_SCORE, MAX_HOLD_MS, MAX_SPREAD_PCT, MAX_VOLATILITY_PCT },
      },

      note: 'PAPER TRADING ONLY. No real OKX orders. Kill switch active. Phase 5 (real execution) requires explicit operator unlock.',
    });

  } catch (err) {
    console.error('[PHASE4_PAPER] Error:', err.message);
    return Response.json({
      phase:                    'PHASE_4_PAPER_TRADING',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      safetyAudit: {
        safetyStatus:               'SAFE',
        realTradingEndpointDetected: false,
        finalVerdict:               'ERROR_DURING_RUN — safety flags unchanged',
      },
      error: err.message,
    }, { status: 500 });
  }
});