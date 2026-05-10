import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function okxRequest(apiKey, apiSecret, passphrase, method, path) {
  const timestamp = new Date().toISOString();
  const body = '';
  
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const res = await fetch(`https://www.okx.com${path}`, {
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

    console.log('[okxInvestigateLocked] Investigating locked USDT for', user.email);

    // Get OKX connection
    const connections = await base44.asServiceRole.entities.ExchangeConnection.filter({});
    const okxConn = connections.find(c => c.exchange === 'okx');

    if (!okxConn || !okxConn.api_key_encrypted) {
      return Response.json({
        success: false,
        error: 'OKX connection not found',
        status: 'NO_CONNECTION'
      });
    }

    // Get OKX credentials from connection (already stored)
    const apiKey = okxConn.api_key_encrypted || '';
    const apiSecret = okxConn.api_secret_encrypted || '';
    const passphrase = okxConn.label || 'trading';

    // Check 1: Open Orders
    console.log('[okxInvestigateLocked] Checking open orders...');
    const openOrdersRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/trade/orders-pending');
    const openOrders = openOrdersRes.data || [];
    console.log(`[okxInvestigateLocked] Found ${openOrders.length} open orders`);

    // Check 2: Get balance (funding account)
    console.log('[okxInvestigateLocked] Checking funding account balance...');
    const fundingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const fundingBalances = fundingRes.data || [];
    const fundingUSDT = fundingBalances.find(b => b.ccy === 'USDT');

    // Check 3: Trading account details
    console.log('[okxInvestigateLocked] Checking trading account...');
    const tradingRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    const tradingBalances = tradingRes.data || [];

    // Check 4: Get account info for frozen balances
    console.log('[okxInvestigateLocked] Checking account info...');
    const acctRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/account-info');
    const acctData = acctRes.data?.[0] || {};

    // Detailed open orders breakdown
    const orderSummary = [];
    let totalLockedByOrders = 0;

    for (const order of openOrders) {
      const lockedAmount = parseFloat(order.sz) * parseFloat(order.notionalUsd || order.notionalValue || 0);
      totalLockedByOrders += lockedAmount;
      
      orderSummary.push({
        ordId: order.ordId,
        instId: order.instId,
        side: order.side,
        state: order.state,
        sz: parseFloat(order.sz),
        avgPx: parseFloat(order.avgPx || order.px || 0),
        cTime: new Date(parseInt(order.cTime)).toISOString(),
        notional: lockedAmount
      });
    }

    return Response.json({
      success: true,
      investigation: {
        timestamp: new Date().toISOString(),
        openOrdersCount: openOrders.length,
        openOrders: orderSummary,
        
        fundingAccount: {
          usdt: fundingUSDT ? {
            available: parseFloat(fundingUSDT.availBal || 0),
            frozen: parseFloat(fundingUSDT.frozenBal || 0),
            total: parseFloat(fundingUSDT.bal || 0)
          } : null
        },

        accountInfo: {
          totalEquity: parseFloat(acctData.totalEq || 0),
          marginRatio: parseFloat(acctData.mgnRatio || 0),
          imr: parseFloat(acctData.imr || 0),
          mmr: parseFloat(acctData.mmr || 0),
          frozenBal: parseFloat(acctData.frozenBal || 0)
        },

        analysis: {
          lockedByOpenOrders: parseFloat(totalLockedByOrders.toFixed(2)),
          possibleReasons: [
            openOrders.length > 0 ? `${openOrders.length} open orders locking capital` : null,
            acctData.frozenBal > 0 ? `Frozen balance: ${acctData.frozenBal} USDT` : null,
            'Margin requirements if leveraged',
            'Pending settlement from recent trades',
            'Collateral for open positions'
          ].filter(r => r)
        }
      }
    });

  } catch (error) {
    console.error('[okxInvestigateLocked] Error:', error.message);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});