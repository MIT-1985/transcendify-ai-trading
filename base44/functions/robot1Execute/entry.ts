/**
 * Robot 1 — Multi-Pair Institutional Trading Engine
 * Pairs: BTC-USDT, ETH-USDT, SOL-USDT, DOGE-USDT, XRP-USDT
 * Rules:
 *   - Max 1 active position per pair
 *   - Max 2 simultaneous positions total
 *   - No averaging down, no martingale, no random scaling
 *   - BUY only the highest-scored pair that passes min threshold
 *   - Position tracking: OXXOrderLedger FIFO only
 *   - P&L: VerifiedTrade BUY→SELL matching only
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Constants ────────────────────────────────────────────────────────────────
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';

// Priority order defines tiebreak; scoring picks the actual winner
const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// Polygon tickers map
const POLYGON_TICKER = {
  'BTC-USDT': 'X:BTCUSD',
  'ETH-USDT': 'X:ETHUSD',
  'SOL-USDT': 'X:SOLUSD',
  'DOGE-USDT': 'X:DOGEUSD',
  'XRP-USDT': 'X:XRPUSD',
};

const TRADE_AMOUNT_USDT = 20;     // fixed USDT per trade
const MAX_POSITION_PCT = 0.30;    // never use more than 30% of freeUSDT in one trade
const MIN_FREE_USDT = 15;         // minimum required free USDT to consider buying
const MAX_SPREAD_PCT = 0.15;      // per pair; high-liq pairs typically <0.05%
const TAKE_PROFIT_PCT = 2.0;
const STOP_LOSS_PCT = -1.0;
const MAX_POSITIONS = 2;          // max simultaneous open positions
const MIN_SCORE_TO_BUY = 40;      // 0-100 composite score floor

// ─── OKX crypto/auth helpers ─────────────────────────────────────────────────
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

// ─── Fetch OKX tickers for all pairs in one call ──────────────────────────────
async function fetchAllTickers(apiKey, secret, passphrase) {
  // OKX supports comma-separated tickers or we fetch individually in parallel
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

// ─── Polygon candle fetch per pair ────────────────────────────────────────────
async function fetchPolygonCandles(ticker) {
  const apiKey = Deno.env.get('POLYGON_API_KEY');
  if (!apiKey) return null;
  const now = new Date();
  const to = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/hour/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${apiKey}`);
    const d = await r.json();
    if (!d.results || d.results.length < 5) return null;
    return d.results;
  } catch {
    return null;
  }
}

// ─── Score a single pair (0-100) ──────────────────────────────────────────────
// Returns { score, signal, trend, momentum, volRatio, volatilityPct, spreadPct, polygonPrice, detail, decisionReason }
function scorePair(pair, ticker, candles) {
  if (!ticker) return { pair, score: 0, signal: null, trend: 'N/A', momentum: 0, volRatio: 0, volatilityPct: 0, spreadPct: 99, polygonPrice: null, detail: 'no_ticker', decisionReason: 'No ticker data available' };

  const bid = parseFloat(ticker.bidPx || 0);
  const ask = parseFloat(ticker.askPx || 0);
  const last = parseFloat(ticker.last || 0);
  const spreadPct = bid > 0 ? parseFloat(((ask - bid) / bid * 100).toFixed(4)) : 99;

  // Hard block: spread too wide
  if (spreadPct > MAX_SPREAD_PCT) {
    return { pair, score: 0, signal: null, trend: 'N/A', momentum: 0, volRatio: 0, volatilityPct: 0, spreadPct, polygonPrice: null, detail: 'spread_too_wide', decisionReason: `Spread ${spreadPct.toFixed(4)}% exceeds max ${MAX_SPREAD_PCT}%` };
  }

  // Spread score: 0% = 30pts, MAX_SPREAD_PCT = 0pts
  const spreadScore = Math.max(0, 30 * (1 - spreadPct / MAX_SPREAD_PCT));

  // No candles → use OKX-only partial score
  if (!candles || candles.length < 5) {
    const score = Math.round(spreadScore * 0.5);
    return { pair, score, signal: null, trend: 'UNKNOWN', momentum: 0, volRatio: 0, volatilityPct: 0, spreadPct, polygonPrice: null, detail: 'no_candles', decisionReason: 'No Polygon candle data — partial score only' };
  }

  const slice = candles.slice(-20);
  const closes = slice.map(c => c.c);
  const vols = slice.map(c => c.v || 0);
  const lastCandle = slice[slice.length - 1];

  // Trend: 3 consecutive higher closes
  const isUp = closes.slice(-3).every((c, i, a) => !i || c > a[i - 1]);

  // Momentum: 10-period price change %
  const momentum = closes.length >= 10
    ? ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100
    : 0;

  // Volume ratio: recent 5 vs prior 5
  const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const olderVol = vols.slice(-10, -5).reduce((a, b) => a + b, 0) || 1;
  const volRatio = recentVol / (olderVol / 5);

  // Volatility: std deviation of last 10 closes
  const mean10 = closes.slice(-10).reduce((a, b) => a + b) / 10;
  const variance = closes.slice(-10).reduce((s, c) => s + Math.pow(c - mean10, 2), 0) / 10;
  const volatilityPct = (Math.sqrt(variance) / mean10) * 100;

  const bullish = lastCandle.c > lastCandle.o;

  // Component scores (sum = 100):
  // Trend strength (20): up & bullish = 20, up only = 10, flat = 0
  const trendScore = isUp && bullish ? 20 : isUp ? 10 : 0;

  // Momentum (20): momentum in [0, 2]% → scale, capped
  const momentumScore = Math.min(20, Math.max(0, momentum * 10));

  // Volume (20): volRatio >= 1.5 = 20, 1.0 = 10, <0.8 = 0
  const volumeScore = Math.min(20, Math.max(0, (volRatio - 0.8) / 0.7 * 20));

  // Volatility (10): sweet spot 0.3-1.5%; too low or too high penalised
  const volatilityScore = volatilityPct >= 0.2 && volatilityPct <= 2.0
    ? 10 : volatilityPct > 2.0 ? Math.max(0, 10 - (volatilityPct - 2.0) * 3) : 5;

  // Spread (30) already computed above

  const score = Math.round(trendScore + momentumScore + volumeScore + volatilityScore + spreadScore);

  const signal = isUp && momentum > 0.3 && volRatio > 1.1 && volatilityPct < 2.0 && bullish ? 'BUY' :
                 !isUp && momentum < -0.3 ? 'SELL' : null;

  const reasons = [];
  if (isUp) reasons.push(`trend UP`); else reasons.push(`trend DOWN`);
  if (bullish) reasons.push(`bullish candle`);
  reasons.push(`momentum=${momentum.toFixed(3)}%`);
  reasons.push(`volRatio=${volRatio.toFixed(2)}x`);
  reasons.push(`spread=${spreadPct.toFixed(4)}%`);
  reasons.push(`volatility=${volatilityPct.toFixed(3)}%`);
  reasons.push(`score=${Math.round(trendScore + momentumScore + volumeScore + volatilityScore + spreadScore)}`);

  return {
    pair, score, signal,
    trend: isUp ? 'UP' : 'DOWN',
    momentum: parseFloat(momentum.toFixed(3)),
    volRatio: parseFloat(volRatio.toFixed(2)),
    volatilityPct: parseFloat(volatilityPct.toFixed(3)),
    spreadPct,
    polygonPrice: parseFloat(lastCandle.c.toFixed(8)),
    detail: 'scored',
    decisionReason: reasons.join(' | ')
  };
}

// ─── Logging helper ───────────────────────────────────────────────────────────
async function saveLog(base44, decision, reason, data = {}) {
  try {
    await base44.asServiceRole.entities.Robot1ExecutionLog.create({
      execution_time: new Date().toISOString(),
      decision, reason,
      active_position: data.activePosition || false,
      position_symbol: data.positionSymbol || null,
      position_qty: data.positionQty || null,
      last_order_id: data.orderId || null,
      okx_status: data.okxStatus || 'OK',
      polygon_status: data.polygonStatus || 'OK',
      free_usdt: data.freeUsdt || 0,
      signal_data: data.pairScores ? { pairScores: data.pairScores, ...(data.signalData || {}) } : (data.signalData || null),
      error_message: data.errorMessage || null
    });
  } catch (err) {
    console.error(`[R1] Log save failed: ${err.message}`);
  }
}

// ─── Save verified fill to OXXOrderLedger ─────────────────────────────────────
async function saveToLedger(base44, fill) {
  try {
    const existing = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: fill.ordId });
    if (existing.length > 0) return;
    await base44.asServiceRole.entities.OXXOrderLedger.create({
      ordId: fill.ordId,
      instId: fill.instId,
      side: fill.side,
      avgPx: fill.avgPx,
      accFillSz: fill.accFillSz,
      quoteUSDT: fill.avgPx * fill.accFillSz,
      fee: Math.abs(fill.fee),
      feeCcy: fill.feeCcy || 'USDT',
      timestamp: fill.timestamp || new Date().toISOString(),
      robotId: 'robot1',
      verified: true,
      state: 'filled'
    });
    console.log(`[R1] Ledger saved: ${fill.side} ${fill.instId} ordId=${fill.ordId}`);
  } catch (err) {
    console.error(`[R1] Ledger save failed: ${err.message}`);
  }
}

// ─── Match BUY→SELL and save VerifiedTrade ────────────────────────────────────
async function matchAndSaveVerifiedTrade(base44, buyOrder, sellOrder) {
  try {
    const existing = await base44.asServiceRole.entities.VerifiedTrade.filter({ sellOrdId: sellOrder.ordId });
    if (existing.length > 0) return;
    const buyValue = buyOrder.avgPx * buyOrder.accFillSz;
    const buyFee = Math.abs(buyOrder.fee);
    const sellValue = sellOrder.avgPx * sellOrder.accFillSz;
    const sellFee = Math.abs(sellOrder.fee);
    const realizedPnL = (sellValue - sellFee) - (buyValue + buyFee);
    const realizedPnLPct = parseFloat(((realizedPnL / (buyValue + buyFee)) * 100).toFixed(2));
    await base44.asServiceRole.entities.VerifiedTrade.create({
      robotId: 'robot1', instId: buyOrder.instId,
      buyOrdId: buyOrder.ordId, sellOrdId: sellOrder.ordId,
      buyPrice: buyOrder.avgPx, buyQty: buyOrder.accFillSz, buyValue, buyFee,
      sellPrice: sellOrder.avgPx, sellQty: sellOrder.accFillSz, sellValue, sellFee,
      realizedPnL: parseFloat(realizedPnL.toFixed(4)), realizedPnLPct,
      buyTime: buyOrder.timestamp, sellTime: sellOrder.timestamp,
      holdingMs: new Date(sellOrder.timestamp).getTime() - new Date(buyOrder.timestamp).getTime(),
      status: 'closed'
    });
    console.log(`[R1] VerifiedTrade saved: PnL=${realizedPnL.toFixed(2)} USDT (${realizedPnLPct}%)`);
  } catch (err) {
    console.error(`[R1] VerifiedTrade save failed: ${err.message}`);
  }
}

// ─── Get ALL active Robot1 positions from OXXOrderLedger (FIFO per pair) ──────
async function getAllActivePositions(base44) {
  const all = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
  const buyStack = {}; // instId -> [{ ordId, avgPx, accFillSz, fee, timestamp }]
  const sorted = all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  for (const ord of sorted) {
    const inst = ord.instId;
    if (!ALLOWED_PAIRS.includes(inst)) continue;
    if (!buyStack[inst]) buyStack[inst] = [];
    if (ord.side === 'buy') {
      buyStack[inst].push({ ordId: ord.ordId, avgPx: ord.avgPx, accFillSz: ord.accFillSz, fee: ord.fee, timestamp: ord.timestamp });
    } else if (ord.side === 'sell' && buyStack[inst].length > 0) {
      buyStack[inst].shift(); // FIFO consume
    }
  }
  const active = [];
  for (const inst of ALLOWED_PAIRS) {
    const stack = buyStack[inst] || [];
    if (stack.length > 0) {
      const buy = stack[0];
      active.push({ instId: inst, qty: buy.accFillSz, entryPrice: buy.avgPx, buyOrdId: buy.ordId, buyTimestamp: buy.timestamp, buyFee: buy.fee });
    }
  }
  return active; // array of all open positions
}

// ─── Execute a verified SELL for one position ─────────────────────────────────
async function executeSell(base44, apiKey, apiSecret, passphrase, pos, reason, commonData) {
  const sellBody = JSON.stringify({ instId: pos.instId, tdMode: 'cash', side: 'sell', ordType: 'market', sz: pos.qty.toString() });
  const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);
  if (sellRes.code !== '0') {
    const errMsg = `OKX SELL rejected (${pos.instId}): ${sellRes.msg}`;
    await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', activePosition: true, positionSymbol: pos.instId, positionQty: pos.qty, errorMessage: errMsg });
    return { ok: false, errMsg };
  }
  const sellOrdId = sellRes.data?.[0]?.ordId;
  await new Promise(r => setTimeout(r, 600));
  const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${pos.instId}&ordId=${sellOrdId}`);
  const fill = verifyRes.data?.[0];
  if (!fill || fill.state !== 'filled') {
    const errMsg = `SELL verify failed: ordId=${sellOrdId} state=${fill?.state}`;
    await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', errorMessage: errMsg, orderId: sellOrdId });
    return { ok: false, errMsg };
  }
  const sellFill = {
    ordId: sellOrdId, instId: pos.instId, side: 'sell',
    avgPx: parseFloat(fill.avgPx || 0), accFillSz: parseFloat(fill.accFillSz || 0),
    fee: parseFloat(fill.fee || 0), feeCcy: fill.feeCcy || 'USDT',
    timestamp: new Date(parseInt(fill.fillTime || fill.uTime || Date.now())).toISOString()
  };
  await saveToLedger(base44, sellFill);
  const buyLedger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: pos.buyOrdId });
  if (buyLedger[0]) await matchAndSaveVerifiedTrade(base44, buyLedger[0], sellFill);
  await saveLog(base44, 'SELL', reason, { ...commonData, orderId: sellOrdId, positionSymbol: pos.instId, positionQty: sellFill.accFillSz });
  console.log(`[R1] SELL EXECUTED ${pos.instId} ordId=${sellOrdId} qty=${sellFill.accFillSz} px=${sellFill.avgPx}`);
  return { ok: true, sellFill, sellOrdId };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.email !== SUZANA_EMAIL && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log(`[R1] === EXECUTION START v2 (multi-pair) ===`);

    // ── 1. OKX credentials ────────────────────────────────────────────────────
    const [c1, c2] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
    ]);
    const seen = new Set();
    const conns = [...c1, ...c2].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (!conns[0]) {
      await saveLog(base44, 'ERROR', 'No OKX connection', { okxStatus: 'FAILED' });
      return Response.json({ error: 'No OKX connection' }, { status: 400 });
    }
    const conn = conns[0];
    const [apiKey, apiSecret, passphrase] = await Promise.all([
      decryptOkx(conn.api_key_encrypted),
      decryptOkx(conn.api_secret_encrypted),
      decryptOkx(conn.encryption_iv)
    ]);

    // ── 2. Fetch all tickers + balance + active positions in parallel ──────────
    const [tickerMap, balRes, allActivePositions] = await Promise.all([
      fetchAllTickers(apiKey, apiSecret, passphrase),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance'),
      getAllActivePositions(base44)
    ]);

    const details = balRes.data?.[0]?.details || [];
    const freeUsdt = parseFloat(details.find(d => d.ccy === 'USDT')?.availBal || 0);
    const activeCount = allActivePositions.length;
    const activePairSet = new Set(allActivePositions.map(p => p.instId));

    console.log(`[R1] Positions open: ${activeCount}/${MAX_POSITIONS} | freeUSDT=${freeUsdt.toFixed(2)}`);

    // ── 3. Fetch Polygon candles for all pairs in parallel ────────────────────
    const polygonCandles = {};
    const candleResults = await Promise.all(
      ALLOWED_PAIRS.map(pair =>
        fetchPolygonCandles(POLYGON_TICKER[pair])
          .then(c => ({ pair, candles: c }))
          .catch(() => ({ pair, candles: null }))
      )
    );
    for (const { pair, candles } of candleResults) polygonCandles[pair] = candles;

    // ── 4. Score all pairs ────────────────────────────────────────────────────
    const pairScores = ALLOWED_PAIRS.map(pair =>
      scorePair(pair, tickerMap[pair], polygonCandles[pair])
    );
    pairScores.sort((a, b) => b.score - a.score); // highest score first
    console.log(`[R1] Pair scores: ${pairScores.map(p => `${p.pair}=${p.score}`).join(', ')}`);

    const polygonStatus = candleResults.some(r => r.candles) ? 'OK' : 'UNAVAILABLE';
    // Build full pairScores array for logging (with decisionReason)
    const pairScoresForLog = pairScores.map(p => ({
      pair: p.pair, score: p.score, signal: p.signal, spread: p.spreadPct,
      trend: p.trend, momentum: p.momentum, volRatio: p.volRatio,
      volatility: p.volatilityPct, decisionReason: p.decisionReason
    }));
    const commonData = { freeUsdt, pairScores: pairScoresForLog, polygonStatus, okxStatus: 'OK' };

    // ── 5. SELL check: iterate all open positions ─────────────────────────────
    const sellResults = [];
    for (const pos of allActivePositions) {
      const ticker = tickerMap[pos.instId];
      if (!ticker) continue;
      const currentPrice = parseFloat(ticker.last || 0);
      const pnlPct = parseFloat(((currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2));
      const hitTP = pnlPct >= TAKE_PROFIT_PCT;
      const hitSL = pnlPct <= STOP_LOSS_PCT;
      const pairScore = pairScores.find(p => p.pair === pos.instId);
      const polygonSell = polygonStatus === 'OK' && pairScore?.signal === 'SELL';
      const shouldSell = hitTP || hitSL || polygonSell;

      console.log(`[R1] Position ${pos.instId}: entry=${pos.entryPrice} current=${currentPrice} pnl=${pnlPct}% sell=${shouldSell}`);

      if (shouldSell) {
        const sellReason = hitTP ? `TP hit: P&L=${pnlPct}%` : hitSL ? `SL hit: P&L=${pnlPct}%` : `Sell signal (score=${pairScore?.score})`;
        const result = await executeSell(base44, apiKey, apiSecret, passphrase, pos, sellReason, commonData);
        sellResults.push({ pair: pos.instId, ...result });
      }
    }

    // Recalculate active positions after sells
    const positionsAfterSells = await getAllActivePositions(base44);
    const activeCountNow = positionsAfterSells.length;
    const activePairSetNow = new Set(positionsAfterSells.map(p => p.instId));

    // ── 6. BUY check ──────────────────────────────────────────────────────────
    let buyResult = null;

    if (activeCountNow >= MAX_POSITIONS) {
      const reason = `Max positions reached (${activeCountNow}/${MAX_POSITIONS}). Holding: ${[...activePairSetNow].join(', ')}`;
      console.log(`[R1] WAIT: ${reason}`);
      await saveLog(base44, 'WAIT', reason, { ...commonData, activePosition: true, positionSymbol: [...activePairSetNow].join(','), positionQty: activeCountNow });
    } else if (freeUsdt < MIN_FREE_USDT) {
      const reason = `Insufficient USDT: ${freeUsdt.toFixed(2)} < minRequired=${MIN_FREE_USDT}`;
      console.log(`[R1] WAIT: ${reason}`);
      await saveLog(base44, 'WAIT', reason, commonData);
    } else {
      // Find best candidate: highest score, not already held, passes min score
      const candidate = pairScores.find(p =>
        p.score >= MIN_SCORE_TO_BUY &&
        !activePairSetNow.has(p.pair) &&
        p.spreadPct <= MAX_SPREAD_PCT
      );

      if (!candidate) {
        const topScore = pairScores[0];
        const reason = `No qualified setup. Best: ${topScore.pair} score=${topScore.score}/${MIN_SCORE_TO_BUY} required. Reason: ${topScore.decisionReason || topScore.detail || ''}`;
        console.log(`[R1] WAIT: ${reason}`);
        await saveLog(base44, 'WAIT', reason, commonData);
      } else {
        // Capital safety: fixed amount, capped at 30% of freeUSDT
        const maxByPct = parseFloat((freeUsdt * MAX_POSITION_PCT).toFixed(2));
        const buyUsdtAmount = Math.min(TRADE_AMOUNT_USDT, maxByPct);
        const winReason = `Selected ${candidate.pair} — score=${candidate.score} (best eligible). ${candidate.decisionReason}`;
        console.log(`[R1] BUY candidate: ${candidate.pair} score=${candidate.score} signal=${candidate.signal} — ${winReason}`);
        console.log(`[R1] Capital allocation: fixed=${TRADE_AMOUNT_USDT} USDT | 30% cap=${maxByPct} USDT | using=${buyUsdtAmount} USDT`);

        const buyBody = JSON.stringify({
          instId: candidate.pair, tdMode: 'cash', side: 'buy',
          ordType: 'market', sz: buyUsdtAmount.toString(), tgtCcy: 'quote_ccy'
        });
        const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', buyBody);

        if (buyRes.code !== '0') {
          const errMsg = `OKX BUY rejected (${candidate.pair}): ${buyRes.msg}`;
          await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', errorMessage: errMsg });
          buyResult = { decision: 'BUY_FAILED', reason: errMsg };
        } else {
          const buyOrdId = buyRes.data?.[0]?.ordId;
          await new Promise(r => setTimeout(r, 600));
          const buyVerify = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${candidate.pair}&ordId=${buyOrdId}`);
          const buyFill = buyVerify.data?.[0];

          if (!buyFill || buyFill.state !== 'filled') {
            const errMsg = `BUY verify failed: ordId=${buyOrdId} state=${buyFill?.state}`;
            await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', errorMessage: errMsg, orderId: buyOrdId });
            buyResult = { decision: 'BUY_UNVERIFIED', reason: errMsg, ordId: buyOrdId };
          } else {
            const buyFillData = {
              ordId: buyOrdId, instId: candidate.pair, side: 'buy',
              avgPx: parseFloat(buyFill.avgPx || 0), accFillSz: parseFloat(buyFill.accFillSz || 0),
              fee: parseFloat(buyFill.fee || 0), feeCcy: buyFill.feeCcy || 'USDT',
              timestamp: new Date(parseInt(buyFill.fillTime || buyFill.uTime || Date.now())).toISOString()
            };
            await saveToLedger(base44, buyFillData);
            const buyMode = `${winReason} | usedUSDT=${buyUsdtAmount} | avgPx=${buyFillData.avgPx}`;
            await saveLog(base44, 'BUY', buyMode, {
              ...commonData, orderId: buyOrdId, activePosition: true,
              positionSymbol: candidate.pair, positionQty: buyFillData.accFillSz
            });
            console.log(`[R1] BUY EXECUTED ${candidate.pair} ordId=${buyOrdId} qty=${buyFillData.accFillSz} px=${buyFillData.avgPx} usdt=${buyUsdtAmount}`);
            buyResult = {
              decision: 'BUY_EXECUTED', pair: candidate.pair, reason: buyMode, ordId: buyOrdId,
              usedUSDT: buyUsdtAmount,
              fill: { avgPx: buyFillData.avgPx, accFillSz: buyFillData.accFillSz, fee: Math.abs(buyFillData.fee) }
            };
          }
        }
      }
    }

    // ── 7. Response ───────────────────────────────────────────────────────────
    return Response.json({
      activePositions: positionsAfterSells.map(p => ({
        instId: p.instId, qty: p.qty, entryPrice: p.entryPrice,
        currentPrice: parseFloat(tickerMap[p.instId]?.last || 0),
        pnlPct: parseFloat(((parseFloat(tickerMap[p.instId]?.last || p.entryPrice) - p.entryPrice) / p.entryPrice * 100).toFixed(2))
      })),
      pairScores: pairScores.map(p => ({
        pair: p.pair, score: p.score, signal: p.signal, spread: p.spreadPct,
        trend: p.trend, momentum: p.momentum, volRatio: p.volRatio,
        volatility: p.volatilityPct, decision: activePairSetNow.has(p.pair) ? 'HOLDING' : p.score >= MIN_SCORE_TO_BUY ? 'ELIGIBLE' : 'WAIT'
      })),
      sells: sellResults,
      buy: buyResult,
      freeUsdt,
      positionCount: positionsAfterSells.length,
      maxPositions: MAX_POSITIONS
    });

  } catch (err) {
    console.error(`[R1] Exception: ${err.message}`);
    try { await saveLog(base44, 'ERROR', `Exception: ${err.message}`, { errorMessage: err.message }); } catch (_) {}
    return Response.json({ error: err.message }, { status: 500 });
  }
});