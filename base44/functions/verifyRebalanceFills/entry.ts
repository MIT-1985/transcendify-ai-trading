import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function deriveKey(secret) {
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

async function decrypt(encryptedStr) {
  const key = await deriveKey();
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
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
    if (user.role !== 'admin' && user.email !== SUZANA_EMAIL) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const orderIds = body.orderIds || [
      '3551292134821961728',
      '3551292180053336064',
      '3551292225519591424'
    ];

    // Get Suzana's OKX connection
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
      return Response.json({ error: 'No OKX connection found' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decrypt(conn.api_key_encrypted);
    const apiSecret = await decrypt(conn.api_secret_encrypted);
    const passphrase = await decrypt(conn.encryption_iv);

    // Fetch initial balance
    const endpoints = ['https://www.okx.com', 'https://eea.okx.com'];
    let workingEndpoint = null;
    let initialBalances = null;

    for (const endpoint of endpoints) {
      try {
        const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        if (res.code === '0' && res.data?.[0]?.details) {
          initialBalances = res.data[0].details;
          workingEndpoint = endpoint;
          break;
        }
      } catch (e) {
        console.log(`[VERIFY] Balance fetch failed: ${e.message}`);
      }
    }

    if (!initialBalances) {
      return Response.json({ error: 'Could not fetch balances' }, { status: 500 });
    }

    const initialUSDT = parseFloat(initialBalances.find(b => b.ccy === 'USDT')?.availBal || 0);

    // ─── Fetch order details using orders-history (includes fill summary) ────
    const fillData = {};
    let totalFillUSDT = 0;

    for (const ordId of orderIds) {
      try {
        const histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/orders-history?ordId=${ordId}&instType=SPOT`, '', workingEndpoint);

        if (histRes.code !== '0' || !histRes.data?.[0]) {
          console.log(`[VERIFY] Order fetch failed for ${ordId}: code=${histRes.code} msg=${histRes.msg}`);
          fillData[ordId] = { error: histRes.msg || `Code ${histRes.code}` };
          continue;
        }

        const order = histRes.data[0];
        const accFillSz = parseFloat(order.accFillSz || 0);
        const avgPx = parseFloat(order.avgPx || 0);
        const fee = parseFloat(order.fee || 0);
        const fillUSDT = (accFillSz * avgPx) - Math.abs(fee);

        fillData[ordId] = {
          instId: order.instId,
          state: order.state,
          accFillSz,
          avgPx,
          fee: parseFloat(fee.toFixed(6)),
          feeCcy: order.feeCcy || 'USDT',
          fillUSDT: parseFloat(fillUSDT.toFixed(2))
        };

        totalFillUSDT += fillUSDT;

        console.log(`[VERIFY] Order ${ordId} (${order.instId}): filled=${accFillSz} @ ${avgPx} = $${fillUSDT.toFixed(2)} (fee=${fee})`);
      } catch (e) {
        console.error(`[VERIFY] Exception for ${ordId}: ${e.message}`);
        fillData[ordId] = { error: e.message };
      }
    }

    // Fetch final balance
    let finalBalances = null;
    for (const endpoint of endpoints) {
      try {
        const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        if (res.code === '0' && res.data?.[0]?.details) {
          finalBalances = res.data[0].details;
          break;
        }
      } catch (e) {}
    }

    const finalUSDT = finalBalances ? parseFloat(finalBalances.find(b => b.ccy === 'USDT')?.availBal || 0) : 0;
    const usdtDelta = finalUSDT - initialUSDT;

    // Validate: does usdtDelta match totalFillUSDT (within tolerance)?
    const tolerance = 0.05; // Allow up to $0.05 discrepancy for rounding
    const isValid = Math.abs(usdtDelta - totalFillUSDT) < tolerance;

    return Response.json({
      status: isValid ? '✓ VALID' : '✗ INVALID',
      message: isValid 
        ? `Report VERIFIED: USDT delta matches fills (within $${tolerance} tolerance)`
        : `Report INVALID: USDT delta ($${usdtDelta.toFixed(2)}) does NOT match fill total ($${totalFillUSDT.toFixed(2)}) | Discrepancy: $${Math.abs(usdtDelta - totalFillUSDT).toFixed(2)}`,
      orderCount: orderIds.length,
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