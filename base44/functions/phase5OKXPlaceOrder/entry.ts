import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// PHASE 5 — OKX PLACE REAL ORDER (MANUAL CONFIRM ONLY)
// ============================================================
// This function places ONE real BTC-USDT market order on OKX.
// It will ONLY execute if ALL of the following are true:
//   1. user.role === 'admin'
//   2. payload.manualConfirmCode === 'I_CONFIRM_REAL_BTC_TEST_TRADE'
//   3. payload.sizeUSDT <= 10 (max test size)
//   4. payload.sizeUSDT >= 1 (min sanity check)
//   5. payload.side === 'buy' (buy only for test)
//   6. No existing open real trades in PaperTrade with phase PHASE_5
//
// It will NEVER:
//   - Trade ETH/SOL/DOGE/XRP
//   - Auto-repeat
//   - Trade more than 1 open position at a time
//   - Execute without explicit manualConfirmCode
// ============================================================

const SAFETY = {
  realTradeAllowed:        false, // flipped to true only inside the guarded block below
  autoTradingAllowed:      false,
  manualConfirmRequired:   true,
  maxTestSizeUSDT:         10,
  minTestSizeUSDT:         1,
  allowedPair:             'BTC-USDT',
  allowedSide:             'buy',
  phase:                   'PHASE_5_MANUAL_REAL_TEST',
  noAutoRepeat:            true,
  maxOpenRealTrades:       1,
};

const REQUIRED_CONFIRM_CODE = 'I_CONFIRM_REAL_BTC_TEST_TRADE';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { manualConfirmCode, sizeUSDT, side, tpPercent, slPercent } = body;

  console.log(`[PHASE5_PLACE_ORDER] requested by ${user.email} — confirmCode=${manualConfirmCode} sizeUSDT=${sizeUSDT} side=${side}`);

  // ── Guard 1: confirm code ────────────────────────────────────
  if (manualConfirmCode !== REQUIRED_CONFIRM_CODE) {
    return Response.json({
      ...SAFETY,
      executed: false,
      error: 'MISSING_CONFIRM_CODE',
      message: 'You must pass manualConfirmCode = "I_CONFIRM_REAL_BTC_TEST_TRADE" to execute.',
      tip: 'This is intentional — prevents accidental execution.',
    }, { status: 400 });
  }

  // ── Guard 2: pair ────────────────────────────────────────────
  if (side !== SAFETY.allowedSide) {
    return Response.json({ ...SAFETY, executed: false, error: 'INVALID_SIDE', message: 'Only buy side allowed for Phase 5 test.' }, { status: 400 });
  }

  // ── Guard 3: size limits ─────────────────────────────────────
  const sz = parseFloat(sizeUSDT);
  if (!sz || sz < SAFETY.minTestSizeUSDT || sz > SAFETY.maxTestSizeUSDT) {
    return Response.json({ ...SAFETY, executed: false, error: 'INVALID_SIZE', message: `Size must be between ${SAFETY.minTestSizeUSDT} and ${SAFETY.maxTestSizeUSDT} USDT.` }, { status: 400 });
  }

  // ── Guard 4: no existing open Phase 5 real trades ────────────
  const openTrades = await base44.asServiceRole.entities.PaperTrade.filter({
    phase: SAFETY.phase,
    status: 'OPEN',
    instId: SAFETY.allowedPair,
  });
  if (openTrades.length >= SAFETY.maxOpenRealTrades) {
    return Response.json({ ...SAFETY, executed: false, error: 'MAX_OPEN_TRADES_REACHED', message: `Already ${openTrades.length} open real trade(s). Close existing before opening another.` }, { status: 400 });
  }

  // ── Fetch live BTC price (read-only ticker) ──────────────────
  let lastPrice = null;
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
    const d = await r.json();
    lastPrice = parseFloat(d?.data?.[0]?.last ?? 0) || null;
  } catch (e) {
    return Response.json({ ...SAFETY, executed: false, error: 'PRICE_FETCH_FAILED', message: e.message }, { status: 500 });
  }

  if (!lastPrice) {
    return Response.json({ ...SAFETY, executed: false, error: 'PRICE_UNAVAILABLE' }, { status: 500 });
  }

  // ── OKX API credentials ──────────────────────────────────────
  const OKX_API_KEY    = Deno.env.get('OKX_API_KEY');
  const OKX_SECRET_KEY = Deno.env.get('OKX_SECRET_KEY');
  const OKX_PASSPHRASE = Deno.env.get('OKX_PASSPHRASE');

  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
    return Response.json({
      ...SAFETY,
      executed: false,
      error: 'OKX_CREDENTIALS_NOT_SET',
      message: 'OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE secrets must be set before executing a real trade.',
      tip: 'Set them in app secrets, then retry.',
    }, { status: 500 });
  }

  // ── Build order params ───────────────────────────────────────
  const qty = (sz / lastPrice).toFixed(6); // BTC quantity
  const tp  = tpPercent || 1.30;
  const sl  = slPercent || 0.65;
  const tpPrice = (lastPrice * (1 + tp / 100)).toFixed(2);
  const slPrice = (lastPrice * (1 - sl / 100)).toFixed(2);
  const clOrdId = `P5_${Date.now()}`;

  // ── OKX signature helper ─────────────────────────────────────
  const timestamp = new Date().toISOString();
  const method = 'POST';
  const path = '/api/v5/trade/order';
  const orderBody = JSON.stringify({
    instId: SAFETY.allowedPair,
    tdMode: 'cash',
    side:   SAFETY.allowedSide,
    ordType:'market',
    sz:     qty,
    clOrdId,
    tpTriggerPx: tpPrice,
    tpOrdPx:     '-1',
    slTriggerPx: slPrice,
    slOrdPx:     '-1',
  });

  const preSign = timestamp + method + path + orderBody;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(OKX_SECRET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(preSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // ── Place order on OKX ───────────────────────────────────────
  let okxResponse = null;
  try {
    const r = await fetch(`https://www.okx.com${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':        'application/json',
        'OK-ACCESS-KEY':       OKX_API_KEY,
        'OK-ACCESS-SIGN':      signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
      },
      body: orderBody,
    });
    okxResponse = await r.json();
  } catch (e) {
    return Response.json({ ...SAFETY, executed: false, error: 'OKX_REQUEST_FAILED', message: e.message }, { status: 500 });
  }

  const orderId = okxResponse?.data?.[0]?.ordId;
  const okxCode = okxResponse?.code;

  if (okxCode !== '0' || !orderId) {
    console.error(`[PHASE5_PLACE_ORDER] OKX rejected: code=${okxCode} msg=${okxResponse?.msg}`);
    return Response.json({
      ...SAFETY,
      executed: false,
      error: 'OKX_ORDER_REJECTED',
      okxCode,
      okxMsg: okxResponse?.msg,
      okxResponse,
    }, { status: 400 });
  }

  // ── Record trade in PaperTrade entity ────────────────────────
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  const trade = await base44.asServiceRole.entities.PaperTrade.create({
    instId:         SAFETY.allowedPair,
    side:           SAFETY.allowedSide,
    entryPrice:     lastPrice,
    sizeUSDT:       sz,
    qty:            parseFloat(qty),
    tpPrice:        parseFloat(tpPrice),
    slPrice:        parseFloat(slPrice),
    tpPercent:      tp,
    slPercent:      sl,
    status:         'OPEN',
    phase:          SAFETY.phase,
    engineMode:     'PHASE_5_MANUAL_REAL_TEST_MODE',
    openedAt:       now,
    expiresAt,
    reason:         `MANUAL_REAL_TEST ordId=${orderId} confirmedBy=${user.email}`,
    signalScore:    body.signalScore || null,
  });

  console.log(`[PHASE5_PLACE_ORDER] ✅ REAL ORDER PLACED ordId=${orderId} qty=${qty} BTC @ ${lastPrice} USDT tradeId=${trade.id}`);

  return Response.json({
    ...SAFETY,
    realTradeAllowed: true, // was true for THIS execution only
    executed:         true,
    orderId,
    clOrdId,
    instId:           SAFETY.allowedPair,
    side:             SAFETY.allowedSide,
    qty,
    entryPrice:       lastPrice,
    sizeUSDT:         sz,
    tpPrice,
    slPrice,
    tradeId:          trade.id,
    executedAt:       now,
    executedBy:       user.email,
    finalVerdict:     'PHASE_5_REAL_ORDER_PLACED',
  });
});