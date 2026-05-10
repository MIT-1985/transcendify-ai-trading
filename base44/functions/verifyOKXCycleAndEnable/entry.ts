import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const TEST_PAIR = 'DOGE-USDT';

// ==================== CRYPTO UTILITIES ====================
const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';

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

// ==================== MAIN HANDLER ====================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = {
      timestamp: new Date().toISOString(),
      user_email: user.email,
      cycle_status: 'PENDING',
      buy_order: null,
      sell_order: null,
      buy_recorded: false,
      sell_recorded: false,
      robot1_enabled: false,
      errors: [],
      next_action: 'Fetching OKX credentials...'
    };

    // ========== GET OKX CREDENTIALS ==========
    const connection = await base44.asServiceRole.entities.ExchangeConnection.filter(
      { exchange: 'okx' },
      '-updated_date',
      1
    );

    if (!connection || connection.length === 0) {
      report.errors.push('ERROR: No OKX connection found');
      return Response.json(report, { status: 400 });
    }

    const conn = connection[0];
    let apiKey, apiSecret, passphrase;
    
    try {
      apiKey = await decrypt(conn.api_key_encrypted);
      apiSecret = await decrypt(conn.api_secret_encrypted);
      passphrase = await decrypt(conn.encryption_iv);
      report.next_action = 'Testing OKX environment...';
    } catch (e) {
      report.errors.push(`ERROR: Failed to decrypt credentials - ${e.message}`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    // ========== STEP 1: PLACE BUY ORDER ==========
    report.next_action = 'Fetching balance and market data...';

    // Get balance
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    if (balRes.code !== '0') {
      report.errors.push(`Balance query failed: ${balRes.msg}`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    let usdtBal = 0;
    for (const d of (balRes.data?.[0]?.details || [])) {
      if (d.ccy === 'USDT') {
        usdtBal = parseFloat(d.availBal || 0);
        break;
      }
    }

    // Use available balance, minimum $10
    const BUY_AMOUNT_USDT = Math.max(10, Math.min(usdtBal - 0.5, 80));
    if (usdtBal < 10) {
      report.errors.push(`Insufficient balance: ${usdtBal} USDT (need $10 minimum)`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    // Get current price
    const tickRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
      `/api/v5/market/ticker?instId=${TEST_PAIR}`);
    
    if (tickRes.code !== '0' || !tickRes.data?.[0]) {
      report.errors.push(`Failed to fetch ${TEST_PAIR} price`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    const currentPrice = parseFloat(tickRes.data[0].last);
    const buyQty = (BUY_AMOUNT_USDT / currentPrice).toFixed(8);
    console.log(`[VERIFY] ${TEST_PAIR} price=${currentPrice} qty=${buyQty} amount=${BUY_AMOUNT_USDT}`);

    report.next_action = `Placing BUY order for ${buyQty} ${TEST_PAIR}...`;

    // Place BUY order
    const buyOrderBody = JSON.stringify({
      instId: TEST_PAIR,
      side: 'buy',
      ordType: 'market',
      tdMode: 'cash',
      tgtCcy: 'quote_ccy',
      sz: BUY_AMOUNT_USDT.toString()
    });

    const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST',
      '/api/v5/trade/order', buyOrderBody);

    if (buyRes.code !== '0') {
      const firstError = buyRes.data?.[0];
      report.errors.push(`BUY ORDER REJECTED: [${firstError?.sCode}] ${firstError?.sMsg}`);
      report.buy_order = {
        attempted: true,
        error_code: firstError?.sCode,
        error_msg: firstError?.sMsg,
        pair: TEST_PAIR,
        qty: buyQty,
        price: currentPrice
      };
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    const buyOrdId = buyRes.data?.[0]?.ordId;
    if (!buyOrdId) {
      report.errors.push('No order ID returned from BUY');
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    report.buy_order = {
      ordId: buyOrdId,
      pair: TEST_PAIR,
      qty: buyQty,
      price: currentPrice,
      state: 'pending'
    };

    report.next_action = 'Waiting for BUY fill...';
    await new Promise(r => setTimeout(r, 1000));

    // ========== VERIFY BUY FILL ==========
    let buyFilled = null;
    for (let i = 0; i < 30; i++) {
      let queryRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/orders-pending?instId=${TEST_PAIR}`);
      
      if (queryRes.code === '0' && queryRes.data) {
        buyFilled = queryRes.data.find(o => o.ordId === buyOrdId);
      }

      // If not in pending, check order history
      if (!buyFilled) {
        const histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
          `/api/v5/trade/orders-history?instId=${TEST_PAIR}&instType=SPOT&ordId=${buyOrdId}`);
        
        if (histRes.code === '0' && histRes.data && histRes.data.length > 0) {
          buyFilled = histRes.data[0];
        }
      }
      
      if (buyFilled) {
        if (buyFilled.state === '2' || (parseFloat(buyFilled.accFillSz || 0) > 0)) {
          report.buy_order.state = 'filled';
          report.buy_order.ordId = buyFilled.ordId;
          report.buy_order.avgPx = parseFloat(buyFilled.avgPx);
          report.buy_order.accFillSz = parseFloat(buyFilled.accFillSz);
          report.buy_order.fee = parseFloat(buyFilled.fee || 0);
          report.buy_order.feeCcy = buyFilled.feeCcy;
          report.buy_order.fillTime = buyFilled.fillTime;
          break;
        } else if (buyFilled.state === '-1') {
          report.errors.push('BUY order was cancelled');
          report.buy_order.state = 'cancelled';
          return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
    }

    if (!buyFilled || !buyFilled.accFillSz || parseFloat(buyFilled.accFillSz) === 0) {
      report.errors.push('BUY order did not fill within 15 seconds');
      report.buy_order.state = 'timeout';
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    report.next_action = `BUY filled! Placing SELL for ${buyFilled.accFillSz} ${TEST_PAIR}...`;

    // ========== STEP 2: PLACE SELL ORDER ==========
    const sellQty = buyFilled.accFillSz; // Sell exact amount that was bought
    
    const sellOrderBody = JSON.stringify({
      instId: TEST_PAIR,
      side: 'sell',
      ordType: 'market',
      tdMode: 'cash',
      tgtCcy: 'quote_ccy',
      sz: sellQty
    });

    const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST',
      '/api/v5/trade/order', sellOrderBody);

    if (sellRes.code !== '0') {
      const firstError = sellRes.data?.[0];
      report.errors.push(`SELL ORDER REJECTED: [${firstError?.sCode}] ${firstError?.sMsg}`);
      report.sell_order = {
        attempted: true,
        error_code: firstError?.sCode,
        error_msg: firstError?.sMsg,
        pair: TEST_PAIR,
        qty: sellQty
      };
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    const sellOrdId = sellRes.data?.[0]?.ordId;
    if (!sellOrdId) {
      report.errors.push('No order ID returned from SELL');
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    report.sell_order = {
      ordId: sellOrdId,
      pair: TEST_PAIR,
      qty: sellQty,
      state: 'pending'
    };

    report.next_action = 'Waiting for SELL fill...';
    await new Promise(r => setTimeout(r, 1000));

    // ========== VERIFY SELL FILL ==========
    let sellFilled = null;
    for (let i = 0; i < 30; i++) {
      let queryRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/orders-pending?instId=${TEST_PAIR}`);
      
      if (queryRes.code === '0' && queryRes.data) {
        sellFilled = queryRes.data.find(o => o.ordId === sellOrdId);
      }

      // If not in pending, check order history
      if (!sellFilled) {
        const histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
          `/api/v5/trade/orders-history?instId=${TEST_PAIR}&instType=SPOT&ordId=${sellOrdId}`);
        
        if (histRes.code === '0' && histRes.data && histRes.data.length > 0) {
          sellFilled = histRes.data[0];
        }
      }
      
      if (sellFilled) {
        if (sellFilled.state === '2' || (parseFloat(sellFilled.accFillSz || 0) > 0)) {
          report.sell_order.state = 'filled';
          report.sell_order.ordId = sellFilled.ordId;
          report.sell_order.avgPx = parseFloat(sellFilled.avgPx);
          report.sell_order.accFillSz = parseFloat(sellFilled.accFillSz);
          report.sell_order.fee = parseFloat(sellFilled.fee || 0);
          report.sell_order.feeCcy = sellFilled.feeCcy;
          report.sell_order.fillTime = sellFilled.fillTime;
          break;
        } else if (sellFilled.state === '-1') {
          report.errors.push('SELL order was cancelled');
          report.sell_order.state = 'cancelled';
          return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
    }

    if (!sellFilled || !sellFilled.accFillSz || parseFloat(sellFilled.accFillSz) === 0) {
      report.errors.push('SELL order did not fill within 15 seconds');
      report.sell_order.state = 'timeout';
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    report.next_action = 'Recording both orders to OXXOrderLedger...';

    // ========== STEP 3: SAVE TO LEDGER ==========
    try {
      await base44.asServiceRole.entities.OXXOrderLedger.create({
        ordId: buyFilled.ordId,
        instId: TEST_PAIR,
        side: 'buy',
        avgPx: parseFloat(buyFilled.avgPx),
        accFillSz: parseFloat(buyFilled.accFillSz),
        quoteUSDT: parseFloat(buyFilled.avgPx) * parseFloat(buyFilled.accFillSz),
        fee: parseFloat(buyFilled.fee),
        feeCcy: buyFilled.feeCcy,
        timestamp: new Date(parseInt(buyFilled.fillTime)).toISOString(),
        robotId: 'verification_cycle',
        verified: true,
        state: 'filled'
      });
      report.buy_recorded = true;
    } catch (e) {
      report.errors.push(`Failed to record BUY order: ${e.message}`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    try {
      await base44.asServiceRole.entities.OXXOrderLedger.create({
        ordId: sellFilled.ordId,
        instId: TEST_PAIR,
        side: 'sell',
        avgPx: parseFloat(sellFilled.avgPx),
        accFillSz: parseFloat(sellFilled.accFillSz),
        quoteUSDT: parseFloat(sellFilled.avgPx) * parseFloat(sellFilled.accFillSz),
        fee: parseFloat(sellFilled.fee),
        feeCcy: sellFilled.feeCcy,
        timestamp: new Date(parseInt(sellFilled.fillTime)).toISOString(),
        robotId: 'verification_cycle',
        verified: true,
        state: 'filled'
      });
      report.sell_recorded = true;
    } catch (e) {
      report.errors.push(`Failed to record SELL order: ${e.message}`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    // ========== ENABLE ROBOT 1 & START AUTOMATION ==========
    report.next_action = 'Enabling Robot 1 automation...';

    try {
      // Create a Robot1ExecutionLog entry to mark verification complete
      await base44.asServiceRole.entities.Robot1ExecutionLog.create({
        execution_time: new Date().toISOString(),
        decision: 'VERIFICATION_CYCLE_PASSED',
        reason: `OKX verified cycle complete: BUY ${buyFilled.accFillSz} @ ${buyFilled.avgPx}, SELL @ ${sellFilled.avgPx}`,
        active_position: false,
        okx_status: 'OK',
        polygon_status: 'OK'
      });

      report.robot1_enabled = true;
    } catch (e) {
      report.errors.push(`Failed to enable Robot 1: ${e.message}`);
      return Response.json({ ...report, cycle_status: 'FAILED' }, { status: 400 });
    }

    report.cycle_status = 'SUCCESS';
    report.next_action = 'Robot 1 enabled. Running first scalp cycle...';

    // Trigger robot1Scalp in background
    try {
      await base44.asServiceRole.functions.invoke('robot1Scalp', {});
    } catch (e) {
      console.error('Initial robot1Scalp call failed:', e.message);
    }

    return Response.json(report, { status: 200 });

  } catch (error) {
    console.error('ERROR:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});