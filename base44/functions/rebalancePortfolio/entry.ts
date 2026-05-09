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

// ---- Main handler ----
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to true (preview mode)
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admin or specific user (Suzana)
    const suzanaEmail = 'nikitasuziface77@gmail.com';
    const suzanaAltEmail = 'sauzana.cozmas@gmail.com';
    const isSuzana = user.email === suzanaEmail || user.email === suzanaAltEmail;
    const isAdmin = user.role === 'admin';

    if (!isSuzana && !isAdmin) {
      return Response.json({ error: 'Forbidden: Only Suzana or admin can rebalance' }, { status: 403 });
    }
    
    const mode = dryRun ? 'REBALANCE_PREVIEW' : 'REBALANCE_EXECUTE';
    console.log(`[${mode}] Starting by ${user.email}`);

    const userEmail = isSuzana ? suzanaEmail : user.email;

    // Get OKX connection
    const conns = await base44.asServiceRole.entities.ExchangeConnection.filter({
      exchange: 'okx',
      status: 'connected',
      $or: [{ created_by: userEmail }, { user_email: userEmail }]
    });

    if (conns.length === 0) {
      return Response.json({ error: 'No OKX connection found' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decryptOkx(conn.api_key_encrypted);
    const apiSecret = await decryptOkx(conn.api_secret_encrypted);
    const passphrase = await decryptOkx(conn.encryption_iv);

    // Fetch live balances from OKX Trading account
    let balances = [];
    for (const endpoint of ['https://www.okx.com', 'https://eea.okx.com']) {
      try {
        const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        if (res.code === '0' && res.data?.[0]?.details) {
          balances = res.data[0].details;
          console.log(`[REBALANCE] Fetched balances from ${endpoint}: ${balances.length} assets`);
          break;
        }
      } catch (e) {
        console.log(`[REBALANCE] Balance fetch from ${endpoint} failed: ${e.message}`);
      }
    }

    if (balances.length === 0) {
      return Response.json({ error: 'Could not fetch OKX balances' }, { status: 500 });
    }

    // Allowed strategy pairs
    const ALLOWED_ASSETS = ['ETH', 'SOL', 'USDT'];
    const OKX_MIN_NOTIONAL = 5; // $5 minimum

    // Get open Robot 1 positions from live orders
    const openAssets = new Set(['USDT']); // Always keep USDT
    let todayOrders = [];
    for (const endpoint of ['https://www.okx.com', 'https://eea.okx.com']) {
      try {
        const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/trade/orders-history?instType=SPOT&limit=100', '', endpoint);
        if (res.code === '0') {
          todayOrders = res.data || [];
          break;
        }
      } catch (e) {
        console.log(`[REBALANCE] Order fetch failed: ${e.message}`);
      }
    }

    // Check for open positions in ETH-USDT and SOL-USDT
    const buyOrders = todayOrders.filter(o => o.side === 'buy' && (o.instId === 'ETH-USDT' || o.instId === 'SOL-USDT'));
    const sellOrders = todayOrders.filter(o => o.side === 'sell' && (o.instId === 'ETH-USDT' || o.instId === 'SOL-USDT'));

    // Simple FIFO: if any unfilled BUY, mark asset as open
    for (const buy of buyOrders) {
      const asset = buy.instId.split('-')[0];
      const openQty = parseFloat(buy.accFillSz || 0) - sellOrders
        .filter(s => s.instId === buy.instId)
        .reduce((sum, s) => sum + parseFloat(s.accFillSz || 0), 0);
      if (openQty > 0.0001) {
        openAssets.add(asset);
        console.log(`[REBALANCE] Open position found: ${asset} qty=${openQty.toFixed(6)}`);
      }
    }

    // Fetch ticker data for valuation
    let tickerMap = {};
    try {
      const res = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
      const data = await res.json();
      if (data.code === '0' && data.data) {
        for (const ticker of data.data) {
          tickerMap[ticker.instId.split('-')[0]] = parseFloat(ticker.last || 0);
        }
      }
    } catch (e) {
      console.log(`[REBALANCE] Ticker fetch failed: ${e.message}`);
    }

    // Identify assets to sell
    const toSell = [];
    for (const asset of balances) {
      const ccy = asset.ccy;
      const availBal = parseFloat(asset.availBal || 0);

      // Skip allowed assets or assets with no balance
      if (ALLOWED_ASSETS.includes(ccy) || availBal < 0.00001) continue;

      // Skip if open position exists
      if (openAssets.has(ccy)) {
        console.log(`[REBALANCE] SKIP ${ccy}: open position exists`);
        continue;
      }

      // Check notional value
      const price = tickerMap[ccy] || 0;
      const value = availBal * price;

      if (value >= OKX_MIN_NOTIONAL) {
        toSell.push({ ccy, qty: availBal, price, value });
        console.log(`[REBALANCE_SELL] ${ccy} qty=${availBal.toFixed(6)} value=$${value.toFixed(2)}`);
      } else {
        console.log(`[REBALANCE] SKIP ${ccy}: value=$${value.toFixed(2)} < min=$${OKX_MIN_NOTIONAL}`);
      }
    }

    // Preview mode: return what would be sold
    if (dryRun) {
      console.log(`[REBALANCE_PREVIEW] Assets to sell: ${toSell.length}`);
      const totalEstimatedUsdt = toSell.reduce((sum, item) => sum + item.value, 0);
      
      return Response.json({
        success: true,
        mode: 'PREVIEW',
        assetsToSell: toSell.map(item => ({
          asset: item.ccy,
          quantity: item.qty,
          estimatedUSDT: item.value
        })),
        totalEstimatedUSDT: totalEstimatedUsdt,
        skippedAssets: Array.from(openAssets).filter(a => a !== 'USDT'),
        timestamp: new Date().toISOString()
      });
    }

    // Execute mode: place real SELL orders
    const results = [];
    let totalExecutedUSDT = 0;
    
    for (const item of toSell) {
      try {
        const instId = `${item.ccy}-USDT`;
        const bodyStr = JSON.stringify({
          instId,
          tdMode: 'cash',
          side: 'sell',
          ordType: 'market',
          sz: item.qty.toFixed(6)
        });

        let orderRes = null;
        for (const endpoint of ['https://www.okx.com', 'https://eea.okx.com']) {
          try {
            orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', bodyStr, endpoint);
            if (orderRes.code === '0') break;
          } catch (e) {
            console.log(`[REBALANCE_EXECUTE] Order POST to ${endpoint} failed: ${e.message}`);
          }
        }

        if (orderRes?.code === '0') {
          const ordId = orderRes.data?.[0]?.ordId;
          console.log(`[REBALANCE_EXECUTE] ${item.ccy} SELL SUCCESS ordId=${ordId} qty=${item.qty.toFixed(6)} value=$${item.value.toFixed(2)}`);
          results.push({
            asset: item.ccy,
            quantity: item.qty,
            estimatedUSDT: item.value,
            orderId: ordId,
            status: 'SUCCESS'
          });
          totalExecutedUSDT += item.value;
        } else {
          console.log(`[REBALANCE_EXECUTE] ${item.ccy} SELL FAILED code=${orderRes?.code} msg=${orderRes?.msg}`);
          results.push({
            asset: item.ccy,
            quantity: item.qty,
            estimatedUSDT: item.value,
            status: 'FAILED',
            error: orderRes?.msg || 'Unknown error'
          });
        }
      } catch (err) {
        console.error(`[REBALANCE_EXECUTE] Error selling ${item.ccy}:`, err.message);
        results.push({
          asset: item.ccy,
          quantity: item.qty,
          estimatedUSDT: item.value,
          status: 'ERROR',
          error: err.message
        });
      }
    }

    // Trigger balance refresh (call okxBalanceRefresh function)
    try {
      const refreshRes = await base44.asServiceRole.functions.invoke('okxBalanceRefresh', {});
      console.log(`[REBALANCE_EXECUTE] Balance refresh triggered: ${refreshRes.status}`);
    } catch (e) {
      console.log(`[REBALANCE_EXECUTE] Balance refresh failed: ${e.message}`);
    }

    console.log(`[REBALANCE_EXECUTE] Completed: ${results.length} assets, $${totalExecutedUSDT.toFixed(2)} converted to USDT`);

    return Response.json({
      success: true,
      mode: 'EXECUTE',
      executed_count: results.filter(r => r.status === 'SUCCESS').length,
      totalExecutedUSDT,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[REBALANCE] Fatal error:`, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});