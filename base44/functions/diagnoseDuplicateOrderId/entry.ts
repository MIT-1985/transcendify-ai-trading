import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';

async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decrypt(encryptedStr) {
  const key = await deriveKey(MASTER_SECRET);
  const [ivB64, dataB64] = encryptedStr.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxRequest(apiKey, secret, passphrase, method, path, body = '') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + body;
  const signature = await sign(secret, message);
  const res = await fetch('https://www.okx.com' + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    },
    body: body || undefined
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

    const connection = await base44.asServiceRole.entities.ExchangeConnection.filter(
      { exchange: 'okx' },
      '-updated_date',
      1
    );

    if (!connection || connection.length === 0) {
      return Response.json({ error: 'No OKX connection' }, { status: 400 });
    }

    const conn = connection[0];
    let apiKey, apiSecret, passphrase;
    
    try {
      apiKey = await decrypt(conn.api_key_encrypted);
      apiSecret = await decrypt(conn.api_secret_encrypted);
      passphrase = await decrypt(conn.encryption_iv);
    } catch (e) {
      return Response.json({ error: `Decryption failed: ${e.message}` }, { status: 400 });
    }

    const orderId = '3554856241391181824';
    
    // Query order history for BTC-USDT
    const histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
      `/api/v5/trade/orders-history?instId=BTC-USDT&instType=SPOT&ordId=${orderId}`);

    if (histRes.code !== '0') {
      return Response.json({
        error: `OKX query failed: ${histRes.msg}`,
        code: histRes.code
      }, { status: 400 });
    }

    if (!histRes.data || histRes.data.length === 0) {
      return Response.json({
        error: 'Order not found in history',
        ordId: orderId,
        instId: 'BTC-USDT'
      }, { status: 400 });
    }

    const order = histRes.data[0];

    return Response.json({
      ordId: order.ordId,
      instId: order.instId,
      side: order.side,
      state: order.state,
      avgPx: parseFloat(order.avgPx),
      accFillSz: parseFloat(order.accFillSz),
      fee: parseFloat(order.fee || 0),
      feeCcy: order.feeCcy,
      fillTime: order.fillTime,
      timestamp: new Date(parseInt(order.fillTime)).toISOString(),
      diagnosis: order.side === 'buy' 
        ? 'Order is BUY. SELL was never placed separately. Cycle invalid.'
        : 'Order is SELL. Where is BUY? Ledger mismatch.'
    }, { status: 200 });

  } catch (error) {
    console.error('ERROR:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});