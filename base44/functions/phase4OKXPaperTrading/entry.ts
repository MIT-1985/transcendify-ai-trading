/**
 * phase4OKXPaperTrading — PHASE 4 OKX-ONLY PAPER TRADING SIMULATOR
 *
 * System:   OKX_ONLY_INTRADAY_TRADING_ENGINE
 * Phase:    PHASE_4_PAPER_TRADING
 * Trading:  PAPER ONLY — no real OKX order endpoint called
 * Orders:   NONE — noOKXOrderEndpointCalled = true always
 * Kill Switch: ACTIVE — tradeAllowed = false always (real)
 *
 * Flow:
 *   1. Run phase3OKXOnlyReadOnlySignalValidator signal logic inline
 *   2. If pair has PAPER_SIGNAL_ONLY → open virtual paper trade
 *   3. Check all open paper trades against current price → close TP/SL
 *   4. Return 24h virtual P&L report
 *
 * Stores paper trades in PaperTrade entity (virtual only).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALL_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

const OKX_TAKER_FEE       = 0.001;
const K_SIZE               = 10;       // USDT per trade
const K_TP                 = 0.30;     // % take profit
const K_SL                 = -0.20;    // % stop loss (negative)
const MAX_HOLD_MS          = 15 * 60 * 1000; // 15 minutes max hold
const REQUIRED_NET_PROFIT  = 0.0003;
const MAX_SPREAD_PCT        = 0.05;
const MAX_VOLATILITY_PCT    = 2.0;
const REQUIRED_SCORE        = 60;
const EMA_FAST              = 9;
const EMA_SLOW              = 21;
const RSI_PERIOD            = 14;

// ── OKX fetchers ──────────────────────────────────────────────────────────────
async function fetchTicker(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const d    = json?.data?.[0];
    if (!d) return { ok: false };
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return { ok: true, last: parseFloat(d.last), bid, ask,
      spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : 0,
      volCcy24h: parseFloat(d.volCcy24h || 0) };
  } catch { return { ok: false }; }
}

async function fetchCandles(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=300`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const data = json?.data || [];
    return data.map(c => ({ ts: Number(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]), vol: parseFloat(c[5]) })).reverse();
  } catch { return []; }
}

async function fetchTrades(instId) {
  try {
    const res  = await fetch(`https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=500`, { signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    return (json?.data || []).map(t => ({ ts: Number(t.ts), price: parseFloat(t.px), size: parseFloat(t.sz), side: t.side }));
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
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

function analyzeIntraday(candles, ticker) {
  if (candles.length < 30) return { direction: 'NEUTRAL', confidence: 0, score: 40, volatilityPct: 0, spreadPct: ticker?.spreadPct || 0 };
  const closes = candles.map(c => c.close);
  const last   = candles[candles.length - 1];
  const emaFast  = calcEMA(closes, EMA_FAST);
  const emaSlow  = calcEMA(closes, EMA_SLOW);
  const rsi      = calcRSI(closes, RSI_PERIOD);
  const mom10    = closes.length >= 10 ? (closes[closes.length-1] - closes[closes.length-10]) / closes[closes.length-10] * 100 : 0;
  const recentVol = candles.slice(-5).reduce((s,c) => s+c.vol, 0) / 5;
  const priorVol  = candles.slice(-10,-5).reduce((s,c) => s+c.vol, 0) / 5;
  const volMom    = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;

  const slice20 = candles.slice(-20);
  const hi = Math.max(...slice20.map(c => c.high));
  const lo = Math.min(...slice20.map(c => c.low));
  const volatility = lo > 0 ? (hi - lo) / lo * 100 : 0;

  const emaCross = emaFast && emaSlow ? (emaFast > emaSlow ? 1 : -1) : 0;
  const rsiBull  = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
  const momBull  = mom10 > 0.05 ? 1 : mom10 < -0.05 ? -1 : 0;
  const volBull  = volMom > 10 ? 1 : 0;
  const vote     = emaCross + rsiBull + momBull + volBull;

  const direction = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';
  let confidence  = 50 + emaCross*15 + rsiBull*12 + momBull*10 + volBull*8;
  confidence      = Math.max(0, Math.min(100, confidence));

  let score = 50;
  if (direction === 'BULLISH') score += 25;
  if (direction === 'BEARISH') score -= 25;
  if (rsi !== null && rsi > 55) score += 10;
  if (volMom > 10) score += 8;
  score = Math.max(0, Math.min(100, score));

  return { direction, confidence, score, emaFast, emaSlow, rsi, momentum: parseFloat(mom10.toFixed(4)),
    volumeMomentum: parseFloat(volMom.toFixed(2)), volatilityPct: parseFloat(volatility.toFixed(4)),
    lastPrice: ticker?.last || last.close, spreadPct: ticker?.spreadPct || 0 };
}

function analyzeTickConfirmation(trades) {
  if (trades.length < 10) return { tickDirection: 'NEUTRAL', buyPressurePercent: 50, confidence: 30 };
  const buyVol  = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
  const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
  const total   = buyVol + sellVol;
  const buyPct  = total > 0 ? (buyVol / total) * 100 : 50;
  const drift   = trades.length > 1 ? (trades[0].price - trades[trades.length-1].price) / trades[trades.length-1].price * 100 : 0;
  const tickDirection = buyPct >= 58 && drift > 0 ? 'BUY_PRESSURE' : (100-buyPct) >= 58 && drift < 0 ? 'SELL_PRESSURE' : 'NEUTRAL';
  return { tickDirection, buyPressurePercent: parseFloat(buyPct.toFixed(2)), confidence: parseFloat(Math.min(100, 50 + Math.abs(buyPct-50)*2).toFixed(1)) };
}

function calcCompositeScore(intraday, tick, spreadPct, netPnl) {
  const intS  = intraday.score;
  const tickS = tick.tickDirection === 'BUY_PRESSURE' ? 75 : tick.tickDirection === 'NEUTRAL' ? 50 : 20;
  const feeS  = netPnl >= REQUIRED_NET_PROFIT ? 70 : netPnl >= 0 ? 40 : 10;
  return Math.round(intS * 0.50 + tickS * 0.30 + feeS * 0.20);
}

function calcFees(entry, exit, spreadPct) {
  const entryFee  = K_SIZE * OKX_TAKER_FEE;
  const exitFee   = K_SIZE * OKX_TAKER_FEE;
  const spreadCost = K_SIZE * (spreadPct / 100);
  const grossPnl  = K_SIZE * ((exit - entry) / entry);
  const netPnl    = grossPnl - entryFee - exitFee - spreadCost;
  return { entryFee: parseFloat(entryFee.toFixed(6)), exitFee: parseFloat(exitFee.toFixed(6)),
    spreadCostUSDT: parseFloat(spreadCost.toFixed(6)), grossPnLUSDT: parseFloat(grossPnl.toFixed(6)),
    netPnLUSDT: parseFloat(netPnl.toFixed(6)) };
}

function checkBarriers(intraday, tick, spreadPct, score) {
  return {
    intradayBarrier:   intraday.direction !== 'BEARISH',
    tickBarrier:       tick.tickDirection !== 'SELL_PRESSURE',
    feeBarrier:        (K_SIZE * K_TP/100 - K_SIZE*OKX_TAKER_FEE*2 - K_SIZE*(spreadPct/100)) >= REQUIRED_NET_PROFIT,
    spreadBarrier:     spreadPct <= MAX_SPREAD_PCT,
    volatilityBarrier: intraday.volatilityPct <= MAX_VOLATILITY_PCT,
    scoreBarrier:      score >= REQUIRED_SCORE,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4_PAPER] Started. user=${user.email} tradeAllowed=false noOKXOrderEndpointCalled=true`);

    const now = Date.now();

    // ── Step 1: Close expired / TP / SL open paper trades ──
    const openTrades = await base44.entities.PaperTrade.filter({ status: 'open' });
    const closedNow  = [];

    for (const trade of openTrades) {
      const ticker = await fetchTicker(trade.instId);
      if (!ticker.ok) continue;

      const current   = ticker.last;
      const entry     = trade.entryPrice;
      const tpPrice   = trade.tpPrice;
      const slPrice   = trade.slPrice;
      const openedMs  = new Date(trade.openedAt).getTime();
      const heldMs    = now - openedMs;

      let closeStatus = null;
      let exitPrice   = null;

      if (current >= tpPrice) {
        closeStatus = 'closed_tp';
        exitPrice   = tpPrice;
      } else if (current <= slPrice) {
        closeStatus = 'closed_sl';
        exitPrice   = slPrice;
      } else if (heldMs >= MAX_HOLD_MS) {
        closeStatus = 'expired';
        exitPrice   = current;
      }

      if (closeStatus) {
        const fees = calcFees(entry, exitPrice, trade.spreadCostUSDT ? (trade.spreadCostUSDT / K_SIZE * 100) : 0.002);
        await base44.entities.PaperTrade.update(trade.id, {
          status:       closeStatus,
          exitPrice,
          closedAt:     new Date().toISOString(),
          holdingMs:    heldMs,
          grossPnLUSDT: fees.grossPnLUSDT,
          netPnLUSDT:   fees.netPnLUSDT,
          exitFeeUSDT:  fees.exitFee,
        });
        console.log(`[PHASE4_PAPER] Closed ${trade.instId} ${closeStatus} entry=${entry} exit=${exitPrice} net=${fees.netPnLUSDT}`);
        closedNow.push({ instId: trade.instId, status: closeStatus, exitPrice, netPnLUSDT: fees.netPnLUSDT });
      }
    }

    // ── Step 2: Scan pairs for new paper signal entries ──
    const newEntries  = [];
    const scanResults = [];

    for (const instId of ALL_PAIRS) {
      // Skip if already have an open trade for this pair
      const existingOpen = openTrades.find(t => t.instId === instId && t.status === 'open');
      if (existingOpen) {
        scanResults.push({ instId, action: 'SKIP_OPEN_POSITION', openTradeId: existingOpen.id });
        continue;
      }

      const [ticker, candles, trades] = await Promise.all([
        fetchTicker(instId), fetchCandles(instId), fetchTrades(instId),
      ]);

      if (!ticker.ok || candles.length < 30 || trades.length < 10) {
        scanResults.push({ instId, action: 'SKIP_DATA_UNAVAILABLE' });
        continue;
      }

      const intraday = analyzeIntraday(candles, ticker);
      const tick     = analyzeTickConfirmation(trades);

      // Fee estimate for barrier check
      const roughNetPnl = K_SIZE*(K_TP/100) - K_SIZE*OKX_TAKER_FEE*2 - K_SIZE*(ticker.spreadPct/100);
      const score       = calcCompositeScore(intraday, tick, ticker.spreadPct, roughNetPnl);
      const barriers    = checkBarriers(intraday, tick, ticker.spreadPct, score);
      const allPass     = Object.values(barriers).every(Boolean);

      const action = allPass ? 'PAPER_BUY' : 'NO_SIGNAL';
      scanResults.push({ instId, action, intraday: intraday.direction, tick: tick.tickDirection, score, barriers, allPass });

      if (!allPass) continue;

      // Open paper trade
      const entry      = ticker.ask; // simulate market buy at ask
      const tpPrice    = parseFloat((entry * (1 + K_TP / 100)).toFixed(8));
      const slPrice    = parseFloat((entry * (1 + K_SL / 100)).toFixed(8));
      const qty        = parseFloat((K_SIZE / entry).toFixed(8));
      const entryFee   = K_SIZE * OKX_TAKER_FEE;
      const spreadCost = K_SIZE * (ticker.spreadPct / 100);

      const paperTrade = await base44.entities.PaperTrade.create({
        instId,
        side:             'buy',
        entryPrice:       entry,
        exitPrice:        null,
        qty,
        sizeUSDT:         K_SIZE,
        tpPrice,
        slPrice,
        tpPercent:        K_TP,
        slPercent:        Math.abs(K_SL),
        entryFeeUSDT:     parseFloat(entryFee.toFixed(6)),
        spreadCostUSDT:   parseFloat(spreadCost.toFixed(6)),
        status:           'open',
        openedAt:         new Date().toISOString(),
        intradaySignal:   intraday.direction,
        tickDirection:    tick.tickDirection,
        entryScore:       score,
        phase:            'PHASE_4_PAPER_TRADING',
        engineMode:       'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      });

      console.log(`[PHASE4_PAPER] NEW PAPER BUY ${instId} entry=${entry} tp=${tpPrice} sl=${slPrice} score=${score}`);
      newEntries.push({ instId, entryPrice: entry, tpPrice, slPrice, score, id: paperTrade.id });
    }

    // ── Step 3: 24h virtual P&L report ──
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const all24h   = await base44.entities.PaperTrade.filter({ phase: 'PHASE_4_PAPER_TRADING' });

    const closedIn24h = all24h.filter(t =>
      t.status !== 'open' && t.closedAt && t.closedAt >= since24h
    );
    const stillOpen = all24h.filter(t => t.status === 'open');

    const totalNetPnL    = closedIn24h.reduce((s, t) => s + (t.netPnLUSDT || 0), 0);
    const totalGrossPnL  = closedIn24h.reduce((s, t) => s + (t.grossPnLUSDT || 0), 0);
    const totalFees      = closedIn24h.reduce((s, t) => s + (t.entryFeeUSDT || 0) + (t.exitFeeUSDT || 0), 0);
    const wins           = closedIn24h.filter(t => (t.netPnLUSDT || 0) > 0);
    const losses         = closedIn24h.filter(t => (t.netPnLUSDT || 0) <= 0);
    const tpHits         = closedIn24h.filter(t => t.status === 'closed_tp');
    const slHits         = closedIn24h.filter(t => t.status === 'closed_sl');
    const expired        = closedIn24h.filter(t => t.status === 'expired');
    const winRate        = closedIn24h.length > 0 ? (wins.length / closedIn24h.length * 100) : 0;

    // Per-pair breakdown
    const pairBreakdown = ALL_PAIRS.map(instId => {
      const pairTrades = closedIn24h.filter(t => t.instId === instId);
      const pairPnl    = pairTrades.reduce((s, t) => s + (t.netPnLUSDT || 0), 0);
      const pairWins   = pairTrades.filter(t => (t.netPnLUSDT || 0) > 0).length;
      return {
        instId,
        trades:      pairTrades.length,
        netPnLUSDT:  parseFloat(pairPnl.toFixed(6)),
        wins:        pairWins,
        losses:      pairTrades.length - pairWins,
        tpHits:      pairTrades.filter(t => t.status === 'closed_tp').length,
        slHits:      pairTrades.filter(t => t.status === 'closed_sl').length,
      };
    });

    console.log(`[PHASE4_PAPER] 24h report: closed=${closedIn24h.length} netPnL=${totalNetPnL.toFixed(6)} winRate=${winRate.toFixed(1)}% newEntries=${newEntries.length}`);

    return Response.json({
      phase:                    'PHASE_4_PAPER_TRADING',
      globalEngineMode:         'OKX_ONLY_INTRADAY_PLUS_TRADES_CONFIRMATION',
      tradeAllowed:             false,
      safeToTradeNow:           false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      polygonRemoved:           true,
      runTime:                  new Date().toISOString(),

      thisRun: {
        newPaperEntries:  newEntries,
        closedThisRun:    closedNow,
        scanResults,
      },

      report24h: {
        windowStart:    since24h,
        windowEnd:      new Date().toISOString(),
        totalTrades:    closedIn24h.length,
        openPositions:  stillOpen.length,
        wins:           wins.length,
        losses:         losses.length,
        winRate:        parseFloat(winRate.toFixed(2)),
        tpHits:         tpHits.length,
        slHits:         slHits.length,
        expired:        expired.length,
        totalGrossPnLUSDT:  parseFloat(totalGrossPnL.toFixed(6)),
        totalFeesUSDT:      parseFloat(totalFees.toFixed(6)),
        totalNetPnLUSDT:    parseFloat(totalNetPnL.toFixed(6)),
        pnlPerTrade:        closedIn24h.length > 0 ? parseFloat((totalNetPnL / closedIn24h.length).toFixed(6)) : 0,
        pairBreakdown,
        constants: { K_SIZE, K_TP, K_SL, OKX_TAKER_FEE, REQUIRED_SCORE, MAX_HOLD_MS },
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
      error:                    err.message,
    }, { status: 500 });
  }
});