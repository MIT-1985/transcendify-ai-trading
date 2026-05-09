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
  if (!apiKey) throw new Error('POLYGON_API_KEY not set');

  // Fetch latest 1m candles for trend, momentum, volume
  const candlesRes = await fetch(
    `https://api.polygon.io/v2/aggs/ticker/X:ETHUSD/range/1/minute/${new Date(Date.now() - 60*60*1000).toISOString().slice(0,10)}/${new Date().toISOString().slice(0,10)}?limit=100&apikey=${apiKey}`
  );
  const candlesData = await candlesRes.json();

  if (!candlesData.results || candlesData.results.length === 0) {
    return { trend: 'NEUTRAL', momentum: 0, volume: 0, volatility: 0, signal: null };
  }

  const candles = candlesData.results.slice(-10); // Last 10 candles
  const closes = candles.map(c => c.c);
  const volumes = candles.map(c => c.v || 0);

  // Trend: check if last 3 closes are higher
  const isUptrend = closes.slice(-3).every((c, i, arr) => !i || c > arr[i - 1]);

  // Momentum: % change from oldest to newest
  const momentum = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;

  // Volume: average of last 5 candles vs older 5
  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const olderVol = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  const volumeRatio = recentVol / (olderVol || 1);

  // Volatility: standard deviation of last 5 closes
  const recentCloses = closes.slice(-5);
  const mean = recentCloses.reduce((a, b) => a + b) / recentCloses.length;
  const variance = recentCloses.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / recentCloses.length;
  const volatility = Math.sqrt(variance);

  // Candle confirmation: last candle close > open
  const lastCandle = candles[candles.length - 1];
  const isBullishCandle = lastCandle.c > lastCandle.o;

  // Signal: BUY if uptrend, positive momentum, high volume, low volatility, bullish candle
  const signal = isUptrend && momentum > 0.1 && volumeRatio > 1.2 && volatility < 1.5 && isBullishCandle ? 'BUY' :
                 !isUptrend && momentum < -0.1 && volatility > 1.5 ? 'SELL' : null;

  return {
    trend: isUptrend ? 'UP' : 'DOWN',
    momentum: parseFloat(momentum.toFixed(3)),
    volume: parseFloat(volumeRatio.toFixed(2)),
    volatility: parseFloat(volatility.toFixed(4)),
    candle: isBullishCandle ? 'BULLISH' : 'BEARISH',
    signal: signal,
    polygonPrice: parseFloat(lastCandle.c.toFixed(2))
  };
}

// ─── Price Comparison (must be within 0.15%) ────────────────────────
function validatePriceDifference(polygonPrice, okxPrice, maxDiffPct = 0.15) {
  if (!polygonPrice || !okxPrice) return { valid: false, diff: null, reason: 'Missing prices' };

  const diff = Math.abs((okxPrice - polygonPrice) / polygonPrice) * 100;
  const valid = diff <= maxDiffPct;

  return {
    valid: valid,
    diff: parseFloat(diff.toFixed(4)),
    reason: valid ? 'PRICE_ALIGNED' : `PRICE_SKEW_${diff.toFixed(2)}%`
  };
}

async function logExecution(base44, decision, reason, data = {}) {
  try {
    const balanceRes = await fetch('https://www.okx.com/api/v5/account/balance', {
      headers: { 'OK-ACCESS-KEY': '' }
    }).catch(() => ({}));
    
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

    console.log(`[ROBOT1] Hybrid Mode: Polygon Signal + OKX Execution`);

    // ─── STEP 1: Get Polygon signal ─────────────────────────────────────
    let polygonSignal = null;
    try {
      polygonSignal = await getPolygonSignal();
      console.log(`[ROBOT1] Polygon signal: ${JSON.stringify(polygonSignal)}`);
    } catch (err) {
      console.error(`[ROBOT1] Polygon fetch failed: ${err.message}`);
      await logExecution(base44, 'ERROR', `Polygon unavailable: ${err.message}`, {
        polygonStatus: 'UNAVAILABLE',
        errorMessage: err.message
      });
      return Response.json({
        error: 'Polygon signal unavailable',
        reason: err.message
      }, { status: 500 });
    }

    // ─── STEP 2: Get OKX connection ────────────────────────────────────
    const [byCreator, byEmail] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: suzanaEmail, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: suzanaEmail, exchange: 'okx' })
    ]);

    const seen = new Set();
    let conns = [...byCreator, ...byEmail].filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    if (conns.length === 0) {
      await logExecution(base44, 'ERROR', 'No OKX connection found', { okxStatus: 'FAILED' });
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
    const bid = parseFloat(tickerRes.data?.[0]?.bidPx || 0);
    const ask = parseFloat(tickerRes.data?.[0]?.askPx || 0);
    const spread = ((ask - bid) / bid * 100).toFixed(4);

    const ethBalance = parseFloat(balanceRes.data?.[0]?.details?.find(d => d.ccy === 'ETH')?.availBal || 0);
    const usdtBalance = parseFloat(balanceRes.data?.[0]?.details?.find(d => d.ccy === 'USDT')?.availBal || 0);

    console.log(`[ROBOT1] OKX price: ${okxPrice}, balance: USDT=${usdtBalance} ETH=${ethBalance}`);

    // ─── STEP 4: Validate Polygon vs OKX price ─────────────────────────
    const priceCheck = validatePriceDifference(polygonSignal.polygonPrice, okxPrice);

    if (!priceCheck.valid) {
      console.log(`[ROBOT1] PRICE MISMATCH: Polygon=${polygonSignal.polygonPrice} OKX=${okxPrice} diff=${priceCheck.diff}%`);
      await logExecution(base44, 'WAIT', `Price skew ${priceCheck.diff}% (spread too high)`, {
        freeUsdt: usdtBalance,
        signalData: polygonSignal
      });
      return Response.json({
        status: 'PRICE_SKEW',
        polygonSignal: polygonSignal,
        okxPrice: okxPrice,
        priceDifference: priceCheck.diff,
        decision: 'SKIP',
        reason: priceCheck.reason
      });
    }

    // ─── STEP 5: Check active position ─────────────────────────────────
    const activeBuys = await base44.asServiceRole.entities.Trade.filter({
      symbol: 'ETH-USDT',
      side: 'BUY',
      execution_mode: 'MAINNET',
      strategy_used: 'robot1'
    });

    const pendingBuy = activeBuys.find(t => !t.exit_price);

    // ─── CASE A: POSITION OPEN → CHECK SELL ────────────────────────────
    if (pendingBuy) {
      const entryPrice = pendingBuy.entry_price;
      const qty = pendingBuy.quantity;
      const unrealizedPnL = (okxPrice - entryPrice) * qty;
      const unrealizedPnLPct = parseFloat(((okxPrice - entryPrice) / entryPrice * 100).toFixed(2));

      const sellGain = unrealizedPnLPct >= 2.0;
      const sellLoss = unrealizedPnLPct <= -1.0;
      const polygonSellSignal = polygonSignal.signal === 'SELL' || polygonSignal.momentum < -0.5;
      const shouldSell = sellGain || sellLoss || polygonSellSignal;

      if (!shouldSell) {
         console.log(`[ROBOT1] Holding: P&L=${unrealizedPnLPct}%, Polygon=${polygonSignal.signal}`);
         await logExecution(base44, 'WAIT', `Active position waiting (P&L=${unrealizedPnLPct}%, trend=${polygonSignal.trend})`, {
           activePosition: true,
           positionSymbol: 'ETH-USDT',
           positionQty: qty,
           freeUsdt: usdtBalance,
           signalData: polygonSignal
         });
         return Response.json({
           status: 'HOLDING',
           polygonSignal: polygonSignal,
           okxPrice: okxPrice,
           priceDifference: priceCheck.diff,
           decision: 'HOLD',
           reason: `P&L=${unrealizedPnLPct}%, need +2% or -1%, Polygon=${polygonSignal.signal}`,
           ordId: null,
           verifiedFill: null
         });
       }

      // Execute SELL
      console.log(`[ROBOT1] SELL SIGNAL: gain=${sellGain}, loss=${sellLoss}, polygon=${polygonSellSignal}`);

      const sellOrderBody = JSON.stringify({
        instId: 'ETH-USDT',
        tdMode: 'cash',
        side: 'sell',
        ordType: 'market',
        sz: qty.toString()
      });

      const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellOrderBody);

      if (sellRes.code !== '0') {
         console.error(`[ROBOT1] SELL FAILED: ${sellRes.msg}`);
         await logExecution(base44, 'ERROR', `OKX verification failed: ${sellRes.msg}`, {
           okxStatus: 'FAILED',
           activePosition: true,
           positionSymbol: 'ETH-USDT',
           positionQty: qty,
           freeUsdt: usdtBalance,
           errorMessage: sellRes.msg
         });
         return Response.json({
           status: 'SELL_ERROR',
           polygonSignal: polygonSignal,
           okxPrice: okxPrice,
           priceDifference: priceCheck.diff,
           decision: 'SELL_FAILED',
           reason: sellRes.msg,
           ordId: null
         }, { status: 400 });
       }

      const ordId = sellRes.data?.[0]?.ordId;
      await new Promise(resolve => setTimeout(resolve, 500));

      const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=ETH-USDT&ordId=${ordId}`);

      if (verifyRes.code !== '0' || !verifyRes.data?.[0]) {
        console.error(`[ROBOT1] SELL verify failed: ${verifyRes.msg}`);
        return Response.json({
          status: 'SELL_VERIFY_FAILED',
          polygonSignal: polygonSignal,
          okxPrice: okxPrice,
          priceDifference: priceCheck.diff,
          decision: 'SELL_UNVERIFIED',
          reason: verifyRes.msg,
          ordId: ordId,
          verifiedFill: null
        }, { status: 400 });
      }

      const verified = verifyRes.data[0];
      const fillSz = parseFloat(verified.accFillSz || 0);
      const fillPx = parseFloat(verified.avgPx || 0);
      const fee = parseFloat(verified.fee || 0);

      const buyValue = entryPrice * qty;
      const buyFee = pendingBuy.fee || 0;
      const sellValue = fillPx * fillSz;
      const realizedPnL = (sellValue - fee) - (buyValue + buyFee);
      const realizedPnLPct = parseFloat(((realizedPnL / (buyValue + buyFee)) * 100).toFixed(2));

      await base44.asServiceRole.entities.Trade.update(pendingBuy.id, {
        exit_price: fillPx,
        profit_loss: realizedPnL,
        timestamp: new Date().toISOString()
      });

      console.log(`[ROBOT1] SOLD: ordId=${ordId}, realized=${realizedPnL.toFixed(2)} USDT`);

      const sellReason = sellGain ? 'Profit +2%' : sellLoss ? 'Loss -1%' : 'Polygon reversal';
      await logExecution(base44, 'SELL', sellReason, {
        orderId: ordId,
        freeUsdt: usdtBalance,
        signalData: polygonSignal
      });

      return Response.json({
        status: 'SOLD',
        polygonSignal: polygonSignal,
        okxPrice: okxPrice,
        priceDifference: priceCheck.diff,
        decision: 'SELL_EXECUTED',
        reason: sellReason,
        ordId: ordId,
        verifiedFill: {
          fillSz: fillSz,
          fillPx: fillPx,
          fee: fee,
          realizedPnL: parseFloat(realizedPnL.toFixed(2)),
          realizedPnLPct: realizedPnLPct
        }
      });
      }

    // ─── CASE B: NO POSITION → CHECK BUY ────────────────────────────────
    console.log(`[ROBOT1] No position. Polygon signal: ${polygonSignal.signal}`);

    if (!polygonSignal.signal || polygonSignal.signal !== 'BUY') {
      await logExecution(base44, 'WAIT', `No BUY signal (Polygon signal=${polygonSignal.signal}, trend=${polygonSignal.trend})`, {
        freeUsdt: usdtBalance,
        signalData: polygonSignal
      });
      return Response.json({
        status: 'READY_NO_BUY',
        polygonSignal: polygonSignal,
        okxPrice: okxPrice,
        priceDifference: priceCheck.diff,
        decision: 'WAIT',
        reason: `Polygon signal=${polygonSignal.signal} (need BUY), USDT=${usdtBalance}`,
        ordId: null,
        verifiedFill: null
      });
    }

    // Polygon says BUY and price is aligned
    console.log(`[ROBOT1] BUY SIGNAL from Polygon: trend=${polygonSignal.trend}, momentum=${polygonSignal.momentum}`);

    // Check resources
    if (ethBalance > 0 || usdtBalance < 10) {
      const insuffReason = ethBalance > 0 ? `ETH=${ethBalance} (must be 0)` : `USDT=${usdtBalance} (need >10)`;
      await logExecution(base44, 'WAIT', `Insufficient USDT: ${insuffReason}`, {
        freeUsdt: usdtBalance,
        signalData: polygonSignal,
        errorMessage: insuffReason
      });
      return Response.json({
        status: 'READY_NO_BUY',
        polygonSignal: polygonSignal,
        okxPrice: okxPrice,
        priceDifference: priceCheck.diff,
        decision: 'WAIT',
        reason: `Polygon BUY ready but: ETH=${ethBalance} (must be 0), USDT=${usdtBalance} (need >10)`,
        ordId: null,
        verifiedFill: null
      });
    }

    // Execute BUY
    const buyQty = (usdtBalance * 0.9 / okxPrice).toFixed(6); // 90% of balance

    console.log(`[ROBOT1] Placing BUY order: qty=${buyQty} at ${okxPrice}`);

    const buyOrderBody = JSON.stringify({
      instId: 'ETH-USDT',
      tdMode: 'cash',
      side: 'buy',
      ordType: 'market',
      sz: buyQty.toString()
    });

    const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', buyOrderBody);

    if (buyRes.code !== '0') {
      console.error(`[ROBOT1] BUY FAILED: ${buyRes.msg}`);
      await logExecution(base44, 'ERROR', `OKX verification failed: ${buyRes.msg}`, {
        okxStatus: 'FAILED',
        freeUsdt: usdtBalance,
        signalData: polygonSignal,
        errorMessage: buyRes.msg
      });
      return Response.json({
        status: 'BUY_ERROR',
        polygonSignal: polygonSignal,
        okxPrice: okxPrice,
        priceDifference: priceCheck.diff,
        decision: 'BUY_FAILED',
        reason: buyRes.msg,
        ordId: null
      }, { status: 400 });
    }

    const buyOrdId = buyRes.data?.[0]?.ordId;
    await new Promise(resolve => setTimeout(resolve, 500));

    const buyVerifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=ETH-USDT&ordId=${buyOrdId}`);

    if (buyVerifyRes.code !== '0' || !buyVerifyRes.data?.[0]) {
      console.error(`[ROBOT1] BUY verify failed: ${buyVerifyRes.msg}`);
      return Response.json({
        status: 'BUY_VERIFY_FAILED',
        polygonSignal: polygonSignal,
        okxPrice: okxPrice,
        priceDifference: priceCheck.diff,
        decision: 'BUY_UNVERIFIED',
        reason: buyVerifyRes.msg,
        ordId: buyOrdId,
        verifiedFill: null
      }, { status: 400 });
    }

    const buyVerified = buyVerifyRes.data[0];
    const buyFillSz = parseFloat(buyVerified.accFillSz || 0);
    const buyFillPx = parseFloat(buyVerified.avgPx || 0);
    const buyFee = parseFloat(buyVerified.fee || 0);

    // Record trade
    await base44.asServiceRole.entities.Trade.create({
      subscription_id: 'robot1',
      symbol: 'ETH-USDT',
      side: 'BUY',
      quantity: buyFillSz,
      price: buyFillPx,
      entry_price: buyFillPx,
      total_value: buyFillSz * buyFillPx,
      fee: buyFee,
      execution_mode: 'MAINNET',
      strategy_used: 'robot1',
      timestamp: new Date().toISOString()
    });

    console.log(`[ROBOT1] BUY EXECUTED: ordId=${buyOrdId}, qty=${buyFillSz}, px=${buyFillPx}`);

    await logExecution(base44, 'BUY', `Polygon BUY signal (trend=${polygonSignal.trend})`, {
      orderId: buyOrdId,
      activePosition: true,
      positionSymbol: 'ETH-USDT',
      positionQty: buyFillSz,
      freeUsdt: usdtBalance,
      signalData: polygonSignal
    });

    return Response.json({
      status: 'BOUGHT',
      polygonSignal: polygonSignal,
      okxPrice: okxPrice,
      priceDifference: priceCheck.diff,
      decision: 'BUY_EXECUTED',
      reason: `Polygon signal=${polygonSignal.signal}, trend=${polygonSignal.trend}`,
      ordId: buyOrdId,
      verifiedFill: {
        fillSz: buyFillSz,
        fillPx: buyFillPx,
        fee: buyFee
      }
    });
    } catch (err) {
    console.error(`[ROBOT1] Exception: ${err.message}`);
    await logExecution(base44, 'ERROR', `Exception: ${err.message}`, { errorMessage: err.message });
    return Response.json({ error: err.message }, { status: 500 });
    }
    });