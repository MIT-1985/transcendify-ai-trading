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

    // Fetch fills from OKX (last 24 hours, SPOT only, USDT pairs)
    console.log('[SYNC_LEDGER] Fetching OKX fills with pagination');
    
    const allFills = [];
    let after = '';
    let pageCount = 0;

    // Pagination loop (OKX returns up to 100 per page)
    while (true) {
      const path = after 
        ? `/api/v5/trade/fills?instType=SPOT&limit=100&after=${after}`
        : '/api/v5/trade/fills?instType=SPOT&limit=100';
      
      const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', path);

      if (res.code !== '0') {
        console.error('[SYNC_LEDGER] OKX fills API error:', res.code, res.msg);
        return Response.json({
          success: false,
          error: res.code,
          message: res.msg,
          endpoint: '/api/v5/trade/fills',
          httpStatus: 403
        }, { status: 403 });
      }

      const fills = res.data || [];
      console.log(`[SYNC_LEDGER] Page ${pageCount + 1}: fetched ${fills.length} fills`);
      
      if (fills.length === 0) break;
      
      allFills.push(...fills);
      pageCount++;
      
      // OKX returns in newest-first order, get last ID for next page
      if (fills.length < 100) break;
      after = fills[fills.length - 1].billId;
    }

    console.log(`[SYNC_LEDGER] Total fills from OKX: ${allFills.length} across ${pageCount} pages`);

    // Map to OXXOrderLedger
    const ledgerEntries = allFills
      .filter(f => f.state === 'filled' && f.instId && f.instId.endsWith('-USDT'))
      .map(f => {
        const side = f.side === 'buy' ? 'buy' : 'sell';
        const accFillSz = parseFloat(f.sz || 0);
        const avgPx = parseFloat(f.fillPrice || 0);
        const quoteUSDT = accFillSz * avgPx;
        const fee = Math.abs(parseFloat(f.fee || 0));

        // Determine robotId based on symbol
        let robotId = 'alphaScalper';
        if (f.instId === 'ETH-USDT' || f.instId === 'SOL-USDT') {
          robotId = 'robot1';
        }

        return {
          ordId: f.ordId,
          instId: f.instId,
          side,
          avgPx,
          accFillSz,
          quoteUSDT,
          fee,
          feeCcy: f.feeCcy || 'USDT',
          timestamp: new Date(parseInt(f.fillTime)).toISOString(),
          robotId,
          verified: true,
          state: 'filled',
          exchange: 'okx',
          source: 'okx_real_sync'
        };
      });

    console.log(`[SYNC_LEDGER] Mapped ${ledgerEntries.length} valid ledger entries`);

    // Get existing fills from ledger
    const existing = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const upsertKeys = new Set();
    existing.forEach(e => {
      upsertKeys.add(`${e.exchange || 'okx'}|${e.ordId}|${e.instId}|${e.side}|${e.timestamp}`);
    });

    // Partition: new vs existing
    const toCreate = [];
    let skipCount = 0;

    for (const entry of ledgerEntries) {
      const key = `okx|${entry.ordId}|${entry.instId}|${entry.side}|${entry.timestamp}`;
      if (!upsertKeys.has(key)) {
        toCreate.push(entry);
      } else {
        skipCount++;
      }
    }

    // Bulk create new ones
    if (toCreate.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        await base44.asServiceRole.entities.OXXOrderLedger.bulkCreate(chunk);
        console.log(`[SYNC_LEDGER] Created batch of ${chunk.length}`);
      }
    }

    console.log(`[SYNC_LEDGER] Sync complete: created=${toCreate.length} skipped=${skipCount}`);

    return Response.json({
      success: true,
      fillsFetchedFromOKX: allFills.length,
      validEntries: ledgerEntries.length,
      upsertedNew: toCreate.length,
      duplicatesSkipped: skipCount,
      existingTotal: existing.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SYNC_LEDGER] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});