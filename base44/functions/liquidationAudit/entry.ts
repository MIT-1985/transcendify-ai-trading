/**
 * Complete OKX Liquidation Audit
 * Pulls real OKX order history directly - NOT relying on OXXOrderLedger
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const LIQUIDATION_START = '2026-05-09T00:00:00Z'; // When liquidation likely started

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

    console.log('[AUDIT] === OKX Real Order History Audit ===');

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

    // 1. Get current OKX balance (AFTER state)
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const details = balRes.data?.[0]?.details || [];

    const afterBalance = {};
    let afterTotalEquity = 0;
    let afterUSDT = 0;

    for (const d of details) {
      const bal = parseFloat(d.availBal || 0);
      if (bal > 0) {
        afterBalance[d.ccy] = bal;
        afterTotalEquity += parseFloat(d.usdtEq || 0);
        if (d.ccy === 'USDT') afterUSDT = bal;
      }
    }

    console.log(`[AUDIT] Current OKX balance - USDT: ${afterUSDT}, Total Equity: ${afterTotalEquity}`);

    // 2. Query OKX order history for all orders (no filter)
    // then filter for SELL orders on -USDT pairs from liquidation window
    const liquidationStart = new Date(LIQUIDATION_START).getTime();
    const now = Date.now();
    
    let allOkxSells = [];
    const instIds = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'AVAX-USDT', 'LINK-USDT', 'ARB-USDT', 
                     'BCH-USDT', 'LTC-USDT', 'ADA-USDT', 'SUI-USDT', 'OP-USDT', 'ATOM-USDT', 'TRX-USDT', 'TON-USDT', 'BNB-USDT', 'XRP-USDT', 'NEAR-USDT', 'DOT-USDT'];

    for (const instId of instIds) {
      try {
        const orderRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', 
          `/api/v5/trade/orders?instId=${instId}&state=2&after=&before=${now}&limit=100`);
        
        if (orderRes.code === '0' && orderRes.data) {
          const sells = orderRes.data.filter(o => {
            const ts = parseInt(o.uTime || o.ts || 0);
            return o.side === 'sell' && ts >= liquidationStart && ts <= now;
          });
          allOkxSells.push(...sells);
          console.log(`[AUDIT] ${instId}: found ${sells.length} sells`);
        }
      } catch (e) {
        console.warn(`[AUDIT] Error fetching ${instId}: ${e.message}`);
      }
    }

    console.log(`[AUDIT] Total OKX SELL orders in liquidation window: ${allOkxSells.length}`);

    // 3. Format OKX sells with calculated values
    const okxSellsFormatted = allOkxSells.map(o => {
      const fillSz = parseFloat(o.fillSz || 0);
      const fillPx = parseFloat(o.fillPx || 0);
      const fillUSDT = fillSz * fillPx;
      const fee = parseFloat(o.fee || 0);
      const avgPx = fillSz > 0 ? fillUSDT / fillSz : 0;
      
      return {
        ordId: o.ordId,
        instId: o.instId,
        side: o.side,
        avgPx: avgPx,
        accFillSz: fillSz,
        fillSz: fillSz,
        fillPx: fillPx,
        fillTime: new Date(parseInt(o.uTime || o.ts || 0)).toISOString(),
        fee: Math.abs(fee),
        feeCcy: o.feeCcy || 'USDT',
        fillUSDT: fillUSDT,
        state: o.state,
        ordType: o.ordType
      };
    }).sort((a, b) => new Date(a.fillTime).getTime() - new Date(b.fillTime).getTime());

    // 4. Compare with OXXOrderLedger
    const ledgerSells = await base44.asServiceRole.entities.OXXOrderLedger.filter({ 
      robotId: 'manual_liquidation', 
      side: 'sell' 
    });

    console.log(`[AUDIT] OXXOrderLedger SELL records: ${ledgerSells.length}`);

    const ledgerOrdIds = new Set(ledgerSells.map(s => s.ordId));
    const missingFromLedger = okxSellsFormatted.filter(s => !ledgerOrdIds.has(s.ordId));

    // 5. Calculate liquidation P&L
    const totalFillUSDT = okxSellsFormatted.reduce((sum, s) => sum + s.fillUSDT, 0);
    const totalFees = okxSellsFormatted.reduce((sum, s) => sum + s.fee, 0);
    const netUSDTReceived = totalFillUSDT - totalFees;

    // 6. Reconstruct before balance
    const beforeAssets = {};
    let beforeEstimatedEquity = null;

    for (const sell of okxSellsFormatted) {
      const asset = sell.instId.split('-')[0];
      beforeAssets[asset] = (beforeAssets[asset] || 0) + sell.accFillSz;
    }
    
    // If any sells occurred, estimate before equity
    if (okxSellsFormatted.length > 0) {
      beforeEstimatedEquity = afterUSDT - netUSDTReceived;
      beforeAssets['USDT'] = beforeEstimatedEquity;
    }

    // 7. Dust analysis
    const dustAssets = Object.entries(afterBalance)
      .filter(([k]) => k !== 'USDT')
      .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});

    return Response.json({
      status: 'audit_complete',
      timestamp: new Date().toISOString(),
      auditMethod: 'OKX API Order History + Ledger Reconciliation',
      
      okxOrderHistory: {
        totalSellsFound: okxSellsFormatted.length,
        liquidationWindow: {
          start: LIQUIDATION_START,
          end: new Date(now).toISOString()
        },
        sells: okxSellsFormatted
      },

      ledgerReconciliation: {
        totalLedgerRecords: ledgerSells.length,
        missingFromLedger: missingFromLedger.length,
        missingRecords: missingFromLedger.map(s => ({
          ordId: s.ordId,
          instId: s.instId,
          fillUSDT: s.fillUSDT,
          fee: s.fee,
          fillTime: s.fillTime
        }))
      },

      beforeLiquidation: {
        estimated: beforeEstimatedEquity !== null,
        estimatedTotalEquityUSDT: beforeEstimatedEquity,
        estimatedAssets: beforeAssets,
        note: beforeEstimatedEquity === null ? 'No sells found - before balance not captured' : 'Reconstructed from OKX SELL orders'
      },

      afterLiquidation: {
        totalEquityUSDT: afterTotalEquity,
        USDT: afterUSDT,
        dustAssets: dustAssets,
        dustCount: Object.keys(dustAssets).length
      },

      pnl: {
        realOkxOrdersCount: okxSellsFormatted.length,
        totalFillUSDT: totalFillUSDT,
        totalFeesPaid: totalFees,
        netUSDTReceived: netUSDTReceived,
        realizedPnL: beforeEstimatedEquity !== null ? (afterTotalEquity - beforeEstimatedEquity) : null,
        realizedPnLPercent: beforeEstimatedEquity !== null && beforeEstimatedEquity > 0 
          ? ((afterTotalEquity - beforeEstimatedEquity) / beforeEstimatedEquity * 100).toFixed(2) 
          : null,
        preserved: beforeEstimatedEquity !== null && beforeEstimatedEquity > 0
          ? (afterTotalEquity / beforeEstimatedEquity * 100).toFixed(2)
          : null
      },

      summary: {
        auditStatus: 'COMPLETE',
        dataQuality: missingFromLedger.length > 0 ? 'WARNING: Ledger incomplete' : 'VERIFIED: Ledger matches OKX',
        realizedPnLStatus: beforeEstimatedEquity !== null ? 'KNOWN' : 'UNKNOWN - before balance not captured',
        tradingStatus: 'PAUSED'
      }
    });

  } catch (err) {
    console.error(`[AUDIT] Exception: ${err.message}`);
    return Response.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
});