import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---- Crypto helpers ----
async function deriveOkxKey(secret) {
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

async function okxRequest(apiKey, secret, passphrase, method, path, bodyStr = '', baseUrl = 'https://www.okx.com') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + bodyStr;
  const signature = await hmacSignOkx(secret, message);
  const res = await fetch(baseUrl + path, {
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

async function fetchLiveBalance(apiKey, secret, passphrase, ccy = null) {
  for (const endpoint of ['https://www.okx.com', 'https://eea.okx.com']) {
    try {
      const res = await okxRequest(apiKey, secret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
      if (res.code === '0' && res.data?.[0]?.details) {
        const details = res.data[0].details;
        if (ccy) {
          return details.find(d => d.ccy === ccy) || null;
        }
        return details;
      }
    } catch (e) {
      console.log(`[VERIFY] Balance fetch from ${endpoint} failed: ${e.message}`);
    }
  }
  return ccy ? null : [];
}

// ---- Main handler ----
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const orderMappings = body.orderMappings || []; // Array of { ordId, instId }
    
    if (!orderMappings || orderMappings.length === 0) {
      return Response.json({ error: 'orderMappings required: array of {ordId, instId}' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only Suzana or admin
    const suzanaEmail = 'nikitasuziface77@gmail.com';
    const isSuzana = user.email === suzanaEmail;
    const isAdmin = user.role === 'admin';

    if (!isSuzana && !isAdmin) {
      return Response.json({ error: 'Forbidden: Only Suzana or admin can verify' }, { status: 403 });
    }

    console.log(`[VERIFY] Starting verification for ${orderMappings.length} orders by ${user.email}`);

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
      return Response.json({ error: 'No OKX connection found for Suzana' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decryptOkx(conn.api_key_encrypted);
    const apiSecret = await decryptOkx(conn.api_secret_encrypted);
    const passphrase = await decryptOkx(conn.encryption_iv);

    // ─── Fetch initial USDT balance ────────────────────────────────────
    console.log(`[VERIFY] Fetching initial USDT balance...`);
    const initialBalances = await fetchLiveBalance(apiKey, apiSecret, passphrase);
    const initialUSDT = parseFloat(initialBalances.find(b => b.ccy === 'USDT')?.availBal || 0);
    console.log(`[VERIFY] Initial USDT: $${initialUSDT.toFixed(2)}`);

    // ─── Verify each order with its exact instId ────────────────────────
    const fillData = {};
    let totalFillUSDT = 0;
    const endpoints = ['https://www.okx.com', 'https://eea.okx.com'];

    for (const mapping of orderMappings) {
      const { ordId, instId } = mapping;

      if (!ordId || !instId) {
        console.error(`[VERIFY] Invalid mapping: ordId=${ordId} instId=${instId}`);
        fillData[ordId] = { error: 'Invalid ordId or instId in mapping' };
        continue;
      }

      let workingEndpoint = null;
      let histRes = null;

      // Try both endpoints
      for (const endpoint of endpoints) {
        try {
          histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${instId}&ordId=${ordId}&instType=SPOT`, '', endpoint);

          if (histRes.code === '0' && histRes.data?.[0]) {
            workingEndpoint = endpoint;
            break;
          }
        } catch (e) {
          console.log(`[VERIFY] Order fetch from ${endpoint} for ${instId} ordId=${ordId} failed: ${e.message}`);
        }
      }

      if (!histRes || histRes.code !== '0' || !histRes.data?.[0]) {
        console.log(`[VERIFY] Order fetch FAILED for ${instId} ordId=${ordId}: code=${histRes?.code} msg=${histRes?.msg}`);
        fillData[ordId] = { instId, error: histRes?.msg || `Code ${histRes?.code}` };
        continue;
      }

      try {
        const order = histRes.data[0];
        const verifiedInstId = order.instId;

        // CRITICAL: Verify instId matches
        if (verifiedInstId !== instId) {
          console.error(`[VERIFY] INSTID MISMATCH for ordId=${ordId}: expected=${instId} got=${verifiedInstId}`);
          fillData[ordId] = {
            instId: instId,
            verifiedInstId: verifiedInstId,
            error: `InstId mismatch: expected ${instId}, got ${verifiedInstId}`
          };
          continue;
        }

        const accFillSz = parseFloat(order.accFillSz || 0);
        const avgPx = parseFloat(order.avgPx || 0);
        const fee = parseFloat(order.fee || 0);
        const fillUSDT = (accFillSz * avgPx) - Math.abs(fee);

        fillData[ordId] = {
          instId: verifiedInstId,
          state: order.state,
          accFillSz,
          avgPx,
          fee: parseFloat(fee.toFixed(6)),
          feeCcy: order.feeCcy || 'USDT',
          fillUSDT: parseFloat(fillUSDT.toFixed(2))
        };

        totalFillUSDT += fillUSDT;

        console.log(`[VERIFY] Order ${ordId} (${verifiedInstId}): filled=${accFillSz} @ ${avgPx} = $${fillUSDT.toFixed(2)}`);
      } catch (e) {
        console.error(`[VERIFY] Exception for ${ordId}: ${e.message}`);
        fillData[ordId] = { instId, error: e.message };
      }
    }

    // ─── Fetch final USDT balance ─────────────────────────────────────
    console.log(`[VERIFY] Fetching final USDT balance...`);
    const finalBalances = await fetchLiveBalance(apiKey, apiSecret, passphrase);
    const finalUSDT = parseFloat(finalBalances.find(b => b.ccy === 'USDT')?.availBal || 0);
    console.log(`[VERIFY] Final USDT: $${finalUSDT.toFixed(2)}`);

    const usdtDelta = finalUSDT - initialUSDT;

    // ─── Validate: does usdtDelta match totalFillUSDT (within tolerance)? ────
    const tolerance = 0.05; // Allow up to $0.05 discrepancy for rounding
    const isValid = Math.abs(usdtDelta - totalFillUSDT) < tolerance;

    return Response.json({
      status: isValid ? '✓ VALID' : '✗ INVALID',
      message: isValid 
        ? `Report VERIFIED: USDT delta matches fills (within $${tolerance} tolerance)`
        : `Report INVALID: USDT delta ($${usdtDelta.toFixed(2)}) does NOT match fill total ($${totalFillUSDT.toFixed(2)}) | Discrepancy: $${Math.abs(usdtDelta - totalFillUSDT).toFixed(2)}`,
      orderCount: orderMappings.length,
      verifiedCount: Object.values(fillData).filter(f => !f.error).length,
      fillData,
      summary: {
        initialUSDT: parseFloat(initialUSDT.toFixed(2)),
        finalUSDT: parseFloat(finalUSDT.toFixed(2)),
        usdtDelta: parseFloat(usdtDelta.toFixed(2)),
        totalFillUSDT: parseFloat(totalFillUSDT.toFixed(2)),
        discrepancy: parseFloat((usdtDelta - totalFillUSDT).toFixed(2)),
        tolerance
      },
      action: isValid ? 'REPORT CLEARED' : 'TRADING HALTED - INVESTIGATE DISCREPANCY',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[VERIFY] Fatal: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});