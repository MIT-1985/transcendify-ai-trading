import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';

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

async function okxRequest(apiKey, secret, passphrase, method, path, body = '', baseUrl = 'https://www.okx.com') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + body;
  const signature = await sign(secret, message);
  const res = await fetch(baseUrl + path, {
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
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [byCreator, byEmail] = await Promise.all([
    base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
    base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
  ]);

  const seen = new Set();
  const conns = [...byCreator, ...byEmail].filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  if (!conns.length) {
    return Response.json({ error: 'No connection' }, { status: 400 });
  }

  const conn = conns[0];
  const apiKey = await decrypt(conn.api_key_encrypted);
  const apiSecret = await decrypt(conn.api_secret_encrypted);
  const passphrase = await decrypt(conn.encryption_iv);

  // Get balance
  const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', 'https://www.okx.com');
  const xrpDeets = balRes.data?.[0]?.details?.find(d => d.ccy === 'XRP');

  console.log(`[XRP-DIAG] Balance: ${JSON.stringify(xrpDeets)}`);
  console.log(`[XRP-DIAG] Available: ${xrpDeets?.availBal}, Frozen: ${xrpDeets?.frozenBal}, Hold: ${xrpDeets?.hold}`);

  // Try to place a test order with 1 XRP
  const testOrder = JSON.stringify({
    instId: 'XRP-USDT',
    tdMode: 'cash',
    side: 'sell',
    ordType: 'market',
    sz: '1'
  });

  const orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', testOrder, 'https://www.okx.com');
  
  console.log(`[XRP-DIAG] 1 XRP sell result: ${JSON.stringify(orderRes)}`);

  return Response.json({
    xrp_balance: xrpDeets,
    order_test_1xrp: orderRes
  });
});