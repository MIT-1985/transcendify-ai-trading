import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// --- Crypto helpers ---
async function getEncryptionKey() {
  const appId = Deno.env.get('BASE44_APP_ID') || 'transcendify-app';
  const material = new TextEncoder().encode(`binance-keys-enc-${appId}-v1`);
  const hash = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptText(text) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return {
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

async function decryptText(encData, ivStr) {
  const key = await getEncryptionKey();
  const iv = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encData), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// --- Binance API helpers ---
async function hmacSign(secret, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function binanceRequest(apiKey, apiSecret, endpoint, params = {}, method = 'GET') {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp: timestamp.toString(), recvWindow: '60000' };
  const queryString = new URLSearchParams(allParams).toString();
  const signature = await hmacSign(apiSecret, queryString);
  const url = `https://api.binance.com${endpoint}?${queryString}&signature=${signature}`;
  const response = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey } });
  return response.json();
}

async function getDecryptedKeys(conn) {
  const [keyIv, secretIv] = conn.encryption_iv.split('|');
  const apiKey = await decryptText(conn.api_key_encrypted, keyIv);
  const apiSecret = await decryptText(conn.api_secret_encrypted, secretIv);
  return { apiKey, apiSecret };
}

function extractBalances(accountInfo) {
  const allBalances = (accountInfo.balances || [])
    .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
    .filter(b => b.free > 0 || b.locked > 0);
  const usdc = allBalances.find(b => b.asset === 'USDC');
  const balanceUsdt = (usdc?.free || 0) + (usdc?.locked || 0);
  return { allBalances, balanceUsdt };
}

// --- Main handler ---
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ---- CONNECT ----
    if (action === 'connect') {
      const { api_key, api_secret, label } = body;
      if (!api_key || !api_secret) return Response.json({ error: 'API key and secret are required' }, { status: 400 });

      const accountInfo = await binanceRequest(api_key, api_secret, '/api/v3/account');
      console.log('Binance connect response:', JSON.stringify(accountInfo).substring(0, 200));
      if (accountInfo.code) {
        console.error('Binance error:', accountInfo.code, accountInfo.msg);
        return Response.json({ error: `Binance грешка: ${accountInfo.msg} (код: ${accountInfo.code})` }, { status: 400 });
      }

      const permissions = accountInfo.permissions || [];
      const { allBalances, balanceUsdt } = extractBalances(accountInfo);

      const encKey = await encryptText(api_key);
      const encSecret = await encryptText(api_secret);
      const encryptionIv = encKey.iv + '|' + encSecret.iv;

      const existing = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'binance' });

      if (existing.length > 0) {
        await base44.asServiceRole.entities.ExchangeConnection.update(existing[0].id, {
          api_key_encrypted: encKey.data,
          api_secret_encrypted: encSecret.data,
          encryption_iv: encryptionIv,
          status: 'connected', is_validated: true,
          permissions, balance_usdt: balanceUsdt, balances: allBalances,
          last_sync: new Date().toISOString(),
          label: label || 'Binance Main'
        });
      } else {
        await base44.entities.ExchangeConnection.create({
          exchange: 'binance',
          api_key_encrypted: encKey.data,
          api_secret_encrypted: encSecret.data,
          encryption_iv: encryptionIv,
          status: 'connected', is_validated: true,
          permissions, balance_usdt: balanceUsdt, balances: allBalances,
          last_sync: new Date().toISOString(),
          label: label || 'Binance Main'
        });
      }

      return Response.json({ success: true, balance_usdt: balanceUsdt, permissions, balances: allBalances });
    }

    // ---- TEST ----
    if (action === 'test') {
      const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'binance' });
      if (!connections.length) return Response.json({ error: 'No Binance connection found' }, { status: 404 });

      const conn = connections[0];
      const { apiKey, apiSecret } = await getDecryptedKeys(conn);
      const accountInfo = await binanceRequest(apiKey, apiSecret, '/api/v3/account');

      if (accountInfo.code) {
        await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, { status: 'error', is_validated: false });
        return Response.json({ success: false, error: accountInfo.msg });
      }

      const { allBalances, balanceUsdt } = extractBalances(accountInfo);
      await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, {
        status: 'connected', is_validated: true,
        balance_usdt: balanceUsdt, balances: allBalances,
        permissions: accountInfo.permissions || [],
        last_sync: new Date().toISOString()
      });

      return Response.json({ success: true, balance_usdt: balanceUsdt, permissions: accountInfo.permissions || [], balances: allBalances });
    }

    // ---- DISCONNECT ----
    if (action === 'disconnect') {
      const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'binance' });
      if (connections.length > 0) {
        await base44.asServiceRole.entities.ExchangeConnection.update(connections[0].id, {
          status: 'disconnected', is_validated: false,
          api_key_encrypted: '', api_secret_encrypted: '', encryption_iv: ''
        });
      }
      return Response.json({ success: true });
    }

    // ---- STATUS ----
    if (action === 'status') {
      const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'binance' });
      if (!connections.length) return Response.json({ connected: false });

      const c = connections[0];
      return Response.json({
        connected: c.status === 'connected',
        status: c.status,
        balance_usdt: c.balance_usdt,
        balances: c.balances,
        permissions: c.permissions,
        last_sync: c.last_sync,
        label: c.label
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});