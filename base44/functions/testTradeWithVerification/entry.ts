/**
 * Test Trade: Real BUY with OKX verification
 * 1. Place BUY order with 20 USDT on best available pair
 * 2. Wait for fill and verify ordId in OKX
 * 3. Save to OXXOrderLedger with robotId='test_trade'
 * 4. Return active position
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const TEST_AMOUNT_USDT = 100;
const PAIR_PRIORITY = ['SOL-USDT', 'DOGE-USDT', 'ADA-USDT', 'XRP-USDT']; // Low fee, high liquidity

async function deriveOkxKey() {
  const enc = new TextEncoder();
  const appId = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
  const mat = await crypto.subtle.importKey('raw', enc.encode(appId), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
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

async function hmacSign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxRequest(apiKey, secret, passphrase, method, path, bodyStr = '') {
  const ts = new Date().toISOString();
  const sig = await hmacSign(secret, ts + method + path + bodyStr);
  const res = await fetch('https://www.okx.com' + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sig,
      'OK-ACCESS-TIMESTAMP': ts,
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
    if (user && user.email !== SUZANA_EMAIL && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[TEST] === Real Test Trade with OKX Verification ===');

    // Get OKX connection
    const [c1, c2] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
    ]);
    const seen = new Set();
    const conns = [...c1, ...c2].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (!conns[0]) return Response.json({ error: 'No OKX connection' }, { status: 400 });

    const conn = conns[0];
    const [apiKey, apiSecret, passphrase] = await Promise.all([
      decryptOkx(conn.api_key_encrypted),
      decryptOkx(conn.api_secret_encrypted),
      decryptOkx(conn.encryption_iv)
    ]);

    // 1. Get current balance
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const details = balRes.data?.[0]?.details || [];
    const usdtDetail = details.find(d => d.ccy === 'USDT');
    const freeUSDT = parseFloat(usdtDetail?.availBal || 0);

    if (freeUSDT < TEST_AMOUNT_USDT) {
      return Response.json({ 
        error: `Insufficient USDT: ${freeUSDT.toFixed(2)} < ${TEST_AMOUNT_USDT}` 
      }, { status: 400 });
    }

    console.log(`[TEST] Free USDT: ${freeUSDT}`);

    // 2. Get SOL price and calculate size
    const tickRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', 
      `/api/v5/market/ticker?instId=SOL-USDT`);
    if (tickRes.code !== '0' || !tickRes.data?.[0]) {
      return Response.json({ error: 'Could not get SOL price' }, { status: 400 });
    }

    const selectedPair = 'SOL-USDT';
    const selectedPrice = parseFloat(tickRes.data[0].last || 0);
    const buyQtyNum = TEST_AMOUNT_USDT / selectedPrice;
    const buyQty = buyQtyNum.toFixed(8);
    
    console.log(`[TEST] Pair: ${selectedPair}, Price: $${selectedPrice}, Qty: ${buyQty}`);

    // 3. Place BUY market order
    const orderBody = JSON.stringify({
      instId: selectedPair,
      tdMode: 'cash',
      side: 'buy',
      ordType: 'market',
      sz: buyQty
    });

    const orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', orderBody);

    if (orderRes.code !== '0' || !orderRes.data?.[0]?.ordId) {
      console.error(`[TEST] Order failed: ${JSON.stringify(orderRes)}`);
      return Response.json({ 
        error: 'Order placement failed',
        okxResponse: orderRes
      }, { status: 400 });
    }

    const ordId = orderRes.data[0].ordId;
    console.log(`[TEST] Order placed: ${ordId}`);

    // 4. Wait for fill (max 15 seconds)
    let filledOrder = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const fillRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/orders/${ordId}?instId=${selectedPair}`);
      
      if (fillRes.code === '0' && fillRes.data?.[0]) {
        const order = fillRes.data[0];
        if (order.state === '2' || order.state === '1' || parseFloat(order.fillSz || 0) > 0) {
          filledOrder = order;
          break;
        }
      }
    }

    if (!filledOrder) {
      return Response.json({ 
        error: 'Order did not fill within timeout',
        ordId: ordId
      }, { status: 400 });
    }

    console.log(`[TEST] Order filled: ${filledOrder.state}`);

    // 5. Save to OXXOrderLedger
    const fillSz = parseFloat(filledOrder.fillSz || 0);
    const fillPx = parseFloat(filledOrder.fillPx || 0);
    const fillUSDT = fillSz * fillPx;
    const fee = Math.abs(parseFloat(filledOrder.fee || 0));

    await base44.asServiceRole.entities.OXXOrderLedger.create({
      ordId: ordId,
      instId: selectedPair,
      side: 'buy',
      avgPx: fillPx,
      accFillSz: fillSz,
      quoteUSDT: fillUSDT,
      fee: fee,
      feeCcy: filledOrder.feeCcy || 'USDT',
      timestamp: new Date(parseInt(filledOrder.fillTime || 0)).toISOString(),
      robotId: 'test_trade',
      verified: true,
      state: 'filled'
    });

    console.log(`[TEST] Ledger record saved for ${ordId}`);

    // 6. Return position info
    const asset = selectedPair.split('-')[0];
    const positionValue = fillUSDT - fee;

    return Response.json({
      status: 'test_trade_complete',
      timestamp: new Date().toISOString(),
      
      orderExecution: {
        ordId: ordId,
        instId: selectedPair,
        side: 'buy',
        okxVerified: true,
        okxState: filledOrder.state
      },

      fillDetails: {
        fillSize: fillSz,
        fillPrice: fillPx,
        fillUSDT: fillUSDT,
        fee: fee,
        netCost: positionValue
      },

      activePosition: {
        asset: asset,
        quantity: fillSz,
        entryPrice: fillPx,
        positionValueUSDT: fillUSDT,
        netValueUSDT: positionValue
      },

      ledgerStatus: {
        saved: true,
        robotId: 'test_trade',
        verified: true,
        recordId: ordId
      },

      sourceOfTruth: 'OKX API verified + OXXOrderLedger saved'
    });

  } catch (err) {
    console.error(`[TEST] Exception: ${err.message}`);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});