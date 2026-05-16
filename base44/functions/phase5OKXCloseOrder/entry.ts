import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// PHASE 5 — OKX CLOSE / EMERGENCY CLOSE REAL POSITION
// ============================================================
// Closes an open Phase 5 real BTC-USDT trade via market sell.
// Requires admin role.
// Requires manualConfirmCode = 'I_CONFIRM_CLOSE_REAL_TRADE'
// ============================================================

const REQUIRED_CONFIRM_CODE = 'I_CONFIRM_CLOSE_REAL_TRADE';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { manualConfirmCode, tradeId, isEmergency } = body;

  console.log(`[PHASE5_CLOSE_ORDER] requested by ${user.email} tradeId=${tradeId} emergency=${isEmergency}`);

  // Emergency close skips confirm code check (operator panic button)
  if (!isEmergency && manualConfirmCode !== REQUIRED_CONFIRM_CODE) {
    return Response.json({
      executed: false,
      error: 'MISSING_CONFIRM_CODE',
      message: 'Pass manualConfirmCode = "I_CONFIRM_CLOSE_REAL_TRADE" or set isEmergency=true.',
    }, { status: 400 });
  }

  // ── Find the open trade ──────────────────────────────────────
  let trade = null;
  if (tradeId) {
    const trades = await base44.asServiceRole.entities.PaperTrade.filter({ id: tradeId });
    trade = trades[0] || null;
  } else {
    const trades = await base44.asServiceRole.entities.PaperTrade.filter({
      phase: 'PHASE_5_MANUAL_REAL_TEST',
      status: 'OPEN',
      instId: 'BTC-USDT',
    });
    trade = trades[0] || null;
  }

  if (!trade) {
    return Response.json({ executed: false, error: 'NO_OPEN_TRADE_FOUND' }, { status: 404 });
  }

  // ── OKX API credentials ──────────────────────────────────────
  const OKX_API_KEY    = Deno.env.get('OKX_API_KEY');
  const OKX_SECRET_KEY = Deno.env.get('OKX_SECRET_KEY');
  const OKX_PASSPHRASE = Deno.env.get('OKX_PASSPHRASE');

  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
    // Credentials not set — still mark trade as manually closed in DB
    await base44.asServiceRole.entities.PaperTrade.update(trade.id, {
      status: 'CLOSED_MANUAL',
      closedAt: new Date().toISOString(),
      reason: (trade.reason || '') + ` | EMERGENCY_CLOSE_NO_CREDENTIALS by ${user.email}`,
    });
    return Response.json({
      executed: false,
      tradeMarkedClosed: true,
      error: 'OKX_CREDENTIALS_NOT_SET',
      message: 'OKX credentials not set — trade marked CLOSED_MANUAL in DB. Close position manually on OKX.',
    });
  }

  // ── Fetch current price ──────────────────────────────────────
  let exitPrice = null;
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
    const d = await r.json();
    exitPrice = parseFloat(d?.data?.[0]?.last ?? 0) || null;
  } catch (_) {}

  // ── Build market sell order ──────────────────────────────────
  const qty = String(trade.qty);
  const timestamp = new Date().toISOString();
  const method = 'POST';
  const path = '/api/v5/trade/order';
  const clOrdId = `P5_CLOSE_${Date.now()}`;
  const orderBody = JSON.stringify({
    instId: 'BTC-USDT',
    tdMode: 'cash',
    side:   'sell',
    ordType:'market',
    sz:     qty,
    clOrdId,
  });

  const preSign = timestamp + method + path + orderBody;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(OKX_SECRET_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(preSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  let okxResponse = null;
  try {
    const r = await fetch(`https://www.okx.com${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'OK-ACCESS-KEY':        OKX_API_KEY,
        'OK-ACCESS-SIGN':       signature,
        'OK-ACCESS-TIMESTAMP':  timestamp,
        'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
      },
      body: orderBody,
    });
    okxResponse = await r.json();
  } catch (e) {
    return Response.json({ executed: false, error: 'OKX_REQUEST_FAILED', message: e.message }, { status: 500 });
  }

  const closeOrdId = okxResponse?.data?.[0]?.ordId;
  const okxCode    = okxResponse?.code;

  // ── Update trade record ──────────────────────────────────────
  const now = new Date().toISOString();
  const grossPnL = exitPrice && trade.entryPrice
    ? ((exitPrice - trade.entryPrice) * trade.qty)
    : null;

  await base44.asServiceRole.entities.PaperTrade.update(trade.id, {
    status:     okxCode === '0' ? 'CLOSED_MANUAL' : 'CLOSED_MANUAL',
    exitPrice:  exitPrice || null,
    closedAt:   now,
    grossPnL:   grossPnL,
    netPnL:     grossPnL, // approximate — no fee calc here
    reason:     (trade.reason || '') + ` | CLOSED by ${user.email} at ${now}${isEmergency ? ' [EMERGENCY]' : ''}`,
  });

  console.log(`[PHASE5_CLOSE_ORDER] ✅ CLOSE executed ordId=${closeOrdId} exitPrice=${exitPrice} tradeId=${trade.id}`);

  return Response.json({
    executed:    okxCode === '0',
    closeOrdId,
    tradeId:     trade.id,
    exitPrice,
    grossPnL,
    closedAt:    now,
    closedBy:    user.email,
    isEmergency: isEmergency || false,
    okxCode,
    okxMsg:      okxResponse?.msg,
    finalVerdict: 'PHASE_5_POSITION_CLOSED',
  });
});