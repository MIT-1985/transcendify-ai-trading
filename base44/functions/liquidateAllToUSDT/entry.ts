/**
 * Liquidate All Crypto to USDT
 * Sells all non-USDT holdings at market price on OKX
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';

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

    console.log('[LIQUIDATE] === Starting liquidation to USDT ===');

    // Fetch OKX connection
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

    // Get current balance
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const details = balRes.data?.[0]?.details || [];

    const liquidations = [];
    const errors = [];

    for (const detail of details) {
      const asset = detail.ccy;
      if (asset === 'USDT') continue; // Skip USDT

      const availableBal = parseFloat(detail.availBal || 0);
      if (availableBal <= 0) continue; // Skip zero balances

      // Determine trading pair
      const pair = `${asset}-USDT`;
      console.log(`[LIQUIDATE] Selling ${asset}: ${availableBal} → ${pair}`);

      // Market sell
      const sellBody = JSON.stringify({
        instId: pair,
        tdMode: 'cash',
        side: 'sell',
        ordType: 'market',
        sz: availableBal.toString()
      });

      try {
        const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);
        if (sellRes.code !== '0') {
          console.error(`[LIQUIDATE] ${pair} FAILED: ${sellRes.msg}`);
          errors.push({ pair, reason: sellRes.msg });
          continue;
        }

        const ordId = sellRes.data?.[0]?.ordId;
        await new Promise(r => setTimeout(r, 600));

        const verify = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${pair}&ordId=${ordId}`);
        const fill = verify.data?.[0];

        if (fill && fill.state === 'filled') {
          liquidations.push({
            asset,
            pair,
            qty: availableBal,
            ordId,
            avgPx: parseFloat(fill.avgPx || 0),
            usdt: parseFloat(fill.avgPx || 0) * availableBal,
            fee: parseFloat(fill.fee || 0),
            timestamp: new Date().toISOString()
          });
          console.log(`[LIQUIDATE] ✓ ${pair} sold: ${availableBal} @ ${fill.avgPx} USDT`);
        } else {
          errors.push({ pair, reason: `Not filled: state=${fill?.state}` });
        }
      } catch (e) {
        errors.push({ pair, reason: e.message });
      }
    }

    // Final balance
    const finalBal = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const finalDetails = finalBal.data?.[0]?.details || [];
    const finalUSDT = parseFloat(finalDetails.find(d => d.ccy === 'USDT')?.availBal || 0);

    return Response.json({
      status: 'completed',
      liquidated: liquidations.length,
      errors: errors.length,
      liquidations,
      errors,
      finalUSDTBalance: finalUSDT
    });

  } catch (err) {
    console.error(`[LIQUIDATE] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});