/**
 * Robot 1 — Live Trading Engine
 * Source of truth: OKX filled orders only.
 * Position tracking: OXXOrderLedger (FIFO, by robotId=robot1).
 * P&L: VerifiedTrade BUY→SELL matching only.
 * No Trade entity, no UserSubscription, no Math.random, no SIM fallback.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Constants ────────────────────────────────────────────────────────────────
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const ALLOWED_PAIRS = ['ETH-USDT', 'SOL-USDT'];
const MIN_TRADE_USDT = 10;
const MAX_SPREAD_PCT = 0.08;   // 0.08% max spread
const TAKE_PROFIT_PCT = 2.0;
const STOP_LOSS_PCT = -1.0;

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

// ─── Polygon signal (non-blocking) ────────────────────────────────────────────
async function getPolygonSignal() {
  const apiKey = Deno.env.get('POLYGON_API_KEY');
  if (!apiKey) return { signal: null, polygonPrice: null, status: 'UNAVAILABLE', reason: 'No API key' };

  const now = new Date();
  const to = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/X:ETHUSD/range/1/hour/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${apiKey}`);
    const d = await r.json();
    console.log(`[R1] Polygon: status=${d.status} count=${d.results?.length || 0}`);

    if (!d.results || d.results.length < 5) {
      return { signal: null, polygonPrice: null, status: 'UNAVAILABLE', reason: `Only ${d.results?.length || 0} candles` };
    }

    const candles = d.results.slice(-20);
    const closes = candles.map(c => c.c);
    const vols = candles.map(c => c.v || 0);
    const isUp = closes.slice(-3).every((c, i, a) => !i || c > a[i - 1]);
    const momentum = ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;
    const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const olderVol = vols.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const volRatio = recentVol / (olderVol || 1);
    const mean = closes.slice(-10).reduce((a, b) => a + b) / 10;
    const variance = closes.slice(-10).reduce((s, c) => s + Math.pow(c - mean, 2), 0) / 10;
    const volatilityPct = (Math.sqrt(variance) / mean) * 100;
    const last = candles[candles.length - 1];
    const bullish = last.c > last.o;

    const signal = isUp && momentum > 0.3 && volRatio > 1.1 && volatilityPct < 2.0 && bullish ? 'BUY' :
                   !isUp && momentum < -0.3 && volatilityPct > 1.5 ? 'SELL' : null;

    console.log(`[R1] Polygon: trend=${isUp?'UP':'DOWN'} momentum=${momentum.toFixed(2)}% signal=${signal}`);
    return {
      trend: isUp ? 'UP' : 'DOWN', momentum: parseFloat(momentum.toFixed(3)),
      volRatio: parseFloat(volRatio.toFixed(2)), volatilityPct: parseFloat(volatilityPct.toFixed(3)),
      candle: bullish ? 'BULLISH' : 'BEARISH', signal,
      polygonPrice: parseFloat(last.c.toFixed(2)), status: 'OK'
    };
  } catch (err) {
    console.error(`[R1] Polygon error: ${err.message}`);
    return { signal: null, polygonPrice: null, status: 'UNAVAILABLE', reason: err.message };
  }
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
      signal_data: data.signalData || null,
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
    if (existing.length > 0) return; // already saved
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
      robotId: 'robot1',
      instId: buyOrder.instId,
      buyOrdId: buyOrder.ordId,
      sellOrdId: sellOrder.ordId,
      buyPrice: buyOrder.avgPx,
      buyQty: buyOrder.accFillSz,
      buyValue,
      buyFee,
      sellPrice: sellOrder.avgPx,
      sellQty: sellOrder.accFillSz,
      sellValue,
      sellFee,
      realizedPnL: parseFloat(realizedPnL.toFixed(4)),
      realizedPnLPct,
      buyTime: buyOrder.timestamp,
      sellTime: sellOrder.timestamp,
      holdingMs: new Date(sellOrder.timestamp).getTime() - new Date(buyOrder.timestamp).getTime(),
      status: 'closed'
    });
    console.log(`[R1] VerifiedTrade saved: PnL=${realizedPnL.toFixed(2)} USDT (${realizedPnLPct}%)`);
  } catch (err) {
    console.error(`[R1] VerifiedTrade save failed: ${err.message}`);
  }
}

// ─── Find active Robot1 position from OXXOrderLedger (FIFO) ──────────────────
async function getActivePosition(base44) {
  // Fetch all robot1 ledger entries sorted by time
  const all = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
  
  // Process FIFO per instId
  const positions = {}; // instId -> { qty, orderId, avgPx, timestamp }
  const buyStack = {}; // instId -> [{ ordId, avgPx, accFillSz, fee, timestamp }]

  // Sort by timestamp ascending
  const sorted = all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  for (const ord of sorted) {
    const inst = ord.instId;
    if (!ALLOWED_PAIRS.includes(inst)) continue;
    if (!buyStack[inst]) buyStack[inst] = [];

    if (ord.side === 'buy') {
      buyStack[inst].push({ ordId: ord.ordId, avgPx: ord.avgPx, accFillSz: ord.accFillSz, fee: ord.fee, timestamp: ord.timestamp });
    } else if (ord.side === 'sell' && buyStack[inst].length > 0) {
      // FIFO: consume the oldest buy
      buyStack[inst].shift();
    }
  }

  // Active position = instId with remaining buys not yet sold
  for (const inst of ALLOWED_PAIRS) {
    const stack = buyStack[inst] || [];
    if (stack.length > 0) {
      const buy = stack[0]; // oldest unmatched buy
      return {
        instId: inst,
        qty: buy.accFillSz,
        entryPrice: buy.avgPx,
        buyOrdId: buy.ordId,
        buyTimestamp: buy.timestamp,
        buyFee: buy.fee
      };
    }
  }
  return null;
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

    console.log(`[R1] === EXECUTION START ===`);

    // ── 1. Polygon signal (non-blocking) ──────────────────────────────────────
    const polygon = await getPolygonSignal();
    const polygonStatus = polygon.status;
    console.log(`[R1] Polygon: status=${polygonStatus} signal=${polygon.signal}`);

    // ── 2. OKX credentials ────────────────────────────────────────────────────
    const [c1, c2] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
    ]);
    const seen = new Set();
    const conns = [...c1, ...c2].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

    if (!conns[0]) {
      await saveLog(base44, 'ERROR', 'No OKX connection', { okxStatus: 'FAILED', polygonStatus });
      return Response.json({ error: 'No OKX connection' }, { status: 400 });
    }

    const conn = conns[0];
    const [apiKey, apiSecret, passphrase] = await Promise.all([
      decryptOkx(conn.api_key_encrypted),
      decryptOkx(conn.api_secret_encrypted),
      decryptOkx(conn.encryption_iv)
    ]);

    // ── 3. OKX live price + balance ───────────────────────────────────────────
    const [tickerRes, balRes] = await Promise.all([
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/market/ticker?instId=ETH-USDT'),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance')
    ]);

    const ticker = tickerRes.data?.[0];
    if (!ticker) {
      await saveLog(base44, 'ERROR', 'OKX ticker unavailable', { okxStatus: 'FAILED', polygonStatus });
      return Response.json({ error: 'OKX ticker unavailable' }, { status: 500 });
    }

    const okxPrice = parseFloat(ticker.last || 0);
    const bid = parseFloat(ticker.bidPx || 0);
    const ask = parseFloat(ticker.askPx || 0);
    const spreadPct = bid > 0 ? parseFloat(((ask - bid) / bid * 100).toFixed(4)) : 0;
    const details = balRes.data?.[0]?.details || [];
    const freeUsdt = parseFloat(details.find(d => d.ccy === 'USDT')?.availBal || 0);

    console.log(`[R1] OKX: price=${okxPrice} bid=${bid} ask=${ask} spread=${spreadPct}% freeUSDT=${freeUsdt.toFixed(2)}`);

    const commonData = { freeUsdt, signalData: polygon, polygonStatus, okxStatus: 'OK' };

    // ── 4. Spread check ───────────────────────────────────────────────────────
    if (spreadPct > MAX_SPREAD_PCT) {
      const reason = `Spread too high: ${spreadPct}% > max ${MAX_SPREAD_PCT}%`;
      await saveLog(base44, 'WAIT', reason, commonData);
      return Response.json({ decision: 'WAIT', reason, okxPrice, spread: spreadPct });
    }

    // ── 5. Price cross-check (only if Polygon available) ─────────────────────
    if (polygonStatus === 'OK' && polygon.polygonPrice) {
      const priceDiff = Math.abs((okxPrice - polygon.polygonPrice) / polygon.polygonPrice) * 100;
      if (priceDiff > 0.15) {
        const reason = `Price skew ${priceDiff.toFixed(2)}%: Polygon=${polygon.polygonPrice} OKX=${okxPrice}`;
        await saveLog(base44, 'WAIT', reason, commonData);
        return Response.json({ decision: 'WAIT', reason, okxPrice, priceDiff: parseFloat(priceDiff.toFixed(4)) });
      }
    }

    // ── 6. Active position from OXXOrderLedger (FIFO) ────────────────────────
    const activePos = await getActivePosition(base44);
    console.log(`[R1] Active position: ${activePos ? `${activePos.instId} qty=${activePos.qty} entry=${activePos.entryPrice}` : 'none'}`);

    // ── CASE A: OPEN POSITION → check SELL ────────────────────────────────────
    if (activePos) {
      const pnlPct = parseFloat(((okxPrice - activePos.entryPrice) / activePos.entryPrice * 100).toFixed(2));
      const hitTP = pnlPct >= TAKE_PROFIT_PCT;
      const hitSL = pnlPct <= STOP_LOSS_PCT;
      const polygonSell = polygonStatus === 'OK' && (polygon.signal === 'SELL' || polygon.momentum < -0.5);
      const shouldSell = hitTP || hitSL || polygonSell;

      if (!shouldSell) {
        const reason = `Holding ${activePos.instId}: P&L=${pnlPct}%, waiting for TP=${TAKE_PROFIT_PCT}% or SL=${STOP_LOSS_PCT}%, Polygon=${polygonStatus === 'OK' ? polygon.signal : 'UNAVAILABLE'}`;
        console.log(`[R1] ${reason}`);
        await saveLog(base44, 'WAIT', reason, {
          ...commonData, activePosition: true,
          positionSymbol: activePos.instId, positionQty: activePos.qty
        });
        return Response.json({
          decision: 'HOLD', reason, okxPrice, polygon,
          activePosition: { instId: activePos.instId, qty: activePos.qty, entryPrice: activePos.entryPrice, pnlPct }
        });
      }

      // ── Execute SELL ─────────────────────────────────────────────────────────
      const sellReason = hitTP ? `Take profit hit: P&L=${pnlPct}%` : hitSL ? `Stop loss hit: P&L=${pnlPct}%` : `Polygon sell signal (momentum=${polygon.momentum})`;
      console.log(`[R1] SELL: ${sellReason}`);

      const sellBody = JSON.stringify({ instId: activePos.instId, tdMode: 'cash', side: 'sell', ordType: 'market', sz: activePos.qty.toString() });
      const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);

      if (sellRes.code !== '0') {
        const errMsg = `OKX SELL rejected: ${sellRes.msg}`;
        await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', activePosition: true, positionSymbol: activePos.instId, positionQty: activePos.qty, errorMessage: errMsg });
        return Response.json({ decision: 'SELL_FAILED', reason: errMsg, okxCode: sellRes.code }, { status: 400 });
      }

      const sellOrdId = sellRes.data?.[0]?.ordId;
      await new Promise(r => setTimeout(r, 600));

      const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${activePos.instId}&ordId=${sellOrdId}`);
      const fill = verifyRes.data?.[0];

      if (!fill || fill.state !== 'filled') {
        const errMsg = `SELL verify failed or not filled: ordId=${sellOrdId} state=${fill?.state}`;
        await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', errorMessage: errMsg, orderId: sellOrdId });
        return Response.json({ decision: 'SELL_UNVERIFIED', reason: errMsg, ordId: sellOrdId }, { status: 400 });
      }

      const sellFill = {
        ordId: sellOrdId, instId: activePos.instId, side: 'sell',
        avgPx: parseFloat(fill.avgPx || 0), accFillSz: parseFloat(fill.accFillSz || 0),
        fee: parseFloat(fill.fee || 0), feeCcy: fill.feeCcy || 'USDT',
        timestamp: new Date(parseInt(fill.fillTime || fill.uTime || Date.now())).toISOString()
      };

      await saveToLedger(base44, sellFill);

      // Fetch the matching buy from ledger for VerifiedTrade
      const buyLedger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: activePos.buyOrdId });
      if (buyLedger[0]) {
        await matchAndSaveVerifiedTrade(base44, buyLedger[0], sellFill);
      }

      await saveLog(base44, 'SELL', sellReason, {
        ...commonData, orderId: sellOrdId,
        positionSymbol: activePos.instId, positionQty: sellFill.accFillSz
      });

      return Response.json({
        decision: 'SELL_EXECUTED', reason: sellReason, ordId: sellOrdId,
        fill: { avgPx: sellFill.avgPx, accFillSz: sellFill.accFillSz, fee: Math.abs(sellFill.fee) },
        okxPrice, polygon
      });
    }

    // ── CASE B: NO POSITION → check BUY ──────────────────────────────────────
    if (freeUsdt < MIN_TRADE_USDT) {
      const reason = `Insufficient USDT: ${freeUsdt.toFixed(2)} < min ${MIN_TRADE_USDT}`;
      await saveLog(base44, 'WAIT', reason, commonData);
      return Response.json({ decision: 'WAIT', reason, okxPrice, freeUsdt });
    }

    // Polygon available and says NO BUY → wait
    if (polygonStatus === 'OK' && polygon.signal !== 'BUY') {
      const reason = `No BUY signal: Polygon=${polygon.signal}, trend=${polygon.trend}, momentum=${polygon.momentum}`;
      await saveLog(base44, 'WAIT', reason, commonData);
      return Response.json({ decision: 'WAIT', reason, okxPrice, polygon });
    }

    // BUY mode label
    const buyMode = polygonStatus === 'OK'
      ? `Polygon BUY signal (trend=${polygon.trend}, momentum=${polygon.momentum})`
      : `OKX-only mode (Polygon ${polygon.reason || 'unavailable'})`;

    console.log(`[R1] BUY: ${buyMode} freeUSDT=${freeUsdt.toFixed(2)}`);

    // OKX market BUY: use USDT amount with tgtCcy=quote_ccy so sz = USDT to spend
    const buyUsdtAmount = parseFloat((freeUsdt * 0.9).toFixed(2));
    const buyBody = JSON.stringify({ instId: 'ETH-USDT', tdMode: 'cash', side: 'buy', ordType: 'market', sz: buyUsdtAmount.toString(), tgtCcy: 'quote_ccy' });
    const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', buyBody);

    if (buyRes.code !== '0') {
      const errMsg = `OKX BUY rejected: ${buyRes.msg}`;
      await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', errorMessage: errMsg });
      return Response.json({ decision: 'BUY_FAILED', reason: errMsg, okxCode: buyRes.code }, { status: 400 });
    }

    const buyOrdId = buyRes.data?.[0]?.ordId;
    await new Promise(r => setTimeout(r, 600));

    const buyVerify = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=ETH-USDT&ordId=${buyOrdId}`);
    const buyFill = buyVerify.data?.[0];

    if (!buyFill || buyFill.state !== 'filled') {
      const errMsg = `BUY verify failed: ordId=${buyOrdId} state=${buyFill?.state}`;
      await saveLog(base44, 'ERROR', errMsg, { ...commonData, okxStatus: 'FAILED', errorMessage: errMsg, orderId: buyOrdId });
      return Response.json({ decision: 'BUY_UNVERIFIED', reason: errMsg, ordId: buyOrdId }, { status: 400 });
    }

    const buyFillData = {
      ordId: buyOrdId, instId: 'ETH-USDT', side: 'buy',
      avgPx: parseFloat(buyFill.avgPx || 0), accFillSz: parseFloat(buyFill.accFillSz || 0),
      fee: parseFloat(buyFill.fee || 0), feeCcy: buyFill.feeCcy || 'USDT',
      timestamp: new Date(parseInt(buyFill.fillTime || buyFill.uTime || Date.now())).toISOString()
    };

    await saveToLedger(base44, buyFillData);
    await saveLog(base44, 'BUY', buyMode, {
      ...commonData, orderId: buyOrdId, activePosition: true,
      positionSymbol: 'ETH-USDT', positionQty: buyFillData.accFillSz
    });

    console.log(`[R1] BUY EXECUTED ordId=${buyOrdId} qty=${buyFillData.accFillSz} px=${buyFillData.avgPx}`);

    return Response.json({
      decision: 'BUY_EXECUTED', reason: buyMode, ordId: buyOrdId,
      fill: { avgPx: buyFillData.avgPx, accFillSz: buyFillData.accFillSz, fee: Math.abs(buyFillData.fee) },
      okxPrice, polygon
    });

  } catch (err) {
    console.error(`[R1] Exception: ${err.message}`);
    try { await saveLog(base44, 'ERROR', `Exception: ${err.message}`, { errorMessage: err.message }); } catch (_) {}
    return Response.json({ error: err.message }, { status: 500 });
  }
});