import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

async function hmacSign(secret, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// All known Binance endpoints including US and alternative domains
const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
  'https://api-gcp.binance.com',
  'https://api.binance.us',           // Binance US
  'https://data-api.binance.vision',  // Alternative endpoint
];

async function binanceRequest(apiKey, apiSecret, endpoint, params = {}) {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp: timestamp.toString(), recvWindow: '60000' };
  const queryString = new URLSearchParams(allParams).toString();
  const signature = await hmacSign(apiSecret, queryString);
  const fullQuery = `${queryString}&signature=${signature}`;

  let lastError = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const url = `${host}${endpoint}?${fullQuery}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)',
          'Accept': 'application/json',
        }
      });
      const data = await response.json();

      // Geo-blocked - try next
      if (data.msg && (data.msg.includes('restricted location') || data.msg.includes('Service unavailable') || data.msg.includes('not allowed'))) {
        console.log(`Host ${host} geo-blocked, trying next...`);
        lastError = data;
        continue;
      }

      // Auth error (wrong key) - no point trying other hosts
      if (data.code === -2014 || data.code === -2015 || data.code === -1022 || data.code === -1100) {
        console.log(`Host ${host} returned auth error: ${data.msg}`);
        return data;
      }

      // Timeout/rate limit - try next
      if (data.code === -1003 || data.code === -1015) {
        lastError = data;
        continue;
      }

      console.log(`Host ${host} SUCCESS, response code: ${data.code ?? 'OK'}`);
      return data;
    } catch (e) {
      console.log(`Host ${host} network error: ${e.message}`);
      lastError = { code: -1, msg: e.message };
    }
  }
  return lastError || { code: -1, msg: 'All Binance hosts unreachable' };
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
  const usdt = allBalances.find(b => b.asset === 'USDT');
  const balanceUsdt = (usdc?.free || 0) + (usdc?.locked || 0) + (usdt?.free || 0) + (usdt?.locked || 0);
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
      console.log('Binance connect result:', JSON.stringify(accountInfo).substring(0, 300));

      if (!accountInfo.balances) {
        const errMsg = accountInfo.msg || 'Не може да се свърже с Binance';
        console.error('Binance connect failed:', errMsg);
        // Check if it's geo-block
        const isGeoBlock = errMsg.includes('restricted') || errMsg.includes('Service unavailable');
        if (isGeoBlock) {
          return Response.json({ 
            error: 'Binance API е блокиран от EU сървъри. Ключовете са запазени - моля опитайте Binance US или OKX.',
            geo_blocked: true
          }, { status: 400 });
        }
        return Response.json({ error: `Binance грешка: ${errMsg}` }, { status: 400 });
      }

      const permissions = accountInfo.permissions || [];
      const { allBalances, balanceUsdt } = extractBalances(accountInfo);

      const encKey = await encryptText(api_key);
      const encSecret = await encryptText(api_secret);
      const encryptionIv = encKey.iv + '|' + encSecret.iv;

      const existing = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'binance' });
      const connData = {
        exchange: 'binance',
        api_key_encrypted: encKey.data,
        api_secret_encrypted: encSecret.data,
        encryption_iv: encryptionIv,
        status: 'connected', is_validated: true,
        permissions, balance_usdt: balanceUsdt, balances: allBalances,
        last_sync: new Date().toISOString(),
        label: label || 'Binance Main'
      };

      if (existing.length > 0) {
        await base44.asServiceRole.entities.ExchangeConnection.update(existing[0].id, connData);
      } else {
        await base44.entities.ExchangeConnection.create(connData);
      }

      return Response.json({ success: true, balance_usdt: balanceUsdt, permissions, balances: allBalances });
    }

    // ---- TEST / REFRESH BALANCE ----
    if (action === 'test') {
      const connections = await base44.entities.ExchangeConnection.filter({ created_by: user.email, exchange: 'binance' });
      if (!connections.length) return Response.json({ success: false, error: 'No Binance connection found' });

      const conn = connections[0];
      const { apiKey, apiSecret } = await getDecryptedKeys(conn);
      const accountInfo = await binanceRequest(apiKey, apiSecret, '/api/v3/account');
      console.log('Binance test result:', JSON.stringify(accountInfo).substring(0, 200));

      if (!accountInfo.balances) {
        const isGeoBlock = accountInfo.msg?.includes('restricted') || accountInfo.msg?.includes('Service unavailable');
        // If geo-blocked, return cached data from DB instead of error
        if (isGeoBlock) {
          console.log('Geo-blocked, returning cached balance from DB');
          return Response.json({
            success: true,
            geo_blocked: true,
            balance_usdt: conn.balance_usdt || 0,
            balances: conn.balances || [],
            permissions: conn.permissions || [],
            last_sync: conn.last_sync,
            cached: true
          });
        }
        await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, { status: 'error', is_validated: false });
        return Response.json({ success: false, error: accountInfo.msg || 'Binance API error' });
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
    console.error('binanceConnect error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});