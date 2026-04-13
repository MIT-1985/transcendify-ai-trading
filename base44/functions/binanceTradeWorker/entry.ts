import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// --- Crypto helpers (duplicated — no local imports allowed) ---
async function getEncryptionKey() {
  const appId = Deno.env.get('BASE44_APP_ID') || 'transcendify-app';
  const material = new TextEncoder().encode(`binance-keys-enc-${appId}-v1`);
  const hash = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function decryptText(encData, ivStr) {
  const key = await getEncryptionKey();
  const iv = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encData), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

async function hmacSign(secret, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function binanceRequest(apiKey, apiSecret, endpoint, params = {}, method = 'GET') {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp: timestamp.toString(), recvWindow: '60000' };
  const queryString = new URLSearchParams(allParams).toString();
  const signature = await hmacSign(apiSecret, queryString);
  const url = `https://api.binance.com${endpoint}?${queryString}&signature=${signature}`;
  const response = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey } });
  return response.json();
}

function toBinanceSymbol(symbol) {
  // X:BTCUSD -> BTCUSDC, BTC/USDT -> BTCUSDC
  return symbol.replace('X:', '').replace('/', '').replace(/USD$/, 'USDC').replace(/USDT$/, 'USDC');
}

// --- Main handler ---
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // Get user's connection
    const connections = await base44.entities.ExchangeConnection.filter({
      created_by: user.email, exchange: 'binance', status: 'connected'
    });
    if (!connections.length) {
      return Response.json({ error: 'No active Binance connection. Please connect first.' }, { status: 400 });
    }

    const conn = connections[0];
    const [keyIv, secretIv] = conn.encryption_iv.split('|');
    const apiKey = await decryptText(conn.api_key_encrypted, keyIv);
    const apiSecret = await decryptText(conn.api_secret_encrypted, secretIv);

    // ---- PLACE ORDER ----
    if (action === 'placeOrder') {
      const { symbol, side, quantity, type, price, subscription_id } = body;
      const binanceSymbol = toBinanceSymbol(symbol);

      const orderParams = {
        symbol: binanceSymbol,
        side: side, // BUY or SELL
        type: type || 'MARKET'
      };

      if (type === 'MARKET') {
        // For market BUYs use quoteOrderQty (USDC amount), for SELLs use quantity (asset amount)
        if (side === 'BUY') {
          orderParams.quoteOrderQty = parseFloat(quantity).toFixed(2);
        } else {
          orderParams.quantity = parseFloat(quantity).toFixed(8);
        }
      } else if (type === 'LIMIT') {
        orderParams.quantity = quantity.toString();
        orderParams.price = parseFloat(price).toFixed(2);
        orderParams.timeInForce = 'GTC';
      }

      console.log(`[TRADE] Placing ${side} ${type} order on ${binanceSymbol}`, orderParams);
      const result = await binanceRequest(apiKey, apiSecret, '/api/v3/order', orderParams, 'POST');

      if (result.code) {
        console.error(`[TRADE] Binance error: ${result.msg}`);
        await base44.entities.Order.create({
          symbol, side, type: type || 'MARKET', quantity,
          status: 'REJECTED', execution_mode: 'MAINNET', fee: 0
        });
        return Response.json({ error: result.msg, code: result.code }, { status: 400 });
      }

      console.log(`[TRADE] Order filled: ${result.orderId} - ${result.status}`);

      const executedQty = parseFloat(result.executedQty || '0');
      const quoteQty = parseFloat(result.cummulativeQuoteQty || '0');
      const avgPrice = executedQty > 0 ? quoteQty / executedQty : 0;
      const totalFee = (result.fills || []).reduce((s, f) => s + parseFloat(f.commission || '0'), 0);

      // Store order
      await base44.entities.Order.create({
        symbol, side, type: type || 'MARKET',
        quantity: executedQty,
        price: avgPrice,
        status: result.status === 'FILLED' ? 'FILLED' : 'PENDING',
        filled_quantity: executedQty,
        average_price: avgPrice,
        total_value: quoteQty,
        fee: totalFee,
        execution_mode: 'MAINNET',
        filled_at: result.status === 'FILLED' ? new Date().toISOString() : null
      });

      // Store trade if filled and linked to subscription
      if (subscription_id && result.status === 'FILLED') {
        await base44.entities.Trade.create({
          subscription_id,
          symbol, side,
          quantity: executedQty,
          price: avgPrice,
          total_value: quoteQty,
          fee: totalFee,
          entry_price: avgPrice,
          execution_mode: 'MAINNET',
          strategy_used: 'binance_live',
          timestamp: new Date().toISOString()
        });
      }

      return Response.json({
        success: true,
        orderId: result.orderId,
        status: result.status,
        executedQty, quoteQty, avgPrice,
        fills: result.fills
      });
    }

    // ---- GET OPEN ORDERS ----
    if (action === 'getOpenOrders') {
      const params = body.symbol ? { symbol: toBinanceSymbol(body.symbol) } : {};
      const result = await binanceRequest(apiKey, apiSecret, '/api/v3/openOrders', params);
      if (result.code) return Response.json({ error: result.msg }, { status: 400 });
      return Response.json({ success: true, orders: result });
    }

    // ---- CANCEL ORDER ----
    if (action === 'cancelOrder') {
      const { symbol, orderId } = body;
      const result = await binanceRequest(apiKey, apiSecret, '/api/v3/order', {
        symbol: toBinanceSymbol(symbol),
        orderId: orderId.toString()
      }, 'DELETE');
      if (result.code) return Response.json({ error: result.msg }, { status: 400 });
      return Response.json({ success: true, result });
    }

    // ---- ACCOUNT INFO ----
    if (action === 'accountInfo') {
      const result = await binanceRequest(apiKey, apiSecret, '/api/v3/account');
      if (result.code) return Response.json({ error: result.msg }, { status: 400 });

      const balances = (result.balances || [])
        .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
        .filter(b => b.free > 0 || b.locked > 0);

      return Response.json({ success: true, balances, permissions: result.permissions });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[TRADE WORKER ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});