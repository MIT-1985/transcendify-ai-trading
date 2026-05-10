import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const TEST_PAIRS = ['SOL-USDT', 'DOGE-USDT'];
const TEST_AMOUNT_USDT = 100; // OKX minimum notional value

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
      environment: {},
      order_test: null,
      order_query: null,
      diagnosis: [],
      passed: false
    };

    // ========== 1. GET OKX CREDENTIALS ==========
    const connection = await base44.asServiceRole.entities.ExchangeConnection.filter(
      { exchange: 'okx' },
      '-updated_date',
      1
    );

    if (!connection || connection.length === 0) {
      report.diagnosis.push('ERROR: No OKX connection found');
      return Response.json(report, { status: 400 });
    }

    const conn = connection[0];
    let apiKey, apiSecret, passphrase;
    
    try {
      apiKey = await decrypt(conn.api_key_encrypted);
      apiSecret = await decrypt(conn.api_secret_encrypted);
      passphrase = await decrypt(conn.encryption_iv);
      report.diagnosis.push(`✓ OKX credentials decrypted`);
    } catch (e) {
      report.diagnosis.push(`ERROR: Failed to decrypt credentials - ${e.message}`);
      return Response.json({ ...report, error: e.message }, { status: 400 });
    }

    // ========== 2. TEST OKX ENVIRONMENT ==========
    report.environment.endpoint = 'https://www.okx.com';
    
    // Get account info - try balance endpoint as fallback
    let acctRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', 
      '/api/v5/account/account-info');
    
    if (acctRes.code !== '0') {
      report.diagnosis.push(`⚠️  Account info (account-info) failed - code ${acctRes.code}, trying balance endpoint...`);
      acctRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', 
        '/api/v5/account/balance');
      if (acctRes.code !== '0') {
        report.diagnosis.push(`ERROR: Both account endpoints failed - ${acctRes.code}`);
        return Response.json(report, { status: 400 });
      }
    }

    const acctData = acctRes.data?.[0];
    report.environment.account_mode = acctData?.acctLvl || 'unknown';
    report.environment.simulated_trading = acctData?.simulated === '1' ? true : false;
    
    if (report.environment.simulated_trading) {
      report.diagnosis.push('⚠️  SIMULATED TRADING MODE ENABLED - Orders may not fill');
    } else {
      report.diagnosis.push('✓ Real trading mode (not simulated)');
    }

    // Check balance
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
      '/api/v5/account/balance');
    
    if (balRes.code !== '0') {
      report.diagnosis.push('ERROR: Balance query failed');
      return Response.json(report, { status: 400 });
    }

    let usdtBal = 0;
    for (const d of (balRes.data?.[0]?.details || [])) {
      if (d.ccy === 'USDT') {
        usdtBal = parseFloat(d.availBal || 0);
        break;
      }
    }

    report.environment.available_usdt = usdtBal;
    report.diagnosis.push(`✓ Available balance: ${usdtBal} USDT`);

    if (usdtBal < TEST_AMOUNT_USDT) {
      report.diagnosis.push(`ERROR: Insufficient balance (need ${TEST_AMOUNT_USDT}, have ${usdtBal})`);
      return Response.json(report, { status: 400 });
    }

    // ========== 3. PLACE TINY TEST ORDER ==========
    let selectedPair = null;
    let selectedPrice = null;

    for (const pair of TEST_PAIRS) {
      const tickRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/market/ticker?instId=${pair}`);
      
      if (tickRes.code === '0' && tickRes.data?.[0]) {
        selectedPair = pair;
        selectedPrice = parseFloat(tickRes.data[0].last);
        break;
      }
    }

    if (!selectedPair) {
      report.diagnosis.push('ERROR: Could not fetch price for any test pair');
      return Response.json(report, { status: 400 });
    }

    const qty = (TEST_AMOUNT_USDT / selectedPrice).toFixed(8);
    report.diagnosis.push(`✓ Selected ${selectedPair}, qty: ${qty} @ $${selectedPrice}`);

    const orderBody = JSON.stringify({
      instId: selectedPair,
      side: 'buy',
      ordType: 'market',
      tdMode: 'cash',
      tgtCcy: 'quote_ccy',
      sz: qty
    });

    const orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST',
      '/api/v5/trade/order', orderBody);

    report.order_test = {
      http_status: 200,
      okx_code: orderRes.code,
      okx_msg: orderRes.msg,
      pair: selectedPair,
      qty,
      price: selectedPrice,
      raw_response: orderRes
    };

    if (orderRes.code !== '0') {
      const firstError = orderRes.data?.[0];
      report.order_test.sCode = firstError?.sCode;
      report.order_test.sMsg = firstError?.sMsg;
      report.diagnosis.push(`❌ Order placement REJECTED: [${firstError?.sCode}] ${firstError?.sMsg}`);
      
      // Diagnose rejection reason
      if (firstError?.sCode === '51020') {
        report.diagnosis.push('→ Reason: Minimum order amount not met (OKX limit)');
      } else if (firstError?.sCode === '54001') {
        report.diagnosis.push('→ Reason: Account not authorized for trading');
      } else if (firstError?.sCode === '58001') {
        report.diagnosis.push('→ Reason: Check API key permissions (missing trade permission)');
      } else if (firstError?.sCode === '51001') {
        report.diagnosis.push('→ Reason: Insufficient balance');
      } else if (firstError?.sCode === '51002') {
        report.diagnosis.push('→ Reason: Invalid order type or tdMode');
      } else {
        report.diagnosis.push(`→ Reason: Unknown error code ${firstError?.sCode}`);
      }
      
      return Response.json(report, { status: 400 });
    }

    const ordId = orderRes.data?.[0]?.ordId;
    report.order_test.ordId = ordId;
    report.diagnosis.push(`✓ Order placed: ${ordId}`);

    // ========== 4. QUERY ORDER STATUS ==========
    await new Promise(r => setTimeout(r, 1000)); // Wait 1s

    for (let i = 0; i < 10; i++) {
      // Try listing all pending orders for the pair
      let qRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/orders-pending?instId=${selectedPair}`);
      
      if (qRes.code !== '0') {
        report.diagnosis.push(`⚠️  Pending orders list failed (${qRes.code}), trying history...`);
        // Try order history
        qRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
          `/api/v5/trade/orders-history?instId=${selectedPair}`);
        if (qRes.code !== '0') {
          report.diagnosis.push(`ERROR: Both order query endpoints failed - ${qRes.code}`);
          break;
        }
      }

      // Find our order in the list
      let order = null;
      if (qRes.data && Array.isArray(qRes.data)) {
        order = qRes.data.find(o => o.ordId === ordId);
      }
      
      if (!order && qRes.data?.[0]) {
        order = qRes.data[0]; // Fallback to first if not found
      }

      if (order) {
        report.order_query = {
          ordId: order?.ordId,
          state: order?.state,
          avgPx: order?.avgPx,
          accFillSz: order?.accFillSz,
          fillSz: order?.fillSz,
          fillTime: order?.fillTime,
          fee: order?.fee,
          feeCcy: order?.feeCcy,
          raw_response: order
        };

        // State: 0 = live, 1 = partially filled, 2 = fully filled, -1 = cancelled
        if (order?.state === '2' || (parseFloat(order?.accFillSz || 0) > 0)) {
          report.diagnosis.push(`✓ ORDER FILLED: accFillSz=${order?.accFillSz}, fee=${order?.fee} ${order?.feeCcy}`);
          report.passed = true;
          break;
        } else if (order?.state === '1') {
          report.diagnosis.push(`⚠️  Partially filled: ${order?.accFillSz} / ${qty}`);
        } else if (order?.state === '0') {
          report.diagnosis.push(`⏳ Live but not filled yet (attempt ${i + 1}/10)...`);
          await new Promise(r => setTimeout(r, 500));
        } else if (order?.state === '-1') {
          report.diagnosis.push(`❌ Order was cancelled`);
          break;
        } else {
          report.diagnosis.push(`❓ Unknown state: ${order?.state}`);
          break;
        }
      } else {
        report.diagnosis.push(`⏳ Order not yet in pending list (attempt ${i + 1}/10)...`);
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (!report.passed) {
      if (report.order_query?.state === '0') {
        report.diagnosis.push('❌ Order timed out - never filled (5 seconds elapsed)');
        report.diagnosis.push('→ Possible reasons:');
        report.diagnosis.push('  1. Market depth insufficient for market order');
        report.diagnosis.push('  2. Simulated trading mode enabled');
        report.diagnosis.push('  3. Account permissions missing');
        report.diagnosis.push('  4. API key restrictions (IP, trading pair, etc.)');
      } else if (!report.order_query) {
        report.diagnosis.push('❌ Order query failed - could not verify fill status');
        report.diagnosis.push('→ This may be a read API permission issue or endpoint path problem');
      }
    }

    return Response.json(report, { status: report.passed ? 200 : 400 });

  } catch (error) {
    console.error('ERROR:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});