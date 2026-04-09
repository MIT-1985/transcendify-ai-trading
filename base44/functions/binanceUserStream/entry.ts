import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// --- Crypto helpers ---
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
  const allParams = { ...params, timestamp: timestamp.toString(), recvWindow: '10000' };
  const queryString = new URLSearchParams(allParams).toString();
  const signature = await hmacSign(apiSecret, queryString);
  const url = `https://api.binance.com${endpoint}?${queryString}&signature=${signature}`;
  const response = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey } });
  return response.json();
}

// --- Main handler ---
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // Get connection
    const connections = await base44.entities.ExchangeConnection.filter({
      created_by: user.email, exchange: 'binance', status: 'connected'
    });
    if (!connections.length) {
      return Response.json({ error: 'No active Binance connection' }, { status: 400 });
    }

    const conn = connections[0];
    const [keyIv, secretIv] = conn.encryption_iv.split('|');
    const apiKey = await decryptText(conn.api_key_encrypted, keyIv);
    const apiSecret = await decryptText(conn.api_secret_encrypted, secretIv);

    // ---- CREATE LISTEN KEY ----
    if (action === 'createListenKey') {
      const response = await fetch('https://api.binance.com/api/v3/userDataStream', {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey }
      });
      const data = await response.json();

      if (data.listenKey) {
        await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, {
          listen_key: data.listenKey
        });
        return Response.json({ success: true, listenKey: data.listenKey });
      }
      return Response.json({ error: 'Failed to create listen key', details: data }, { status: 400 });
    }

    // ---- KEEPALIVE LISTEN KEY ----
    if (action === 'keepAlive') {
      const listenKey = conn.listen_key;
      if (!listenKey) return Response.json({ error: 'No listen key found' }, { status: 400 });

      const response = await fetch(`https://api.binance.com/api/v3/userDataStream?listenKey=${listenKey}`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': apiKey }
      });
      return Response.json({ success: response.ok });
    }

    // ---- SYNC ACCOUNT ----
    if (action === 'syncAccount') {
      // Fetch latest account info
      const accountInfo = await binanceRequest(apiKey, apiSecret, '/api/v3/account');
      if (accountInfo.code) {
        return Response.json({ error: accountInfo.msg }, { status: 400 });
      }

      const balances = (accountInfo.balances || [])
        .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
        .filter(b => b.free > 0 || b.locked > 0);

      const usdt = balances.find(b => b.asset === 'USDT');
      const balanceUsdt = (usdt?.free || 0) + (usdt?.locked || 0);

      // Update connection
      await base44.asServiceRole.entities.ExchangeConnection.update(conn.id, {
        balance_usdt: balanceUsdt,
        balances,
        last_sync: new Date().toISOString()
      });

      // Fetch recent trades and sync to DB
      const { subscription_id, symbol } = body;
      if (subscription_id && symbol) {
        const binanceSymbol = symbol.replace('X:', '').replace('/', '').replace(/USD$/, 'USDT');
        const myTrades = await binanceRequest(apiKey, apiSecret, '/api/v3/myTrades', {
          symbol: binanceSymbol, limit: '20'
        });

        if (Array.isArray(myTrades)) {
          // Get existing trades to avoid duplicates
          const existingTrades = await base44.entities.Trade.filter({ subscription_id });
          const existingTimestamps = new Set(existingTrades.map(t => t.timestamp));

          for (const trade of myTrades) {
            const ts = new Date(trade.time).toISOString();
            if (existingTimestamps.has(ts)) continue;

            await base44.entities.Trade.create({
              subscription_id,
              symbol,
              side: trade.isBuyer ? 'BUY' : 'SELL',
              quantity: parseFloat(trade.qty),
              price: parseFloat(trade.price),
              total_value: parseFloat(trade.quoteQty),
              fee: parseFloat(trade.commission),
              entry_price: parseFloat(trade.price),
              execution_mode: 'MAINNET',
              strategy_used: 'binance_live',
              timestamp: ts
            });
          }
        }
      }

      return Response.json({
        success: true,
        balance_usdt: balanceUsdt,
        balances,
        synced_at: new Date().toISOString()
      });
    }

    // ---- GET RECENT TRADES ----
    if (action === 'recentTrades') {
      const { symbol } = body;
      const binanceSymbol = symbol ? symbol.replace('X:', '').replace('/', '').replace(/USD$/, 'USDT') : 'BTCUSDT';
      const trades = await binanceRequest(apiKey, apiSecret, '/api/v3/myTrades', {
        symbol: binanceSymbol, limit: '50'
      });

      if (trades.code) return Response.json({ error: trades.msg }, { status: 400 });

      return Response.json({
        success: true,
        trades: (trades || []).map(t => ({
          symbol: t.symbol,
          side: t.isBuyer ? 'BUY' : 'SELL',
          price: parseFloat(t.price),
          quantity: parseFloat(t.qty),
          quoteQty: parseFloat(t.quoteQty),
          commission: parseFloat(t.commission),
          commissionAsset: t.commissionAsset,
          time: new Date(t.time).toISOString(),
          isMaker: t.isMaker
        }))
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[USER STREAM ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});