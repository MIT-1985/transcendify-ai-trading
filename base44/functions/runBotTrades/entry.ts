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

async function okxRequest(apiKey, secret, passphrase, method, path, bodyStr = '', baseUrl = 'https://www.okx.com') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + bodyStr;
  const signature = await hmacSignOkx(secret, message);
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    },
    body: bodyStr || undefined
  });
  return res.json();
}

async function okxEnsureTradingFunds(apiKey, secret, passphrase, ccy, amount, baseUrl) {
  // Transfer from Funding to Trading account if needed
  const bodyStr = JSON.stringify({ ccy, amt: amount.toFixed(6), from: '6', to: '18', type: '0' });
  const res = await okxRequest(apiKey, secret, passphrase, 'POST', '/api/v5/asset/transfer', bodyStr, baseUrl);
  console.log(`[OKX-TRANSFER] Funding→Trading ${ccy} ${amount}: code=${res.code} msg=${res.msg}`);
  return res;
}

async function okxPlaceOrder(apiKey, secret, passphrase, instId, side, usdtAmount, currentPrice) {
  const endpoints = ['https://www.okx.com', 'https://eea.okx.com'];
  for (const base of endpoints) {
    try {
      // For market BUY: use USDT amount with tgtCcy=quote_ccy (sz = USDT amount)
      // For market SELL: use base currency amount (sz = coin amount)
      let orderBody;
      if (side === 'buy') {
        orderBody = { instId, tdMode: 'cash', side: 'buy', ordType: 'market', sz: usdtAmount.toFixed(2), tgtCcy: 'quote_ccy' };
      } else {
        const coinAmount = usdtAmount / currentPrice;
        orderBody = { instId, tdMode: 'cash', side: 'sell', ordType: 'market', sz: coinAmount.toFixed(6) };
      }
      const bodyStr = JSON.stringify(orderBody);
      console.log(`[OKX-ORDER] ${base} body: ${bodyStr}`);
      const data = await okxRequest(apiKey, secret, passphrase, 'POST', '/api/v5/trade/order', bodyStr, base);
      console.log(`[OKX-ORDER] response: code=${data.code} msg=${data.msg} data=${JSON.stringify(data.data)}`);
      if (data.code === '0') return data;
      if (data.code !== '50119') return data; // 50119 = key not on this domain, try next
    } catch (e) {
      console.log(`[OKX-ORDER] ${base} error: ${e.message}`);
    }
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

    // Get all active subscriptions + SUZANA'S SPECIAL CASE
    const subscriptions = await base44.asServiceRole.entities.UserSubscription.filter({ status: 'active' });
    
    // SUZANA: Always include her subscriptions even if not in normal filter
    const suzanaEmail = 'nikitasuziface77@gmail.com';
    const suzanaAltEmail = 'sauzana.cozmas@gmail.com';
    const suzanaSubs = await base44.asServiceRole.entities.UserSubscription.filter({ 
      $or: [{ user_email: suzanaEmail }, { user_email: suzanaAltEmail }, { created_by: suzanaEmail }, { created_by: suzanaAltEmail }]
    });
    
    // Merge and deduplicate
    const seenSubIds = new Set();
    const allSubs = [...subscriptions, ...suzanaSubs].filter(s => {
      if (seenSubIds.has(s.id)) return false;
      seenSubIds.add(s.id);
      return true;
    });
    
    const results = [];

    for (const sub of allSubs) {
      try {
        const bots = await base44.asServiceRole.entities.TradingBot.filter({ id: sub.bot_id });
        const bot = bots[0];
        if (!bot) continue;
        
        // CRITICAL: Stop all bots except Robot 1 (DCA Warrior)
        const BOT1_ID = '69352a734b5108d3c7824639';
        if (bot.id !== BOT1_ID) {
          console.log(`[ROBOT-1] SKIP: ${bot.name} - only Robot 1 enabled`);
          continue;
        }
        
        console.log(`[ROBOT-1] Starting execution for ${bot.name}`);

        // Get user's exchange connection (search by both created_by and user_email)
        let exchange = sub.exchange || 'binance';
        const userEmail = sub.user_email || sub.created_by;
        
        // SUZANA: Force OKX for her accounts
        const isSuzana = userEmail === suzanaEmail || userEmail === suzanaAltEmail;
        if (isSuzana) {
          exchange = 'okx';
        }
        
        const [connsByCreator, connsByEmail] = await Promise.all([
          base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: userEmail, exchange, status: 'connected' }),
          base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: userEmail, exchange, status: 'connected' })
        ]);
        const seenConns = new Set();
        const allConns = [...connsByCreator, ...connsByEmail].filter(c => { if (seenConns.has(c.id)) return false; seenConns.add(c.id); return true; });
        console.log(`[runBotTrades] sub=${sub.id} userEmail=${userEmail} exchange=${exchange} isSuzana=${isSuzana} conns found=${allConns.length} (byCreator=${connsByCreator.length}, byEmail=${connsByEmail.length})`);

        // If no real connection - fall back to SIM
        // SUZANA: Force MAINNET even if no connection (use encrypted credentials from DB)
        let conn = allConns[0];
        const isLive = !!conn || isSuzana;

        // VIP boost
        const wallets = await base44.asServiceRole.entities.Wallet.filter({ created_by: sub.created_by });
        const wallet = wallets[0];
        const vipLevel = wallet?.vip_level || 'none';
        const vipBoosts = { none: 0, bronze: 0.05, silver: 0.10, gold: 0.15, platinum: 0.20, diamond: 0.25 };
        const feeDiscounts = { none: 0, bronze: 0.10, silver: 0.20, gold: 0.30, platinum: 0.40, diamond: 0.50 };
        const vipBoost = vipBoosts[vipLevel] || 0;
        const feeDiscount = feeDiscounts[vipLevel] || 0;

        // ---- ROBOT 1: ONLY ETH-USDT OR SOL-USDT ----
        const ALLOWED_PAIRS = ['ETH-USDT', 'SOL-USDT'];
        const symbol = ALLOWED_PAIRS[Math.floor(Math.random() * ALLOWED_PAIRS.length)];
        
        console.log(`[BOT_DECISION] User=${userEmail} pair=${symbol} freeUSDT=${freeUsdt.toFixed(2)}`);

        // Fetch real OKX price for the instrument
        let instIdForPrice = symbol.replace('X:', '').replace('/', '-');
        if (instIdForPrice.endsWith('USD') && !instIdForPrice.endsWith('USDT')) instIdForPrice = instIdForPrice.replace(/USD$/, 'USDT');
        if (!instIdForPrice.includes('-')) instIdForPrice = instIdForPrice.replace(/([A-Z]{3,4})(USDT|USDC|BTC|ETH)$/, '$1-$2');
        if (!instIdForPrice.includes('-')) instIdForPrice += '-USDT';

        let currentPrice = 50000;
        try {
          const okxTickerRes = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instIdForPrice}`);
          const okxTickerData = await okxTickerRes.json();
          if (okxTickerData.code === '0' && okxTickerData.data?.[0]?.last) {
            currentPrice = parseFloat(okxTickerData.data[0].last);
          }
        } catch (e) {
          console.log(`[runBotTrades] OKX price fetch failed for ${instIdForPrice}, using default`);
        }

        // Fetch candles from Polygon for technical analysis signals
        const polygonKey = Deno.env.get('POLYGON_API_KEY');
        const polygonSymbol = symbol.startsWith('X:') ? symbol : `X:${instIdForPrice.replace('-', '')}`;
        const toDate = new Date();
        const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        const candlesRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${polygonSymbol}/range/1/hour/${fromDate.toISOString().split('T')[0]}/${toDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&apiKey=${polygonKey}`
        );
        const candlesData = await candlesRes.json();
        const candles = candlesData.results || [];

        // ---- CRITICAL: Build openPositions from live filled OKX orders (FIFO) ----
        const instIdAsset = symbol.split('-')[0]; // ETH or SOL
        let openPositions = {}; // { 'ETH': { qty: 1.5, cost: 5000 }, ... }
        
        // Fetch live OKX orders directly using OKX API (same method as getSuzanaOrders)
        try {
          const apiKey = await decryptOkx(conn.api_key_encrypted);
          const apiSecret = await decryptOkx(conn.api_secret_encrypted);
          const passphrase = await decryptOkx(conn.encryption_iv);
          
          let ordersData = null;
          for (const ep of ['https://www.okx.com', 'https://eea.okx.com']) {
            try {
              const data = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/trade/orders-history?instType=SPOT&limit=100', '', ep);
              if (data.code === '0') { ordersData = data; break; }
            } catch (e) {
              console.log(`[SKIP_REASON] OKX endpoint ${ep} failed: ${e.message}`);
            }
          }
          
          if (!ordersData || ordersData.code !== '0') {
            console.log(`[SKIP_REASON] Live order fetch failed, cannot verify positions`);
            continue;
          }
          
          // Build FIFO positions from OKX orders
          const filledOrders = ordersData.data || [];
          for (const order of filledOrders) {
            if (order.instId === symbol) {
              const asset = order.instId.split('-')[0];
              if (!openPositions[asset]) openPositions[asset] = { qty: 0, cost: 0 };
              
              const fillQty = parseFloat(order.accFillSz || 0);
              const fillPrice = parseFloat(order.avgPx || 0);
              
              if (order.side?.toUpperCase() === 'BUY') {
                openPositions[asset].qty += fillQty;
                openPositions[asset].cost += fillQty * fillPrice;
              } else if (order.side?.toUpperCase() === 'SELL') {
                openPositions[asset].qty -= fillQty;
                if (openPositions[asset].qty < 0) openPositions[asset].qty = 0;
              }
            }
          }
          console.log(`[BOT_DECISION] Fetched ${filledOrders.length} live orders, built positions`);
        } catch (e) {
          console.log(`[SKIP_REASON] Exception fetching live orders: ${e.message}`);
          continue;
        }
        
        const assetOpenQty = openPositions[instIdAsset]?.qty || 0;
        const hasOpenPos = assetOpenQty > 0.0001;
        
        // ---- POSITION SIZE: min(freeUSDT * 0.15, $20) ----
        const positionSize = Math.min(freeUsdt * 0.15, 20);
        const OKX_MIN_NOTIONAL = 5; // OKX min $5
        if (positionSize < OKX_MIN_NOTIONAL) {
          console.log(`[SKIP_REASON] positionSize=${positionSize.toFixed(2)} < OKX_MIN=${OKX_MIN_NOTIONAL}`);
          continue;
        }
        
        // ---- DECISION: BUY only if NO open position, SELL only if position exists ----
        const isBuy = !hasOpenPos;
        
        if (isBuy && hasOpenPos) {
          console.log(`[SKIP_REASON] ${instIdAsset} has open qty=${assetOpenQty.toFixed(6)}, cannot BUY`);
          continue;
        }
        
        if (!isBuy && !hasOpenPos) {
          console.log(`[SKIP_REASON] ${instIdAsset} no open position, cannot SELL`);
          continue;
        }
        
        // ---- FOR SELL: check live OKX balance ----
        if (!isBuy) {
          const assetBal = balanceDetails?.find(d => d.ccy === instIdAsset);
          const assetAvail = assetBal ? parseFloat(assetBal.availBal || 0) : 0;
          if (assetAvail < 0.0001) {
            console.log(`[SKIP_REASON] ${instIdAsset} balance=${assetAvail.toFixed(6)} below min size`);
            continue;
          }
        }
        
        const finalIsBuy = isBuy;
        console.log(`[BOT_DECISION] ${finalIsBuy ? 'BUY' : 'SELL'} ${symbol} size=${positionSize.toFixed(2)} USDT openQty=${assetOpenQty.toFixed(6)}`);
        
        const isWin = Math.random() < confidence;

        // Profit simulation: win rate ~70%, losses capped so max loss per trade ≤ $2
        // isWin is already biased by confidence (from technical analysis)
        const forceWin = Math.random() < 0.70; // at least 70% win rate regardless of signal
        const isWinFinal = forceWin || isWin;
        let profitPct = 0;
        switch (bot.strategy) {
          case 'scalping':   profitPct = isWinFinal ? (0.4 + Math.random() * 0.8) : -(0.1 + Math.random() * 0.2); break;
          case 'swing':      profitPct = isWinFinal ? (1.5 + Math.random() * 3)   : -(0.2 + Math.random() * 0.5); break;
          case 'arbitrage':  profitPct = isWinFinal ? (0.2 + Math.random() * 0.4) : -(0.05 + Math.random() * 0.1); break;
          case 'grid':       profitPct = isWinFinal ? (0.6 + Math.random() * 1.2) : -(0.1 + Math.random() * 0.3); break;
          case 'dca':        profitPct = isWinFinal ? (0.8 + Math.random() * 2)   : -(0.15 + Math.random() * 0.3); break;
          case 'momentum':   profitPct = isWinFinal ? (2 + Math.random() * 4)     : -(0.2 + Math.random() * 0.5); break;
          default:           profitPct = isWinFinal ? 0.8 : -0.15;
        }
        profitPct *= (1 + vipBoost);
        const slPct = sub.stop_loss || 5;
        const tpPct = sub.take_profit || 10;
        if (profitPct < 0 && Math.abs(profitPct) > slPct) profitPct = -slPct;
        if (profitPct > 0 && profitPct > tpPct) profitPct = tpPct;
        // Hard cap: max loss per trade = $2
        const maxLossDollars = 2;
        if (profitPct < 0) {
          const lossDollars = Math.abs(profitPct / 100) * positionSize;
          if (lossDollars > maxLossDollars) profitPct = -(maxLossDollars / positionSize * 100);
        }

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

        // ---- SUZANA OKX SETUP ----
        if (isSuzana && !conn) {
          // Get Suzana's OKX connection directly
          const suzanaConns = await base44.asServiceRole.entities.ExchangeConnection.filter({ 
            created_by: userEmail, exchange: 'okx' 
          });
          if (suzanaConns.length === 0) {
            console.log(`[SUZANA-OKX] No OKX connection found for ${userEmail}, skipping live trading`);
            // Fall back to SIM if connection not found
          } else {
            conn = suzanaConns[0];
            console.log(`[SUZANA-OKX] Using connection: ${conn.id}`);
          }
        }



        // ---- LIVE EXECUTION ----
        if (isLive && conn) {
          try {
            if (exchange === 'binance') {
              const [keyIv, secretIv] = conn.encryption_iv.split('|');
              const apiKey = await decryptBinance(conn.api_key_encrypted, keyIv);
              const apiSecret = await decryptBinance(conn.api_secret_encrypted, secretIv);
              const binSym = toBinanceSymbol(symbol);

              console.log(`[LIVE-BINANCE] ${sub.created_by} | ${finalIsBuy ? 'BUY' : 'SELL'} ${binSym} quoteQty=${positionSize.toFixed(2)}`);
              const orderRes = await binancePlaceOrder(apiKey, apiSecret, binSym, finalIsBuy ? 'BUY' : 'SELL', positionSize);

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

              // For BUY orders: ensure we have enough USDT in Trading wallet
              // For SELL orders: ensure we have enough of the coin
              if (finalIsBuy) {
                // Try to transfer funds from Funding to Trading wallet
                let transferDone = false;
                for (const ep of ['https://www.okx.com', 'https://eea.okx.com']) {
                  const tr = await okxEnsureTradingFunds(apiKey, apiSecret, passphrase, 'USDT', positionSize, ep);
                  if (tr.code === '0' || tr.code === '58350') { transferDone = true; break; }
                }
                if (!transferDone) {
                  console.log(`[LIVE-OKX] Transfer failed, skipping BUY order`);
                  executionMode = 'SIM';
                  throw new Error('Insufficient USDT for trading');
                }
              }

              console.log(`[ROBOT-1] OKX_REQUEST: ${finalIsBuy ? 'BUY' : 'SELL'} ${instId} amount=${positionSize.toFixed(2)} USDT`);
              const orderRes = await okxPlaceOrder(apiKey, apiSecret, passphrase, instId, finalIsBuy ? 'buy' : 'sell', positionSize, currentPrice);

              if (orderRes.code === '0') {
                executionMode = 'MAINNET';
                realOrderId = orderRes.data?.[0]?.ordId;
                console.log(`[ROBOT-1] OKX_SUCCESS: ordId=${realOrderId} code=${orderRes.code}`);

                // Fetch order details to get actual fill info (try both endpoints)
                if (realOrderId) {
                  let filled = false;
                  for (const ep of ['https://www.okx.com', 'https://eea.okx.com']) {
                    try {
                      const orderDetailsPath = `/api/v5/trade/orders/${realOrderId}?instId=${instId}`;
                      const detailsRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', orderDetailsPath, '', ep);
                      if (detailsRes.code === '0' && detailsRes.data?.[0]) {
                        const orderDetail = detailsRes.data[0];
                        realQty = parseFloat(orderDetail.accFillSz || quantity);
                        realAvgPrice = orderDetail.avgPx ? parseFloat(orderDetail.avgPx) : currentPrice;
                        realFee = orderDetail.fee ? Math.abs(parseFloat(orderDetail.fee)) : (positionSize * 0.001);
                        console.log(`[LIVE-OKX] Order detail from ${ep}: qty=${realQty} avgPrice=${realAvgPrice} fee=${realFee} state=${orderDetail.state}`);
                        filled = true;
                        break;
                      }
                    } catch (e) {
                      console.log(`[LIVE-OKX] Detail fetch from ${ep} failed: ${e.message}`);
                    }
                  }
                  if (!filled) {
                    console.log(`[LIVE-OKX] Could not fetch order details, using defaults`);
                  }
                }
              } else {
                console.log(`[ROBOT-1] OKX_FAILED: code=${orderRes.code} msg=${orderRes.msg}`);
                executionMode = 'SIM';
              }
            }
          } catch (liveErr) {
            console.error(`[LIVE-EXEC] Error for ${sub.created_by}: ${liveErr.message}`);
            executionMode = 'SIM';
          }
        }

        // Calculate profit: for MAINNET SELL closing a position, use real entry vs exit price
        let profit;
        if (executionMode === 'MAINNET' && !finalIsBuy && openPosition) {
          const realPnl = (realAvgPrice - openPosition.entry_price) * openPosition.quantity;
          profit = Number(realPnl.toFixed(2));
        } else if (executionMode === 'MAINNET') {
          profit = 0; // BUY opens a position, P&L is 0 until closed
        } else {
          profit = Number(((positionSize * profitPct) / 100 - fee).toFixed(2));
        }

        // Record order
        await base44.asServiceRole.entities.Order.create({
          symbol, side: finalIsBuy ? 'BUY' : 'SELL', type: 'MARKET',
          quantity: realQty, price: realAvgPrice,
          status: 'FILLED', filled_quantity: realQty,
          average_price: realAvgPrice, total_value: Number(positionSize.toFixed(2)),
          fee: realFee, execution_mode: executionMode,
          filled_at: new Date().toISOString(),
          created_by: userEmail,
          user_email: userEmail
        });

        // If closing a position (MAINNET SELL), update the original BUY trade with exit info
        if (executionMode === 'MAINNET' && !finalIsBuy && openPosition) {
          await base44.asServiceRole.entities.Trade.update(openPosition.id, {
            exit_price: realAvgPrice,
            profit_loss: profit
          });
          console.log(`[CLOSE-POSITION] Updated BUY trade ${openPosition.id} with exit=${realAvgPrice} P&L=${profit}`);
        }

        // DO NOT write to Trade entity or update subscription stats
        // Use only real OKX filled orders from getSuzanaOrders function
        // P&L will be calculated by RealTradesSummary from BUY/SELL matching

        results.push({
          user: sub.created_by,
          exchange, executionMode,
          symbol, side: finalIsBuy ? 'BUY' : 'SELL',
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