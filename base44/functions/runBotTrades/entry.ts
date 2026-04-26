import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ---- Crypto helpers ----
async function getBinanceEncKey() {
  const appId = Deno.env.get('BASE44_APP_ID') || 'transcendify-app';
  const material = new TextEncoder().encode(`binance-keys-enc-${appId}-v1`);
  const hash = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function decryptBinance(encData, ivStr) {
  const key = await getBinanceEncKey();
  const iv = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encData), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

async function deriveOkxKey(secret) {
  const enc = new TextEncoder();
  const appId = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(appId), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
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

// ---- Binance helpers ----
async function hmacSignBinance(secret, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function binancePlaceOrder(apiKey, apiSecret, symbol, side, quoteQty) {
  const timestamp = Date.now();
  const params = { symbol, side, type: 'MARKET', quoteOrderQty: quoteQty.toFixed(2), timestamp: timestamp.toString(), recvWindow: '60000' };
  const queryString = new URLSearchParams(params).toString();
  const signature = await hmacSignBinance(apiSecret, queryString);
  const url = `https://api.binance.com/api/v3/order?${queryString}&signature=${signature}`;
  const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } });
  return res.json();
}

function toBinanceSymbol(symbol) {
  // X:BTCUSD -> BTCUSDT, BTC/USDT -> BTCUSDT
  let s = symbol.replace('X:', '').replace('/', '');
  if (!s.endsWith('USDT') && !s.endsWith('USDC') && !s.endsWith('BTC')) {
    s = s.replace(/USD$/, 'USDT');
  }
  return s;
}

// ---- OKX helpers ----
async function hmacSignOkx(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxPlaceOrder(apiKey, secret, passphrase, instId, side, sz) {
  const timestamp = new Date().toISOString();
  const bodyStr = JSON.stringify({ instId, tdMode: 'cash', side, ordType: 'market', sz: sz.toFixed(4) });
  const message = timestamp + 'POST' + '/api/v5/trade/order' + bodyStr;
  const signature = await hmacSignOkx(secret, message);

  const endpoints = ['https://www.okx.com', 'https://eea.okx.com'];
  for (const base of endpoints) {
    try {
      const res = await fetch(base + '/api/v5/trade/order', {
        method: 'POST',
        headers: {
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase,
          'Content-Type': 'application/json'
        },
        body: bodyStr
      });
      const data = await res.json();
      if (data.code === '0') return data;
      if (data.code !== '50119') return data; // 50119 = key not on this domain
    } catch (_) { /* try next */ }
  }
  return { code: '-1', msg: 'All OKX endpoints failed' };
}

// ---- Technical analysis ----
function calcSignal(candles, currentPrice, stopLoss, takeProfit) {
  if (candles.length < 50) return { signal: 'BUY', confidence: 0.6 };
  const prices = candles.map(c => c.c);

  // RSI
  const gains = [], losses = [];
  for (let i = prices.length - 14; i < prices.length; i++) {
    const ch = prices[i] - prices[i - 1];
    ch > 0 ? gains.push(ch) : losses.push(Math.abs(ch));
  }
  const avgGain = gains.reduce((a, b) => a + b, 0) / 14 || 0.001;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / 14 || 0.001;
  const rsi = 100 - 100 / (1 + avgGain / avgLoss);

  // MACD
  const ema = (arr, period) => {
    const k = 2 / (period + 1);
    return arr.reduce((prev, val, i) => i === 0 ? val : prev * (1 - k) + val * k, arr[0]);
  };
  const macd = ema(prices, 12) - ema(prices, 26);

  // Bollinger
  const sma = prices.slice(-20).reduce((a, b) => a + b) / 20;
  const std = Math.sqrt(prices.slice(-20).reduce((a, b) => a + (b - sma) ** 2, 0) / 20);
  const bbPct = (currentPrice - (sma - 2 * std)) / (4 * std);

  const buyScore = (rsi < 35 ? 1 : 0) + (macd > 0 ? 1 : 0) + (bbPct < 0.25 ? 1 : 0);
  const sellScore = (rsi > 65 ? 1 : 0) + (macd < 0 ? 1 : 0) + (bbPct > 0.75 ? 1 : 0);

  if (buyScore >= 2) return { signal: 'BUY', confidence: 0.65 + buyScore * 0.1 };
  if (sellScore >= 2) return { signal: 'SELL', confidence: 0.65 + sellScore * 0.1 };
  return { signal: 'BUY', confidence: 0.55 }; // default lean buy
}

// ---- Main handler ----
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // All active subscriptions
    const subscriptions = await base44.asServiceRole.entities.UserSubscription.filter({ status: 'active' });
    const results = [];

    for (const sub of subscriptions) {
      try {
        const bots = await base44.asServiceRole.entities.TradingBot.filter({ id: sub.bot_id });
        const bot = bots[0];
        if (!bot) continue;

        // Get user's exchange connection (search by both created_by and user_email)
        const exchange = sub.exchange || 'binance';
        const userEmail = sub.user_email || sub.created_by;
        const [connsByCreator, connsByEmail] = await Promise.all([
          base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: userEmail, exchange, status: 'connected' }),
          base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: userEmail, exchange, status: 'connected' })
        ]);
        const seenConns = new Set();
        const allConns = [...connsByCreator, ...connsByEmail].filter(c => { if (seenConns.has(c.id)) return false; seenConns.add(c.id); return true; });

        // If no real connection - fall back to SIM
        const conn = allConns[0];
        const isLive = !!conn;

        // VIP boost
        const wallets = await base44.asServiceRole.entities.Wallet.filter({ created_by: sub.created_by });
        const wallet = wallets[0];
        const vipLevel = wallet?.vip_level || 'none';
        const vipBoosts = { none: 0, bronze: 0.05, silver: 0.10, gold: 0.15, platinum: 0.20, diamond: 0.25 };
        const feeDiscounts = { none: 0, bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.40, diamond: 0.50 };
        const vipBoost = vipBoosts[vipLevel] || 0;
        const feeDiscount = feeDiscounts[vipLevel] || 0;

        const tradingPairs = sub.trading_pairs || ['X:BTCUSD'];
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        const capital = sub.capital_allocated || 1000;
        const positionSize = Math.min(capital, capital * 0.25);

        // Fetch price + candles
        const polygonKey = Deno.env.get('POLYGON_API_KEY');
        const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${polygonKey}`);
        const priceData = await priceRes.json();
        const currentPrice = priceData.results?.p || 50000;

        const toDate = new Date();
        const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        const candlesRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/hour/${fromDate.toISOString().split('T')[0]}/${toDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&apiKey=${polygonKey}`
        );
        const candlesData = await candlesRes.json();
        const candles = candlesData.results || [];

        const { signal, confidence } = calcSignal(candles, currentPrice, sub.stop_loss, sub.take_profit);
        const isBuy = signal === 'BUY';
        const isWin = Math.random() < confidence;

        // Profit simulation (used for SIM mode and for recording)
        let profitPct = 0;
        switch (bot.strategy) {
          case 'scalping': profitPct = isWin ? (0.5 + Math.random()) : -(0.3 + Math.random() * 0.6); break;
          case 'swing': profitPct = isWin ? (2 + Math.random() * 4) : -(1 + Math.random() * 2.5); break;
          case 'arbitrage': profitPct = isWin ? (0.2 + Math.random() * 0.5) : -(0.1 + Math.random() * 0.3); break;
          case 'grid': profitPct = isWin ? (0.8 + Math.random() * 1.5) : -(0.4 + Math.random() * 0.8); break;
          case 'dca': profitPct = isWin ? (1 + Math.random() * 2.5) : -(0.6 + Math.random() * 1.5); break;
          case 'momentum': profitPct = isWin ? (2.5 + Math.random() * 5) : -(1.5 + Math.random() * 4); break;
          default: profitPct = isWin ? 1 : -0.5;
        }
        profitPct *= (1 + vipBoost);
        const slPct = sub.stop_loss || 5;
        const tpPct = sub.take_profit || 10;
        if (profitPct < 0 && Math.abs(profitPct) > slPct) profitPct = -slPct;
        if (profitPct > 0 && profitPct > tpPct) profitPct = tpPct;

        const quantity = Number((positionSize / currentPrice).toFixed(8));
        if (!quantity || isNaN(quantity) || quantity <= 0) continue;

        const baseFee = positionSize * 0.001;
        const fee = Number((baseFee * (1 - feeDiscount)).toFixed(2));
        const entryPrice = Number((currentPrice * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2));
        const exitPrice = Number((entryPrice * (1 + profitPct / 100)).toFixed(2));

        let executionMode = 'SIM';
        let realOrderId = null;
        let realFee = fee;
        let realQty = quantity;
        let realAvgPrice = entryPrice;

        // ---- LIVE EXECUTION ----
        if (isLive) {
          try {
            if (exchange === 'binance') {
              const [keyIv, secretIv] = conn.encryption_iv.split('|');
              const apiKey = await decryptBinance(conn.api_key_encrypted, keyIv);
              const apiSecret = await decryptBinance(conn.api_secret_encrypted, secretIv);
              const binSym = toBinanceSymbol(symbol);

              console.log(`[LIVE-BINANCE] ${sub.created_by} | ${isBuy ? 'BUY' : 'SELL'} ${binSym} quoteQty=${positionSize.toFixed(2)}`);
              const orderRes = await binancePlaceOrder(apiKey, apiSecret, binSym, isBuy ? 'BUY' : 'SELL', positionSize);

              if (orderRes.code) {
                console.error(`[LIVE-BINANCE] Order failed: ${orderRes.msg}`);
                executionMode = 'SIM'; // fall back to SIM on error
              } else {
                executionMode = 'MAINNET';
                realOrderId = orderRes.orderId?.toString();
                realQty = parseFloat(orderRes.executedQty || quantity);
                const quoteQty = parseFloat(orderRes.cummulativeQuoteQty || positionSize);
                realAvgPrice = realQty > 0 ? quoteQty / realQty : entryPrice;
                realFee = (orderRes.fills || []).reduce((s, f) => s + parseFloat(f.commission || 0), 0);
                console.log(`[LIVE-BINANCE] Filled orderId=${realOrderId} avgPrice=${realAvgPrice} qty=${realQty}`);
              }
            } else if (exchange === 'okx') {
              const apiKey = await decryptOkx(conn.api_key_encrypted);
              const apiSecret = await decryptOkx(conn.api_secret_encrypted);
              const passphrase = await decryptOkx(conn.encryption_iv);

              // OKX instId: BTC-USDT format (handle X:BTCUSD, BTC/USDT, BTC-USDT etc.)
              let instId = symbol.replace('X:', '').replace('/', '-');
              if (instId.endsWith('USD') && !instId.endsWith('USDT')) instId = instId.replace(/USD$/, 'USDT');
              if (!instId.includes('-')) instId = instId.replace(/([A-Z]{3,4})(USDT|USDC|BTC|ETH)$/, '$1-$2');
              if (!instId.includes('-')) instId += '-USDT';
              // If already in BTC-USDT format, use as-is
              console.log(`[LIVE-OKX] instId resolved to: ${instId} from symbol: ${symbol}`);

              const sz = positionSize / currentPrice; // base currency amount
              console.log(`[LIVE-OKX] ${sub.created_by} | ${isBuy ? 'buy' : 'sell'} ${instId} sz=${sz.toFixed(4)}`);
              const orderRes = await okxPlaceOrder(apiKey, apiSecret, passphrase, instId, isBuy ? 'buy' : 'sell', sz);

              if (orderRes.code === '0') {
                executionMode = 'MAINNET';
                realOrderId = orderRes.data?.[0]?.ordId;
                console.log(`[LIVE-OKX] Placed ordId=${realOrderId}`);
              } else {
                console.error(`[LIVE-OKX] Order failed: ${orderRes.msg}`);
                executionMode = 'SIM';
              }
            }
          } catch (liveErr) {
            console.error(`[LIVE-EXEC] Error for ${sub.created_by}: ${liveErr.message}`);
            executionMode = 'SIM';
          }
        }

        const profit = executionMode === 'MAINNET'
          ? 0 // real P&L tracked separately when position closes
          : Number(((positionSize * profitPct) / 100 - fee).toFixed(2));

        // Record order
        await base44.asServiceRole.entities.Order.create({
          symbol, side: isBuy ? 'BUY' : 'SELL', type: 'MARKET',
          quantity: realQty, price: realAvgPrice,
          status: 'FILLED', filled_quantity: realQty,
          average_price: realAvgPrice, total_value: Number(positionSize.toFixed(2)),
          fee: realFee, execution_mode: executionMode,
          filled_at: new Date().toISOString(),
          created_by: userEmail,
          user_email: userEmail
        });

        // Record trade
        await base44.asServiceRole.entities.Trade.create({
          subscription_id: sub.id,
          symbol, side: isBuy ? 'BUY' : 'SELL',
          quantity: realQty, price: realAvgPrice,
          total_value: Number(positionSize.toFixed(2)),
          fee: realFee,
          profit_loss: profit,
          entry_price: realAvgPrice,
          exit_price: executionMode === 'SIM' ? exitPrice : null,
          execution_mode: executionMode,
          strategy_used: `${bot.strategy} (${exchange.toUpperCase()}, Conf:${(confidence * 100).toFixed(0)}%)`,
          timestamp: new Date().toISOString(),
          created_by: userEmail,
          user_email: userEmail
        });

        // Update subscription stats (only SIM profit is tracked instantly)
        const newProfit = (sub.total_profit || 0) + profit;
        const newTrades = (sub.total_trades || 0) + 1;
        await base44.asServiceRole.entities.UserSubscription.update(sub.id, {
          total_profit: Number(newProfit.toFixed(2)),
          total_trades: newTrades
        });

        results.push({
          user: sub.created_by,
          exchange, executionMode,
          symbol, side: isBuy ? 'BUY' : 'SELL',
          price: realAvgPrice, profit
        });

      } catch (err) {
        console.error(`[runBotTrades] Error for subscription ${sub.id}:`, err.message);
      }
    }

    return Response.json({ success: true, trades_created: results.length, results });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});