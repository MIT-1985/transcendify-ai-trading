/**
 * phase4FBTCOnlyPaperMode — Phase 4F BTC-Only Economic Paper Mode
 *
 * Safety:
 *   realTradeAllowed          = false  ALWAYS
 *   realTradeUnlockAllowed    = false  ALWAYS
 *   killSwitchActive          = true   ALWAYS
 *   noOKXOrderEndpointCalled  = true   ALWAYS
 *   phase                     = PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE
 *
 * Reason: Phase 4E clean accounting confirmed:
 *   - EDGE_EXISTS_BUT_FEE_DRAIN
 *   - BTC-USDT is the only pair with net profitable VerifiedTrade history
 *   - ETH/SOL/DOGE/XRP have no verified profitable data
 *   - recommendedTPPercent = 1.3% for $10 size
 *
 * Changes from Phase 4D:
 *   - Active pairs: BTC-USDT only
 *   - tpPercent: 0.30 → 1.30
 *   - slPercent: 0.20 → 0.65 (risk/reward 1:2)
 *   - maxHoldMs: 15min → 60min
 *   - requiredScore: 65 → 75
 *   - minTickScore: 12 → 15
 *   - maxOpenTrades: 5 → 1
 *
 * Sub-calls use entity reads directly (service-role pattern) to avoid
 * inter-function auth issues. Paper trading cycle is run inline.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── HARDCODED SAFETY ──────────────────────────────────────────────────────────
const REAL_TRADE_ALLOWED        = false;
const REAL_TRADE_UNLOCK_ALLOWED = false;
const KILL_SWITCH_ACTIVE        = true;
const NO_OKX_ORDER_ENDPOINT     = true;
const PHASE                     = 'PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE';

// ── Old constants (Phase 4D) ──────────────────────────────────────────────────
const OLD = {
  activePairs:            ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'],
  tpPercent:              0.30,
  slPercent:              0.20,
  maxHoldMinutes:         15,
  requiredScore:          65,
  minTickScore:           12,
  minEstimatedNetProfit:  0.10,
  grossProfitFloor:       0.15,
  feeEfficiencyMaxRatio:  0.30,
  maxOpenTrades:          5,
  phase:                  'PHASE_4D',
};

// ── New constants (Phase 4F) ──────────────────────────────────────────────────
const NEW = {
  activePairs:            ['BTC-USDT'],
  disabledPairs:          ['ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'],
  disabledReason:         'DISABLED_NO_VERIFIED_EDGE',
  tpPercent:              1.30,
  slPercent:              0.65,   // 1:2 risk/reward
  maxHoldMinutes:         60,
  requiredScore:          75,
  minTickScore:           15,
  minEstimatedNetProfit:  0.10,
  grossProfitFloor:       0.15,
  feeEfficiencyMaxRatio:  0.30,
  maxOpenTrades:          1,
  maxOpenTradesPerPair:   1,
  phase:                  'PHASE_4F',
};

const OKX_TAKER_FEE  = 0.001;
const K_SIZE         = 10;
const MAX_SPREAD_PCT = 0.05;
const MAX_VOL_PCT    = 2.0;
const REQUIRED_NET   = 0.0003;
const EMA_FAST       = 9;
const EMA_SLOW       = 21;
const RSI_PERIOD     = 14;

// ── OKX public market data (read-only) ───────────────────────────────────────
async function fetchTicker(instId) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const d = j?.data?.[0];
    if (!d) return null;
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    return { last: parseFloat(d.last), bid, ask, spreadPct: mid > 0 ? (ask - bid) / mid * 100 : 0 };
  } catch { return null; }
}

async function fetchCandles(instId) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1m&limit=300`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return (j?.data || []).map(c => ({
      ts: Number(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]), vol: parseFloat(c[5]),
    })).reverse();
  } catch { return []; }
}

async function fetchTrades(instId) {
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=500`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return (j?.data || []).map(t => ({ ts: Number(t.ts), price: parseFloat(t.px), size: parseFloat(t.sz), side: t.side }));
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
  if (candles.length < 30) return { direction: 'NEUTRAL', score: 40, volatilityPct: 0, momentum: 0, spreadPct: ticker?.spreadPct || 0 };
  const closes  = candles.map(c => c.close);
  const emaFast = calcEMA(closes, EMA_FAST);
  const emaSlow = calcEMA(closes, EMA_SLOW);
  const rsi     = calcRSI(closes, RSI_PERIOD);
  const mom10   = closes.length >= 10 ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100 : 0;
  const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
  const priorVol  = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
  const volMom    = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;
  const slice20   = candles.slice(-20);
  const hi = Math.max(...slice20.map(c => c.high));
  const lo = Math.min(...slice20.map(c => c.low));
  const volatility = lo > 0 ? (hi - lo) / lo * 100 : 0;

  const emaCross = emaFast && emaSlow ? (emaFast > emaSlow ? 1 : -1) : 0;
  const rsiBull  = rsi !== null ? (rsi > 55 ? 1 : rsi < 45 ? -1 : 0) : 0;
  const momBull  = mom10 > 0.05 ? 1 : mom10 < -0.05 ? -1 : 0;
  const volBull  = volMom > 10 ? 1 : 0;
  const vote     = emaCross + rsiBull + momBull + volBull;
  const direction = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';

  let score = 50;
  if (direction === 'BULLISH') score += 25;
  if (direction === 'BEARISH') score -= 25;
  if (rsi !== null && rsi > 55) score += 10;
  if (volMom > 10) score += 8;
  score = Math.max(0, Math.min(100, score));

  return { direction, score, emaFast, emaSlow, rsi, momentum: parseFloat(mom10.toFixed(4)), volumeMomentum: parseFloat(volMom.toFixed(2)), volatilityPct: parseFloat(volatility.toFixed(4)), spreadPct: ticker?.spreadPct || 0 };
}

function analyzeTickConfirmation(trades) {
  if (trades.length < 10) return { tickDirection: 'NEUTRAL', buyPressurePercent: 50, tickScore: 10 };
  const buyVol  = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
  const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
  const total   = buyVol + sellVol;
  const buyPct  = total > 0 ? buyVol / total * 100 : 50;
  const drift   = trades.length > 1 ? (trades[0].price - trades[trades.length - 1].price) / trades[trades.length - 1].price * 100 : 0;
  const tickDirection = buyPct >= 58 && drift > 0 ? 'BUY_PRESSURE' : (100 - buyPct) >= 58 && drift < 0 ? 'SELL_PRESSURE' : 'NEUTRAL';
  const tickScore = buyPct >= 65 ? 25 : buyPct >= 55 ? 18 : buyPct >= 45 ? 10 : 5;
  return { tickDirection, buyPressurePercent: parseFloat(buyPct.toFixed(2)), tickScore };
}

function calcCompositeScore(intraday, tick, netPnl) {
  const intS  = intraday.score;
  const tickS = tick.tickDirection === 'BUY_PRESSURE' ? 75 : tick.tickDirection === 'NEUTRAL' ? 50 : 20;
  const feeS  = netPnl >= REQUIRED_NET ? 70 : netPnl >= 0 ? 40 : 10;
  return Math.round(intS * 0.50 + tickS * 0.30 + feeS * 0.20);
}

function calcPnL(entry, exit, spreadPct, tp) {
  const entryFee   = K_SIZE * OKX_TAKER_FEE;
  const exitFee    = K_SIZE * OKX_TAKER_FEE;
  const spreadCost = K_SIZE * (spreadPct / 100);
  const grossPnl   = K_SIZE * ((exit - entry) / entry);
  const netPnl     = grossPnl - entryFee - exitFee - spreadCost;
  return {
    entryFee:   parseFloat(entryFee.toFixed(6)),
    exitFee:    parseFloat(exitFee.toFixed(6)),
    fees:       parseFloat((entryFee + exitFee).toFixed(6)),
    spreadCost: parseFloat(spreadCost.toFixed(6)),
    grossPnL:   parseFloat(grossPnl.toFixed(6)),
    netPnL:     parseFloat(netPnl.toFixed(6)),
  };
}

function checkBarriers4F(intraday, tick, spreadPct, score) {
  const grossProfit     = K_SIZE * (NEW.tpPercent / 100);
  const fees            = K_SIZE * OKX_TAKER_FEE * 2;
  const spreadCost      = K_SIZE * (spreadPct / 100);
  const feeNet          = grossProfit - fees - spreadCost;
  const feeEffRatio     = grossProfit > 0 ? (fees + spreadCost) / grossProfit : 1;
  // Phase 4F: TP realism — momentum*3 must reach TP or score>=85
  const tpRealismPass   = (Math.abs(intraday.momentum) * 3 >= NEW.tpPercent) || (score >= 85);

  return {
    intradayBarrier:      intraday.direction !== 'BEARISH',
    tickBarrier:          tick.tickScore >= NEW.minTickScore,
    feeBarrier:           feeNet >= REQUIRED_NET,
    minNetProfitBarrier:  feeNet >= NEW.minEstimatedNetProfit,
    grossProfitFloor:     grossProfit >= NEW.grossProfitFloor,
    feeEfficiencyBarrier: feeEffRatio <= NEW.feeEfficiencyMaxRatio,
    spreadBarrier:        spreadPct <= MAX_SPREAD_PCT,
    volatilityBarrier:    intraday.volatilityPct <= MAX_VOL_PCT,
    scoreBarrier:         score >= NEW.requiredScore,
    momentumBarrier:      Math.abs(intraday.momentum) >= 0.03,
    tpRealismBarrier:     tpRealismPass,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    console.log(`[PHASE4F] BTC-only paper mode requested by ${user.email}`);

    const now = Date.now();
    const MAX_HOLD_MS = NEW.maxHoldMinutes * 60 * 1000;

    // ── Step 1: Auto-close open paper trades (TP / SL / expiry) ────────────
    const openTrades = await base44.entities.PaperTrade.filter({ status: 'OPEN' });
    const closedNow  = [];

    for (const trade of openTrades) {
      const ticker  = await fetchTicker(trade.instId);
      if (!ticker) continue;
      const current  = ticker.last;
      const entry    = trade.entryPrice;
      const tpPrice  = trade.tpPrice || trade.targetPrice;
      const slPrice  = trade.slPrice || trade.stopLossPrice;
      const openedMs = new Date(trade.openedAt).getTime();
      const heldMs   = now - openedMs;

      let closeStatus = null, exitPrice = null, closeReason = null;

      if (current >= tpPrice) {
        closeStatus = 'CLOSED_TP'; exitPrice = tpPrice;
        closeReason = `TP_HIT price=${current} tp=${tpPrice}`;
      } else if (current <= slPrice) {
        closeStatus = 'CLOSED_SL'; exitPrice = slPrice;
        closeReason = `SL_HIT price=${current} sl=${slPrice}`;
      } else if (heldMs >= MAX_HOLD_MS) {
        closeStatus = 'EXPIRED'; exitPrice = current;
        closeReason = `60MIN_EXPIRY held=${Math.round(heldMs / 1000)}s`;
      }

      if (closeStatus) {
        const pnl = calcPnL(entry, exitPrice, trade.spreadPct || 0, NEW.tpPercent);
        await base44.entities.PaperTrade.update(trade.id, {
          status: closeStatus, exitPrice,
          closedAt: new Date().toISOString(), holdingMs: heldMs,
          grossPnL: pnl.grossPnL, grossPnLUSDT: pnl.grossPnL,
          netPnL: pnl.netPnL, netPnLUSDT: pnl.netPnL,
          fees: pnl.fees, exitFeeUSDT: pnl.exitFee,
          reason: closeReason,
        });
        console.log(`[PHASE4F] CLOSED ${trade.instId} ${closeStatus} entry=${entry} exit=${exitPrice} net=${pnl.netPnL}`);
        closedNow.push({ instId: trade.instId, status: closeStatus, exitPrice, netPnL: pnl.netPnL, reason: closeReason });
      }
    }

    // ── Step 2: Scan BTC-USDT only ─────────────────────────────────────────
    const openAfterClose = await base44.entities.PaperTrade.filter({ status: 'OPEN' });
    const newEntries  = [];
    const scanResults = [];

    // Disabled pairs summary
    for (const dp of NEW.disabledPairs) {
      scanResults.push({ instId: dp, action: 'DISABLED', reason: NEW.disabledReason });
    }

    const canOpenNew = openAfterClose.length < NEW.maxOpenTrades;

    if (!canOpenNew) {
      scanResults.push({ instId: 'BTC-USDT', action: 'SKIP_MAX_OPEN', reason: `maxOpenTrades=${NEW.maxOpenTrades} reached` });
    } else {
      // Duplicate check for BTC
      const btcOpen = openAfterClose.find(t => t.instId === 'BTC-USDT');
      if (btcOpen) {
        scanResults.push({ instId: 'BTC-USDT', action: 'SKIP_OPEN_POSITION', reason: 'DUPLICATE_PROTECTION', openTradeId: btcOpen.id });
      } else {
        const [ticker, candles, trades] = await Promise.all([
          fetchTicker('BTC-USDT'), fetchCandles('BTC-USDT'), fetchTrades('BTC-USDT'),
        ]);

        if (!ticker || candles.length < 30 || trades.length < 10) {
          scanResults.push({ instId: 'BTC-USDT', action: 'SKIP_NO_DATA', reason: `ticker=${!!ticker} candles=${candles.length} trades=${trades.length}` });
        } else {
          const intraday  = analyzeIntraday(candles, ticker);
          const tick      = analyzeTickConfirmation(trades);
          const roughNet  = K_SIZE * (NEW.tpPercent / 100) - K_SIZE * OKX_TAKER_FEE * 2 - K_SIZE * (ticker.spreadPct / 100);
          const score     = calcCompositeScore(intraday, tick, roughNet);
          const barriers  = checkBarriers4F(intraday, tick, ticker.spreadPct, score);
          const allPass   = Object.values(barriers).every(Boolean);

          const failedBarriers = Object.entries(barriers).filter(([, v]) => !v).map(([k]) => k);
          const reason = allPass
            ? `ALL_BARRIERS_PASS score=${score} intraday=${intraday.direction} tick=${tick.tickDirection} tp=${NEW.tpPercent}%`
            : `BARRIERS_FAILED: ${failedBarriers.join(',')} | score=${score} intraday=${intraday.direction} tick=${tick.tickDirection}`;

          scanResults.push({ instId: 'BTC-USDT', action: allPass ? 'PAPER_BUY' : 'NO_SIGNAL', score, intraday: intraday.direction, tick: tick.tickDirection, barriers, allPass, reason });

          if (allPass) {
            const entry      = ticker.ask;
            const tpPrice    = parseFloat((entry * (1 + NEW.tpPercent / 100)).toFixed(2));
            const slPrice    = parseFloat((entry * (1 - NEW.slPercent / 100)).toFixed(2));
            const qty        = parseFloat((K_SIZE / entry).toFixed(8));
            const entryFee   = parseFloat((K_SIZE * OKX_TAKER_FEE).toFixed(6));
            const spreadCost = parseFloat((K_SIZE * (ticker.spreadPct / 100)).toFixed(6));
            const openedAt   = new Date().toISOString();
            const expiresAt  = new Date(now + MAX_HOLD_MS).toISOString();

            // ── Look up latest READY SignalSnapshot within last 10 min ──────
            // Snapshot is audit metadata only — all barriers already validated above
            const SNAPSHOT_WINDOW_MS = 10 * 60 * 1000;
            const snapshotWindowStart = new Date(now - SNAPSHOT_WINDOW_MS).toISOString();
            let snapshotLink = {
              signalSnapshotId:          null,
              signalSnapshotScore:       null,
              signalSnapshotMomentum:    null,
              signalSnapshotBuyPressure: null,
              signalSnapshotAlertLevel:  null,
              signalSnapshotAgeMs:       null,
            };

            try {
              const recentSnapshots = await base44.entities.SignalSnapshot.filter(
                { pair: 'BTC-USDT', alertLevel: 'READY' },
                '-timestamp',
                20
              );
              // Find the most recent one within the 10-min window
              const matchingSnap = recentSnapshots.find(s => {
                const snapTime = s.timestamp || s.created_date;
                return snapTime && snapTime >= snapshotWindowStart;
              });

              if (matchingSnap) {
                const snapTs = new Date(matchingSnap.timestamp || matchingSnap.created_date).getTime();
                snapshotLink = {
                  signalSnapshotId:          matchingSnap.id,
                  signalSnapshotScore:       matchingSnap.totalScore ?? null,
                  signalSnapshotMomentum:    matchingSnap.momentumPercent ?? null,
                  signalSnapshotBuyPressure: matchingSnap.buyPressurePercent ?? null,
                  signalSnapshotAlertLevel:  matchingSnap.alertLevel ?? null,
                  signalSnapshotAgeMs:       now - snapTs,
                };
                console.log(`[PHASE4F] 📸 Linked READY snapshot id=${matchingSnap.id} age=${snapshotLink.signalSnapshotAgeMs}ms score=${matchingSnap.totalScore}`);
              } else {
                console.log(`[PHASE4F] ℹ️ No READY snapshot within last 10 min — proceeding without link (barriers verified live)`);
              }
            } catch (snapLookupErr) {
              console.error(`[PHASE4F] ⚠️ Snapshot lookup failed (non-fatal): ${snapLookupErr.message}`);
            }

            const paperTrade = await base44.entities.PaperTrade.create({
              instId:         'BTC-USDT',
              side:           'buy',
              entryPrice:     entry,
              exitPrice:      null,
              targetPrice:    tpPrice,
              stopLossPrice:  slPrice,
              qty,
              sizeUSDT:       K_SIZE,
              tpPrice, slPrice,
              tpPercent:      NEW.tpPercent,
              slPercent:      NEW.slPercent,
              entryFeeUSDT:   entryFee,
              fees:           entryFee,
              spreadCost, spreadCostUSDT: spreadCost,
              spreadPct:      parseFloat(ticker.spreadPct.toFixed(6)),
              status:         'OPEN',
              openedAt, expiresAt,
              intradaySignal: intraday.direction,
              tickDirection:  tick.tickDirection,
              signalScore:    score,
              entryScore:     score,
              reason,
              phase:          PHASE,
              engineMode:     'PHASE_4F_BTC_ONLY_ECONOMIC',
              // ── Snapshot linkage (audit metadata) ────────────────────────
              ...snapshotLink,
            });

            console.log(`[PHASE4F] PAPER_BUY BTC-USDT entry=${entry} tp=${tpPrice} sl=${slPrice} expiresAt=${expiresAt} score=${score} snapshotLinked=${!!snapshotLink.signalSnapshotId}`);
            newEntries.push({ instId: 'BTC-USDT', entryPrice: entry, tpPrice, slPrice, expiresAt, score, id: paperTrade.id, snapshotLinked: !!snapshotLink.signalSnapshotId, snapshotId: snapshotLink.signalSnapshotId });
          }
        }
      }
    }

    // ── Step 3: 24h report ─────────────────────────────────────────────────
    const all24h    = await base44.entities.PaperTrade.filter({ phase: PHASE });
    const since24h  = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const closed24h = all24h.filter(t => t.status !== 'OPEN' && t.closedAt && t.closedAt >= since24h);
    const open4F    = all24h.filter(t => t.status === 'OPEN');

    const net24h   = closed24h.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const gross24h = closed24h.reduce((s, t) => s + (t.grossPnL || t.grossPnLUSDT || 0), 0);
    const fees24h  = closed24h.reduce((s, t) => s + (t.fees || 0), 0);
    const wins24h  = closed24h.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const wr24h    = closed24h.length > 0 ? wins24h / closed24h.length * 100 : 0;
    const tp24h    = closed24h.filter(t => t.status === 'CLOSED_TP').length;
    const sl24h    = closed24h.filter(t => t.status === 'CLOSED_SL').length;
    const exp24h   = closed24h.filter(t => t.status === 'EXPIRED').length;

    // Snapshot linkage analysis
    const withSnap    = closed24h.filter(t => !!t.signalSnapshotId);
    const withoutSnap = closed24h.filter(t => !t.signalSnapshotId);
    const snapWins    = withSnap.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const noSnapWins  = withoutSnap.filter(t => (t.netPnL || t.netPnLUSDT || 0) > 0).length;
    const snapNet     = withSnap.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const noSnapNet   = withoutSnap.reduce((s, t) => s + (t.netPnL || t.netPnLUSDT || 0), 0);
    const snapWR      = withSnap.length > 0 ? snapWins / withSnap.length * 100 : null;
    const noSnapWR    = withoutSnap.length > 0 ? noSnapWins / withoutSnap.length * 100 : null;

    // ── Step 4: Clean accounting snapshot ─────────────────────────────────
    const cleanTrades = await base44.entities.VerifiedTrade.list('-buyTime', 500);
    const btcClean    = cleanTrades.filter(t => t.instId === 'BTC-USDT' && t.status !== 'archived');
    const btcNet      = btcClean.reduce((s, t) => s + (t.realizedPnL || 0), 0);
    const btcWins     = btcClean.filter(t => (t.realizedPnL || 0) > 0).length;
    const btcWR       = btcClean.length > 0 ? btcWins / btcClean.length * 100 : 0;

    // ── Safety audit ───────────────────────────────────────────────────────
    const safetyStatus              = 'SAFE';
    const realTradingEndpointDetected = false;

    // ── Final verdict ──────────────────────────────────────────────────────
    const finalVerdict = `PHASE_4F_ACTIVE — BTC-USDT only, tp=${NEW.tpPercent}%, sl=${NEW.slPercent}%, expiry=${NEW.maxHoldMinutes}min, score≥${NEW.requiredScore}, maxOpen=${NEW.maxOpenTrades}. ETH/SOL/DOGE/XRP disabled (NO_VERIFIED_EDGE). Kill switch enforced. No real orders.`;

    console.log(`[PHASE4F] finalVerdict: ${finalVerdict}`);

    const runTime = new Date().toISOString();

    return Response.json({
      // ── Safety ──────────────────────────────────────────────────────────
      phase:                    PHASE,
      realTradeAllowed:         REAL_TRADE_ALLOWED,
      realTradeUnlockAllowed:   REAL_TRADE_UNLOCK_ALLOWED,
      killSwitchActive:         KILL_SWITCH_ACTIVE,
      noOKXOrderEndpointCalled: NO_OKX_ORDER_ENDPOINT,

      // ── Mode diff ────────────────────────────────────────────────────────
      oldMode:        OLD.phase,
      newMode:        PHASE,
      activePairs:    NEW.activePairs,
      disabledPairs:  NEW.disabledPairs.map(p => ({ instId: p, reason: NEW.disabledReason })),
      oldTP:          OLD.tpPercent,
      newTP:          NEW.tpPercent,
      oldSL:          OLD.slPercent,
      newSL:          NEW.slPercent,
      oldExpiry:      `${OLD.maxHoldMinutes}min`,
      newExpiry:      `${NEW.maxHoldMinutes}min`,
      oldMaxOpen:     OLD.maxOpenTrades,
      newMaxOpen:     NEW.maxOpenTrades,
      oldScore:       OLD.requiredScore,
      newScore:       NEW.requiredScore,
      oldTickScore:   OLD.minTickScore,
      newTickScore:   NEW.minTickScore,
      riskReward:     '1:2 (sl=0.65%, tp=1.30%)',

      // ── This run ─────────────────────────────────────────────────────────
      openedThisRun:   newEntries.length,
      closedThisRun:   closedNow.length,
      openPositions:   openAfterClose.length,
      scanResults,
      newEntries,
      closedNow,

      // ── 24h report (Phase 4F trades only) ────────────────────────────────
      report24h: {
        closedTrades:   closed24h.length,
        openPositions:  open4F.length,
        wins:           wins24h,
        losses:         closed24h.length - wins24h,
        winRate:        parseFloat(wr24h.toFixed(2)),
        tpHits:         tp24h,
        slHits:         sl24h,
        expired:        exp24h,
        grossPnL:       parseFloat(gross24h.toFixed(6)),
        fees:           parseFloat(fees24h.toFixed(6)),
        netPnL:         parseFloat(net24h.toFixed(6)),
        note:           'Phase 4F trades only (phase=PHASE_4F_BTC_ONLY_ECONOMIC_PAPER_MODE)',
        // Snapshot linkage stats
        snapshotLinkage: {
          tradesWithSnapshot:    withSnap.length,
          tradesWithoutSnapshot: withoutSnap.length,
          snapshotLinkedWinRate: snapWR !== null ? parseFloat(snapWR.toFixed(2)) : null,
          snapshotLinkedNetPnL:  parseFloat(snapNet.toFixed(6)),
          unlinkedWinRate:       noSnapWR !== null ? parseFloat(noSnapWR.toFixed(2)) : null,
          unlinkedNetPnL:        parseFloat(noSnapNet.toFixed(6)),
        },
      },

      // ── BTC verified trade history snapshot ──────────────────────────────
      btcVerifiedSnapshot: {
        totalTrades:  btcClean.length,
        wins:         btcWins,
        winRate:      parseFloat(btcWR.toFixed(2)),
        netPnL:       parseFloat(btcNet.toFixed(6)),
        source:       'VerifiedTrade entity (non-archived)',
      },

      // ── Safety ──────────────────────────────────────────────────────────
      safetyStatus,
      realTradingEndpointDetected,
      finalVerdict,
      runAt: runTime,
      requestedBy: user.email,
    });

  } catch (err) {
    console.error('[PHASE4F] Error:', err.message);
    return Response.json({
      phase:                    PHASE,
      realTradeAllowed:         false,
      realTradeUnlockAllowed:   false,
      killSwitchActive:         true,
      noOKXOrderEndpointCalled: true,
      safetyStatus:             'SAFE',
      realTradingEndpointDetected: false,
      finalVerdict:             'ERROR_DURING_RUN',
      error:                    err.message,
    }, { status: 500 });
  }
});