import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OKX HMAC-SHA256 signature
async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Try www first (global), then eea (EU registered accounts)
const OKX_ENDPOINTS = [
  'https://www.okx.com',
  'https://eea.okx.com'
];

async function okxRequest(apiKey, secret, passphrase, method, path, body = '', baseUrl = 'https://www.okx.com') {
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

  const res = await fetch(baseUrl + path, {
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
    console.log('Testing OKX connection for key:', api_key.substring(0, 8) + '...');
    
    // Try all endpoints until one works (for geo-blocking issues)
    let testRes = null;
    for (const endpoint of OKX_ENDPOINTS) {
      try {
        testRes = await okxRequest(api_key, api_secret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        console.log(`OKX ${endpoint} response - code:`, testRes.code, 'msg:', testRes.msg);
        // Stop only on success (code 0) or definitive auth errors (wrong password/signature)
        // Continue trying other endpoints if key not found on this one (50119) or geo-blocked (50000)
        if (testRes.code === '0') break;
        if (testRes.code === '50102' || testRes.code === '50112' || testRes.code === '50113') break;
        // 50119 = key not on this domain, try next endpoint
      } catch (networkErr) {
        console.log(`OKX ${endpoint} network error:`, networkErr.message);
      }
    }
    
    if (!testRes || testRes.code !== '0') {
      let errorMsg = testRes?.msg || 'Invalid credentials';
      if (testRes?.code === '50102') errorMsg = 'Timestamp expired - check your device time';
      if (testRes?.code === '50111') errorMsg = 'Invalid API Key';
      if (testRes?.code === '50112') errorMsg = 'Invalid passphrase';
      if (testRes?.code === '50113') errorMsg = 'Invalid signature - check your API Secret';
      if (testRes?.code === '50119') errorMsg = 'API key does not exist';
      console.log('OKX connection failed:', errorMsg, 'code:', testRes?.code);
      return Response.json({ success: false, error: errorMsg, code: testRes?.code });
    }

    // Encrypt and store
    const encKey = await encrypt(api_key, MASTER_SECRET);
    const encSecret = await encrypt(api_secret, MASTER_SECRET);
    const encPass = await encrypt(passphrase, MASTER_SECRET);

    // Determine which endpoint worked
    let workingEndpoint = 'https://www.okx.com';
    for (const ep of OKX_ENDPOINTS) {
      const r = await okxRequest(api_key, api_secret, passphrase, 'GET', '/api/v5/account/balance', '', ep).catch(() => null);
      if (r?.code === '0') { workingEndpoint = ep; break; }
    }

    // Also fetch Funding account balance
    let fundingData = null;
    try {
      const fr = await okxRequest(api_key, api_secret, passphrase, 'GET', '/api/v5/asset/balances', '', workingEndpoint);
      if (fr?.code === '0') fundingData = fr.data || [];
      console.log('Connect - Funding data:', JSON.stringify(fundingData).substring(0, 300));
    } catch (e) {
      console.log('Connect - Funding error:', e.message);
    }

    // Parse balances - merge Trading + Funding
    const balanceMap = {};
    console.log('Connect - full trading data:', JSON.stringify(testRes.data));
    const acctData = testRes.data?.[0];
    const details = acctData?.details || [];
    console.log('Connect - details count:', details.length, 'sample:', JSON.stringify(details.slice(0, 5)));
    for (const d of details) {
      const total = parseFloat(d.cashBal || d.eq || 0);
      const avail = parseFloat(d.availBal || d.availEq || total);
      if (total > 0.0001) {
        balanceMap[d.ccy] = balanceMap[d.ccy] || { free: 0, locked: 0 };
        balanceMap[d.ccy].free += avail;
        balanceMap[d.ccy].locked += Math.max(0, total - avail);
      }
    }
    for (const d of (fundingData || [])) {
      const total = parseFloat(d.bal || d.availBal || 0);
      const avail = parseFloat(d.availBal || total);
      if (total > 0.0001) {
        balanceMap[d.ccy] = balanceMap[d.ccy] || { free: 0, locked: 0 };
        balanceMap[d.ccy].free += avail;
        balanceMap[d.ccy].locked += Math.max(0, total - avail);
      }
    }
    const balances = Object.entries(balanceMap).map(([asset, b]) => ({ asset, free: b.free, locked: b.locked }));
    let balanceUsdt = balances.filter(b => b.asset === 'USDT' || b.asset === 'USDC').reduce((s, b) => s + b.free + b.locked, 0);

    // Find existing or create - filter strictly by user!
    const existing = await base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    console.log(`Connect: user=${user.email}, existing connections=${existing.length}`);
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
      await base44.asServiceRole.entities.ExchangeConnection.create(data);
    }

    return Response.json({ success: true, balances, balance_usdt: balanceUsdt });
  }

  // GET BALANCE - refresh balance
  if (action === 'balance') {
    const connections = await base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    console.log(`Balance request for user: ${user.email}, found ${connections.length} connections`);
    if (!connections.length) return Response.json({ error: 'No OKX connection found' });

    const conn = connections[0];
    const apiKey = await decrypt(conn.api_key_encrypted, MASTER_SECRET);
    const apiSecret = await decrypt(conn.api_secret_encrypted, MASTER_SECRET);
    const passphrase = await decrypt(conn.encryption_iv, MASTER_SECRET);

    // Find working endpoint
    let workingEndpoint = 'https://www.okx.com';
    let tradingRes = null;
    for (const endpoint of OKX_ENDPOINTS) {
      try {
        const r = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        console.log(`Trading balance ${endpoint} code:`, r.code, 'sample:', JSON.stringify(r.data?.[0]).substring(0, 300));
        if (r.code === '0') { tradingRes = r; workingEndpoint = endpoint; break; }
        if (r.code === '50102' || r.code === '50112' || r.code === '50113') { tradingRes = r; break; }
      } catch (networkErr) {
        console.log(`OKX ${endpoint} network error:`, networkErr.message);
      }
    }

    // Also fetch Funding account balance (separate wallet in OKX)
    let fundingRes = null;
    try {
      fundingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/asset/balances', '', workingEndpoint);
      console.log('Funding balance code:', fundingRes.code, 'data:', JSON.stringify(fundingRes.data).substring(0, 300));
    } catch (e) {
      console.log('Funding balance error:', e.message);
    }

    const balanceMap = {}; // asset -> { free, locked }

    // Parse Trading account (Unified)
    if (tradingRes?.code === '0') {
      const accountData = tradingRes.data?.[0];
      const details = accountData?.details || [];
      console.log('Trading details count:', details.length);
      for (const d of details) {
        const total = parseFloat(d.cashBal || d.eq || 0);
        const avail = parseFloat(d.availBal || d.availEq || total);
        if (total > 0.0001) {
          balanceMap[d.ccy] = balanceMap[d.ccy] || { free: 0, locked: 0 };
          balanceMap[d.ccy].free += avail;
          balanceMap[d.ccy].locked += Math.max(0, total - avail);
        }
      }
    }

    // Parse Funding account (asset wallet)
    if (fundingRes?.code === '0') {
      const fundingItems = fundingRes.data || [];
      console.log('Funding items count:', fundingItems.length);
      for (const d of fundingItems) {
        const total = parseFloat(d.bal || d.availBal || 0);
        const avail = parseFloat(d.availBal || total);
        if (total > 0.0001) {
          balanceMap[d.ccy] = balanceMap[d.ccy] || { free: 0, locked: 0 };
          balanceMap[d.ccy].free += avail;
          balanceMap[d.ccy].locked += Math.max(0, total - avail);
        }
      }
    }

    if (!tradingRes || tradingRes.code !== '0') {
      return Response.json({ error: tradingRes?.msg || 'Failed to fetch balance' });
    }

    const balances = Object.entries(balanceMap).map(([asset, b]) => ({ asset, free: b.free, locked: b.locked }));
    const balanceUsdt = balances.filter(b => b.ccy === 'USDT' || b.asset === 'USDT' || b.asset === 'USDC')
      .reduce((sum, b) => sum + b.free + b.locked, 0);

    console.log('Final balances:', JSON.stringify(balances), 'USDT:', balanceUsdt);
    // Verify this connection belongs to current user before updating
    if (conn.created_by !== user.email) {
      console.error(`SECURITY: user ${user.email} tried to access connection owned by ${conn.created_by}`);
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }
    await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, { balances, balance_usdt: balanceUsdt, last_sync: new Date().toISOString() });
    return Response.json({ success: true, balances, balance_usdt: balanceUsdt });
  }

  // PLACE ORDER
  if (action === 'trade') {
    const { instId, side, ordType, sz, px } = body; // e.g. instId=BTC-USDT, side=buy/sell, ordType=market/limit
    const connections = await base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
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
    const connections = await base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'okx' });
    for (const c of connections) {
      await base44.asServiceRole.entities.ExchangeConnection.update(c.id, { status: 'disconnected', is_validated: false });
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
});