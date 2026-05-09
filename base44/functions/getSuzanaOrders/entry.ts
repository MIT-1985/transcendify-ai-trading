import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function deriveOkxKey() {
  const enc = new TextEncoder();
  const appId = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(appId), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
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

async function okxRequest(apiKey, secret, passphrase, method, path, baseUrl = 'https://www.okx.com') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path;
  const signature = await hmacSignOkx(secret, message);
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

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Find Suzana's OKX connection
    const conns = await base44.asServiceRole.entities.ExchangeConnection.filter({
      created_by: SUZANA_EMAIL, exchange: 'okx', status: 'connected'
    });
    const conn = conns[0];
    if (!conn) return Response.json({ success: false, error: 'No OKX connection found' }, { status: 404 });

    const apiKey = await decryptOkx(conn.api_key_encrypted);
    const apiSecret = await decryptOkx(conn.api_secret_encrypted);
    const passphrase = await decryptOkx(conn.encryption_iv);

    // Try both endpoints
    const endpoints = ['https://www.okx.com', 'https://eea.okx.com'];
    let ordersData = null;
    for (const ep of endpoints) {
      try {
        const data = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/trade/orders-history?instType=SPOT&limit=20', ep);
        if (data.code === '0') { ordersData = data; break; }
        if (data.code !== '50119') { ordersData = data; break; }
      } catch (e) {
        console.log(`[getSuzanaOrders] ${ep} error: ${e.message}`);
      }
    }

    if (!ordersData || ordersData.code !== '0') {
      return Response.json({ success: false, error: ordersData?.msg || 'Failed to fetch orders' }, { status: 500 });
    }

    const orders = (ordersData.data || []).map(o => ({
      ordId: o.ordId,
      instId: o.instId,
      side: o.side?.toUpperCase(),
      ordType: o.ordType,
      sz: parseFloat(o.sz),
      px: o.px ? parseFloat(o.px) : null,
      avgPx: o.avgPx ? parseFloat(o.avgPx) : null,
      fillSz: parseFloat(o.fillSz || 0),
      accFillSz: parseFloat(o.accFillSz || 0),
      fee: o.fee ? parseFloat(o.fee) : 0,
      pnl: o.pnl ? parseFloat(o.pnl) : 0,
      state: o.state,
      cTime: parseInt(o.cTime),
      uTime: parseInt(o.uTime),
    }));

    // Calculate realized P&L by matching buy/sell pairs per symbol
    const symbolTrades = {};
    orders.forEach(o => {
      if (!symbolTrades[o.instId]) symbolTrades[o.instId] = { buys: [], sells: [] };
      if (o.side === 'BUY') symbolTrades[o.instId].buys.push(o);
      else if (o.side === 'SELL') symbolTrades[o.instId].sells.push(o);
    });

    let totalRealizedPnl = 0;
    Object.values(symbolTrades).forEach(({ buys, sells }) => {
      buys.sort((a, b) => a.cTime - b.cTime);
      sells.sort((a, b) => a.cTime - b.cTime);
      
      let buyIdx = 0, sellIdx = 0;
      let remainingQty = 0, avgCostPerUnit = 0;
      
      // Process all buys first to accumulate cost
      buys.forEach(buy => {
        if (buy.accFillSz > 0 && buy.avgPx > 0) {
          avgCostPerUnit = (avgCostPerUnit * remainingQty + buy.avgPx * buy.accFillSz) / (remainingQty + buy.accFillSz);
          remainingQty += buy.accFillSz;
        }
      });
      
      // Match sells against buys
      sells.forEach(sell => {
        if (sell.accFillSz > 0 && sell.avgPx > 0 && remainingQty > 0) {
          const qtyToClose = Math.min(remainingQty, sell.accFillSz);
          const pnl = (sell.avgPx - avgCostPerUnit) * qtyToClose - Math.abs(sell.fee) - (qtyToClose * avgCostPerUnit * 0.002); // subtract maker fees
          totalRealizedPnl += pnl;
          remainingQty -= qtyToClose;
        }
      });
    });

    // Add calculated P&L to orders for display
    const ordersWithPnl = orders.map(o => ({
      ...o,
      calculatedPnl: totalRealizedPnl > 0 ? o.side === 'SELL' ? totalRealizedPnl : 0 : 0
    }));

    console.log(`[getSuzanaOrders] Fetched ${orders.length} orders, total realized P&L: $${totalRealizedPnl.toFixed(4)}`);
    return Response.json({ success: true, orders: ordersWithPnl, totalRealizedPnl });
  } catch (err) {
    console.error('[getSuzanaOrders]', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});