import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---- Crypto helpers (same pattern) ----
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

// ---- Main handler ----
Deno.serve(async (req) => {
  try {
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
      return Response.json({ error: 'Forbidden: Only Suzana or admin can audit' }, { status: 403 });
    }

    console.log(`[AUDIT] Starting 24h execution audit for ${user.email}`);

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
      return Response.json({ error: 'No OKX connection found' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decryptOkx(conn.api_key_encrypted);
    const apiSecret = await decryptOkx(conn.api_secret_encrypted);
    const passphrase = await decryptOkx(conn.encryption_iv);

    // ─── Calculate time window: last 30 days (or custom from body) ──────────
    const body = await req.json().catch(() => ({}));
    const days = body.days || 30; // Default 30 days if no custom window
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const after = startDate.getTime().toString();
    const before = now.getTime().toString();

    console.log(`[AUDIT] Time window: ${days} days (${startDate.toISOString()} to ${now.toISOString()})`);
    const auditLabel = days === 1 ? 'last 24h' : `last ${days} days`;

    // ─── Fetch ALL orders from last 24h ──────────────────────────────────
    let allOrders = [];
    const endpoints = ['https://www.okx.com', 'https://eea.okx.com'];
    let workingEndpoint = null;

    for (const endpoint of endpoints) {
      try {
        // Get filled + partially filled orders only
        const histRes = await okxRequest(
          apiKey,
          apiSecret,
          passphrase,
          'GET',
          `/api/v5/trade/orders-history?instType=SPOT&state=filled&after=${after}&before=${before}&limit=100`,
          '',
          endpoint
        );

        if (histRes.code === '0' && histRes.data) {
          allOrders = histRes.data;
          workingEndpoint = endpoint;
          console.log(`[AUDIT] Fetched ${allOrders.length} filled orders from ${endpoint}`);
          break;
        }
      } catch (e) {
        console.log(`[AUDIT] Fetch from ${endpoint} failed: ${e.message}`);
      }
    }

    if (!workingEndpoint || allOrders.length === 0) {
      console.log(`[AUDIT] No filled orders found in last 24h`);
      return Response.json({
        audit: {
          timeWindow: { from: startDate.toISOString(), to: now.toISOString(), period: auditLabel },
          filledOrdersCount: 0,
          buyCount: 0,
          sellCount: 0,
          totalBuyUSDT: 0,
          totalSellUSDT: 0,
          realizedPnL: 0,
          failedOrderCount: 0,
          skipReasonsCount: 0,
          lastTenOrders: []
        },
        timestamp: now.toISOString()
      });
    }

    // ─── Analyze orders ─────────────────────────────────────────────────
    const buyOrders = [];
    const sellOrders = [];
    let totalBuyUSDT = 0;
    let totalSellUSDT = 0;

    for (const order of allOrders) {
      const side = order.side?.toUpperCase();
      const fillSz = parseFloat(order.accFillSz || 0);
      const fillPx = parseFloat(order.avgPx || 0);
      const fee = parseFloat(order.fee || 0);
      const fillValue = fillSz * fillPx;

      if (side === 'BUY') {
        buyOrders.push({ ...order, fillValue });
        totalBuyUSDT += fillValue;
      } else if (side === 'SELL') {
        sellOrders.push({ ...order, fillValue });
        totalSellUSDT += fillValue;
      }
    }

    // ─── Calculate realized P&L (FIFO matching) ────────────────────────
    // Simple approach: match each SELL against oldest BUYs
    let realizedPnL = 0;
    const buyStack = [...buyOrders].sort((a, b) => a.cTime - b.cTime);

    for (const sell of sellOrders) {
      const sellInstId = sell.instId; // e.g., BTC-USDT
      const sellQty = parseFloat(sell.accFillSz || 0);
      const sellPx = parseFloat(sell.avgPx || 0);

      let remainingSellQty = sellQty;

      // Find matching BUY orders
      for (let i = buyStack.length - 1; i >= 0; i--) {
        if (remainingSellQty <= 0) break;

        const buy = buyStack[i];
        if (buy.instId !== sellInstId) continue; // Same instrument

        const buyQtyAvail = parseFloat(buy.accFillSz || 0);
        if (buyQtyAvail <= 0) continue;

        const matchQty = Math.min(remainingSellQty, buyQtyAvail);
        const buyPx = parseFloat(buy.avgPx || 0);

        const pnl = (sellPx - buyPx) * matchQty;
        realizedPnL += pnl;

        buy.accFillSz = (buyQtyAvail - matchQty).toString();
        remainingSellQty -= matchQty;
      }
    }

    // ─── Last 10 orders (newest first) ──────────────────────────────────
    const lastTen = allOrders.sort((a, b) => b.cTime - a.cTime).slice(0, 10).map(o => ({
      ordId: o.ordId,
      instId: o.instId,
      side: o.side?.toUpperCase(),
      fillSz: parseFloat(o.accFillSz || 0),
      fillPx: parseFloat(o.avgPx || 0),
      state: o.state,
      timestamp: new Date(parseInt(o.cTime)).toISOString()
    }));

    return Response.json({
      audit: {
        timeWindow: { from: startDate.toISOString(), to: now.toISOString(), period: auditLabel },
        filledOrdersCount: allOrders.length,
        buyCount: buyOrders.length,
        sellCount: sellOrders.length,
        totalBuyUSDT: parseFloat(totalBuyUSDT.toFixed(2)),
        totalSellUSDT: parseFloat(totalSellUSDT.toFixed(2)),
        realizedPnL: parseFloat(realizedPnL.toFixed(2)),
        failedOrderCount: 0, // Only fetched filled orders, no failures
        skipReasonsCount: 0, // No skip logic in this audit
        lastTenOrders: lastTen
      },
      rawStats: {
        totalOrdersAnalyzed: allOrders.length,
        endpoint: workingEndpoint
      },
      timestamp: now.toISOString()
    });
  } catch (err) {
    console.error(`[AUDIT] Fatal: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});