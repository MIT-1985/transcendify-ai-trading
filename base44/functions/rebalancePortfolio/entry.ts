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
      console.log(`[REBALANCE] Balance fetch from ${endpoint} failed: ${e.message}`);
    }
  }
  return ccy ? null : [];
}

async function calculateEquity(balances, tickerMap) {
  let totalUSD = 0;
  for (const balance of balances) {
    const ccy = balance.ccy;
    const qty = parseFloat(balance.availBal || 0);
    const price = tickerMap[ccy] || 0;
    totalUSD += qty * price;
  }
  return totalUSD;
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

    // Always use Suzana's connection for now
    const targetEmail = suzanaEmail;

    // Get OKX connection
    const [byCreator, byEmail] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: targetEmail, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: targetEmail, exchange: 'okx' })
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

    // ─── STEP 1: Fetch initial balances ────────────────────────────────────
    console.log(`[${mode}] Fetching live balances...`);
    const initialBalances = await fetchLiveBalance(apiKey, apiSecret, passphrase);
    
    if (initialBalances.length === 0) {
      return Response.json({ error: 'Could not fetch OKX balances' }, { status: 500 });
    }

    // ─── STEP 2: Fetch live ticker data ────────────────────────────────────
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
      console.log(`[${mode}] Ticker fetch failed: ${e.message}`);
    }

    // ─── STEP 3: Calculate initial equity ──────────────────────────────────
    const initialEquity = await calculateEquity(initialBalances, tickerMap);
    const initialUSDT = parseFloat(initialBalances.find(b => b.ccy === 'USDT')?.availBal || 0);
    console.log(`[${mode}] Initial state: Equity=$${initialEquity.toFixed(2)}, USDT=$${initialUSDT.toFixed(2)}`);

    // ─── STEP 4: Identify assets to sell ───────────────────────────────────
    const PROTECTED_ASSETS = new Set(['ETH', 'SOL', 'USDT']);
    const OKX_MIN_NOTIONAL = 5; // $5 minimum
    const SELL_RATIO = 0.95; // Sell 95% to avoid "insufficient balance"

    const toSell = [];
    for (const asset of initialBalances) {
      const ccy = asset.ccy;
      const availBal = parseFloat(asset.availBal || 0);

      if (PROTECTED_ASSETS.has(ccy) || availBal < 0.00001) continue;

      const price = tickerMap[ccy] || 0;
      const value = availBal * price;

      if (value >= OKX_MIN_NOTIONAL) {
        const sellQty = (availBal * SELL_RATIO).toFixed(6);
        toSell.push({ ccy, availBal, sellQty, price, value });
        console.log(`[${mode}] ${ccy}: avail=${availBal.toFixed(6)} sell=${sellQty} value=$${value.toFixed(2)}`);
      } else {
        console.log(`[${mode}] SKIP ${ccy}: value=$${value.toFixed(2)} < min=$${OKX_MIN_NOTIONAL}`);
      }
    }

    // ─── STEP 5: Preview mode ─────────────────────────────────────────────
    if (dryRun) {
      return Response.json({
        success: true,
        mode: 'PREVIEW',
        assetsToSell: toSell.map(item => ({
          asset: item.ccy,
          availableBalance: item.availBal,
          quantityToSell: parseFloat(item.sellQty),
          estimatedUSDT: item.value
        })),
        totalEstimatedUSDT: toSell.reduce((sum, item) => sum + item.value, 0),
        protectedAssets: Array.from(PROTECTED_ASSETS),
        timestamp: new Date().toISOString()
      });
    }

    // ─── STEP 6: Execute trades one by one ────────────────────────────────
    const results = [];
    const tradeDetails = {}; // Track before/after for key assets
    let totalExecutedUSDT = 0;

    for (const item of toSell) {
      try {
        const instId = `${item.ccy}-USDT`;
        const sellQty = item.sellQty;
        
        console.log(`[REBALANCE_EXECUTE] Starting ${item.ccy} sell qty=${sellQty}`);

        // Place market sell order
        const bodyStr = JSON.stringify({
          instId,
          tdMode: 'cash',
          side: 'sell',
          ordType: 'market',
          sz: sellQty
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

        if (!orderRes || orderRes.code !== '0') {
          console.error(`[REBALANCE_EXECUTE] ${item.ccy} FAILED: ${orderRes?.msg || 'Unknown error'}`);
          // STOP immediately on failure
          results.push({
            asset: item.ccy,
            status: 'FAILED',
            error: orderRes?.msg || 'Order placement failed'
          });
          break; // Stop processing further assets
        }

        const ordId = orderRes.data?.[0]?.ordId;
        console.log(`[REBALANCE_EXECUTE] ${item.ccy} order placed ordId=${ordId}`);

        // Wait 1 second for order to settle
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Refresh balance for this asset
        const afterBalance = await fetchLiveBalance(apiKey, apiSecret, passphrase, item.ccy);
        const qtyAfter = parseFloat(afterBalance?.availBal || 0);
        const qtySold = item.availBal - qtyAfter;
        const receivedUSDT = qtySold * item.price;

        console.log(`[REBALANCE_EXECUTE] ${item.ccy} settled: sold=${qtySold.toFixed(6)}, after=${qtyAfter.toFixed(6)}`);

        // Track key assets
        if (['DOT', 'BTC', 'XRP'].includes(item.ccy)) {
          tradeDetails[item.ccy] = {
            qtyBefore: item.availBal,
            qtySold: qtySold,
            avgPrice: item.price,
            receivedUSDT: receivedUSDT,
            ordId: ordId,
            qtyAfter: qtyAfter
          };
        }

        results.push({
          asset: item.ccy,
          orderId: ordId,
          qtyBefore: item.availBal,
          qtySold: qtySold,
          avgPrice: item.price,
          receivedUSDT: receivedUSDT,
          qtyAfter: qtyAfter,
          status: 'SUCCESS'
        });

        totalExecutedUSDT += receivedUSDT;
      } catch (err) {
        console.error(`[REBALANCE_EXECUTE] Exception selling ${item.ccy}:`, err.message);
        results.push({
          asset: item.ccy,
          status: 'ERROR',
          error: err.message
        });
        break; // Stop on error
      }
    }

    // ─── STEP 7: Fetch final balances ────────────────────────────────────
    console.log(`[REBALANCE_EXECUTE] Fetching final balances...`);
    const finalBalances = await fetchLiveBalance(apiKey, apiSecret, passphrase);
    const finalEquity = await calculateEquity(finalBalances, tickerMap);
    const finalUSDT = parseFloat(finalBalances.find(b => b.ccy === 'USDT')?.availBal || 0);

    console.log(`[REBALANCE_EXECUTE] Final state: Equity=$${finalEquity.toFixed(2)}, USDT=$${finalUSDT.toFixed(2)}`);

    const equityDelta = finalEquity - initialEquity;

    // ─── STEP 8: Return full report ────────────────────────────────────────
    return Response.json({
      success: true,
      mode: 'EXECUTE',
      summary: {
        totalEquityBefore: initialEquity,
        totalEquityAfter: finalEquity,
        freeUSDTBefore: initialUSDT,
        freeUSDTAfter: finalUSDT,
        equityDelta: equityDelta,
        equityDeltaPct: ((equityDelta / initialEquity) * 100).toFixed(4) + '%'
      },
      executedCount: results.filter(r => r.status === 'SUCCESS').length,
      totalExecutedUSDT: totalExecutedUSDT,
      tradeDetails: tradeDetails, // DOT, BTC, XRP before/after
      results: results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[REBALANCE] Fatal error:`, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});