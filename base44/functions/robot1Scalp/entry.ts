/**
 * Robot 1 — Scalping Mode
 * Fee-aware trade sizing: calculates minimum viable trade amount before entry.
 * Robot will not open a trade that mathematically cannot reach positive net profit at TP.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Scalping Constants ────────────────────────────────────────────────────────
const SUZANA_EMAIL           = 'nikitasuziface77@gmail.com';
const ALLOWED_PAIRS          = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

const DEFAULT_TRADE_USDT     = 20;     // default USDT per trade
const MAX_TRADE_USDT         = 30;     // hard ceiling regardless of balance
const MAX_POSITION_PCT       = 0.25;   // cap at 25% of totalCapital per position
const MIN_FREE_USDT          = 12;     // absolute minimum balance to enter

// ─── Capital Reserve Management ───────────────────────────────────────────────
const MIN_FREE_CAPITAL_PCT   = 0.30;   // always keep ≥30% free
const PREFERRED_FREE_PCT     = 0.50;   // target 50% free for best liquidity
const MAX_SIMULTANEOUS_POS   = 2;      // hard max positions
const CAPITAL_RECOVERY_PCT   = 0.30;   // activate recovery mode below this

const TAKE_PROFIT_PCT        = 0.25;   // 0.25% TP (must exceed round-trip fees ~0.20%)
const STOP_LOSS_PCT          = -0.18;  // -0.18% SL
const TRAILING_STOP_PCT      = 0.08;   // trail from peak once near TP
const MICRO_TRAIL_ENTER_PCT  = 0.12;   // activate micro-trail when pnl >= this
const MICRO_TRAIL_PEAK_PCT   = 0.13;   // require bestPnl >= this before trailing
const MICRO_TRAIL_DROP_PCT   = 0.05;   // sell if price drops 0.05% from best
const MIN_NET_PROFIT_USDT    = 0.02;   // minimum net profit after fees to SELL (except SL)
const MAX_SPREAD_PCT         = 0.08;   // tight spread gate
const OKX_FEE_RATE           = 0.001;  // 0.1% taker per side
const MAX_POSITIONS          = MAX_SIMULTANEOUS_POS;
const COOLDOWN_SECONDS       = 30;     // cooldown after any sell

// ─── OKX auth helpers ─────────────────────────────────────────────────────────
async function deriveOkxKey() {
  const enc = new TextEncoder();
  const appId = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
  const mat = await crypto.subtle.importKey('raw', enc.encode(appId), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function decryptOkx(encryptedStr) {
  const key = await deriveOkxKey();
  const [ivB64, dataB64] = encryptedStr.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxRequest(apiKey, secret, passphrase, method, path, bodyStr = '') {
  const ts = new Date().toISOString();
  const sig = await hmacSign(secret, ts + method + path + bodyStr);
  const res = await fetch('https://www.okx.com' + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sig,
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    },
    body: bodyStr || undefined
  });
  return res.json();
}

// ─── Fetch all tickers ────────────────────────────────────────────────────────
async function fetchAllTickers(apiKey, secret, passphrase) {
  const results = await Promise.all(
    ALLOWED_PAIRS.map(pair =>
      okxRequest(apiKey, secret, passphrase, 'GET', `/api/v5/market/ticker?instId=${pair}`)
        .then(r => ({ pair, ticker: r.data?.[0] || null }))
        .catch(() => ({ pair, ticker: null }))
    )
  );
  const map = {};
  for (const { pair, ticker } of results) map[pair] = ticker;
  return map;
}

// ─── Fee-aware trade sizing ───────────────────────────────────────────────────
// Analyzes whether a given USDT amount makes the trade viable at TP after fees.
//
// Math:
//   grossProfit  = tradeUSDT * (tpPct/100)
//   buyFee       = tradeUSDT * OKX_FEE_RATE
//   sellFee      = tradeUSDT * (1 + tpPct/100) * OKX_FEE_RATE
//   totalFees    = buyFee + sellFee
//   netProfitAtTP = grossProfit - totalFees
//
//   For netProfitAtTP >= MIN_NET:
//     tradeUSDT >= MIN_NET / ( (tpPct/100) - OKX_FEE_RATE*(2 + tpPct/100) )
function analyzeTradeSizing(tradeUSDT, tpPct) {
  const estimatedBuyFee  = tradeUSDT * OKX_FEE_RATE;
  const estimatedSellFee = tradeUSDT * (1 + tpPct / 100) * OKX_FEE_RATE;
  const estimatedFees    = estimatedBuyFee + estimatedSellFee;
  const grossProfitAtTP  = tradeUSDT * (tpPct / 100);
  const netProfitAtTP    = grossProfitAtTP - estimatedFees;

  // Break-even: what % move covers fees alone
  const breakEvenMovePct = (estimatedFees / tradeUSDT) * 100;
  // Required move to also clear MIN_NET
  const requiredPriceMovePercent = ((estimatedFees + MIN_NET_PROFIT_USDT) / tradeUSDT) * 100;

  // Minimum trade size that makes TP viable
  // netRateAtTP = gross% - fee% = (tpPct/100) - OKX_FEE_RATE*(2 + tpPct/100)
  // If <= 0, TP is below round-trip fees — structurally impossible regardless of size
  const netRateAtTP = (tpPct / 100) - OKX_FEE_RATE * (2 + tpPct / 100);
  const tpBelowFees = netRateAtTP <= 0;
  const minTradeAmountForProfit = tpBelowFees
    ? null
    : parseFloat((MIN_NET_PROFIT_USDT / netRateAtTP).toFixed(2));

  return {
    tradeUSDT,
    estimatedBuyFee:  parseFloat(estimatedBuyFee.toFixed(4)),
    estimatedSellFee: parseFloat(estimatedSellFee.toFixed(4)),
    estimatedFees:    parseFloat(estimatedFees.toFixed(4)),
    grossProfitAtTP:  parseFloat(grossProfitAtTP.toFixed(4)),
    netProfitAtTP:    parseFloat(netProfitAtTP.toFixed(4)),
    breakEvenMovePct: parseFloat(breakEvenMovePct.toFixed(4)),
    requiredPriceMovePercent: parseFloat(requiredPriceMovePercent.toFixed(4)),
    minTradeAmountForProfit,
    tpBelowFees,
    viable: !tpBelowFees && netProfitAtTP >= MIN_NET_PROFIT_USDT,
    reason: tpBelowFees ? 'TP below estimated round-trip fees' : null
  };
}

// ─── Dead position detection ─────────────────────────────────────────────────
// A position is "dead" if it's been held too long with no progress toward TP
const DEAD_POSITION_MINUTES = 15;    // max hold time before forced exit
const DEAD_POSITION_MIN_PNL = -0.05; // exit only if pnl% > this (avoid cutting at bad SL)

function isDeadPosition(pos, pnlPct) {
  if (!pos.buyTimestamp) return false;
  const holdMs = Date.now() - new Date(pos.buyTimestamp).getTime();
  const holdMin = holdMs / 60000;
  // Dead: held > 15 min AND stuck between SL and +0% (no progress)
  return holdMin >= DEAD_POSITION_MINUTES && pnlPct > DEAD_POSITION_MIN_PNL && pnlPct < 0.05;
}

// ─── Capital Reserve Analysis ─────────────────────────────────────────────────
function analyzeCapitalReserve(freeUsdt, activePositions, tickerMap) {
  // Estimate locked capital = sum of position values at current price
  let lockedCapital = 0;
  const capitalLockedByPair = {};
  for (const pos of activePositions) {
    const cur = parseFloat(tickerMap[pos.instId]?.last || pos.entryPrice);
    const val = parseFloat((cur * pos.qty).toFixed(2));
    lockedCapital += val;
    capitalLockedByPair[pos.instId] = val;
  }
  const totalCapital       = freeUsdt + lockedCapital;
  const freeCapitalPct     = totalCapital > 0 ? freeUsdt / totalCapital : 1;
  const lockedCapitalPct   = totalCapital > 0 ? lockedCapital / totalCapital : 0;
  const capitalRecovery    = freeCapitalPct < CAPITAL_RECOVERY_PCT;
  const availableTradeSlots = Math.max(0, MAX_SIMULTANEOUS_POS - activePositions.length);
  // Efficiency: how many opportunities are viable (slots open + enough free capital)
  const capitalEfficiencyScore = parseFloat(
    (Math.min(freeCapitalPct / PREFERRED_FREE_PCT, 1) * 100).toFixed(1)
  );

  return {
    totalCapital:         parseFloat(totalCapital.toFixed(2)),
    freeCapital:          parseFloat(freeUsdt.toFixed(2)),
    lockedCapital:        parseFloat(lockedCapital.toFixed(2)),
    freeCapitalPct:       parseFloat((freeCapitalPct * 100).toFixed(1)),
    lockedCapitalPct:     parseFloat((lockedCapitalPct * 100).toFixed(1)),
    capitalRecoveryMode:  capitalRecovery,
    availableTradeSlots,
    capitalEfficiencyScore,
    capitalLockedByPair
  };
}

// Decide trade amount: respects capital reserve rules
function computeTradeAmount(freeUsdt, totalCapital, capitalRecoveryMode) {
  // In recovery mode reduce position size to accelerate capital release
  const maxPct  = capitalRecoveryMode ? 0.15 : MAX_POSITION_PCT;
  const balanceCap = totalCapital * maxPct;   // % of total, not just free
  const hardCap    = Math.min(MAX_TRADE_USDT, balanceCap);

  // Must keep MIN_FREE_CAPITAL_PCT of total free after the trade
  const maxAllowedByReserve = freeUsdt - (totalCapital * MIN_FREE_CAPITAL_PCT);
  const effectiveCap = Math.min(hardCap, maxAllowedByReserve);

  if (effectiveCap <= 0) {
    return {
      amount: 0, analysis: analyzeTradeSizing(DEFAULT_TRADE_USDT, TAKE_PROFIT_PCT),
      scaled: false, rejected: true,
      reason: `Capital reserve breach: would drop freeCapital below ${(MIN_FREE_CAPITAL_PCT * 100)}%`
    };
  }

  // 1. Try default
  const defaultA = analyzeTradeSizing(DEFAULT_TRADE_USDT, TAKE_PROFIT_PCT);
  if (defaultA.viable && DEFAULT_TRADE_USDT <= effectiveCap) {
    return { amount: DEFAULT_TRADE_USDT, analysis: defaultA, scaled: false, rejected: false };
  }

  // 2. Scale up to minimum required (+ 5% buffer), capped at effectiveCap
  const minReq = defaultA.minTradeAmountForProfit;
  if (minReq !== Infinity && minReq <= effectiveCap) {
    const scaledAmount = parseFloat(Math.min(minReq * 1.05, effectiveCap).toFixed(2));
    const scaledA = analyzeTradeSizing(scaledAmount, TAKE_PROFIT_PCT);
    return { amount: scaledAmount, analysis: scaledA, scaled: true, rejected: false };
  }

  // 3. Cannot make trade viable within effective cap → reject
  const capAnalysis = analyzeTradeSizing(Math.max(effectiveCap, 0.01), TAKE_PROFIT_PCT);
  return {
    amount: 0,
    analysis: capAnalysis,
    scaled: false,
    rejected: true,
    reason: `minRequired=${minReq === Infinity ? '∞' : minReq?.toFixed(2)} USDT > effectiveCap=${effectiveCap.toFixed(2)} USDT`
  };
}

// ─── Get active Robot1 positions from OXXOrderLedger (FIFO) ──────────────────
async function getActivePositions(base44) {
  const all = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
  const sorted = all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const buyStack = {};
  const buyRecords = {};
  for (const ord of sorted) {
    if (!ALLOWED_PAIRS.includes(ord.instId)) continue;
    if (!buyStack[ord.instId]) { buyStack[ord.instId] = []; buyRecords[ord.instId] = []; }
    if (ord.side === 'buy') {
      buyStack[ord.instId].push({ ordId: ord.ordId, avgPx: ord.avgPx, accFillSz: ord.accFillSz, fee: ord.fee, timestamp: ord.timestamp });
      buyRecords[ord.instId].push(ord);
    } else if (ord.side === 'sell' && buyStack[ord.instId].length > 0) {
      buyStack[ord.instId].shift();
      buyRecords[ord.instId].shift();
    }
  }
  const active = [];
  for (const inst of ALLOWED_PAIRS) {
    const stack = buyStack[inst] || [];
    if (stack.length > 0) {
      const b = stack[0];
      const rec = buyRecords[inst][0];
      active.push({
        instId: inst, qty: b.accFillSz, entryPrice: b.avgPx,
        buyOrdId: b.ordId, buyTimestamp: b.timestamp, buyFee: Math.abs(b.fee),
        ledgerId: rec.id,
        bestPnlPct: rec.bestPnlPct ?? 0
      });
    }
  }
  return active;
}

// ─── Save to OXXOrderLedger ───────────────────────────────────────────────────
async function saveToLedger(base44, fill) {
  const existing = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: fill.ordId });
  if (existing.length > 0) return;
  await base44.asServiceRole.entities.OXXOrderLedger.create({
    ordId: fill.ordId, instId: fill.instId, side: fill.side,
    avgPx: fill.avgPx, accFillSz: fill.accFillSz,
    quoteUSDT: fill.avgPx * fill.accFillSz,
    fee: Math.abs(fill.fee), feeCcy: fill.feeCcy || 'USDT',
    timestamp: fill.timestamp || new Date().toISOString(),
    robotId: 'robot1', verified: true, state: 'filled'
  });
}

// ─── Create VerifiedTrade ─────────────────────────────────────────────────────
async function saveVerifiedTrade(base44, buyOrd, sellOrd) {
  const existing = await base44.asServiceRole.entities.VerifiedTrade.filter({ sellOrdId: sellOrd.ordId });
  if (existing.length > 0) return;
  const buyValue  = buyOrd.avgPx * buyOrd.accFillSz;
  const buyFee    = Math.abs(buyOrd.fee);
  const sellValue = sellOrd.avgPx * sellOrd.accFillSz;
  const sellFee   = Math.abs(sellOrd.fee);
  const realizedPnL = (sellValue - sellFee) - (buyValue + buyFee);
  await base44.asServiceRole.entities.VerifiedTrade.create({
    robotId: 'robot1', instId: buyOrd.instId,
    buyOrdId: buyOrd.ordId, sellOrdId: sellOrd.ordId,
    buyPrice: buyOrd.avgPx, buyQty: buyOrd.accFillSz, buyValue, buyFee,
    sellPrice: sellOrd.avgPx, sellQty: sellOrd.accFillSz, sellValue, sellFee,
    realizedPnL: parseFloat(realizedPnL.toFixed(4)),
    realizedPnLPct: parseFloat(((realizedPnL / (buyValue + buyFee)) * 100).toFixed(3)),
    buyTime: buyOrd.timestamp, sellTime: sellOrd.timestamp,
    holdingMs: new Date(sellOrd.timestamp).getTime() - new Date(buyOrd.timestamp).getTime(),
    status: 'closed'
  });
  console.log(`[SCALP] VerifiedTrade: PnL=${realizedPnL.toFixed(4)} USDT`);
}

// ─── Execute SELL ─────────────────────────────────────────────────────────────
async function executeSell(base44, apiKey, apiSecret, passphrase, pos, reason) {
  const sellBody = JSON.stringify({ instId: pos.instId, tdMode: 'cash', side: 'sell', ordType: 'market', sz: pos.qty.toString() });
  const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);
  if (sellRes.code !== '0') {
    console.error(`[SCALP] SELL rejected ${pos.instId}: ${sellRes.msg}`);
    return { ok: false, errMsg: sellRes.msg };
  }
  const sellOrdId = sellRes.data?.[0]?.ordId;
  await new Promise(r => setTimeout(r, 600));
  const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${pos.instId}&ordId=${sellOrdId}`);
  const fill = verifyRes.data?.[0];
  if (!fill || fill.state !== 'filled') {
    console.error(`[SCALP] SELL verify failed: ordId=${sellOrdId} state=${fill?.state}`);
    return { ok: false, errMsg: `Verify failed state=${fill?.state}` };
  }
  const sellFill = {
    ordId: sellOrdId, instId: pos.instId, side: 'sell',
    avgPx: parseFloat(fill.avgPx || 0), accFillSz: parseFloat(fill.accFillSz || 0),
    fee: parseFloat(fill.fee || 0), feeCcy: fill.feeCcy || 'USDT',
    timestamp: new Date(parseInt(fill.fillTime || fill.uTime || Date.now())).toISOString()
  };
  await saveToLedger(base44, sellFill);
  const buyLedger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: pos.buyOrdId });
  if (buyLedger[0]) await saveVerifiedTrade(base44, buyLedger[0], sellFill);
  console.log(`[SCALP] SELL DONE ${pos.instId} ordId=${sellOrdId} px=${sellFill.avgPx} reason=${reason}`);
  return { ok: true, sellFill, sellOrdId, reason };
}

// ─── Cooldown check ───────────────────────────────────────────────────────────
async function isInCooldown(base44, pair) {
  const recent = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', instId: pair, side: 'sell' });
  if (!recent.length) return false;
  const lastSell = recent.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const secondsSince = (Date.now() - new Date(lastSell.timestamp).getTime()) / 1000;
  return secondsSince < COOLDOWN_SECONDS;
}

// ─── Optimizer Metrics ────────────────────────────────────────────────────────
// Computes all 9 optimizer KPIs from VerifiedTrade history
async function computeOptimizerMetrics(base44) {
  const allTrades = await base44.asServiceRole.entities.VerifiedTrade.filter({ robotId: 'robot1' });
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const todayTrades = allTrades.filter(t => t.sellTime && new Date(t.sellTime) >= todayStart);
  const week7Trades = allTrades.filter(t => t.sellTime && new Date(t.sellTime).getTime() >= sevenDaysAgo);

  // realizedPnLToday
  const realizedPnLToday = todayTrades.reduce((s, t) => s + (t.realizedPnL || 0), 0);

  // realizedPnL7D
  const realizedPnL7D = week7Trades.reduce((s, t) => s + (t.realizedPnL || 0), 0);

  // rollingWinRate (last 50 trades)
  const last50 = allTrades
    .filter(t => t.sellTime)
    .sort((a, b) => new Date(b.sellTime) - new Date(a.sellTime))
    .slice(0, 50);
  const wins = last50.filter(t => t.realizedPnL > 0).length;
  const rollingWinRate = last50.length > 0 ? parseFloat((wins / last50.length * 100).toFixed(1)) : 0;

  // rollingDrawdown: max consecutive losses in last 50
  let maxDD = 0, curDD = 0;
  for (const t of last50) {
    if ((t.realizedPnL || 0) < 0) { curDD++; maxDD = Math.max(maxDD, curDD); }
    else curDD = 0;
  }
  const rollingDrawdown = maxDD;

  // avgCycleDuration (ms → seconds, last 50 closed trades)
  const durations = last50.filter(t => t.holdingMs > 0).map(t => t.holdingMs);
  const avgCycleDuration = durations.length > 0
    ? parseFloat((durations.reduce((s, d) => s + d, 0) / durations.length / 1000).toFixed(1))
    : 0;

  // feeEfficiencyRatio: totalPnL / totalFeesPaid (last 50)
  const totalGross = last50.reduce((s, t) => s + ((t.sellValue || 0) - (t.buyValue || 0)), 0);
  const totalFees = last50.reduce((s, t) => s + (t.buyFee || 0) + (t.sellFee || 0), 0);
  const feeEfficiencyRatio = totalFees > 0 ? parseFloat((totalGross / totalFees).toFixed(2)) : 0;

  // scalpQualityScore: composite 0-100
  // Weights: winRate (40) + feeEfficiency (30) + drawdown penalty (20) + cycleDuration bonus (10)
  const winScore = Math.min(rollingWinRate, 100) * 0.40;
  const feeScore = Math.min(Math.max(feeEfficiencyRatio * 20, 0), 30); // 1.5x = 30pts
  const ddPenalty = Math.min(rollingDrawdown * 5, 20);
  const cycleBonus = avgCycleDuration > 0 && avgCycleDuration < 120 ? 10 : 5; // fast cycles = bonus
  const scalpQualityScore = parseFloat(Math.max(0, Math.min(100, winScore + feeScore - ddPenalty + cycleBonus)).toFixed(1));

  return {
    realizedPnLToday: parseFloat(realizedPnLToday.toFixed(4)),
    realizedPnL7D:    parseFloat(realizedPnL7D.toFixed(4)),
    rollingWinRate,
    rollingDrawdown,
    avgCycleDuration,
    feeEfficiencyRatio,
    scalpQualityScore,
    tradesCountToday: todayTrades.length,
    tradesCount7D:    week7Trades.length,
    last50Count:      last50.length,
  };
}

// ─── Aggression scaling: reduce trade size after losses ───────────────────────
function aggressionMultiplier(recentLosses) {
  // 0 losses → 1.0x, 1 loss → 0.85x, 2 → 0.70x, 3+ → 0.55x (minimum)
  if (recentLosses <= 0) return 1.0;
  if (recentLosses === 1) return 0.85;
  if (recentLosses === 2) return 0.70;
  return 0.55;
}

// ─── Score pair for scalping ──────────────────────────────────────────────────
function scalpScore(pair, ticker) {
  if (!ticker) return { ok: false, reason: 'no ticker' };
  const bid      = parseFloat(ticker.bidPx || 0);
  const ask      = parseFloat(ticker.askPx || 0);
  const last     = parseFloat(ticker.last || 0);
  const open24h  = parseFloat(ticker.open24h || last);
  const spreadPct = bid > 0 ? (ask - bid) / bid * 100 : 99;

  if (spreadPct > MAX_SPREAD_PCT) return { ok: false, reason: `spread ${spreadPct.toFixed(4)}% > ${MAX_SPREAD_PCT}%` };
  if (last <= open24h) return { ok: false, reason: `24h trend negative (last=${last} open24h=${open24h})` };
  const vol24h = parseFloat(ticker.vol24h || 0);
  if (vol24h < 100) return { ok: false, reason: `volume too low (vol24h=${vol24h})` };

  return { ok: true, spreadPct, last, bid, ask };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
    // Allow: logged-in Suzana/admin, OR service-role call from dispatcher (no user context)
    let user = null;
    try { user = await base44.auth.me(); } catch { /* scheduler / service-role call */ }
    if (user && user.email !== SUZANA_EMAIL && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[SCALP] === SCALP EXECUTION START ===');

    // ── Compute sizing preview + trade allowed status for dashboard ──
    // (done early so it's available even if we return before BUY pass)
    const defaultSizing = analyzeTradeSizing(DEFAULT_TRADE_USDT, TAKE_PROFIT_PCT);
    const netRateAtTP = (TAKE_PROFIT_PCT / 100) - OKX_FEE_RATE * (2 + TAKE_PROFIT_PCT / 100);

    // 1. OKX credentials
    const [c1, c2] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
    ]);
    const seen = new Set();
    const conns = [...c1, ...c2].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (!conns[0]) return Response.json({ error: 'No OKX connection' }, { status: 400 });
    const conn = conns[0];
    const [apiKey, apiSecret, passphrase] = await Promise.all([
      decryptOkx(conn.api_key_encrypted),
      decryptOkx(conn.api_secret_encrypted),
      decryptOkx(conn.encryption_iv)
    ]);

    // 2. Fetch tickers + balance + active positions + optimizer metrics
    const [tickerMap, balRes, activePositions, optimizerMetrics] = await Promise.all([
      fetchAllTickers(apiKey, apiSecret, passphrase),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance'),
      getActivePositions(base44),
      computeOptimizerMetrics(base44)
    ]);

    const details  = balRes.data?.[0]?.details || [];
    const freeUsdt = parseFloat(details.find(d => d.ccy === 'USDT')?.availBal || 0);

    // ── Capital Reserve Analysis ──
    const capitalReserve = analyzeCapitalReserve(freeUsdt, activePositions, tickerMap);
    const { totalCapital, capitalRecoveryMode } = capitalReserve;

    console.log(`[SCALP] freeUSDT=${freeUsdt.toFixed(2)} total=${totalCapital.toFixed(2)} freeCapPct=${capitalReserve.freeCapitalPct}% recovery=${capitalRecoveryMode} positions=${activePositions.length}/${MAX_POSITIONS}`);

    // In CAPITAL_RECOVERY mode, log it clearly
    if (capitalRecoveryMode) {
      console.log(`[SCALP] ⚠️ CAPITAL_RECOVERY MODE — freeCapital ${capitalReserve.freeCapitalPct}% < ${(CAPITAL_RECOVERY_PCT*100)}% threshold. Prioritizing exits.`);
    }

    // ── Pre-compute sizing preview for all pairs (always shown in dashboard) ──
    const sizingPreview = {};
    for (const pair of ALLOWED_PAIRS) {
      const t = tickerMap[pair];
      if (t?.last) {
        sizingPreview[pair] = analyzeTradeSizing(DEFAULT_TRADE_USDT, TAKE_PROFIT_PCT);
      }
    }

    // 3. SELL pass — always before BUY
    const sellDetails = [];
    const sellResults = [];

    for (const pos of activePositions) {
      const ticker = tickerMap[pos.instId];
      if (!ticker) { console.log(`[SCALP] ${pos.instId}: no ticker, skipping`); continue; }

      const currentPrice   = parseFloat(ticker.last || 0);
      const pnlPct         = (currentPrice - pos.entryPrice) / pos.entryPrice * 100;
      const grossProfit    = (currentPrice - pos.entryPrice) * pos.qty;
      const buyFee         = pos.buyFee || pos.entryPrice * pos.qty * OKX_FEE_RATE;
      const sellFee        = currentPrice * pos.qty * OKX_FEE_RATE;
      const estimatedFees  = buyFee + sellFee;
      const netProfit      = grossProfit - estimatedFees;

      // Persist bestPnlPct high-water mark
      const prevBest = pos.bestPnlPct ?? 0;
      const newBest  = Math.max(prevBest, pnlPct);
      if (newBest > prevBest && pos.ledgerId) {
        try {
          await base44.asServiceRole.entities.OXXOrderLedger.update(pos.ledgerId, { bestPnlPct: parseFloat(newBest.toFixed(6)) });
        } catch (e) { console.error(`[SCALP] bestPnlPct update failed: ${e.message}`); }
      }

      const trailingDistance  = parseFloat((newBest - pnlPct).toFixed(4));
      const microTrailingActive = pnlPct >= MICRO_TRAIL_ENTER_PCT && pnlPct < TAKE_PROFIT_PCT;

      console.log(`[SCALP] ${pos.instId}: pnl=${pnlPct.toFixed(4)}% best=${newBest.toFixed(4)}% net=${netProfit.toFixed(4)}`);

      const hitTP         = pnlPct >= TAKE_PROFIT_PCT && netProfit >= MIN_NET_PROFIT_USDT;
      const hitSL         = pnlPct <= STOP_LOSS_PCT;
      const hitTrail      = pnlPct >= (TAKE_PROFIT_PCT - TRAILING_STOP_PCT) && pnlPct < TAKE_PROFIT_PCT && netProfit >= MIN_NET_PROFIT_USDT;
      const hitMicroTrail = microTrailingActive && newBest >= MICRO_TRAIL_PEAK_PCT && trailingDistance >= MICRO_TRAIL_DROP_PCT && netProfit >= MIN_NET_PROFIT_USDT;
      // In CAPITAL_RECOVERY mode: also exit at break-even or better to free capital
      const hitBreakEven  = capitalRecoveryMode && netProfit >= 0 && pnlPct > 0;
      // Dead position: stuck too long with no meaningful move — recycle capital
      const hitDeadPos    = isDeadPosition(pos, pnlPct);
      const shouldSell    = hitTP || hitSL || hitTrail || hitMicroTrail || hitBreakEven || hitDeadPos;

      let exitMode = 'WAIT';
      if (hitTP)              exitMode = 'TP';
      else if (hitSL)         exitMode = 'SL';
      else if (hitTrail)      exitMode = 'TRAIL';
      else if (hitMicroTrail) exitMode = 'MICRO_TRAIL';
      else if (hitBreakEven)  exitMode = 'BREAK_EVEN_EXIT';
      else if (hitDeadPos)    exitMode = 'DEAD_EXIT';
      else if (netProfit < MIN_NET_PROFIT_USDT && pnlPct > 0) exitMode = 'WAIT_NET_TOO_LOW';

      console.log(`[SCALP] ${pos.instId}: exitMode=${exitMode}`);

      const diag = {
        pair: pos.instId,
        entryPx: pos.entryPrice, currentPx: currentPrice,
        pnlPercent: parseFloat(pnlPct.toFixed(4)),
        grossPnL: parseFloat(grossProfit.toFixed(4)),
        estimatedFees: parseFloat(estimatedFees.toFixed(4)),
        netPnL: parseFloat(netProfit.toFixed(4)),
        bestPnlPercent: parseFloat(newBest.toFixed(4)),
        trailingDistance, microTrailingActive, exitMode,
        buyOrdId: pos.buyOrdId
      };
      sellDetails.push(diag);

      if (shouldSell) {
        const reason = hitTP         ? `TP: pnl=${pnlPct.toFixed(4)}% net=${netProfit.toFixed(4)}`
                     : hitSL         ? `SL: pnl=${pnlPct.toFixed(4)}%`
                     : hitTrail      ? `TRAIL: pnl=${pnlPct.toFixed(4)}% net=${netProfit.toFixed(4)}`
                     : hitBreakEven  ? `BREAK_EVEN_EXIT: capital recovery mode, pnl=${pnlPct.toFixed(4)}% net=${netProfit.toFixed(4)}`
                     : hitDeadPos    ? `DEAD_EXIT: stuck ${((Date.now()-new Date(pos.buyTimestamp).getTime())/60000).toFixed(1)}min pnl=${pnlPct.toFixed(4)}%`
                     : `MICRO_TRAIL: bestPnl=${newBest.toFixed(4)}% drop=${trailingDistance}% net=${netProfit.toFixed(4)}`;
        const sr = await executeSell(base44, apiKey, apiSecret, passphrase, pos, reason);
        sellResults.push({ ...diag, ...sr });
      }
    }

    // 4. BUY pass
    const posNow = await getActivePositions(base44);
    const activePairNow = new Set(posNow.map(p => p.instId));
    let buyResult = null;

    // Re-run capital reserve with updated positions after sells
    const capitalReserveNow = analyzeCapitalReserve(freeUsdt, posNow, tickerMap);

    if (posNow.length >= MAX_POSITIONS) {
      const holdingStr = posNow.map(p => {
        const t = tickerMap[p.instId];
        const cur = t ? parseFloat(t.last || 0) : 0;
        const pct = cur ? ((cur - p.entryPrice) / p.entryPrice * 100).toFixed(4) : '?';
        return `${p.instId} @${p.entryPrice} cur=${cur} pnl=${pct}%`;
      }).join(' | ');
      console.log(`[SCALP] WAIT — max positions reached: ${holdingStr}`);
      buyResult = { decision: 'WAIT_ACTIVE_POSITION', reason: `Max positions (${MAX_POSITIONS}): ${holdingStr}` };

    } else if (capitalReserveNow.capitalRecoveryMode) {
      console.log(`[SCALP] WAIT — CAPITAL_RECOVERY: freeCapital=${capitalReserveNow.freeCapitalPct}% < ${(CAPITAL_RECOVERY_PCT*100)}%. No new positions.`);
      buyResult = { decision: 'WAIT_CAPITAL_RECOVERY', freeUsdt, freeCapitalPct: capitalReserveNow.freeCapitalPct };

    } else if (freeUsdt < MIN_FREE_USDT) {
      console.log(`[SCALP] WAIT: freeUSDT=${freeUsdt.toFixed(2)} < min=${MIN_FREE_USDT}`);
      buyResult = { decision: 'WAIT_LOW_BALANCE', freeUsdt };

    } else {
      // ── Aggression scaling based on recent losses ──
      const recentTrades = (await base44.asServiceRole.entities.VerifiedTrade.filter({ robotId: 'robot1' }))
        .filter(t => t.sellTime)
        .sort((a, b) => new Date(b.sellTime) - new Date(a.sellTime))
        .slice(0, 5);
      let recentConsecLosses = 0;
      for (const t of recentTrades) {
        if ((t.realizedPnL || 0) < 0) recentConsecLosses++;
        else break;
      }
      const aggMult = aggressionMultiplier(recentConsecLosses);
      if (recentConsecLosses > 0) {
        console.log(`[SCALP] Aggression reduced: ${recentConsecLosses} consec losses → mult=${aggMult}x`);
      }

      // ── Fee-aware candidate scoring ──
      const candidates = [];
      for (const pair of ALLOWED_PAIRS) {
        if (activePairNow.has(pair)) continue;

        const score = scalpScore(pair, tickerMap[pair]);
        if (!score.ok) { console.log(`[SCALP] SKIP ${pair}: ${score.reason}`); continue; }

        const cooled = await isInCooldown(base44, pair);
        if (cooled) { console.log(`[SCALP] SKIP ${pair}: cooldown`); continue; }

        // Capital-reserve-aware sizing with aggression scaling
        const sizing = computeTradeAmount(freeUsdt, capitalReserveNow.totalCapital, capitalReserveNow.capitalRecoveryMode);
        if (sizing.amount > 0) sizing.amount = parseFloat((sizing.amount * aggMult).toFixed(2));

        if (sizing.analysis?.tpBelowFees) {
          console.log(`[SCALP] SKIP ${pair}: TP below round-trip fees — trading disabled`);
          continue;
        }

        if (sizing.rejected) {
          console.log(`[SCALP] SKIP ${pair}: trade size rejected — ${sizing.reason} (minRequired=${sizing.analysis.minTradeAmountForProfit} USDT)`);
          continue;
        }

        if (!sizing.analysis.viable) {
          console.log(`[SCALP] SKIP ${pair}: not viable — netAtTP=${sizing.analysis.netProfitAtTP} requiredMove=${sizing.analysis.requiredPriceMovePercent}% > TP=${TAKE_PROFIT_PCT}%`);
          continue;
        }

        console.log(`[SCALP] CANDIDATE ${pair}: amount=${sizing.amount} USDT scaled=${sizing.scaled} requiredMove=${sizing.analysis.requiredPriceMovePercent}% netAtTP=${sizing.analysis.netProfitAtTP} minTrade=${sizing.analysis.minTradeAmountForProfit}`);
        candidates.push({ pair, ...score, sizing });
      }

      if (candidates.length === 0) {
        console.log('[SCALP] WAIT: no eligible candidates');
        buyResult = { decision: 'WAIT_NO_CANDIDATES' };
      } else {
        const best = candidates.sort((a, b) => a.spreadPct - b.spreadPct)[0];
        const buyUsdtAmount = parseFloat(best.sizing.amount.toFixed(2));

        console.log(`[SCALP] BUY ${best.pair} amount=${buyUsdtAmount} USDT scaled=${best.sizing.scaled} netAtTP=${best.sizing.analysis.netProfitAtTP}`);

        const buyBody = JSON.stringify({
          instId: best.pair, tdMode: 'cash', side: 'buy',
          ordType: 'market', sz: buyUsdtAmount.toString(), tgtCcy: 'quote_ccy'
        });
        const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', buyBody);

        if (buyRes.code !== '0') {
          const errMsg = `BUY rejected (${best.pair}): ${buyRes.msg}`;
          console.error(`[SCALP] ${errMsg}`);
          buyResult = { decision: 'BUY_FAILED', reason: errMsg };
        } else {
          const buyOrdId = buyRes.data?.[0]?.ordId;
          await new Promise(r => setTimeout(r, 600));
          const verify = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${best.pair}&ordId=${buyOrdId}`);
          const bf = verify.data?.[0];
          if (!bf || bf.state !== 'filled') {
            buyResult = { decision: 'BUY_UNVERIFIED', ordId: buyOrdId, state: bf?.state };
          } else {
            const buyFill = {
              ordId: buyOrdId, instId: best.pair, side: 'buy',
              avgPx: parseFloat(bf.avgPx || 0), accFillSz: parseFloat(bf.accFillSz || 0),
              fee: parseFloat(bf.fee || 0), feeCcy: bf.feeCcy || 'USDT',
              timestamp: new Date(parseInt(bf.fillTime || bf.uTime || Date.now())).toISOString()
            };
            await saveToLedger(base44, buyFill);
            console.log(`[SCALP] BUY EXECUTED ${best.pair} ordId=${buyOrdId} qty=${buyFill.accFillSz} px=${buyFill.avgPx} usdt=${buyUsdtAmount}`);
            buyResult = {
              decision: 'BUY_EXECUTED',
              pair: best.pair, ordId: buyOrdId,
              usedUSDT: buyUsdtAmount, avgPx: buyFill.avgPx, qty: buyFill.accFillSz,
              tradeSizeScaled: best.sizing.scaled,
              // Sizing diagnostics
              sizing: {
                requiredPriceMovePercent: best.sizing.analysis.requiredPriceMovePercent,
                minTradeAmountForProfit:  best.sizing.analysis.minTradeAmountForProfit,
                estimatedFees:            best.sizing.analysis.estimatedFees,
                expectedNetProfitAtTP:    best.sizing.analysis.netProfitAtTP,
              }
            };
          }
        }
      }
    }

    const finalPositions = await getActivePositions(base44);
    const finalCapital = analyzeCapitalReserve(freeUsdt, finalPositions, tickerMap);
    return Response.json({
      mode: 'scalp',
      freeUsdt,
      freeCapitalPercent: finalCapital.freeCapitalPct,
      positionCount: finalPositions.length,
      maxPositions: MAX_POSITIONS,
      capitalReserve: finalCapital,
      optimizerMetrics,
      positionDiagnostics: sellDetails,
      sizingPreview,
      activePositions: finalPositions.map(p => ({
        instId: p.instId, qty: p.qty, entryPrice: p.entryPrice,
        currentPrice: parseFloat(tickerMap[p.instId]?.last || 0),
        pnlPct: parseFloat(((parseFloat(tickerMap[p.instId]?.last || p.entryPrice) - p.entryPrice) / p.entryPrice * 100).toFixed(3))
      })),
      sells: sellResults,
      buy: buyResult,
      config: {
        DEFAULT_TRADE_USDT, MAX_TRADE_USDT, MAX_POSITION_PCT,
        MIN_FREE_CAPITAL_PCT, PREFERRED_FREE_PCT, CAPITAL_RECOVERY_PCT,
        TAKE_PROFIT_PCT, STOP_LOSS_PCT, TRAILING_STOP_PCT,
        MICRO_TRAIL_ENTER_PCT, MICRO_TRAIL_PEAK_PCT, MICRO_TRAIL_DROP_PCT,
        MIN_NET_PROFIT_USDT, MAX_SPREAD_PCT, OKX_FEE_RATE, COOLDOWN_SECONDS
      }
    });

  } catch (err) {
    console.error(`[SCALP] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});