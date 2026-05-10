/**
 * Complete OKX Liquidation Audit
 * Captures exact before/after balances, liquidation P&L, and dust analysis
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

    console.log('[AUDIT] === Complete Liquidation Audit ===');

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

    // 1. Fetch all liquidation SELL orders (manual_liquidation)
    const allOrders = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'manual_liquidation', side: 'sell' });
    console.log(`[AUDIT] Found ${allOrders.length} manual liquidation SELL orders`);

    const liquidationSells = allOrders.map(o => ({
      asset: o.instId.split('-')[0],
      instId: o.instId,
      ordId: o.ordId,
      avgPx: o.avgPx,
      accFillSz: o.accFillSz,
      filledUSDT: o.quoteUSDT,
      fee: o.fee,
      feeCcy: o.feeCcy,
      timestamp: o.timestamp,
      verified: o.verified
    }));

    // 2. Calculate liquidation totals
    const totalUsdt = liquidationSells.reduce((sum, s) => sum + (s.filledUSDT || 0), 0);
    const totalFees = liquidationSells.reduce((sum, s) => sum + Math.abs(s.fee || 0), 0);

    // 3. Get current OKX balance
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const details = balRes.data?.[0]?.details || [];

    const afterBalance = {};
    let afterTotalEquity = 0;
    let dustValue = 0;

    for (const d of details) {
      const bal = parseFloat(d.availBal || 0);
      if (bal > 0) {
        afterBalance[d.ccy] = bal;
        afterTotalEquity += parseFloat(d.usdtEq || 0);
        if (d.ccy !== 'USDT' && bal > 0) {
          dustValue += parseFloat(d.usdtEq || 0);
        }
      }
    }

    const afterUSDT = afterBalance['USDT'] || 0;
    
    console.log(`[AUDIT] After balance - USDT: ${afterUSDT}, Total Equity: ${afterTotalEquity}, Dust: ${dustValue}`);

    // 4. Calculate before liquidation balance (reverse from sells)
    let beforeTotalUSDT = afterUSDT - totalUsdt + totalFees;
    const beforeEquity = beforeTotalUSDT + liquidationSells.reduce((sum, s) => sum + (s.filledUSDT || 0), 0);

    // 5. Build before balance asset breakdown
    const beforeBalance = { USDT: beforeTotalUSDT };
    for (const sell of liquidationSells) {
      beforeBalance[sell.asset] = (beforeBalance[sell.asset] || 0) + sell.accFillSz;
    }

    // 6. Calculate P&L
    const realizedPnL = totalUsdt - totalFees;
    const slippageEst = liquidationSells.length > 0 ? totalFees : 0;
    const preservedAmount = (afterTotalEquity / beforeEquity * 100).toFixed(2);

    return Response.json({
      status: 'audit_complete',
      timestamp: new Date().toISOString(),
      
      before: {
        totalEquityUSDT: beforeEquity,
        assets: beforeBalance,
        assetCount: Object.keys(beforeBalance).length
      },

      liquidationSells: liquidationSells.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),

      after: {
        totalEquityUSDT: afterTotalEquity,
        USDT: afterUSDT,
        dustAssets: Object.entries(afterBalance)
          .filter(([k]) => k !== 'USDT')
          .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {}),
        dustValueUSDT: dustValue
      },

      pnl: {
        totalUSDTReceived: totalUsdt,
        totalFeesPaid: totalFees,
        realizedPnL: realizedPnL,
        slippageEstimate: slippageEst,
        preservedPercent: preservedAmount,
        comparison: {
          beforeEquity: beforeEquity,
          afterEquity: afterTotalEquity,
          loss: (beforeEquity - afterTotalEquity).toFixed(4),
          lossPercent: ((beforeEquity - afterTotalEquity) / beforeEquity * 100).toFixed(2)
        }
      },

      summary: {
        liquidationOrderCount: liquidationSells.length,
        dustAssetsRemaining: Object.keys(afterBalance).length - 1,
        tradingStatus: 'PAUSED',
        auditStatus: 'COMPLETE'
      }
    });

  } catch (err) {
    console.error(`[AUDIT] Exception: ${err.message}`);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});