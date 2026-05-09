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

        const tradingPairs = sub.trading_pairs || ['X:BTCUSD'];
        const symbol = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        const capital = sub.capital_allocated || 1000;
        // Scalping: small position sizes for fast frequent trades, min $5 (OKX minimum)
        const maxPos = bot.strategy === 'scalping' ? 0.05 : 0.10;
        const positionSize = Math.max(5, Math.min(capital * maxPos, 15)); // $5–$15 per trade

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

        // Check for open BUY position (last trade for this sub with no exit_price)
        const recentTrades = await base44.asServiceRole.entities.Trade.filter({ subscription_id: sub.id });
        const openPositions = recentTrades.filter(t => t.side === 'BUY' && !t.exit_price && t.execution_mode === 'MAINNET');
        const openPosition = openPositions[0] || null;

        // Scalping: alternate BUY/SELL rapidly. If open position → SELL, else BUY
        const { signal, confidence } = calcSignal(candles, currentPrice, sub.stop_loss, sub.take_profit);
        // Force more trades: if last trade was BUY (SIM), flip to SELL
        const lastTrade = recentTrades[0];
        const lastWasBuy = lastTrade?.side === 'BUY';
        const isBuy = (exchange?.toLowerCase() === 'okx' && isLive) ? true : (openPosition ? false : (lastWasBuy ? false : true));
        const isWin = Math.random() < confidence; // base signal confidence

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

        // ---- CHECK REAL BALANCE FOR ADAPTIVE BUY/SELL ----
        let hasUsdt = false;
        let hasAsset = false;
        let adaptiveIsBuy = isBuy; // Default to the calculated isBuy
        
        if (isSuzana && isLive && exchange?.toLowerCase() === 'okx' && conn) {
          try {
            const apiKey = await decryptOkx(conn.api_key_encrypted);
            const apiSecret = await decryptOkx(conn.api_secret_encrypted);
            const passphrase = await decryptOkx(conn.encryption_iv);
            
            // Get account balance from OKX - structure: {data: [{details: [{ccy, availBal, frozenBal}]}]}
            const balResPath = '/api/v5/account/balance';
            let balanceDetails = null;
            for (const ep of ['https://www.okx.com', 'https://eea.okx.com']) {
              try {
                const br = await okxRequest(apiKey, apiSecret, passphrase, 'GET', balResPath, '', ep);
                if (br.code === '0' && br.data?.[0]?.details) { 
                  balanceDetails = br.data[0].details; // Extract the details array
                  break; 
                }
              } catch (e) {}
            }
            
            if (balanceDetails) {
              // Check USDT balance from details array
              const usdtBal = balanceDetails.find(d => d.ccy === 'USDT');
              const usdtTotal = usdtBal ? (parseFloat(usdtBal.availBal) || 0) + (parseFloat(usdtBal.frozenBal) || 0) : 0;
              hasUsdt = usdtTotal > positionSize;
              
              // Check asset balance from details array
              const assetCode = instIdForPrice.split('-')[0];
              const assetBal = balanceDetails.find(d => d.ccy === assetCode);
              const assetAvail = assetBal ? parseFloat(assetBal.availBal) || 0 : 0;
              hasAsset = assetAvail > 0.0001;
              
              // Adaptive decision: if have asset AND open position → SELL, else if have USDT → BUY
              if (hasAsset && openPosition) {
                adaptiveIsBuy = false; // Sell the asset to close position
              } else if (hasUsdt) {
                adaptiveIsBuy = true;  // Buy more
              } else {
                console.log(`[SKIP-TRADE] Insufficient balance: USDT=${usdtTotal.toFixed(2)}, ${assetCode}=${assetAvail.toFixed(6)}`);
                continue;
              }
              
              console.log(`[ADAPTIVE] ${assetCode}: adapt=${!adaptiveIsBuy ? 'SELL' : 'BUY'} | USDT=${usdtTotal.toFixed(2)} | Asset=${assetAvail.toFixed(6)}`);
            }
          } catch (e) {
            console.log(`[BALANCE-CHECK] Error: ${e.message}`);
          }
        }
        
        // Use adaptive isBuy for OKX live, else use calculated
        const finalIsBuy = (isSuzana && isLive && exchange?.toLowerCase() === 'okx') ? adaptiveIsBuy : isBuy;

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

              console.log(`[LIVE-OKX] ${userEmail} | ${finalIsBuy ? 'buy' : 'sell'} ${instId} usdtAmt=${positionSize.toFixed(2)}`);
              const orderRes = await okxPlaceOrder(apiKey, apiSecret, passphrase, instId, finalIsBuy ? 'buy' : 'sell', positionSize, currentPrice);

              if (orderRes.code === '0') {
                executionMode = 'MAINNET';
                realOrderId = orderRes.data?.[0]?.ordId;
                console.log(`[LIVE-OKX] Placed ordId=${realOrderId}`);

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
                console.error(`[LIVE-OKX] Order failed: ${orderRes.msg}`);
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

        // Record trade
        await base44.asServiceRole.entities.Trade.create({
          subscription_id: sub.id,
          symbol, side: finalIsBuy ? 'BUY' : 'SELL',
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

        // Update subscription stats — for live users only count real MAINNET trades
        // SIM profits/losses for users with a live connection are NOT counted (they're not real)
        const countProfit = isLive ? (executionMode === 'MAINNET' ? profit : 0) : profit;
        const newProfit = (sub.total_profit || 0) + countProfit;
        const newTrades = (sub.total_trades || 0) + 1;
        await base44.asServiceRole.entities.UserSubscription.update(sub.id, {
          total_profit: Number(newProfit.toFixed(2)),
          total_trades: newTrades
        });

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