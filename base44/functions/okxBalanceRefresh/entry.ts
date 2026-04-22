import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const OKX_ENDPOINTS = ['https://www.okx.com', 'https://eea.okx.com'];

async function okxRequest(apiKey, secret, passphrase, method, path, baseUrl) {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path;
  const signature = await sign(secret, message);
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
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

  // This function is called by a scheduled automation - use service role
  const allConnections = await base44.asServiceRole.entities.ExchangeConnection.filter({ exchange: 'okx', status: 'connected' });
  console.log(`OKX Balance Refresh: found ${allConnections.length} connected accounts`);

  let updated = 0;
  let errors = 0;

  for (const conn of allConnections) {
    try {
      const apiKey = await decrypt(conn.api_key_encrypted, MASTER_SECRET);
      const apiSecret = await decrypt(conn.api_secret_encrypted, MASTER_SECRET);
      const passphrase = await decrypt(conn.encryption_iv, MASTER_SECRET);

      // Find working endpoint
      let tradingRes = null;
      let fundingRes = null;
      let workingEndpoint = OKX_ENDPOINTS[0];

      for (const endpoint of OKX_ENDPOINTS) {
        try {
          const r = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', endpoint);
          if (r.code === '0') { tradingRes = r; workingEndpoint = endpoint; break; }
          if (r.code === '50102' || r.code === '50112' || r.code === '50113') { tradingRes = r; break; }
        } catch (e) {
          console.log(`Endpoint ${endpoint} failed for conn ${conn.id}:`, e.message);
        }
      }

      try {
        fundingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/asset/balances', workingEndpoint);
      } catch (e) {
        console.log(`Funding fetch failed for conn ${conn.id}:`, e.message);
      }

      const balanceMap = {};

      if (tradingRes?.code === '0') {
        for (const d of (tradingRes.data?.[0]?.details || [])) {
          const total = parseFloat(d.cashBal || d.eq || 0);
          const avail = parseFloat(d.availBal || d.availEq || total);
          if (total > 0.0001) {
            balanceMap[d.ccy] = { free: avail, locked: Math.max(0, total - avail) };
          }
        }
      }

      if (fundingRes?.code === '0') {
        for (const d of (fundingRes.data || [])) {
          const total = parseFloat(d.bal || 0);
          const avail = parseFloat(d.availBal || total);
          const frozen = parseFloat(d.frozenBal || 0);
          if (total > 0.0001) {
            const existing = balanceMap[d.ccy] || { free: 0, locked: 0 };
            balanceMap[d.ccy] = { free: Math.max(avail, existing.free), locked: Math.max(frozen, existing.locked) };
          }
        }
      }

      if (Object.keys(balanceMap).length === 0 && !tradingRes && !fundingRes) {
        console.log(`No data for conn ${conn.id}, skipping`);
        continue;
      }

      const balances = Object.entries(balanceMap).map(([asset, b]) => ({ asset, free: b.free, locked: b.locked }));
      const balanceUsdt = balances.filter(b => b.asset === 'USDT' || b.asset === 'USDC').reduce((s, b) => s + b.free + b.locked, 0);

      await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, {
        balances,
        balance_usdt: balanceUsdt,
        last_sync: new Date().toISOString()
      });

      console.log(`Updated conn ${conn.id} (${conn.user_email || conn.created_by}): $${balanceUsdt.toFixed(2)} USDT`);
      updated++;
    } catch (err) {
      console.error(`Error refreshing conn ${conn.id}:`, err.message);
      errors++;
    }
  }

  return Response.json({ success: true, updated, errors, total: allConnections.length });
});