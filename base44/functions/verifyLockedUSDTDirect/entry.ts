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
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[verifyLocked] Starting direct OKX verification...');

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
        error: 'No OKX connection found'
      }, { status: 400 });
    }

    const conn = conns[0];
    const apiKey = await decrypt(conn.api_key_encrypted);
    const apiSecret = await decrypt(conn.api_secret_encrypted);
    const passphrase = await decrypt(conn.encryption_iv);

    console.log('[verifyLocked] Got OKX credentials, fetching account balance...');

    // 1. GET REAL OKX BALANCE (including frozen)
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    
    if (balRes.code !== '0') {
      return Response.json({
        success: false,
        error: 'OKX balance API failed',
        okxError: balRes.msg || 'Unknown error',
        okxCode: balRes.code
      }, { status: 500 });
    }

    const balanceData = balRes.data?.[0] || {};
    const totalEq = parseFloat(balanceData.totalEq || 0);
    const availEq = parseFloat(balanceData.availEq || 0);
    const frozenBal = parseFloat(balanceData.frozenBal || 0);
    const cashBal = parseFloat(balanceData.cashBal || 0);
    const uTime = balanceData.uTime;

    console.log('[verifyLocked] OKX Balance: totalEq=' + totalEq.toFixed(2) + ' availEq=' + availEq.toFixed(2) + ' frozenBal=' + frozenBal.toFixed(2));

    // Parse all asset details
    const details = balanceData.details || [];
    const assetBalances = details
      .filter(d => parseFloat(d.cashBal) > 0 || parseFloat(d.frozenBal) > 0)
      .map(d => ({
        ccy: d.ccy,
        cashBal: parseFloat(d.cashBal || 0),
        frozenBal: parseFloat(d.frozenBal || 0),
        availBal: parseFloat(d.availBal || 0),
        ordFrozen: parseFloat(d.ordFrozen || 0)
      }));

    console.log('[verifyLocked] Fetching OKX open orders...');

    // 2. GET REAL OKX OPEN ORDERS
    const ordersRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/trade/orders-pending?instType=SPOT');
    
    if (ordersRes.code !== '0') {
      return Response.json({
        success: false,
        error: 'OKX open orders API failed',
        okxError: ordersRes.msg || 'Unknown error',
        okxCode: ordersRes.code
      }, { status: 500 });
    }

    const openOrders = ordersRes.data || [];
    console.log('[verifyLocked] OKX reports ' + openOrders.length + ' open orders');

    // Parse open orders
    const openOrdersList = openOrders.map(o => ({
      ordId: o.ordId,
      instId: o.instId,
      side: o.side,
      ordType: o.ordType,
      state: o.state,
      sz: parseFloat(o.sz || 0),
      accFillSz: parseFloat(o.accFillSz || 0),
      avgPx: parseFloat(o.avgPx || 0),
      px: parseFloat(o.px || 0),
      cTime: o.cTime,
      uTime: o.uTime
    }));

    // Calculate locked USDT from real OKX open orders
    let realLockedByOpenOrders = 0;
    const pendingBuys = [];
    
    for (const order of openOrdersList) {
      if (order.side === 'buy' && order.instId.includes('USDT')) {
        const remainingQty = order.sz - order.accFillSz;
        const notional = remainingQty * order.px;
        realLockedByOpenOrders += notional;
        pendingBuys.push({
          ordId: order.ordId,
          instId: order.instId,
          remainingQty: remainingQty,
          price: order.px,
          lockedUSDT: notional
        });
      }
    }

    console.log('[verifyLocked] Real locked USDT from OKX open orders: ' + realLockedByOpenOrders.toFixed(2));
    console.log('[verifyLocked] Frozen USDT from account: ' + frozenBal.toFixed(2));

    // 3. GET LEDGER DATA FOR COMPARISON
    console.log('[verifyLocked] Fetching ledger data...');

    const allOrders = await base44.asServiceRole.entities.OXXOrderLedger.list();
    const verifiedTrades = await base44.asServiceRole.entities.VerifiedTrade.list();
    
    const buyOrders = allOrders.filter(o => o.side === 'buy');
    const matchedSellIds = new Set(verifiedTrades.map(t => t.sellOrdId));
    const unmatchedBuys = buyOrders.filter(buy => !matchedSellIds.has(buy.ordId));

    let ledgerLockedNotional = 0;
    for (const buy of unmatchedBuys) {
      ledgerLockedNotional += (buy.quoteUSDT || (buy.accFillSz * buy.avgPx));
    }

    console.log('[verifyLocked] Ledger unmatched buys: ' + unmatchedBuys.length + ' notional: ' + ledgerLockedNotional.toFixed(2));

    // 4. COMPARISON & CLASSIFICATION

    // Are the ledger "unmatched" buys actually open on OKX?
    const realOrdIds = new Set(openOrdersList.map(o => o.ordId));
    
    const stillRealOpenOrders = unmatchedBuys.filter(b => realOrdIds.has(b.ordId));
    const staleUnmatchedOrders = unmatchedBuys.filter(b => !realOrdIds.has(b.ordId));

    console.log('[verifyLocked] Unmatched buys still on OKX: ' + stillRealOpenOrders.length);
    console.log('[verifyLocked] Stale unmatched buys: ' + staleUnmatchedOrders.length);

    // Classification
    let classification = 'BALANCE_UNVERIFIED';
    let reason = '';

    if (openOrders.length === 0) {
      if (frozenBal < 1) {
        // OKX: 0 open orders, < $1 frozen
        if (unmatchedBuys.length > 0) {
          classification = 'LEDGER_STALE_ONLY';
          reason = `OKX: 0 open orders, ${frozenBal.toFixed(2)} frozen USDT. Ledger has ${unmatchedBuys.length} unmatched buys - STALE.`;
        } else {
          classification = 'REAL_LOCKED_BY_OKX';
          reason = 'OKX: 0 open orders, <$1 frozen. No locked capital.';
        }
      } else {
        // OKX: 0 open orders but frozen > $1 - may be other types
        classification = 'BALANCE_UNVERIFIED';
        reason = `OKX: 0 open orders but ${frozenBal.toFixed(2)} USDT frozen. Cause unknown (may be margin, funding transfer, etc).`;
      }
    } else if (openOrders.length > 0 && stillRealOpenOrders.length > 0) {
      // Real open orders confirmed
      classification = 'REAL_LOCKED_BY_OKX';
      reason = `OKX confirmed: ${openOrders.length} open orders. ${stillRealOpenOrders.length} match ledger unmatched buys. Frozen: ${frozenBal.toFixed(2)} USDT.`;
    } else if (openOrders.length > 0 && stillRealOpenOrders.length === 0) {
      // Open orders exist but don't match ledger unmatched buys
      classification = 'LEDGER_STALE_ONLY';
      reason = `OKX has ${openOrders.length} open orders but NONE match ledger unmatched buys. Ledger is stale.`;
    } else {
      classification = 'BALANCE_UNVERIFIED';
      reason = 'Unable to classify.';
    }

    // Mark stale records in database
    if (staleUnmatchedOrders.length > 0) {
      console.log('[verifyLocked] Marking ' + staleUnmatchedOrders.length + ' stale records in database...');
      for (const order of staleUnmatchedOrders) {
        try {
          await base44.asServiceRole.entities.OXXOrderLedger.update(order.id, {
            stale_unmatched_buy: true,
            excludedFromActivePositions: true
          });
        } catch (e) {
          console.warn('[verifyLocked] Failed to mark stale order ' + order.id);
        }
      }
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      
      okxLiveData: {
        balance: {
          totalEquityUSDT: totalEq,
          availableUSDT: availEq,
          frozenUSDT: frozenBal,
          cashBalanceUSDT: cashBal,
          lastUpdateTime: uTime,
          assetDetails: assetBalances
        },
        
        openOrders: {
          count: openOrdersList.length,
          lockedByOpenBuyOrders: realLockedByOpenOrders,
          openBuyOrdersUSDTPairs: pendingBuys.length,
          details: openOrdersList.slice(0, 100),
          pendingBuyDetails: pendingBuys.slice(0, 50)
        }
      },

      ledgerComparison: {
        unmatchedBuysCount: unmatchedBuys.length,
        unmatchedBuysNotional: ledgerLockedNotional,
        matchesOKXRealOrders: stillRealOpenOrders.length,
        staleUnmatchedOrders: staleUnmatchedOrders.length,
        nowMarkedAsStale: staleUnmatchedOrders.length > 0 ? true : false
      },

      finalClassification: {
        type: classification,
        reason: reason,
        
        verification: {
          okxOpenOrdersCount: openOrders.length,
          okxFrozenUSDT: frozenBal,
          ledgerUnmatchedBuysCount: unmatchedBuys.length,
          ledgerUnmatchedNotional: ledgerLockedNotional,
          alignment: stillRealOpenOrders.length > 0 ? 'ALIGNED' : 'MISALIGNED'
        },

        recommendation: 
          classification === 'REAL_LOCKED_BY_OKX'
            ? `REAL: ${frozenBal.toFixed(2)} USDT locked by OKX open orders. Keep kill switch active until reviewed and positions closed.`
            : classification === 'LEDGER_STALE_ONLY'
            ? `STALE: ${staleUnmatchedOrders.length} ledger records marked as stale. OKX account is free. No real locked capital.`
            : `UNVERIFIED: Cannot determine lock source. Manual OKX review required.`
      }
    });

  } catch (error) {
    console.error('[verifyLocked] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});