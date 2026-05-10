import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function deriveOkxKey() {
  const enc = new TextEncoder();
  const appId = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(appId), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
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

async function hmacSignOkx(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxRequest(apiKey, secret, passphrase, method, path, bodyStr = '') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + bodyStr;
  const signature = await hmacSignOkx(secret, message);
  const res = await fetch('https://www.okx.com' + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    },
    body: bodyStr || undefined
  });
  return res.json();
}

// ─── Polygon Market Analysis ────────────────────────────────────────
async function getPolygonSignal() {
  const apiKey = Deno.env.get('POLYGON_API_KEY');
  if (!apiKey) return { signal: null, polygonPrice: null, status: 'UNAVAILABLE', reason: 'No API key' };

  const now = new Date();
  const toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fromDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  console.log(`[ROBOT1] Polygon fetch: from=${from} to=${to}`);

  try {
    const candlesRes = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/X:ETHUSD/range/1/hour/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${apiKey}`
    );
    const candlesData = await candlesRes.json();
    console.log(`[ROBOT1] Polygon response: status=${candlesData.status} count=${candlesData.results?.length || 0}`);

    if (!candlesData.results || candlesData.results.length < 5) {
      console.log(`[ROBOT1] Polygon returned ${candlesData.results?.length || 0} candles — OKX-only mode`);
      return { signal: null, polygonPrice: null, status: 'UNAVAILABLE', reason: `Only ${candlesData.results?.length || 0} candles` };
    }

    const candles = candlesData.results.slice(-20);
    const closes = candles.map(c => c.c);
    const volumes = candles.map(c => c.v || 0);

    const isUptrend = closes.slice(-3).every((c, i, arr) => !i || c > arr[i - 1]);
    const momentum = ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const olderVol = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const volumeRatio = recentVol / (olderVol || 1);
    const recentCloses = closes.slice(-10);
    const mean = recentCloses.reduce((a, b) => a + b) / recentCloses.length;
    const variance = recentCloses.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / recentCloses.length;
    const volatilityPct = (Math.sqrt(variance) / mean) * 100;
    const lastCandle = candles[candles.length - 1];
    const isBullishCandle = lastCandle.c > lastCandle.o;

    const signal = isUptrend && momentum > 0.3 && volumeRatio > 1.1 && volatilityPct < 2.0 && isBullishCandle ? 'BUY' :
                   !isUptrend && momentum < -0.3 && volatilityPct > 1.5 ? 'SELL' : null;

    console.log(`[ROBOT1] Polygon: trend=${isUptrend?'UP':'DOWN'} momentum=${momentum.toFixed(3)}% volRatio=${volumeRatio.toFixed(2)} signal=${signal}`);

    return {
      trend: isUptrend ? 'UP' : 'DOWN',
      momentum: parseFloat(momentum.toFixed(3)),
      volume: parseFloat(volumeRatio.toFixed(2)),
      volatility: parseFloat(volatilityPct.toFixed(4)),
      candle: isBullishCandle ? 'BULLISH' : 'BEARISH',
      signal,
      polygonPrice: parseFloat(lastCandle.c.toFixed(2)),
      status: 'OK'
    };
  } catch (err) {
    console.error(`[ROBOT1] Polygon fetch error: ${err.message}`);
    return { signal: null, polygonPrice: null, status: 'UNAVAILABLE', reason: err.message };
  }
}

async function logExecution(base44, decision, reason, data = {}) {
  try {
    await base44.asServiceRole.entities.Robot1ExecutionLog.create({
      execution_time: new Date().toISOString(),
      decision,
      reason,
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
    console.error(`[ROBOT1] Log creation failed: ${err.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const suzanaEmail = 'nikitasuziface77@gmail.com';
    if (user.email !== suzanaEmail && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log(`[ROBOT1] === START EXECUTION ===`);

    // ─── STEP 1: Try Polygon signal (non-blocking) ─────────────────────
    const polygonSignal = await getPolygonSignal();
    const polygonAvailable = polygonSignal.status === 'OK';
    console.log(`[ROBOT1] Polygon status=${polygonSignal.status} signal=${polygonSignal.signal}`);

    // ─── STEP 2: Get OKX connection ────────────────────────────────────
    const [byCreator, byEmail] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: suzanaEmail, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: suzanaEmail, exchange: 'okx' })
    ]);

    const seen = new Set();
    const conns = [...byCreator, ...byEmail].filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    if (conns.length === 0) {
      await logExecution(base44, 'ERROR', 'No OKX connection found', {
        okxStatus: 'FAILED',
        polygonStatus: polygonAvailable ? 'OK' : 'UNAVAILABLE'
      });
      return Response.json({ error: 'No OKX connection' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decryptOkx(conn.api_key_encrypted);
    const apiSecret = await decryptOkx(conn.api_secret_encrypted);
    const passphrase = await decryptOkx(conn.encryption_iv);

    // ─── STEP 3: Fetch OKX live price + balance ────────────────────────
    const [tickerRes, balanceRes] = await Promise.all([
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/market/ticker?instId=ETH-USDT'),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance')
    ]);

    const okxPrice = parseFloat(tickerRes.data?.[0]?.last || 0);
    if (!okxPrice) {
      await logExecution(base44, 'ERROR', 'OKX price fetch failed', { okxStatus: 'FAILED' });
      return Response.json({ error: 'OKX price unavailable' }, { status: 500 });
    }

    const ethBalance = parseFloat(balanceRes.data?.[0]?.details?.find(d => d.ccy === 'ETH')?.availBal || 0);
    const usdtBalance = parseFloat(balanceRes.data?.[0]?.details?.find(d => d.ccy === 'USDT')?.availBal || 0);

    console.log(`[ROBOT1] OKX price=${okxPrice} USDT=${usdtBalance} ETH=${ethBalance}`);

    // ─── STEP 4: Validate price ONLY if Polygon is available ──────────
    // NEVER block on price mismatch if Polygon is unavailable
    let priceDiff = null;
    if (polygonAvailable && polygonSignal.polygonPrice) {
      const diff = Math.abs((okxPrice - polygonSignal.polygonPrice) / polygonSignal.polygonPrice) * 100;
      priceDiff = parseFloat(diff.toFixed(4));
      if (diff > 0.15) {
        console.log(`[ROBOT1] Price skew ${diff.toFixed(3)}% — skipping trade this cycle`);
        await logExecution(base44, 'WAIT', `Price skew ${diff.toFixed(2)}% (Polygon=${polygonSignal.polygonPrice} OKX=${okxPrice})`, {
          freeUsdt: usdtBalance,
          signalData: polygonSignal,
          polygonStatus: 'OK'
        });
        return Response.json({
          status: 'PRICE_SKEW', polygonSignal, okxPrice, priceDifference: priceDiff,
          decision: 'WAIT', reason: `Price skew ${diff.toFixed(2)}% — skipping`
        });
      }
    }

    // ─── STEP 5: Check active Robot1 ETH or SOL position ──────────────
    const [ethTrades, solTrades] = await Promise.all([
      base44.asServiceRole.entities.Trade.filter({ symbol: 'ETH-USDT', side: 'BUY', execution_mode: 'MAINNET', strategy_used: 'robot1' }),
      base44.asServiceRole.entities.Trade.filter({ symbol: 'SOL-USDT', side: 'BUY', execution_mode: 'MAINNET', strategy_used: 'robot1' })
    ]);

    const pendingBuy = [...ethTrades, ...solTrades].find(t => !t.exit_price);
    const polygonStatus = polygonAvailable ? 'OK' : 'UNAVAILABLE';

    // ─── CASE A: POSITION OPEN → CHECK SELL ────────────────────────────
    if (pendingBuy) {
      const entryPrice = pendingBuy.entry_price;
      const qty = pendingBuy.quantity;
      const symbol = pendingBuy.symbol;
      const unrealizedPnLPct = parseFloat(((okxPrice - entryPrice) / entryPrice * 100).toFixed(2));

      const sellGain = unrealizedPnLPct >= 2.0;
      const sellLoss = unrealizedPnLPct <= -1.0;
      const polygonSellSignal = polygonAvailable && (polygonSignal.signal === 'SELL' || polygonSignal.momentum < -0.5);
      const shouldSell = sellGain || sellLoss || polygonSellSignal;

      if (!shouldSell) {
        const holdReason = `Holding ${symbol}: P&L=${unrealizedPnLPct}%, need +2% or -1%, Polygon=${polygonAvailable ? polygonSignal.signal : 'UNAVAILABLE'}`;
        console.log(`[ROBOT1] ${holdReason}`);
        await logExecution(base44, 'WAIT', holdReason, {
          activePosition: true, positionSymbol: symbol, positionQty: qty,
          freeUsdt: usdtBalance, signalData: polygonSignal,
          polygonStatus, okxStatus: 'OK'
        });
        return Response.json({
          status: 'HOLDING', polygonSignal, okxPrice, priceDifference: priceDiff,
          decision: 'HOLD', reason: holdReason, ordId: null, verifiedFill: null,
          activePosition: { symbol, qty, entryPrice, unrealizedPnLPct }
        });
      }

      // Execute SELL
      const sellReason = sellGain ? 'Profit target +2%' : sellLoss ? 'Stop loss -1%' : 'Polygon reversal signal';
      console.log(`[ROBOT1] SELL: ${sellReason}`);

      const sellOrderBody = JSON.stringify({ instId: symbol, tdMode: 'cash', side: 'sell', ordType: 'market', sz: qty.toString() });
      const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellOrderBody);

      if (sellRes.code !== '0') {
        const errMsg = sellRes.msg || 'OKX SELL rejected';
        await logExecution(base44, 'ERROR', `SELL failed: ${errMsg}`, {
          okxStatus: 'FAILED', activePosition: true, positionSymbol: symbol,
          positionQty: qty, freeUsdt: usdtBalance, errorMessage: errMsg, polygonStatus
        });
        return Response.json({ status: 'SELL_ERROR', decision: 'SELL_FAILED', reason: errMsg, okxPrice }, { status: 400 });
      }

      const ordId = sellRes.data?.[0]?.ordId;
      await new Promise(resolve => setTimeout(resolve, 600));

      const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${symbol}&ordId=${ordId}`);
      const verified = verifyRes.data?.[0];
      const fillSz = parseFloat(verified?.accFillSz || 0);
      const fillPx = parseFloat(verified?.avgPx || 0);
      const fee = parseFloat(verified?.fee || 0);

      const buyValue = entryPrice * qty;
      const buyFee = pendingBuy.fee || 0;
      const sellValue = fillPx * fillSz;
      const realizedPnL = (sellValue - Math.abs(fee)) - (buyValue + Math.abs(buyFee));
      const realizedPnLPct = parseFloat(((realizedPnL / (buyValue + Math.abs(buyFee))) * 100).toFixed(2));

      await base44.asServiceRole.entities.Trade.update(pendingBuy.id, {
        exit_price: fillPx, profit_loss: realizedPnL, timestamp: new Date().toISOString()
      });

      console.log(`[ROBOT1] SOLD ordId=${ordId} realizedPnL=${realizedPnL.toFixed(2)}`);
      await logExecution(base44, 'SELL', sellReason, {
        orderId: ordId, freeUsdt: usdtBalance, signalData: polygonSignal,
        polygonStatus, okxStatus: 'OK'
      });

      return Response.json({
        status: 'SOLD', polygonSignal, okxPrice, priceDifference: priceDiff,
        decision: 'SELL_EXECUTED', reason: sellReason, ordId,
        verifiedFill: { fillSz, fillPx, fee: Math.abs(fee), realizedPnL: parseFloat(realizedPnL.toFixed(2)), realizedPnLPct }
      });
    }

    // ─── CASE B: NO POSITION → CHECK BUY ────────────────────────────────
    console.log(`[ROBOT1] No open position. freeUSDT=${usdtBalance} ETH=${ethBalance}`);

    // BUY conditions:
    // - Must have enough USDT (>= 10)
    // - Must NOT have ETH already (clean entry)
    // - Either Polygon says BUY, OR Polygon is unavailable (OKX-only mode)
    if (usdtBalance < 10) {
      const reason = `No BUY: insufficient USDT=${usdtBalance.toFixed(2)} (need >= 10)`;
      await logExecution(base44, 'WAIT', reason, {
        freeUsdt: usdtBalance, signalData: polygonSignal, polygonStatus, okxStatus: 'OK'
      });
      return Response.json({ status: 'WAIT', decision: 'WAIT', reason, okxPrice, polygonSignal });
    }

    if (ethBalance >= 0.001) {
      const reason = `No BUY: ETH balance=${ethBalance} already held (no open trade record — manual hold?)`;
      await logExecution(base44, 'WAIT', reason, {
        freeUsdt: usdtBalance, signalData: polygonSignal, polygonStatus, okxStatus: 'OK'
      });
      return Response.json({ status: 'WAIT', decision: 'WAIT', reason, okxPrice, polygonSignal });
    }

    // Check Polygon signal — only block BUY if Polygon IS available AND says no BUY
    if (polygonAvailable && polygonSignal.signal !== 'BUY') {
      const reason = `No BUY signal from Polygon: signal=${polygonSignal.signal}, trend=${polygonSignal.trend}, momentum=${polygonSignal.momentum}`;
      await logExecution(base44, 'WAIT', reason, {
        freeUsdt: usdtBalance, signalData: polygonSignal, polygonStatus: 'OK', okxStatus: 'OK'
      });
      return Response.json({ status: 'WAIT', decision: 'WAIT', reason, okxPrice, polygonSignal });
    }

    const buyMode = polygonAvailable ? `Polygon BUY signal (trend=${polygonSignal.trend})` : `OKX-only mode (Polygon unavailable)`;
    console.log(`[ROBOT1] Executing BUY — ${buyMode}`);

    const buyQty = (usdtBalance * 0.9 / okxPrice).toFixed(6);
    const buyOrderBody = JSON.stringify({ instId: 'ETH-USDT', tdMode: 'cash', side: 'buy', ordType: 'market', sz: buyQty.toString() });
    const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', buyOrderBody);

    if (buyRes.code !== '0') {
      const errMsg = buyRes.msg || 'OKX BUY rejected';
      await logExecution(base44, 'ERROR', `BUY failed: ${errMsg}`, {
        okxStatus: 'FAILED', freeUsdt: usdtBalance, errorMessage: errMsg, polygonStatus
      });
      return Response.json({ status: 'BUY_ERROR', decision: 'BUY_FAILED', reason: errMsg, okxPrice }, { status: 400 });
    }

    const buyOrdId = buyRes.data?.[0]?.ordId;
    await new Promise(resolve => setTimeout(resolve, 600));

    const buyVerifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=ETH-USDT&ordId=${buyOrdId}`);
    const buyVerified = buyVerifyRes.data?.[0];
    const buyFillSz = parseFloat(buyVerified?.accFillSz || 0);
    const buyFillPx = parseFloat(buyVerified?.avgPx || 0);
    const buyFee = parseFloat(buyVerified?.fee || 0);

    await base44.asServiceRole.entities.Trade.create({
      subscription_id: 'robot1', symbol: 'ETH-USDT', side: 'BUY',
      quantity: buyFillSz, price: buyFillPx, entry_price: buyFillPx,
      total_value: buyFillSz * buyFillPx, fee: buyFee,
      execution_mode: 'MAINNET', strategy_used: 'robot1',
      timestamp: new Date().toISOString()
    });

    console.log(`[ROBOT1] BUY EXECUTED ordId=${buyOrdId} qty=${buyFillSz} px=${buyFillPx}`);
    await logExecution(base44, 'BUY', buyMode, {
      orderId: buyOrdId, activePosition: true, positionSymbol: 'ETH-USDT',
      positionQty: buyFillSz, freeUsdt: usdtBalance, signalData: polygonSignal,
      polygonStatus, okxStatus: 'OK'
    });

    return Response.json({
      status: 'BOUGHT', polygonSignal, okxPrice, priceDifference: priceDiff,
      decision: 'BUY_EXECUTED', reason: buyMode, ordId: buyOrdId,
      verifiedFill: { fillSz: buyFillSz, fillPx: buyFillPx, fee: Math.abs(buyFee) }
    });

  } catch (err) {
    console.error(`[ROBOT1] Exception: ${err.message}`);
    try {
      const base44 = createClientFromRequest(req);
      await logExecution(base44, 'ERROR', `Exception: ${err.message}`, { errorMessage: err.message });
    } catch (_) {}
    return Response.json({ error: err.message }, { status: 500 });
  }
});