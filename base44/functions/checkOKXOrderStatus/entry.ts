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

    const conn = await base44.asServiceRole.entities.ExchangeConnection.filter(
      { exchange: 'okx' },
      '-updated_date',
      1
    );

    if (!conn || conn.length === 0) {
      return Response.json({ error: 'No OKX connection' }, { status: 400 });
    }

    const apiKey = await decrypt(conn[0].api_key_encrypted);
    const apiSecret = await decrypt(conn[0].api_secret_encrypted);
    const passphrase = await decrypt(conn[0].encryption_iv);

    // Get account info
    const acctRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/account-info');
    
    // Get last 5 orders for SOL-USDT
    const ordersRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', 
      '/api/v5/trade/orders-history?instId=SOL-USDT&instType=SPOT&limit=5');

    return Response.json({
      account_info: acctRes.data?.[0],
      recent_orders: ordersRes.data || [],
      orders_code: ordersRes.code,
      orders_msg: ordersRes.msg
    }, { status: 200 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});