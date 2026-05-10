/**
 * Verify all OXXOrderLedger records against live OKX API
 * Only trades confirmed by OKX are marked as real
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

    console.log('[VERIFY] === Reconciling OXXOrderLedger against OKX API ===');

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

    // Get all OXXOrderLedger records
    const allLedgerRecords = await base44.asServiceRole.entities.OXXOrderLedger.list();
    console.log(`[VERIFY] Total ledger records: ${allLedgerRecords.length}`);

    // Verify each one against OKX
    const verificationResults = [];

    for (const record of allLedgerRecords) {
      try {
        const ordRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
          `/api/v5/trade/orders/${record.ordId}?instId=${record.instId}`);

        const found = ordRes.code === '0' && ordRes.data?.[0];
        const okxOrder = found ? ordRes.data[0] : null;

        const filledSize = okxOrder ? parseFloat(okxOrder.fillSz || 0) : 0;
        const filledPrice = okxOrder ? parseFloat(okxOrder.fillPx || 0) : 0;
        const filledUSDT = filledSize * filledPrice;

        const result = {
          claimedOrdId: record.ordId,
          instId: record.instId,
          side: record.side,
          foundInOKX: found,
          okxState: okxOrder?.state || 'NOT_FOUND',
          okxFilled: found,
          ledgerSaved: true,
          recordId: record.id,
          
          // From ledger
          ledgerAvgPx: record.avgPx,
          ledgerAccFillSz: record.accFillSz,
          ledgerQuoteUSDT: record.quoteUSDT,
          
          // From OKX (if found)
          okxFillPx: filledPrice,
          okxFillSz: filledSize,
          okxFillUSDT: filledUSDT,
          okxFee: okxOrder?.fee || 0,
          
          // Match check
          mismatch: found && (
            Math.abs(parseFloat(record.accFillSz) - filledSize) > 1e-8 ||
            Math.abs(record.quoteUSDT - filledUSDT) > 0.01
          )
        };

        verificationResults.push(result);
        console.log(`[VERIFY] ${record.ordId}: ${found ? 'FOUND' : 'NOT_FOUND'}`);
      } catch (e) {
        console.warn(`[VERIFY] Error checking ${record.ordId}: ${e.message}`);
        verificationResults.push({
          claimedOrdId: record.ordId,
          instId: record.instId,
          side: record.side,
          foundInOKX: false,
          okxState: 'ERROR',
          ledgerSaved: true,
          error: e.message
        });
      }
    }

    // Summary
    const foundCount = verificationResults.filter(r => r.foundInOKX).length;
    const notFoundCount = verificationResults.filter(r => !r.foundInOKX).length;
    const mismatchCount = verificationResults.filter(r => r.mismatch).length;

    return Response.json({
      status: 'verification_complete',
      timestamp: new Date().toISOString(),
      
      summary: {
        totalLedgerRecords: allLedgerRecords.length,
        foundInOKX: foundCount,
        notFoundInOKX: notFoundCount,
        mismatchedRecords: mismatchCount,
        provenRealTrades: foundCount
      },

      reconciliationTable: verificationResults.sort((a, b) => {
        if (a.foundInOKX !== b.foundInOKX) return b.foundInOKX ? 1 : -1;
        return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
      }),

      sourceOfTruth: {
        rule: 'ONLY OKX API confirmed orders are real trades',
        rejected: notFoundCount > 0 ? `${notFoundCount} orders not found in OKX` : 'All ledger records verified',
        verified: foundCount
      }
    });

  } catch (err) {
    console.error(`[VERIFY] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});