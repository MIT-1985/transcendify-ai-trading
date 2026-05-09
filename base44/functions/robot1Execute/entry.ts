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
      created_by: suzanaEmail,
      symbol: 'ETH-USDT',
      side: 'BUY',
      execution_mode: 'MAINNET',
      strategy_used: 'robot1'
    });

    const pendingBuy = activeBuys.find(t => !t.exit_price); // No exit_price = still open
    if (pendingBuy) {
      console.log(`[ROBOT1] Active BUY found (entry at ${pendingBuy.entry_price}), waiting for SELL condition`);
      return Response.json({
        status: 'WAITING_FOR_SELL',
        message: 'Active BUY position exists, waiting for SELL signal',
        pendingBuyId: pendingBuy.id,
        entryPrice: pendingBuy.entry_price,
        quantity: pendingBuy.quantity
      });
    }

    // ─── Place market BUY 5–10 USDT (random in range) ─────────────────────
    const buySize = (Math.random() * 5 + 5).toFixed(2); // 5-10
    console.log(`[ROBOT1] Placing BUY order sz=${buySize} USDT`);

    const orderBody = JSON.stringify({
      instId: 'ETH-USDT',
      tdMode: 'cash',
      side: 'buy',
      ordType: 'market',
      sz: buySize,
      tgtCcy: 'quote_ccy'
    });

    const orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', orderBody);
    
    if (orderRes.code !== '0') {
      console.error(`[ROBOT1] BUY FAILED: ${orderRes.msg}`);
      return Response.json({
        status: 'ERROR',
        okxCode: orderRes.code,
        errorMessage: orderRes.msg
      }, { status: 400 });
    }

    const ordId = orderRes.data?.[0]?.ordId;
    if (!ordId) {
      return Response.json({ status: 'ERROR', errorMessage: 'No ordId returned' }, { status: 500 });
    }

    // ─── Verify order immediately ────────────────────────────────────────
    await new Promise(resolve => setTimeout(resolve, 500));

    const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=ETH-USDT&ordId=${ordId}`);
    
    if (verifyRes.code !== '0' || !verifyRes.data?.[0]) {
      console.error(`[ROBOT1] VERIFY FAILED: ${verifyRes.msg}`);
      return Response.json({
        status: 'VERIFY_FAILED',
        okxCode: verifyRes.code,
        errorMessage: verifyRes.msg
      }, { status: 400 });
    }

    const verified = verifyRes.data[0];
    
    // Only save if FILLED or PARTIALLY_FILLED
    if (verified.state !== 'filled' && verified.state !== 'part_filled') {
      console.log(`[ROBOT1] Order not filled yet, state=${verified.state}`);
      return Response.json({
        status: 'NOT_FILLED_YET',
        ordId: ordId,
        state: verified.state
      });
    }

    // ─── Save verified order to Trade entity ─────────────────────────────
    const filledQty = parseFloat(verified.accFillSz || 0);
    const avgPrice = parseFloat(verified.avgPx || 0);

    const tradeRecord = await base44.asServiceRole.entities.Trade.create({
      subscription_id: 'robot1', // Placeholder
      symbol: 'ETH-USDT',
      side: 'BUY',
      quantity: filledQty,
      price: avgPrice,
      entry_price: avgPrice,
      total_value: filledQty * avgPrice,
      fee: parseFloat(verified.fee || 0),
      execution_mode: 'MAINNET',
      strategy_used: 'robot1',
      timestamp: new Date(parseInt(verified.cTime)).toISOString(),
      profit_loss: 0 // Not set until SELL
    });

    console.log(`[ROBOT1] BUY verified and saved. ordId=${ordId} tradeId=${tradeRecord.id} qty=${filledQty} avgPx=${avgPrice}`);

    return Response.json({
      status: 'BUY_VERIFIED',
      ordId: ordId,
      tradeId: tradeRecord.id,
      state: verified.state,
      quantity: filledQty,
      avgPrice: avgPrice,
      totalValue: filledQty * avgPrice,
      fee: parseFloat(verified.fee || 0),
      message: 'BUY filled and verified. Waiting for SELL condition.'
    });
  } catch (err) {
    console.error(`[ROBOT1] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});