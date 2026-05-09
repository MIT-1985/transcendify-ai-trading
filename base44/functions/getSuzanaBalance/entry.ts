import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const OKX_ENDPOINTS = ['https://www.okx.com', 'https://eea.okx.com'];

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

  if (user.role !== 'admin' && user.email !== SUZANA_EMAIL) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [byCreator, byEmail] = await Promise.all([
    base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
    base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
  ]);

  const seen = new Set();
  const connections = [...byCreator, ...byEmail].filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  if (!connections.length) {
    return Response.json({ error: 'No OKX connection found for Suzana' });
  }

  const conn = connections[0];
  const apiKey = await decrypt(conn.api_key_encrypted);
  const apiSecret = await decrypt(conn.api_secret_encrypted);
  const passphrase = await decrypt(conn.encryption_iv);

  // Try both endpoints
  let workingEndpoint = null;
  let tradingRes = null;
  let fundingRes = null;
  let subAccountRes = null;
  let rawDebug = {};

  for (const endpoint of OKX_ENDPOINTS) {
    try {
      const r = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
      console.log(`[getSuzanaBalance] Trading ${endpoint} code:${r.code} raw:${JSON.stringify(r).substring(0, 300)}`);
      rawDebug[`trading_${endpoint}`] = { code: r.code, data: r.data };
      if (r.code === '0') { tradingRes = r; workingEndpoint = endpoint; break; }
    } catch (e) { console.log(`[getSuzanaBalance] ${endpoint} error: ${e.message}`); }
  }

  if (workingEndpoint) {
    // Funding
    try {
      fundingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/asset/balances', '', workingEndpoint);
      console.log(`[getSuzanaBalance] Funding code:${fundingRes.code} raw:${JSON.stringify(fundingRes).substring(0, 300)}`);
      rawDebug['funding'] = { code: fundingRes.code, data: fundingRes.data };
    } catch (e) { console.log(`[getSuzanaBalance] Funding error: ${e.message}`); }

    // Sub-accounts list
    try {
      subAccountRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/users/subaccount/list', '', workingEndpoint);
      console.log(`[getSuzanaBalance] SubAccounts code:${subAccountRes.code} raw:${JSON.stringify(subAccountRes).substring(0, 300)}`);
      rawDebug['subaccounts'] = { code: subAccountRes.code, data: subAccountRes.data };
    } catch (e) { console.log(`[getSuzanaBalance] SubAccounts error: ${e.message}`); }
  }

  // Merge balances (trading + funding)
  const balanceMap = {};
  if (tradingRes?.code === '0') {
    for (const d of (tradingRes.data?.[0]?.details || [])) {
      const total = parseFloat(d.cashBal || d.eq || 0);
      const avail = parseFloat(d.availBal || d.availEq || total);
      if (total > 0.000001) {
        balanceMap[d.ccy] = { free: avail, locked: Math.max(0, total - avail) };
      }
    }
  }
  if (fundingRes?.code === '0') {
    for (const d of (fundingRes.data || [])) {
      const total = parseFloat(d.bal || 0);
      const avail = parseFloat(d.availBal || total);
      const frozen = parseFloat(d.frozenBal || 0);
      if (total > 0.000001) {
        const ex = balanceMap[d.ccy] || { free: 0, locked: 0 };
        balanceMap[d.ccy] = {
          free: (ex.free || 0) + avail,
          locked: (ex.locked || 0) + frozen
        };
      }
    }
  }

  const balances = Object.entries(balanceMap).map(([asset, b]) => ({ asset, free: b.free, locked: b.locked }));
  const balanceUsdt = balances.reduce((s, b) => {
    if (b.asset === 'USDT' || b.asset === 'USDC') return s + b.free + b.locked;
    return s;
  }, 0);

  console.log(`[getSuzanaBalance] Final: ${balances.length} assets, USDT=${balanceUsdt}`);

  // Update connection record
  await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, {
    balances, balance_usdt: balanceUsdt, last_sync: new Date().toISOString()
  });

  return Response.json({
    success: true,
    balance_usdt: balanceUsdt,
    balances,
    endpoint: workingEndpoint,
    connection_id: conn.id,
    debug: rawDebug  // full raw data for diagnosis
  });
});