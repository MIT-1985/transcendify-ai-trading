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

    console.log('[SYNC_LEDGER] Starting OKX order sync');

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

    // Fetch all filled orders from OKX
    const ordersRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/trade/orders-history?state=filled&limit=100');

    if (ordersRes.code !== '0' || !ordersRes.data) {
      console.error('[SYNC_LEDGER] OKX API error:', ordersRes.msg);
      return Response.json({ error: 'OKX API error', msg: ordersRes.msg }, { status: 400 });
    }

    const rawOrders = ordersRes.data || [];
    console.log(`[SYNC_LEDGER] Fetched ${rawOrders.length} filled orders from OKX`);

    // Map to OXXOrderLedger
    const ledgerEntries = rawOrders
      .filter(o => o.state === 'filled') // Only filled
      .map(o => {
        const side = o.side === 'buy' ? 'buy' : 'sell';
        const accFillSz = parseFloat(o.accFillSz || 0);
        const avgPx = parseFloat(o.avgPx || 0);
        const quoteUSDT = accFillSz * avgPx;
        const fee = Math.abs(parseFloat(o.fee || 0));

        // Determine robotId based on symbol
        let robotId = 'legacy';
        if (o.instId === 'ETH-USDT' || o.instId === 'SOL-USDT') {
          robotId = 'robot1';
        }

        return {
          ordId: o.ordId,
          instId: o.instId,
          side,
          avgPx,
          accFillSz,
          quoteUSDT,
          fee,
          feeCcy: o.feeCcy || 'USDT',
          timestamp: new Date(parseInt(o.uTime)).toISOString(),
          robotId,
          verified: true,
          state: 'filled'
        };
      });

    // Check which are already in ledger
    const existingOrdIds = new Set();
    const existing = await base44.asServiceRole.entities.OXXOrderLedger.list();
    existing.forEach(e => existingOrdIds.add(e.ordId));

    // Only insert new ones
    const toInsert = ledgerEntries.filter(e => !existingOrdIds.has(e.ordId));

    if (toInsert.length > 0) {
      await base44.asServiceRole.entities.OXXOrderLedger.bulkCreate(toInsert);
      console.log(`[SYNC_LEDGER] Inserted ${toInsert.length} new orders`);
    } else {
      console.log('[SYNC_LEDGER] No new orders');
    }

    return Response.json({
      success: true,
      totalFromOKX: rawOrders.length,
      newInserted: toInsert.length,
      existingSkipped: existingOrdIds.size
    });
  } catch (error) {
    console.error('[SYNC_LEDGER] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});