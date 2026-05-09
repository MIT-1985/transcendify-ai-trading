import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createHmac } from 'node:crypto';

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const OKX_ENDPOINTS = ['https://www.okx.com', 'https://eea.okx.com'];

async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decrypt(encryptedStr) {
  const key = await deriveKey(MASTER_SECRET);
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
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role !== 'admin' && user.email !== SUZANA_EMAIL) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
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
      return Response.json({ error: 'No OKX connection found for Suzana' }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decrypt(conn.api_key_encrypted);
    const apiSecret = await decrypt(conn.api_secret_encrypted);
    const passphrase = await decrypt(conn.encryption_iv);

    // ─── STEP 1: Get balance BEFORE ────────────────────────────────────────────
    let balanceBeforeData = null;
    let workingEndpoint = null;

    for (const endpoint of OKX_ENDPOINTS) {
      try {
        const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        if (res.code === '0' && res.data?.[0]?.details) {
          balanceBeforeData = res.data[0].details;
          workingEndpoint = endpoint;
          break;
        }
      } catch (e) {
        console.log(`[TEST-XRP] Balance fetch from ${endpoint} failed: ${e.message}`);
      }
    }

    if (!balanceBeforeData) {
      return Response.json({ error: 'Could not fetch balances' }, { status: 500 });
    }

    // Extract XRP and USDT before
    const xrpBefore = balanceBeforeData.find(d => d.ccy === 'XRP');
    const usdtBefore = balanceBeforeData.find(d => d.ccy === 'USDT');
    const xrpQtyBefore = parseFloat(xrpBefore?.availBal || 0);
    const usdtQtyBefore = parseFloat(usdtBefore?.availBal || 0);

    // Get current XRP price for equity calc
    let xrpPrice = 0;
    try {
      const tickerRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=XRP-USDT');
      const tickerData = await tickerRes.json();
      if (tickerData.code === '0' && tickerData.data?.[0]?.last) {
        xrpPrice = parseFloat(tickerData.data[0].last);
      }
    } catch (e) {
      console.log(`[TEST-XRP] Price fetch error: ${e.message}`);
    }

    // Calculate total equity BEFORE
    let totalEquityBefore = usdtQtyBefore;
    for (const d of balanceBeforeData) {
      if (d.ccy !== 'USDT' && d.ccy !== 'XRP') {
        try {
          const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${d.ccy}-USDT`);
          const data = await res.json();
          if (data.code === '0' && data.data?.[0]?.last) {
            totalEquityBefore += parseFloat(d.availBal || 0) * parseFloat(data.data[0].last);
          }
        } catch (e) {}
      }
    }
    // Add XRP equity
    totalEquityBefore += xrpQtyBefore * xrpPrice;

    console.log(`[TEST-XRP] ✓ BEFORE: XRP=${xrpQtyBefore}, USDT=${usdtQtyBefore}, Total Equity=$${totalEquityBefore.toFixed(2)}`);

    // ─── STEP 2: Execute XRP market sell ────────────────────────────────────────
    // Conservative: sell 1 XRP (minimum that works, ~$1.41 USDT)
    const sellQty = '1';
    const orderBody = JSON.stringify({
      instId: 'XRP-USDT',
      tdMode: 'cash',
      side: 'sell',
      ordType: 'market',
      sz: sellQty
    });

    const orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', orderBody, workingEndpoint);
    
    if (orderRes.code !== '0') {
      return Response.json({
        success: false,
        error: `Order failed: ${orderRes.msg || orderRes.code}`,
        details: orderRes
      }, { status: 500 });
    }

    const ordId = orderRes.data?.[0]?.ordId;
    console.log(`[TEST-XRP] ✓ Order placed: ${ordId}`);

    // Wait 1s for order to settle
    await new Promise(r => setTimeout(r, 1000));

    // ─── STEP 3: Get order details ─────────────────────────────────────────────
    let executedQty = 0;
    let executedAvgPrice = 0;
    let executedUSDT = 0;

    const orderDetailsRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=XRP-USDT&ordId=${ordId}`, '', workingEndpoint);
    
    if (orderDetailsRes.code === '0' && orderDetailsRes.data?.[0]) {
      const order = orderDetailsRes.data[0];
      executedQty = parseFloat(order.accFillSz || 0);
      executedAvgPrice = parseFloat(order.avgPx || 0);
      executedUSDT = executedQty * executedAvgPrice;
      console.log(`[TEST-XRP] ✓ Execution: qty=${executedQty}, avgPx=${executedAvgPrice}, USDT=${executedUSDT.toFixed(2)}`);
    }

    // ─── STEP 4: Get balance AFTER ─────────────────────────────────────────────
    await new Promise(r => setTimeout(r, 1000));

    let balanceAfterData = null;
    for (const endpoint of OKX_ENDPOINTS) {
      try {
        const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance', '', endpoint);
        if (res.code === '0' && res.data?.[0]?.details) {
          balanceAfterData = res.data[0].details;
          break;
        }
      } catch (e) {}
    }

    if (!balanceAfterData) {
      return Response.json({ error: 'Could not fetch balances after' }, { status: 500 });
    }

    // Extract after values
    const xrpAfter = balanceAfterData.find(d => d.ccy === 'XRP');
    const usdtAfter = balanceAfterData.find(d => d.ccy === 'USDT');
    const xrpQtyAfter = parseFloat(xrpAfter?.availBal || 0);
    const usdtQtyAfter = parseFloat(usdtAfter?.availBal || 0);

    // Calculate total equity AFTER
    let totalEquityAfter = usdtQtyAfter;
    for (const d of balanceAfterData) {
      if (d.ccy !== 'USDT' && d.ccy !== 'XRP') {
        try {
          const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${d.ccy}-USDT`);
          const data = await res.json();
          if (data.code === '0' && data.data?.[0]?.last) {
            totalEquityAfter += parseFloat(d.availBal || 0) * parseFloat(data.data[0].last);
          }
        } catch (e) {}
      }
    }
    // Add XRP equity (should be minimal)
    totalEquityAfter += xrpQtyAfter * xrpPrice;

    console.log(`[TEST-XRP] ✓ AFTER: XRP=${xrpQtyAfter}, USDT=${usdtQtyAfter}, Total Equity=$${totalEquityAfter.toFixed(2)}`);

    // ─── STEP 5: Calculate deltas ──────────────────────────────────────────────
    const xrpDelta = xrpQtyBefore - xrpQtyAfter;
    const usdtDelta = usdtQtyAfter - usdtQtyBefore;
    const equityDelta = totalEquityAfter - totalEquityBefore;

    return Response.json({
      success: true,
      test: 'XRP-USDT Market Sell',
      order: {
        ordId,
        instId: 'XRP-USDT',
        side: 'sell',
        ordType: 'market'
      },
      before: {
        xrp_qty: xrpQtyBefore,
        usdt_qty: usdtQtyBefore,
        xrp_price: xrpPrice,
        total_equity: parseFloat(totalEquityBefore.toFixed(2))
      },
      execution: {
        xrp_sold: executedQty,
        avg_price: executedAvgPrice,
        usdt_received: parseFloat(executedUSDT.toFixed(2))
      },
      after: {
        xrp_qty: xrpQtyAfter,
        usdt_qty: parseFloat(usdtQtyAfter.toFixed(2)),
        total_equity: parseFloat(totalEquityAfter.toFixed(2))
      },
      delta: {
        xrp_delta: parseFloat(xrpDelta.toFixed(6)),
        usdt_delta: parseFloat(usdtDelta.toFixed(2)),
        equity_delta: parseFloat(equityDelta.toFixed(2)),
        equity_change_pct: parseFloat(((equityDelta / totalEquityBefore) * 100).toFixed(4))
      }
    });

  } catch (error) {
    console.log(`[TEST-XRP] ERROR: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});