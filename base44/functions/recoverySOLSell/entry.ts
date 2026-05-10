import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = {
      timestamp: new Date().toISOString(),
      phase: 'init',
      before_balance: null,
      after_balance: null,
      sell_order: null,
      recovery_status: 'PENDING',
      errors: []
    };

    // ========== STEP 1: GET OKX CREDENTIALS ==========
    report.phase = 'fetching_credentials';
    const connection = await base44.asServiceRole.entities.ExchangeConnection.filter(
      { exchange: 'okx' },
      '-updated_date',
      1
    );

    if (!connection || connection.length === 0) {
      report.errors.push('No OKX connection found');
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    const conn = connection[0];
    let apiKey, apiSecret, passphrase;
    
    try {
      apiKey = await decrypt(conn.api_key_encrypted);
      apiSecret = await decrypt(conn.api_secret_encrypted);
      passphrase = await decrypt(conn.encryption_iv);
    } catch (e) {
      report.errors.push(`Failed to decrypt credentials: ${e.message}`);
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    // ========== STEP 2: FETCH BALANCE ==========
    report.phase = 'fetching_balance';
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    
    if (balRes.code !== '0') {
      report.errors.push(`Balance query failed: ${balRes.msg}`);
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    const details = balRes.data?.[0]?.details || [];
    let usdtAvailable = 0, solAvailable = 0, solFrozen = 0, solTotal = 0;
    
    for (const d of details) {
      if (d.ccy === 'USDT') {
        usdtAvailable = parseFloat(d.availBal || 0);
      } else if (d.ccy === 'SOL') {
        solAvailable = parseFloat(d.availBal || 0);
        solFrozen = parseFloat(d.frozenBal || 0);
        solTotal = parseFloat((solAvailable + solFrozen).toFixed(8));
      }
    }

    const totalEquity = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const totalEquityUSDT = parseFloat(totalEquity.data?.[0]?.totalEq || 0);

    report.before_balance = {
      usdt_available: parseFloat(usdtAvailable.toFixed(2)),
      sol_available: parseFloat(solAvailable.toFixed(8)),
      sol_frozen: parseFloat(solFrozen.toFixed(8)),
      sol_total: parseFloat(solTotal.toFixed(8)),
      total_equity_usdt: parseFloat(totalEquityUSDT.toFixed(2))
    };

    console.log(`[RECOVERY] BALANCE: USDT=${usdtAvailable.toFixed(2)}, SOL_avail=${solAvailable.toFixed(8)}, SOL_frozen=${solFrozen.toFixed(8)}, SOL_total=${solTotal.toFixed(8)}, Equity=${totalEquityUSDT.toFixed(2)}`);

    // ========== STEP 3: CHECK IF SOL AVAILABLE > MINIMUM ==========
    const SOL_MIN = 0.0001;
    if (solAvailable <= SOL_MIN) {
      report.recovery_status = 'NO_RECOVERY_NEEDED';
      report.after_balance = report.before_balance;
      return Response.json(report, { status: 200 });
    }

    report.phase = 'placing_sell_order';

    // ========== STEP 4: PLACE MARKET SELL ==========
    const sellQty = parseFloat(solAvailable.toFixed(8));
    const sellBody = JSON.stringify({
      instId: 'SOL-USDT',
      side: 'sell',
      ordType: 'market',
      tdMode: 'cash',
      sz: sellQty.toString()  // Base asset quantity, NOT USDT
    });

    console.log(`[RECOVERY] SELL REQUEST: sz=${sellQty} (string), body=${sellBody}`);

    const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);

    if (sellRes.code !== '0') {
      const errMsg = sellRes.data?.[0]?.sMsg || sellRes.msg;
      report.errors.push(`SELL REJECTED: ${errMsg}`);
      report.sell_order = { attempted: true, error: errMsg };
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    const sellOrdId = sellRes.data?.[0]?.ordId;
    if (!sellOrdId) {
      report.errors.push('No order ID returned from SELL');
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    report.sell_order = { ordId: sellOrdId, requested_qty: sellQty, state: 'pending' };
    console.log(`[RECOVERY] SELL placed: ordId=${sellOrdId}`);

    // ========== STEP 5: VERIFY ORDER FILL ==========
    report.phase = 'verifying_fill';
    await new Promise(r => setTimeout(r, 1000));

    let sellFilled = null;
    for (let i = 0; i < 30; i++) {
      const queryRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/orders-history?instId=SOL-USDT&instType=SPOT&ordId=${sellOrdId}`);
      
      if (queryRes.code === '0' && queryRes.data && queryRes.data.length > 0) {
        sellFilled = queryRes.data[0];
      }
      
      if (sellFilled && (sellFilled.state === '2' || parseFloat(sellFilled.accFillSz || 0) > 0)) {
        break;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }

    if (!sellFilled || !sellFilled.accFillSz || parseFloat(sellFilled.accFillSz) === 0) {
      report.errors.push('SELL order did not fill within 15 seconds');
      report.sell_order.state = 'timeout';
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    report.sell_order = {
      ordId: sellOrdId,
      state: 'filled',
      avgPx: parseFloat(sellFilled.avgPx),
      accFillSz: parseFloat(sellFilled.accFillSz),
      fee: parseFloat(sellFilled.fee || 0),
      feeCcy: sellFilled.feeCcy,
      fillTime: sellFilled.fillTime
    };

    console.log(`[RECOVERY] SELL VERIFIED: ordId=${sellOrdId}, qty=${sellFilled.accFillSz}, px=${sellFilled.avgPx}, fee=${sellFilled.fee} ${sellFilled.feeCcy}`);

    // ========== STEP 6: SAVE TO LEDGER ==========
    report.phase = 'saving_to_ledger';
    try {
      await base44.asServiceRole.entities.OXXOrderLedger.create({
        ordId: sellFilled.ordId,
        instId: 'SOL-USDT',
        side: 'sell',
        avgPx: parseFloat(sellFilled.avgPx),
        accFillSz: parseFloat(sellFilled.accFillSz),
        quoteUSDT: parseFloat(sellFilled.avgPx) * parseFloat(sellFilled.accFillSz),
        fee: parseFloat(sellFilled.fee),
        feeCcy: sellFilled.feeCcy,
        timestamp: new Date(parseInt(sellFilled.fillTime)).toISOString(),
        robotId: 'recovery_sell',
        verified: true,
        state: 'filled'
      });
      console.log(`[RECOVERY] Ledger record created`);
    } catch (e) {
      report.errors.push(`Ledger save failed: ${e.message}`);
      report.recovery_status = 'FAILED';
      return Response.json(report, { status: 400 });
    }

    // ========== STEP 7: FETCH AFTER BALANCE ==========
    report.phase = 'fetching_after_balance';
    const balRes2 = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const details2 = balRes2.data?.[0]?.details || [];
    let usdtAvailable2 = 0, solAvailable2 = 0, solFrozen2 = 0, solTotal2 = 0;
    
    for (const d of details2) {
      if (d.ccy === 'USDT') {
        usdtAvailable2 = parseFloat(d.availBal || 0);
      } else if (d.ccy === 'SOL') {
        solAvailable2 = parseFloat(d.availBal || 0);
        solFrozen2 = parseFloat(d.frozenBal || 0);
        solTotal2 = parseFloat((solAvailable2 + solFrozen2).toFixed(8));
      }
    }

    const totalEquity2 = balRes2.data?.[0]?.totalEq || 0;

    report.after_balance = {
      usdt_available: parseFloat(usdtAvailable2.toFixed(2)),
      sol_available: parseFloat(solAvailable2.toFixed(8)),
      sol_frozen: parseFloat(solFrozen2.toFixed(8)),
      sol_total: parseFloat(solTotal2.toFixed(8)),
      total_equity_usdt: parseFloat(totalEquity2)
    };

    report.recovery_status = 'SUCCESS';
    report.phase = 'complete';

    console.log(`[RECOVERY] SUCCESS: USDT ${usdtAvailable.toFixed(2)} → ${usdtAvailable2.toFixed(2)}, SOL ${solTotal.toFixed(8)} → ${solTotal2.toFixed(8)}`);

    return Response.json(report, { status: 200 });

  } catch (error) {
    console.error('[RECOVERY] Exception:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});