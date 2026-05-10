import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';

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
  const key = await deriveKey(Deno.env.get('BASE44_APP_ID') || 'okx-master-secret');
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

async function okxRequest(apiKey, secret, passphrase, method, path) {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path;
  const signature = await sign(secret, message);
  
  const res = await fetch('https://www.okx.com' + path, {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized', status: 401 }, { status: 401 });
    }

    console.log('[okxLiveBalance] Fetching real OKX balance for:', user.email);

    // Get OKX connection
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

    if (conns.length === 0) {
      return Response.json({
        success: false,
        totalEquityUSDT: 'UNKNOWN',
        freeUSDT: 'UNKNOWN',
        assets: [],
        fetchedAt: new Date().toISOString(),
        error: 'NO_OKX_CONNECTION',
        message: 'No OKX connection found'
      }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decrypt(conn.api_key_encrypted);
    const apiSecret = await decrypt(conn.api_secret_encrypted);
    const passphrase = await decrypt(conn.encryption_iv);

    // Fetch trading account balance
    const tradingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    console.log('[okxLiveBalance] Trading balance response code:', tradingRes.code, 'msg:', tradingRes.msg);

    if (tradingRes.code !== '0') {
      return Response.json({
        success: false,
        totalEquityUSDT: 'UNKNOWN',
        freeUSDT: 'UNKNOWN',
        assets: [],
        fetchedAt: new Date().toISOString(),
        error: tradingRes.code || 'OKX_ERROR',
        message: tradingRes.msg || 'OKX API error',
        httpStatus: 403,
        endpoint: '/api/v5/account/balance'
      }, { status: 403 });
    }

    // Parse balance data
    const balanceMap = {};
    if (tradingRes.data?.[0]?.details) {
      for (const d of tradingRes.data[0].details) {
        const total = parseFloat(d.eq || 0);
        if (total > 0.000001) {
          const free = parseFloat(d.availEq || 0);
          balanceMap[d.ccy] = { free, locked: Math.max(0, total - free) };
        }
      }
    }

    // Fetch funding account balance
    let fundingData = [];
    try {
      const fundingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/asset/balances');
      if (fundingRes.code === '0' && fundingRes.data) {
        fundingData = fundingRes.data;
      }
    } catch (e) {
      console.warn('[okxLiveBalance] Funding balance fetch failed:', e.message);
    }

    // Merge funding balances
    for (const d of fundingData) {
      const total = parseFloat(d.bal || 0);
      if (total > 0.000001) {
        const free = parseFloat(d.availBal || 0);
        const existing = balanceMap[d.ccy] || { free: 0, locked: 0 };
        balanceMap[d.ccy] = {
          free: existing.free + free,
          locked: existing.locked + (total - free)
        };
      }
    }

    // Get prices for non-stablecoin assets
    const priceMap = {};
    const stablecoins = new Set(['USDT', 'USDC', 'BUSD', 'DAI']);
    
    for (const asset of Object.keys(balanceMap)) {
      if (!stablecoins.has(asset)) {
        try {
          const tickerRes = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${asset}-USDT`);
          const tickerData = await tickerRes.json();
          if (tickerData.code === '0' && tickerData.data?.[0]?.last) {
            priceMap[asset] = parseFloat(tickerData.data[0].last);
          }
        } catch (e) {
          console.warn(`[okxLiveBalance] Price fetch failed for ${asset}:`, e.message);
        }
      }
    }

    // Calculate total equity and build asset list
    let totalEquityUSDT = 0;
    let freeUSDT = 0;
    const assets = [];

    for (const [asset, balance] of Object.entries(balanceMap)) {
      const total = balance.free + balance.locked;
      let usdValue = 0;

      if (stablecoins.has(asset)) {
        usdValue = total;
      } else if (priceMap[asset]) {
        usdValue = total * priceMap[asset];
      }

      totalEquityUSDT += usdValue;
      if (asset === 'USDT') freeUSDT += balance.free;

      assets.push({
        asset,
        free: parseFloat(balance.free.toFixed(8)),
        locked: parseFloat(balance.locked.toFixed(8)),
        total: parseFloat(total.toFixed(8)),
        price: priceMap[asset] || null,
        usdValue: parseFloat(usdValue.toFixed(2))
      });
    }

    // Sort by USD value descending
    assets.sort((a, b) => b.usdValue - a.usdValue);

    // Get raw USDT balance object
    const usdtDetails = tradingRes.data?.[0]?.details?.find(d => d.ccy === 'USDT') || {};
    
    // Correct mapping per OKX API:
    // availBal = available balance (can be used freely)
    // frozenBal = frozen in account
    // ordFrozen = frozen in orders
    // cashBal = cash balance (total liquid)
    // eq = total equity including positions
    const availableUSDT = parseFloat(usdtDetails.availBal || 0);
    const frozenUSDT = (parseFloat(usdtDetails.ordFrozen || 0) + parseFloat(usdtDetails.frozenBal || 0));

    console.log('[okxLiveBalance] Success: totalEquity=' + totalEquityUSDT.toFixed(2) + ' availBal=' + availableUSDT.toFixed(2) + ' frozen=' + frozenUSDT.toFixed(2) + ' cashBal=' + (parseFloat(usdtDetails.cashBal || 0)).toFixed(2) + ' assets=' + assets.length);

    return Response.json({
      success: true,
      totalEquityUSDT: parseFloat(totalEquityUSDT.toFixed(2)),
      availableUSDT: parseFloat(availableUSDT.toFixed(2)),
      freeUSDT: parseFloat(availableUSDT.toFixed(2)),
      frozenUSDT: parseFloat(frozenUSDT.toFixed(2)),
      openOrdersCount: 0,
      nonFreeBal: parseFloat((parseFloat(usdtDetails.eq || 0) - availableUSDT).toFixed(2)),
      nonFreeExplanation: 'cashBal - availBal = capital in positions',
      raw_usdt_balance: {
        ccy: usdtDetails.ccy,
        eq: parseFloat(usdtDetails.eq || 0),
        cashBal: parseFloat(usdtDetails.cashBal || 0),
        availBal: parseFloat(usdtDetails.availBal || 0),
        availEq: parseFloat(usdtDetails.availEq || 0),
        frozenBal: parseFloat(usdtDetails.frozenBal || 0),
        ordFrozen: parseFloat(usdtDetails.ordFrozen || 0),
        disEq: parseFloat(usdtDetails.disEq || 0),
        uTime: usdtDetails.uTime
      },
      assets,
      assetCount: assets.length,
      fetchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[okxLiveBalance] Error:', error.message);
    return Response.json({
      success: false,
      totalEquityUSDT: 'UNKNOWN',
      freeUSDT: 'UNKNOWN',
      assets: [],
      fetchedAt: new Date().toISOString(),
      error: 'FETCH_ERROR',
      message: error.message
    }, { status: 500 });
  }
});