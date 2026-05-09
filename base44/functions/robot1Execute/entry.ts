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

    console.log(`[ROBOT1] Execute triggered by ${user.email}`);

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

    // ─── Check if we have an active BUY waiting for SELL ─────────────────
    const activeBuys = await base44.asServiceRole.entities.Trade.filter({
      symbol: 'ETH-USDT',
      side: 'BUY',
      execution_mode: 'MAINNET',
      strategy_used: 'robot1'
    });

    const pendingBuy = activeBuys.find(t => !t.exit_price); // No exit_price = still open
    
    if (!pendingBuy) {
      console.log(`[ROBOT1] DECISION: No active BUY position`);
      return Response.json({
        status: 'NO_POSITION',
        message: 'No active BUY position. Awaiting manual BUY entry.',
        activeBuyCount: activeBuys.length
      });
    }

    // ─── SELL CONDITION CHECK ────────────────────────────────────────────
    const entryPrice = pendingBuy.entry_price;
    const quantity = pendingBuy.quantity;
    
    const tickerRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/market/ticker?instId=ETH-USDT');
    const currentPrice = parseFloat(tickerRes.data?.[0]?.last || 0);

    if (currentPrice === 0) {
      return Response.json({
        status: 'PRICE_FETCH_FAILED',
        message: 'Could not fetch current ETH price'
      }, { status: 500 });
    }

    const unrealizedPnL = (currentPrice - entryPrice) * quantity;
    const unrealizedPnLPct = parseFloat(((currentPrice - entryPrice) / entryPrice * 100).toFixed(2));

    const sellConditionGain = unrealizedPnLPct >= 2.0;    // profit >= +2%
    const sellConditionLoss = unrealizedPnLPct <= -1.0;   // loss <= -1%
    const sellConditionMet = sellConditionGain || sellConditionLoss;

    // ─── If no SELL condition, return decision status ────────────────────
    if (!sellConditionMet) {
      const executionLog = {
        entryPx: parseFloat(entryPrice.toFixed(2)),
        currentPx: parseFloat(currentPrice.toFixed(2)),
        pnlPercent: unrealizedPnLPct,
        action: 'WAIT',
        ordId: null,
        realizedPnL: 0
      };
      console.log(`[ROBOT1] EXECUTION LOG: ${JSON.stringify(executionLog)}`);
      
      return Response.json({
        status: 'WAITING',
        executionLog: executionLog,
        activePosition: {
          tradeId: pendingBuy.id,
          quantity: quantity,
          entryPrice: entryPrice,
          currentPrice: currentPrice,
          unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
          unrealizedPnLPct: unrealizedPnLPct
        }
      });
    }

    // ─── SELL CONDITION MET: Execute market SELL ────────────────────────
    console.log(`[ROBOT1] SELL CONDITION MET: P&L=${unrealizedPnLPct}%. Executing SELL...`);
    
    const sellOrderBody = JSON.stringify({
      instId: 'ETH-USDT',
      tdMode: 'cash',
      side: 'sell',
      ordType: 'market',
      sz: quantity.toString()
    });

    const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellOrderBody);
    
    if (sellRes.code !== '0') {
      console.error(`[ROBOT1] SELL FAILED: ${sellRes.msg}`);
      return Response.json({
        status: 'SELL_ERROR',
        okxCode: sellRes.code,
        errorMessage: sellRes.msg,
        activePosition: {
          tradeId: pendingBuy.id,
          quantity: quantity,
          entryPrice: entryPrice,
          currentPrice: currentPrice,
          unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
          unrealizedPnLPct: unrealizedPnLPct
        }
      }, { status: 400 });
    }

    const sellOrdId = sellRes.data?.[0]?.ordId;
    console.log(`[ROBOT1] SELL order placed: ordId=${sellOrdId}`);
    
    // ─── Verify SELL order ───────────────────────────────────────────────
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=ETH-USDT&ordId=${sellOrdId}`);
    
    if (verifyRes.code !== '0' || !verifyRes.data?.[0]) {
      console.error(`[ROBOT1] SELL verification failed: ${verifyRes.msg}`);
      return Response.json({
        status: 'SELL_VERIFY_FAILED',
        okxCode: verifyRes.code,
        errorMessage: verifyRes.msg,
        sellOrdId: sellOrdId
      }, { status: 400 });
    }

    const verifiedSell = verifyRes.data[0];
    const sellFilledQty = parseFloat(verifiedSell.accFillSz || 0);
    const sellAvgPrice = parseFloat(verifiedSell.avgPx || 0);
    const sellFee = parseFloat(verifiedSell.fee || 0);

    console.log(`[ROBOT1] SELL verified: qty=${sellFilledQty} avgPrice=${sellAvgPrice} fee=${sellFee}`);

    // ─── Calculate realized P&L from real fills ──────────────────────────
    const buyValue = pendingBuy.entry_price * pendingBuy.quantity;
    const buyFee = pendingBuy.fee || 0;
    const sellValue = sellAvgPrice * sellFilledQty;
    const realizedPnL = (sellValue - sellFee) - (buyValue + buyFee);
    const realizedPnLPct = parseFloat(((realizedPnL / (buyValue + buyFee)) * 100).toFixed(2));

    console.log(`[ROBOT1] Realized P&L: ${realizedPnL.toFixed(2)} USDT (${realizedPnLPct}%)`);

    // ─── Update position: set exit_price to mark it closed ───────────────
    await base44.asServiceRole.entities.Trade.update(pendingBuy.id, {
      exit_price: sellAvgPrice,
      profit_loss: realizedPnL,
      timestamp: new Date().toISOString()
    });

    const executionLog = {
      entryPx: parseFloat(entryPrice.toFixed(2)),
      currentPx: parseFloat(currentPrice.toFixed(2)),
      sellPx: parseFloat(sellAvgPrice.toFixed(2)),
      pnlPercent: unrealizedPnLPct,
      action: 'SELL',
      ordId: sellOrdId,
      realizedPnL: parseFloat(realizedPnL.toFixed(2))
    };

    console.log(`[ROBOT1] EXECUTION LOG: ${JSON.stringify(executionLog)}`);

    return Response.json({
      status: 'SOLD',
      executionLog: executionLog,
      soldPosition: {
        tradeId: pendingBuy.id,
        entryPrice: entryPrice,
        sellPrice: sellAvgPrice,
        quantity: sellFilledQty,
        realizedPnL: parseFloat(realizedPnL.toFixed(2)),
        realizedPnLPct: realizedPnLPct
      }
    });
  } catch (err) {
    console.error(`[ROBOT1] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});