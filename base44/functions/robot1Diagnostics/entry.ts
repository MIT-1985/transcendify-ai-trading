import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUZANA_EMAIL = 'suzana@transcendify.online';
const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];
const OKX_FEE_RATE = 0.001; // 0.1% per side
const MAX_SPREAD_PCT = 0.08;
const TAKE_PROFIT_PCT = 0.35;
const MIN_NET_PROFIT_USDT = 0.005;
const DEFAULT_TRADE_USDT = 25;
const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';

// ─── Decrypt (same as okxConnect) ─────────────────────────────────────────
async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decrypt(encryptedStr, masterSecret) {
  const key = await deriveKey(masterSecret);
  const [ivB64, dataB64] = encryptedStr.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

// ─── Sign & OKX Request ───────────────────────────────────────────────────
async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxRequest(apiKey, apiSecret, passphrase, method, path, body = '') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + (body || '');
  const signature = await sign(apiSecret, message);
  
  const res = await fetch(`https://www.okx.com${path}`, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    },
    body: body || undefined
  });
  return res.json();
}

// ─── Fetch all tickers ───────────────────────────────────────────────────
async function fetchAllTickers(apiKey, apiSecret, passphrase) {
  const tickerMap = {};
  for (const pair of ALLOWED_PAIRS) {
    const res = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/market/ticker?instId=${pair}`);
    if (res.data?.[0]) {
      tickerMap[pair] = res.data[0];
    }
  }
  return tickerMap;
}

// ─── Detailed diagnostics ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { }
    if (user && user.email !== SUZANA_EMAIL && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch OKX credentials
    const [c1, c2] = await Promise.all([
      base44.asServiceRole.entities.ExchangeConnection.filter({ created_by: SUZANA_EMAIL, exchange: 'okx' }),
      base44.asServiceRole.entities.ExchangeConnection.filter({ user_email: SUZANA_EMAIL, exchange: 'okx' })
    ]);
    const seen = new Set();
    const conns = [...c1, ...c2].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (!conns[0]) return Response.json({ error: 'No OKX connection' }, { status: 400 });

    const conn = conns[0];
    const [apiKey, apiSecret, passphrase] = await Promise.all([
      decrypt(conn.api_key_encrypted, MASTER_SECRET),
      decrypt(conn.api_secret_encrypted, MASTER_SECRET),
      decrypt(conn.encryption_iv, MASTER_SECRET)
    ]);

    // Fetch ALL tickers
    const tickerMap = await fetchAllTickers(apiKey, apiSecret, passphrase);

    // Detailed diagnostics for each pair
    const diagnostics = [];

    for (const pair of ALLOWED_PAIRS) {
      const ticker = tickerMap[pair];
      if (!ticker) {
        diagnostics.push({
          pair,
          error: 'No ticker data',
          bid: null, ask: null, last: null, mid: null,
          spreadPct: null,
          score: 0,
          tradeAllowed: false,
          rejectionReason: 'No ticker data from OKX'
        });
        continue;
      }

      const bid = parseFloat(ticker.bidPx || 0);
      const ask = parseFloat(ticker.askPx || 0);
      const last = parseFloat(ticker.last || 0);
      const open24h = parseFloat(ticker.open24h || last);
      const vol24h = parseFloat(ticker.vol24h || 0);

      // Spread: (ask - bid) / midpoint * 100
      const mid = (bid + ask) / 2;
      const spreadPct = mid > 0 ? ((ask - bid) / mid) * 100 : 99;

      // Quality score (OKX-only)
      const trendScore = last > open24h ? 40 : 20;
      const spreadScore = Math.max(0, 30 - (spreadPct * 500));
      const volumeScore = Math.min(20, (vol24h / 1000) * 20);
      const liquidityScore = bid > 0 && ask > 0 ? 10 : 0;
      const score = parseFloat((trendScore + spreadScore + volumeScore + liquidityScore).toFixed(1));

      // ─── Fee & sizing analysis ───────────────────────────────────────
      // Round-trip fee percentage (buy + sell)
      const feeRoundTripPct = (OKX_FEE_RATE * 2 * 100);

      // Effective spread after fees
      const effectiveSpreadAfterFees = parseFloat((spreadPct + feeRoundTripPct).toFixed(4));

      // ─── Profit calculation (entry at ask, exit at ask * (1 + TP%)) ───
      const entryAtAsk = ask;
      const exitAtTP = ask * (1 + TAKE_PROFIT_PCT / 100);
      const spreadCost = entryAtAsk * (spreadPct / 100);
      const buyFee = entryAtAsk * OKX_FEE_RATE;
      const sellFee = exitAtTP * OKX_FEE_RATE;
      const grossFromTP = exitAtTP - entryAtAsk;
      const trueNetProfit = grossFromTP - spreadCost - buyFee - sellFee;

      // Estimated sizing analysis
      const buyFeeAmount = DEFAULT_TRADE_USDT * OKX_FEE_RATE;
      const tpMoveAbsolute = (DEFAULT_TRADE_USDT / (1 + OKX_FEE_RATE)) * (TAKE_PROFIT_PCT / 100);
      const sellFeeAmount = (DEFAULT_TRADE_USDT + tpMoveAbsolute) * OKX_FEE_RATE;
      const totalFeesAmount = buyFeeAmount + sellFeeAmount;

      // ─── Hard filter checks ───────────────────────────────────────────
      const spreadRejects = spreadPct > MAX_SPREAD_PCT;
      const scoreRejects = score < 25;
      const profitRejects = trueNetProfit < MIN_NET_PROFIT_USDT;

      let rejectionReason = '';
      if (spreadRejects) rejectionReason += `spread ${spreadPct.toFixed(6)}% > max ${MAX_SPREAD_PCT}% | `;
      if (scoreRejects) rejectionReason += `score ${score.toFixed(1)} < 25 | `;
      if (profitRejects) rejectionReason += `trueNet ${trueNetProfit.toFixed(8)} < min ${MIN_NET_PROFIT_USDT} | `;
      if (!rejectionReason) rejectionReason = 'OK - TRADE ALLOWED';

      diagnostics.push({
        // Raw OKX data
        pair,
        bid: parseFloat(bid.toFixed(8)),
        ask: parseFloat(ask.toFixed(8)),
        last: parseFloat(last.toFixed(8)),
        mid: parseFloat(mid.toFixed(8)),
        
        // Spread analysis
        spreadPct: parseFloat(spreadPct.toFixed(6)),
        maxAllowedSpreadPct: MAX_SPREAD_PCT,
        spreadRejectsHardFilter: spreadRejects,
        
        // Fee analysis (for $25 trade)
        estimatedRoundTripFees: parseFloat(totalFeesAmount.toFixed(8)),
        feeRoundTripPercent: parseFloat(feeRoundTripPct.toFixed(4)),
        effectiveSpreadAfterFees,
        
        // Profit analysis
        estimatedNetProfitAtTP: parseFloat(tpMoveAbsolute.toFixed(8)),
        trueExpectedNetProfit: parseFloat(trueNetProfit.toFixed(8)),
        minNetRequired: MIN_NET_PROFIT_USDT,
        profitRejectsViability: profitRejects,
        
        // Quality score
        score: score,
        minScoreRequired: 25,
        scoreRejects: scoreRejects,
        
        // Decision
        tradeAllowed: !spreadRejects && !scoreRejects && !profitRejects,
        rejectionReason: rejectionReason.slice(0, -3) || 'OK - TRADE ALLOWED'
      });
    }

    const allowedCount = diagnostics.filter(d => d.tradeAllowed).length;

    return Response.json({
      timestamp: new Date().toISOString(),
      config: {
        balanceMode: 'SMALL',
        DEFAULT_TRADE_USDT,
        TAKE_PROFIT_PCT: `${TAKE_PROFIT_PCT}%`,
        MAX_SPREAD_PCT: `${MAX_SPREAD_PCT}%`,
        MIN_NET_PROFIT_USDT,
        OKX_FEE_RATE: `${(OKX_FEE_RATE * 100).toFixed(2)}% per side`
      },
      summary: {
        totalPairs: ALLOWED_PAIRS.length,
        tradeAllowed: allowedCount,
        tradeBlocked: ALLOWED_PAIRS.length - allowedCount
      },
      diagnostics
    });
  } catch (err) {
    console.error(`[DIAG] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});