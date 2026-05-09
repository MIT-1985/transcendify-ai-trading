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

// ─── Market Analysis Helpers ────────────────────────────────────────
function analyzeTrend(candles) {
  if (!candles || candles.length < 5) return { trend: 'NEUTRAL', momentum: 0, sma5: 0 };
  
  // candles[0] is most recent (newest first)
  const closes = candles.map(c => parseFloat(c[4])).reverse(); // Reverse for chronological order
  const sma5 = closes.reduce((a, b) => a + b) / closes.length;
  const currentClose = closes[closes.length - 1];
  const prevClose = closes[0];
  
  // Check if last 3 closes are in uptrend
  const isUptrend = closes.slice(-3).every((c, i, arr) => !i || c > arr[i - 1]);
  const momentum = ((currentClose - prevClose) / prevClose) * 100;
  
  return {
    trend: isUptrend ? 'UP' : 'DOWN',
    momentum: parseFloat(momentum.toFixed(3)),
    sma5: parseFloat(sma5.toFixed(2)),
    currentClose: parseFloat(currentClose.toFixed(2))
  };
}

function calculateVolatility(candles) {
  if (!candles || candles.length < 3) return 0;
  const closes = candles.map(c => parseFloat(c[4]));
  const mean = closes.reduce((a, b) => a + b) / closes.length;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / closes.length;
  return parseFloat(Math.sqrt(variance).toFixed(4));
}

function calculateSpread(bid, ask) {
  return parseFloat(((ask - bid) / bid * 100).toFixed(4));
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

    console.log(`[ROBOT1] Smart Mode activated`);

    // Get OKX connection
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
      return Response.json({ error: 'No OKX connection' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decryptOkx(conn.api_key_encrypted);
    const apiSecret = await decryptOkx(conn.api_secret_encrypted);
    const passphrase = await decryptOkx(conn.encryption_iv);

    // ─── 1. FETCH LIVE MARKET DATA ──────────────────────────────────────
    console.log(`[ROBOT1] Fetching live OKX data...`);

    const [tickerRes, candles5mRes, candles1mRes, balanceRes] = await Promise.all([
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/market/ticker?instId=ETH-USDT'),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/market/candles?instId=ETH-USDT&bar=5m&limit=10'),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/market/candles?instId=ETH-USDT&bar=1m&limit=5'),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance')
    ]);

    const lastPrice = parseFloat(tickerRes.data?.[0]?.last || 0);
    const bid = parseFloat(tickerRes.data?.[0]?.bidPx || 0);
    const ask = parseFloat(tickerRes.data?.[0]?.askPx || 0);
    const spread = calculateSpread(bid, ask);

    const trend5m = analyzeTrend(candles5mRes.data || []);
    const trend1m = analyzeTrend(candles1mRes.data || []);
    const volatility = calculateVolatility(candles1mRes.data || []);

    const ethBalance = parseFloat(balanceRes.data?.[0]?.details?.find(d => d.ccy === 'ETH')?.availBal || 0);
    const usdtBalance = parseFloat(balanceRes.data?.[0]?.details?.find(d => d.ccy === 'USDT')?.availBal || 0);

    // ─── 2. CHECK ACTIVE POSITION ───────────────────────────────────────
    const activeBuys = await base44.asServiceRole.entities.Trade.filter({
      symbol: 'ETH-USDT',
      side: 'BUY',
      execution_mode: 'MAINNET',
      strategy_used: 'robot1'
    });

    const pendingBuy = activeBuys.find(t => !t.exit_price);

    // ─── CASE A: ACTIVE POSITION EXISTS → CHECK SELL CONDITIONS ──────────
    if (pendingBuy) {
      const entryPrice = pendingBuy.entry_price;
      const qty = pendingBuy.quantity;
      const unrealizedPnL = (lastPrice - entryPrice) * qty;
      const unrealizedPnLPct = parseFloat(((lastPrice - entryPrice) / entryPrice * 100).toFixed(2));

      const sellGain = unrealizedPnLPct >= 2.0;
      const sellLoss = unrealizedPnLPct <= -1.0;
      const momentumReversed = trend1m.momentum < -0.5; // Strong downmove on 1m
      const shouldSell = sellGain || sellLoss || momentumReversed;

      if (!shouldSell) {
        // Still holding
        return Response.json({
          status: 'HOLDING',
          marketTrend: trend5m.trend,
          lastPrice: lastPrice,
          spread: spread,
          volatility: volatility,
          decision: 'HOLD',
          reason: `P&L=${unrealizedPnLPct}% (need +2% or -1%), momentum=${trend1m.momentum}%`,
          executionLog: {
            entryPx: parseFloat(entryPrice.toFixed(2)),
            currentPx: lastPrice,
            pnlPercent: unrealizedPnLPct,
            action: 'WAIT',
            ordId: null,
            realizedPnL: 0
          }
        });
      }

      // Execute SELL
      console.log(`[ROBOT1] SELL SIGNAL: gain=${sellGain}, loss=${sellLoss}, momentum=${momentumReversed}`);

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
        return Response.json({
          status: 'SELL_ERROR',
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
          decision: 'SELL_EXECUTED_UNVERIFIED',
          ordId: ordId,
          reason: verifyRes.msg
        }, { status: 400 });
      }

      const verifiedSell = verifyRes.data[0];
      const fillSz = parseFloat(verifiedSell.accFillSz || 0);
      const fillPx = parseFloat(verifiedSell.avgPx || 0);
      const fee = parseFloat(verifiedSell.fee || 0);

      const buyValue = entryPrice * qty;
      const buyFee = pendingBuy.fee || 0;
      const sellValue = fillPx * fillSz;
      const realizedPnL = (sellValue - fee) - (buyValue + buyFee);
      const realizedPnLPct = parseFloat(((realizedPnL / (buyValue + buyFee)) * 100).toFixed(2));

      // Mark closed
      await base44.asServiceRole.entities.Trade.update(pendingBuy.id, {
        exit_price: fillPx,
        profit_loss: realizedPnL,
        timestamp: new Date().toISOString()
      });

      console.log(`[ROBOT1] SOLD: ordId=${ordId}, realized=${realizedPnL.toFixed(2)} USDT (${realizedPnLPct}%)`);

      return Response.json({
        status: 'SOLD',
        marketTrend: trend5m.trend,
        lastPrice: lastPrice,
        spread: spread,
        volatility: volatility,
        decision: 'SELL_EXECUTED',
        reason: sellGain ? 'Profit +2%' : sellLoss ? 'Loss -1%' : 'Momentum reversal',
        ordId: ordId,
        verifiedFill: {
          fillSz: fillSz,
          fillPx: fillPx,
          fee: fee
        },
        executionLog: {
          entryPx: parseFloat(entryPrice.toFixed(2)),
          currentPx: lastPrice,
          sellPx: fillPx,
          pnlPercent: unrealizedPnLPct,
          action: 'SELL',
          ordId: ordId,
          realizedPnL: parseFloat(realizedPnL.toFixed(2))
        }
      });
    }

    // ─── CASE B: NO ACTIVE POSITION → CHECK BUY CONDITIONS ───────────────
    console.log(`[ROBOT1] No active position. Checking BUY signals...`);

    const spreadOK = spread < 0.05; // Tight spread
    const trend5mUp = trend5m.trend === 'UP';
    const trend1mUp = trend1m.trend === 'UP';
    const volatilityLow = volatility < 2.0;

    const canBuy = trend5mUp && trend1mUp && spreadOK && volatilityLow && ethBalance === 0 && usdtBalance > 10;

    if (!canBuy) {
      const reasons = [];
      if (!trend5mUp) reasons.push('5m trend down');
      if (!trend1mUp) reasons.push('1m trend down');
      if (!spreadOK) reasons.push(`spread ${spread}% too high`);
      if (!volatilityLow) reasons.push(`volatility ${volatility} high`);
      if (ethBalance > 0) reasons.push('ETH already held');
      if (usdtBalance <= 10) reasons.push('insufficient USDT');

      return Response.json({
        status: 'READY_NO_BUY',
        marketTrend: trend5m.trend,
        lastPrice: lastPrice,
        spread: spread,
        volatility: volatility,
        decision: 'WAIT_FOR_SETUP',
        reason: reasons.join(' | '),
        marketData: {
          trend5m: trend5m,
          trend1m: trend1m,
          spreadOK: spreadOK,
          volatilityLow: volatilityLow,
          usdtBalance: usdtBalance
        }
      });
    }

    // BUY signal confirmed
    console.log(`[ROBOT1] BUY SIGNAL: All conditions met`);

    // Placeholder for future auto-BUY logic
    return Response.json({
      status: 'BUY_READY',
      marketTrend: trend5m.trend,
      lastPrice: lastPrice,
      spread: spread,
      volatility: volatility,
      decision: 'BUY_CONFIRMED',
      reason: 'All conditions met: 5m up, 1m up, tight spread, low volatility, no position',
      marketData: {
        trend5m: trend5m,
        trend1m: trend1m,
        spread: spread,
        volatility: volatility
      },
      ordId: null,
      verifiedFill: null
    });
  } catch (err) {
    console.error(`[ROBOT1] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});