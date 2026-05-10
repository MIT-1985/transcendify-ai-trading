/**
 * Robot 1 — Scalping Mode
 * Tight TP/SL with trailing stop, fee-adjusted net profit check, cooldown enforcement.
 * USDT → COIN → USDT cycle only. No simulation, no fake trades.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Scalping Constants ────────────────────────────────────────────────────────
const SUZANA_EMAIL = 'nikitasuziface77@gmail.com';
const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

const TRADE_AMOUNT_USDT    = 15;      // USDT per scalp trade
const MAX_POSITION_PCT     = 0.25;    // max 25% of freeUSDT in one trade
const MIN_FREE_USDT        = 12;      // minimum to enter new position
const TAKE_PROFIT_PCT        = 0.18;   // 0.18% standard TP
const STOP_LOSS_PCT          = -0.18;  // -0.18% SL
const TRAILING_STOP_PCT      = 0.06;   // standard trail from peak (when >= TP)
const MICRO_TRAIL_ENTER_PCT  = 0.07;   // activate micro-trail when pnl >= this
const MICRO_TRAIL_PEAK_PCT   = 0.08;   // require bestPnl >= this before trailing
const MICRO_TRAIL_DROP_PCT   = 0.04;   // sell if price drops 0.04% from best
const MIN_NET_PROFIT_USDT    = 0.02;   // minimum net profit after fees to trigger SELL
const MAX_SPREAD_PCT       = 0.08;    // tight spread gate
const OKX_FEE_RATE         = 0.001;   // 0.1% taker per side
const MAX_POSITIONS        = 2;
const COOLDOWN_SECONDS     = 30;      // cooldown after any sell

// ─── OKX auth helpers ─────────────────────────────────────────────────────────
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

// ─── Fetch all tickers ────────────────────────────────────────────────────────
async function fetchAllTickers(apiKey, secret, passphrase) {
  const results = await Promise.all(
    ALLOWED_PAIRS.map(pair =>
      okxRequest(apiKey, secret, passphrase, 'GET', `/api/v5/market/ticker?instId=${pair}`)
        .then(r => ({ pair, ticker: r.data?.[0] || null }))
        .catch(() => ({ pair, ticker: null }))
    )
  );
  const map = {};
  for (const { pair, ticker } of results) map[pair] = ticker;
  return map;
}

// ─── Get active Robot1 positions from OXXOrderLedger (FIFO) ──────────────────
async function getActivePositions(base44) {
  const all = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', verified: true });
  const sorted = all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const buyStack = {};
  const buyRecords = {}; // keep full record for bestPnlPct + id
  for (const ord of sorted) {
    if (!ALLOWED_PAIRS.includes(ord.instId)) continue;
    if (!buyStack[ord.instId]) { buyStack[ord.instId] = []; buyRecords[ord.instId] = []; }
    if (ord.side === 'buy') {
      buyStack[ord.instId].push({ ordId: ord.ordId, avgPx: ord.avgPx, accFillSz: ord.accFillSz, fee: ord.fee, timestamp: ord.timestamp });
      buyRecords[ord.instId].push(ord); // full record with id + bestPnlPct
    } else if (ord.side === 'sell' && buyStack[ord.instId].length > 0) {
      buyStack[ord.instId].shift();
      buyRecords[ord.instId].shift();
    }
  }
  const active = [];
  for (const inst of ALLOWED_PAIRS) {
    const stack = buyStack[inst] || [];
    if (stack.length > 0) {
      const b = stack[0];
      const rec = buyRecords[inst][0];
      active.push({
        instId: inst, qty: b.accFillSz, entryPrice: b.avgPx,
        buyOrdId: b.ordId, buyTimestamp: b.timestamp, buyFee: Math.abs(b.fee),
        ledgerId: rec.id,            // entity record id for update
        bestPnlPct: rec.bestPnlPct ?? 0  // persisted peak pnl
      });
    }
  }
  return active;
}

// ─── Save to OXXOrderLedger ───────────────────────────────────────────────────
async function saveToLedger(base44, fill) {
  const existing = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: fill.ordId });
  if (existing.length > 0) return;
  await base44.asServiceRole.entities.OXXOrderLedger.create({
    ordId: fill.ordId, instId: fill.instId, side: fill.side,
    avgPx: fill.avgPx, accFillSz: fill.accFillSz,
    quoteUSDT: fill.avgPx * fill.accFillSz,
    fee: Math.abs(fill.fee), feeCcy: fill.feeCcy || 'USDT',
    timestamp: fill.timestamp || new Date().toISOString(),
    robotId: 'robot1', verified: true, state: 'filled'
  });
}

// ─── Create VerifiedTrade ─────────────────────────────────────────────────────
async function saveVerifiedTrade(base44, buyOrd, sellOrd) {
  const existing = await base44.asServiceRole.entities.VerifiedTrade.filter({ sellOrdId: sellOrd.ordId });
  if (existing.length > 0) return;
  const buyValue = buyOrd.avgPx * buyOrd.accFillSz;
  const buyFee = Math.abs(buyOrd.fee);
  const sellValue = sellOrd.avgPx * sellOrd.accFillSz;
  const sellFee = Math.abs(sellOrd.fee);
  const realizedPnL = (sellValue - sellFee) - (buyValue + buyFee);
  await base44.asServiceRole.entities.VerifiedTrade.create({
    robotId: 'robot1', instId: buyOrd.instId,
    buyOrdId: buyOrd.ordId, sellOrdId: sellOrd.ordId,
    buyPrice: buyOrd.avgPx, buyQty: buyOrd.accFillSz, buyValue, buyFee,
    sellPrice: sellOrd.avgPx, sellQty: sellOrd.accFillSz, sellValue, sellFee,
    realizedPnL: parseFloat(realizedPnL.toFixed(4)),
    realizedPnLPct: parseFloat(((realizedPnL / (buyValue + buyFee)) * 100).toFixed(3)),
    buyTime: buyOrd.timestamp, sellTime: sellOrd.timestamp,
    holdingMs: new Date(sellOrd.timestamp).getTime() - new Date(buyOrd.timestamp).getTime(),
    status: 'closed'
  });
  console.log(`[SCALP] VerifiedTrade: PnL=${realizedPnL.toFixed(4)} USDT`);
}

// ─── Execute SELL ─────────────────────────────────────────────────────────────
async function executeSell(base44, apiKey, apiSecret, passphrase, pos, reason) {
  const sellBody = JSON.stringify({ instId: pos.instId, tdMode: 'cash', side: 'sell', ordType: 'market', sz: pos.qty.toString() });
  const sellRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', sellBody);
  if (sellRes.code !== '0') {
    console.error(`[SCALP] SELL rejected ${pos.instId}: ${sellRes.msg}`);
    return { ok: false, errMsg: sellRes.msg };
  }
  const sellOrdId = sellRes.data?.[0]?.ordId;
  await new Promise(r => setTimeout(r, 600));
  const verifyRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${pos.instId}&ordId=${sellOrdId}`);
  const fill = verifyRes.data?.[0];
  if (!fill || fill.state !== 'filled') {
    console.error(`[SCALP] SELL verify failed: ordId=${sellOrdId} state=${fill?.state}`);
    return { ok: false, errMsg: `Verify failed state=${fill?.state}` };
  }
  const sellFill = {
    ordId: sellOrdId, instId: pos.instId, side: 'sell',
    avgPx: parseFloat(fill.avgPx || 0), accFillSz: parseFloat(fill.accFillSz || 0),
    fee: parseFloat(fill.fee || 0), feeCcy: fill.feeCcy || 'USDT',
    timestamp: new Date(parseInt(fill.fillTime || fill.uTime || Date.now())).toISOString()
  };
  await saveToLedger(base44, sellFill);
  const buyLedger = await base44.asServiceRole.entities.OXXOrderLedger.filter({ ordId: pos.buyOrdId });
  if (buyLedger[0]) await saveVerifiedTrade(base44, buyLedger[0], sellFill);
  console.log(`[SCALP] SELL DONE ${pos.instId} ordId=${sellOrdId} px=${sellFill.avgPx} reason=${reason}`);
  return { ok: true, sellFill, sellOrdId, reason };
}

// ─── Check cooldown: no sell of same pair within COOLDOWN_SECONDS ─────────────
async function isInCooldown(base44, pair) {
  const recent = await base44.asServiceRole.entities.OXXOrderLedger.filter({ robotId: 'robot1', instId: pair, side: 'sell' });
  if (!recent.length) return false;
  const lastSell = recent.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  const secondsSince = (Date.now() - new Date(lastSell.timestamp).getTime()) / 1000;
  return secondsSince < COOLDOWN_SECONDS;
}

// ─── Fee-adjusted net profit check ───────────────────────────────────────────
function expectedNetProfit(entryPrice, qty, tpPct) {
  const targetPrice = entryPrice * (1 + tpPct / 100);
  const grossProfit = (targetPrice - entryPrice) * qty;
  const buyFee = entryPrice * qty * OKX_FEE_RATE;
  const sellFee = targetPrice * qty * OKX_FEE_RATE;
  return grossProfit - buyFee - sellFee;
}

// ─── Score pair for scalping (simplified: spread + momentum only) ─────────────
function scalpScore(pair, ticker) {
  if (!ticker) return { ok: false, reason: 'no ticker' };
  const bid = parseFloat(ticker.bidPx || 0);
  const ask = parseFloat(ticker.askPx || 0);
  const last = parseFloat(ticker.last || 0);
  const open24h = parseFloat(ticker.open24h || last);
  const spreadPct = bid > 0 ? (ask - bid) / bid * 100 : 99;

  if (spreadPct > MAX_SPREAD_PCT) return { ok: false, reason: `spread ${spreadPct.toFixed(4)}% > ${MAX_SPREAD_PCT}%` };

  const trend24h = last > open24h; // simple 24h trend gate
  if (!trend24h) return { ok: false, reason: `24h trend negative (last=${last} open24h=${open24h})` };

  // Volume spike check using vol24h
  const vol24h = parseFloat(ticker.vol24h || 0);
  if (vol24h < 100) return { ok: false, reason: `volume too low (vol24h=${vol24h})` };

  return { ok: true, spreadPct, last, bid, ask };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  let base44;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.email !== SUZANA_EMAIL && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[SCALP] === SCALP EXECUTION START ===');

    // 1. OKX credentials
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

    // 2. Fetch tickers + balance + active positions
    const [tickerMap, balRes, activePositions] = await Promise.all([
      fetchAllTickers(apiKey, apiSecret, passphrase),
      okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance'),
      getActivePositions(base44)
    ]);

    const details = balRes.data?.[0]?.details || [];
    const freeUsdt = parseFloat(details.find(d => d.ccy === 'USDT')?.availBal || 0);
    const activePairSet = new Set(activePositions.map(p => p.instId));

    console.log(`[SCALP] freeUSDT=${freeUsdt.toFixed(2)} positions=${activePositions.length}/${MAX_POSITIONS}`);

    const sellResults = [];

    // 3. SELL pass — ALWAYS check active positions FIRST before any BUY logic
    // Exit modes (in priority order):
    //   TP          — pnlPct >= 0.18% AND netProfit >= 0.02
    //   SL          — pnlPct <= -0.18% (no net check)
    //   TRAIL       — pnlPct >= (TP - 0.06%) and < TP AND netProfit >= 0.02
    //   MICRO_TRAIL — pnlPct in [0.07%, 0.18%), bestPnlPct >= 0.08%, and
    //                 pnlPct has dropped >= 0.04% from bestPnlPct AND netProfit >= 0.02
    //   WAIT        — none of the above
    const sellDetails = []; // per-position diagnostic for response

    for (const pos of activePositions) {
      const ticker = tickerMap[pos.instId];
      if (!ticker) { console.log(`[SCALP] ${pos.instId}: no ticker, skipping`); continue; }

      const currentPrice = parseFloat(ticker.last || 0);
      const pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice * 100;
      const grossProfit = (currentPrice - pos.entryPrice) * pos.qty;
      const buyFee = pos.buyFee || pos.entryPrice * pos.qty * OKX_FEE_RATE;
      const sellFee = currentPrice * pos.qty * OKX_FEE_RATE;
      const estimatedFees = buyFee + sellFee;
      const netProfit = grossProfit - estimatedFees;

      // Update bestPnlPct if current pnl is a new high
      const prevBest = pos.bestPnlPct ?? 0;
      const newBest = Math.max(prevBest, pnlPct);
      if (newBest > prevBest && pos.ledgerId) {
        try {
          await base44.asServiceRole.entities.OXXOrderLedger.update(pos.ledgerId, { bestPnlPct: parseFloat(newBest.toFixed(6)) });
        } catch (e) { console.error(`[SCALP] bestPnlPct update failed: ${e.message}`); }
      }

      const trailingDistance = parseFloat((newBest - pnlPct).toFixed(4));
      const microTrailingActive = pnlPct >= MICRO_TRAIL_ENTER_PCT && pnlPct < TAKE_PROFIT_PCT;

      console.log(`[SCALP] ${pos.instId}: entry=${pos.entryPrice} cur=${currentPrice} pnlPct=${pnlPct.toFixed(4)}% bestPnl=${newBest.toFixed(4)}% trailDist=${trailingDistance}% gross=${grossProfit.toFixed(4)} fees=${estimatedFees.toFixed(4)} net=${netProfit.toFixed(4)} USDT`);

      const hitTP    = pnlPct >= TAKE_PROFIT_PCT && netProfit >= MIN_NET_PROFIT_USDT;
      const hitSL    = pnlPct <= STOP_LOSS_PCT;
      const hitTrail = pnlPct >= (TAKE_PROFIT_PCT - TRAILING_STOP_PCT) && pnlPct < TAKE_PROFIT_PCT && netProfit >= MIN_NET_PROFIT_USDT;
      const hitMicroTrail = microTrailingActive
        && newBest >= MICRO_TRAIL_PEAK_PCT
        && trailingDistance >= MICRO_TRAIL_DROP_PCT
        && netProfit >= MIN_NET_PROFIT_USDT;

      const shouldSell = hitTP || hitSL || hitTrail || hitMicroTrail;

      // Determine exit mode for diagnostics
      let exitMode = 'WAIT';
      if (hitTP)         exitMode = 'TP';
      else if (hitSL)    exitMode = 'SL';
      else if (hitTrail) exitMode = 'TRAIL';
      else if (hitMicroTrail) exitMode = 'MICRO_TRAIL';
      else if (netProfit < MIN_NET_PROFIT_USDT && pnlPct > 0) exitMode = 'WAIT_NET_TOO_LOW';

      console.log(`[SCALP] ${pos.instId}: exitMode=${exitMode} hitTP=${hitTP} hitSL=${hitSL} hitTrail=${hitTrail} hitMicroTrail=${hitMicroTrail} microTrailingActive=${microTrailingActive}`);

      const diag = {
        pair: pos.instId,
        entryPx: pos.entryPrice,
        currentPx: currentPrice,
        pnlPercent: parseFloat(pnlPct.toFixed(4)),
        grossPnL: parseFloat(grossProfit.toFixed(4)),
        estimatedFees: parseFloat(estimatedFees.toFixed(4)),
        netPnL: parseFloat(netProfit.toFixed(4)),
        bestPnlPercent: parseFloat(newBest.toFixed(4)),
        trailingDistance: trailingDistance,
        microTrailingActive,
        exitMode,
        buyOrdId: pos.buyOrdId
      };
      sellDetails.push(diag);

      if (shouldSell) {
        const reason = hitTP    ? `TP: pnl=${pnlPct.toFixed(4)}% net=${netProfit.toFixed(4)}USDT`
                     : hitSL    ? `SL: pnl=${pnlPct.toFixed(4)}%`
                     : hitTrail ? `TRAIL: pnl=${pnlPct.toFixed(4)}% net=${netProfit.toFixed(4)}USDT`
                     : `MICRO_TRAIL: bestPnl=${newBest.toFixed(4)}% drop=${trailingDistance}% net=${netProfit.toFixed(4)}USDT`;
        const sr = await executeSell(base44, apiKey, apiSecret, passphrase, pos, reason);
        sellResults.push({ ...diag, ...sr });
      }
    }

    // 4. BUY pass: only attempt if NO active positions remain after sells
    const posNow = await getActivePositions(base44);
    const activePairNow = new Set(posNow.map(p => p.instId));
    let buyResult = null;

    // If there are still active positions → do not BUY, wait for next cycle to sell
    if (posNow.length > 0) {
      const holdingStr = posNow.map(p => {
        const t = tickerMap[p.instId];
        const cur = t ? parseFloat(t.last || 0) : 0;
        const pct = cur ? ((cur - p.entryPrice) / p.entryPrice * 100).toFixed(4) : '?';
        return `${p.instId} @${p.entryPrice} cur=${cur} pnl=${pct}%`;
      }).join(' | ');
      console.log(`[SCALP] WAIT — active position: ${holdingStr}. Waiting for TP/SL.`);
      buyResult = { decision: 'WAIT_ACTIVE_POSITION', reason: `Holding: ${holdingStr}` };
    } else if (freeUsdt < MIN_FREE_USDT) {
      console.log(`[SCALP] WAIT: freeUSDT=${freeUsdt.toFixed(2)} < min=${MIN_FREE_USDT}`);
    } else {
      // Score all pairs, filter eligibility
      const candidates = [];
      for (const pair of ALLOWED_PAIRS) {
        if (activePairNow.has(pair)) continue; // already holding
        const score = scalpScore(pair, tickerMap[pair]);
        if (!score.ok) { console.log(`[SCALP] SKIP ${pair}: ${score.reason}`); continue; }

        // Cooldown check
        const cooled = await isInCooldown(base44, pair);
        if (cooled) { console.log(`[SCALP] SKIP ${pair}: cooldown active (<${COOLDOWN_SECONDS}s since last sell)`); continue; }

        // Fee-adjusted profit check
        const tradeQty = Math.min(TRADE_AMOUNT_USDT, freeUsdt * MAX_POSITION_PCT) / score.last;
        const netExpected = expectedNetProfit(score.last, tradeQty, TAKE_PROFIT_PCT);
        if (netExpected < MIN_NET_PROFIT_USDT) {
          console.log(`[SCALP] SKIP ${pair}: expected net profit ${netExpected.toFixed(5)} < ${MIN_NET_PROFIT_USDT}`);
          continue;
        }

        candidates.push({ pair, ...score, tradeQty, netExpected });
      }

      if (candidates.length === 0) {
        console.log('[SCALP] WAIT: no eligible candidates');
      } else {
        // Pick lowest spread (best liquidity for scalping)
        const best = candidates.sort((a, b) => a.spreadPct - b.spreadPct)[0];
        const buyUsdtAmount = parseFloat(Math.min(TRADE_AMOUNT_USDT, freeUsdt * MAX_POSITION_PCT).toFixed(2));

        console.log(`[SCALP] BUY ${best.pair} spread=${best.spreadPct.toFixed(4)}% netExpected=${best.netExpected.toFixed(5)} USDT amount=${buyUsdtAmount}`);

        const buyBody = JSON.stringify({
          instId: best.pair, tdMode: 'cash', side: 'buy',
          ordType: 'market', sz: buyUsdtAmount.toString(), tgtCcy: 'quote_ccy'
        });
        const buyRes = await okxRequest(apiKey, apiSecret, passphrase, 'POST', '/api/v5/trade/order', buyBody);

        if (buyRes.code !== '0') {
          const errMsg = `BUY rejected (${best.pair}): ${buyRes.msg}`;
          console.error(`[SCALP] ${errMsg}`);
          buyResult = { decision: 'BUY_FAILED', reason: errMsg };
        } else {
          const buyOrdId = buyRes.data?.[0]?.ordId;
          await new Promise(r => setTimeout(r, 600));
          const verify = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/trade/order?instId=${best.pair}&ordId=${buyOrdId}`);
          const bf = verify.data?.[0];
          if (!bf || bf.state !== 'filled') {
            buyResult = { decision: 'BUY_UNVERIFIED', ordId: buyOrdId, state: bf?.state };
          } else {
            const buyFill = {
              ordId: buyOrdId, instId: best.pair, side: 'buy',
              avgPx: parseFloat(bf.avgPx || 0), accFillSz: parseFloat(bf.accFillSz || 0),
              fee: parseFloat(bf.fee || 0), feeCcy: bf.feeCcy || 'USDT',
              timestamp: new Date(parseInt(bf.fillTime || bf.uTime || Date.now())).toISOString()
            };
            await saveToLedger(base44, buyFill);
            console.log(`[SCALP] BUY EXECUTED ${best.pair} ordId=${buyOrdId} qty=${buyFill.accFillSz} px=${buyFill.avgPx} usdt=${buyUsdtAmount}`);
            buyResult = {
              decision: 'BUY_EXECUTED', pair: best.pair, ordId: buyOrdId,
              usedUSDT: buyUsdtAmount, avgPx: buyFill.avgPx, qty: buyFill.accFillSz,
              expectedNetProfit: best.netExpected
            };
          }
        }
      }
    }

    const finalPositions = await getActivePositions(base44);
    return Response.json({
      mode: 'scalp',
      freeUsdt,
      positionCount: finalPositions.length,
      maxPositions: MAX_POSITIONS,
      positionDiagnostics: sellDetails,   // full per-position detail incl. exitMode
      activePositions: finalPositions.map(p => ({
        instId: p.instId, qty: p.qty, entryPrice: p.entryPrice,
        currentPrice: parseFloat(tickerMap[p.instId]?.last || 0),
        pnlPct: parseFloat(((parseFloat(tickerMap[p.instId]?.last || p.entryPrice) - p.entryPrice) / p.entryPrice * 100).toFixed(3))
      })),
      sells: sellResults,
      buy: buyResult,
      config: { TAKE_PROFIT_PCT, STOP_LOSS_PCT, TRAILING_STOP_PCT, MICRO_TRAIL_ENTER_PCT, MICRO_TRAIL_PEAK_PCT, MICRO_TRAIL_DROP_PCT, MIN_NET_PROFIT_USDT, MAX_SPREAD_PCT, COOLDOWN_SECONDS, TRADE_AMOUNT_USDT },
      note: 'SELL always first. MICRO_TRAIL fires if pnl in [0.07,0.18), bestPnl>=0.08%, drop>=0.04%, net>=0.02.'
    });

  } catch (err) {
    console.error(`[SCALP] Exception: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});