import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OKX HMAC-SHA256 signature
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

  const headers = {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  };

  const res = await fetch('https://www.okx.com' + path, {
    method,
    headers,
    body: body || undefined
  });

  return res.json();
}

// Simple AES-GCM encryption
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

async function encrypt(text, masterSecret) {
  const key = await deriveKey(masterSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return btoa(String.fromCharCode(...iv)) + ':' + btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decrypt(encryptedStr, masterSecret) {
  const key = await deriveKey(masterSecret);
  const [ivB64, dataB64] = encryptedStr.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // CONNECT - save encrypted credentials
  if (action === 'connect') {
    const { api_key, api_secret, passphrase, label } = body;

    // Test the credentials first
    const testRes = await okxRequest(api_key, api_secret, passphrase, 'GET', '/api/v5/account/balance');
    if (testRes.code !== '0') {
      return Response.json({ success: false, error: testRes.msg || 'Invalid credentials' });
    }

    // Encrypt and store
    const encKey = await encrypt(api_key, MASTER_SECRET);
    const encSecret = await encrypt(api_secret, MASTER_SECRET);
    const encPass = await encrypt(passphrase, MASTER_SECRET);

    // Parse balances
    const balances = [];
    let balanceUsdt = 0;
    if (testRes.data?.[0]?.details) {
      for (const d of testRes.data[0].details) {
        const total = parseFloat(d.cashBal || 0);
        if (total > 0) {
          balances.push({ asset: d.ccy, free: parseFloat(d.availBal || 0), locked: total - parseFloat(d.availBal || 0) });
          if (d.ccy === 'USDT' || d.ccy === 'USDC') balanceUsdt += total;
        }
      }
    }

    // Find existing or create
    const existing = await base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    const data = {
      exchange: 'okx',
      api_key_encrypted: encKey,
      api_secret_encrypted: encSecret,
      encryption_iv: encPass,
      status: 'connected',
      is_validated: true,
      balance_usdt: balanceUsdt,
      balances,
      last_sync: new Date().toISOString(),
      label: label || 'OKX Account'
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.ExchangeConnection.update(existing[0].id, data);
    } else {
      await base44.entities.ExchangeConnection.create(data);
    }

    return Response.json({ success: true, balances, balance_usdt: balanceUsdt });
  }

  // GET BALANCE - refresh balance
  if (action === 'balance') {
    const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    if (!connections.length) return Response.json({ error: 'No OKX connection found' });

    const conn = connections[0];
    const apiKey = await decrypt(conn.api_key_encrypted, MASTER_SECRET);
    const apiSecret = await decrypt(conn.api_secret_encrypted, MASTER_SECRET);
    const passphrase = await decrypt(conn.encryption_iv, MASTER_SECRET);

    const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    if (res.code !== '0') return Response.json({ error: res.msg });

    const balances = [];
    let balanceUsdt = 0;
    if (res.data?.[0]?.details) {
      for (const d of res.data[0].details) {
        const total = parseFloat(d.cashBal || 0);
        if (total > 0) {
          balances.push({ asset: d.ccy, free: parseFloat(d.availBal || 0), locked: total - parseFloat(d.availBal || 0) });
          if (d.ccy === 'USDT' || d.ccy === 'USDC') balanceUsdt += total;
        }
      }
    }

    await base44.entities.ExchangeConnection.update(conn.id, { balances, balance_usdt: balanceUsdt, last_sync: new Date().toISOString() });
    return Response.json({ success: true, balances, balance_usdt: balanceUsdt });
  }

  // PLACE ORDER
  if (action === 'trade') {
    const { instId, side, ordType, sz, px } = body; // e.g. instId=BTC-USDT, side=buy/sell, ordType=market/limit
    const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    if (!connections.length) return Response.json({ error: 'No OKX connection found' });

    const conn = connections[0];
    const apiKey = await decrypt(conn.api_key_encrypted, MASTER_SECRET);
    const apiSecret = await decrypt(conn.api_secret_encrypted, MASTER_SECRET);
    const passphrase = await decrypt(conn.encryption_iv, MASTER_SECRET);

    const orderBody = JSON.stringify({ instId, tdMode: 'cash', side, ordType, sz, ...(px ? { px } : {}) });
    const res = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', orderBody);

    return Response.json({ success: res.code === '0', data: res.data, error: res.msg });
  }

  // DISCONNECT
  if (action === 'disconnect') {
    const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    for (const c of connections) {
      await base44.entities.ExchangeConnection.update(c.id, { status: 'disconnected', is_validated: false });
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
});