/**
 * Liquidate All Crypto to USDT
 * Sells all non-USDT holdings at market price on OKX
 * Full audit trail: before balance → sells → after balance → OXXOrderLedger
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

async function fetchOkxBalance(apiKey, secret, passphrase) {
  const res = await okxRequest(apiKey, secret, passphrase, 'GET', '/api/v5/account/balance');
  if (res.code !== '0') throw new Error(`Balance fetch failed: ${res.msg}`);
  const details = res.data?.[0]?.details || [];
  const balances = {};
  let totalEquity = 0;
  for (const d of details) {
    const bal = parseFloat(d.availBal || 0);
    if (bal > 0) {
      balances[d.ccy] = bal;
      if (d.ccy === 'USDT') totalEquity += bal;
    }
  }
  return { balances, totalEquity, raw: res.data?.[0] };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user && user.email !== SUZANA_EMAIL && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[LIQUIDATE] === Starting full liquidation ===');

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

    // 1. BEFORE balance
    console.log('[LIQUIDATE] Fetching BEFORE balance...');
    const { balances: beforeBalances, totalEquity: beforeEquity } = await fetchOkxBalance(apiKey, apiSecret, passphrase);
    console.log('[LIQUIDATE] BEFORE:', beforeBalances);

    const sells = [];
    const failedSells = [];

    // 2. SELLS
    for (const [asset, qty] of Object.entries(beforeBalances)) {
      if (asset === 'USDT' || qty <= 0) continue;

      const pair = `${asset}-USDT`;
      console.log(`[LIQUIDATE] Selling ${asset}: ${qty} → ${pair}`);

      const sellBody = JSON.stringify({
        instId: pair,
        tdMode: 'cash',
        side: 'sell',
        ordType: 'market',
        sz: qty.toString()
      });

      try {
        const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);
        
        if (sellRes.code !== '0') {
          console.error(`[LIQUIDATE] ${pair} FAILED: code=${sellRes.code}, msg=${sellRes.msg}`);
          failedSells.push({
            instId: pair,
            qty,
            code: sellRes.code,
            message: sellRes.msg,
            raw: sellRes
          });
          continue;
        }

        const ordId = sellRes.data?.[0]?.ordId;
        await new Promise(r => setTimeout(r, 800));

        // Verify order fill
        const verify = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${pair}&ordId=${ordId}`);
        const fill = verify.data?.[0];

        if (fill && fill.state === 'filled') {
          const sellRecord = {
            asset,
            pair,
            qty,
            ordId,
            avgPx: parseFloat(fill.avgPx || 0),
            accFillSz: parseFloat(fill.accFillSz || 0),
            fillNotionalUSDT: parseFloat(fill.notionalUsd || 0),
            fee: parseFloat(fill.fee || 0),
            feeCcy: fill.feeCcy || 'USDT',
            timestamp: new Date(fill.uTime).toISOString()
          };
          sells.push(sellRecord);
          console.log(`[LIQUIDATE] ✓ ${pair}: ${qty} @ ${fill.avgPx} = ${fill.notionalUsd} USDT, fee=${fill.fee}`);
        } else {
          failedSells.push({
            instId: pair,
            qty,
            code: 'NOT_FILLED',
            message: `Order state: ${fill?.state || 'unknown'}`,
            raw: fill
          });
        }
      } catch (e) {
        console.error(`[LIQUIDATE] Exception on ${pair}:`, e.message);
        failedSells.push({
          instId: pair,
          qty,
          code: 'EXCEPTION',
          message: e.message,
          raw: null
        });
      }
    }

    // 3. Save SELL orders to OXXOrderLedger
    let ledgerCount = 0;
    for (const sell of sells) {
      try {
        await base44.asServiceRole.entities.OXXOrderLedger.create({
          ordId: sell.ordId,
          instId: sell.pair,
          side: 'sell',
          avgPx: sell.avgPx,
          accFillSz: sell.accFillSz,
          quoteUSDT: sell.fillNotionalUSDT,
          fee: sell.fee,
          feeCcy: sell.feeCcy,
          timestamp: sell.timestamp,
          robotId: 'manual_liquidation',
          verified: true,
          state: 'filled'
        });
        ledgerCount++;
        console.log(`[LIQUIDATE] Saved to ledger: ${sell.pair} ordId=${sell.ordId}`);
      } catch (e) {
        console.error(`[LIQUIDATE] Failed to save ledger for ${sell.pair}:`, e.message);
      }
    }

    // 4. AFTER balance
    await new Promise(r => setTimeout(r, 1000));
    console.log('[LIQUIDATE] Fetching AFTER balance...');
    const { balances: afterBalances, totalEquity: afterEquity } = await fetchOkxBalance(apiKey, apiSecret, passphrase);
    console.log('[LIQUIDATE] AFTER:', afterBalances);

    return Response.json({
      status: 'completed',
      before: {
        balances: beforeBalances,
        totalEquityUSDT: beforeEquity
      },
      sells: sells.map(s => ({
        asset: s.asset,
        instId: s.pair,
        qty: s.qty,
        ordId: s.ordId,
        avgPx: s.avgPx,
        filledUSDT: s.fillNotionalUSDT,
        fee: s.fee,
        feeCcy: s.feeCcy
      })),
      failed: failedSells,
      after: {
        balances: afterBalances,
        totalEquityUSDT: afterEquity
      },
      ledgerSaved: ledgerCount,
      summary: {
        successfulSells: sells.length,
        failedSells: failedSells.length,
        ledgerRecords: ledgerCount
      }
    });

  } catch (err) {
    console.error(`[LIQUIDATE] Exception: ${err.message}`);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});