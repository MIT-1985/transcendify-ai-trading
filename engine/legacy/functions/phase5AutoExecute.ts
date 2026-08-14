// Пренесена от base44/functions - виж engine/scripts/port-legacy.ts.
// Логиката е непроменена; сменени са само вносовете и платформата.
import { createClientFromRequest } from '../../src/compat/base44Client.ts';
import { fetchOkxTicker, OKX_TAKER_FEE_RATE } from '../../shared/microMarketData.ts';

// ============================================================
// PHASE 5 — AUTO EXECUTE (Claude signal-driven)
// ============================================================
// Reads the latest Claude SignalSnapshot. If:
//   1. claudeAction === 'BUY'
//   2. claudeConfidence >= 75
//   3. Kill switch is active (safety on) AND auto_mode_enabled marker
//      is present on the latest TradingKillSwitch record
//   4. No existing open PHASE_5_AUTO trade
//   5. Fee-aware net profit filter passes (net >= 0.05% of position)
//   6. Available balance >= positionUSDT
// → places a real OKX market buy order with TP/SL.
//
// Admin-only. Calls the real OKX order endpoint.
// ============================================================

const PAIR = 'BTC-USDT';
const MIN_CONFIDENCE = 75;
const MIN_NET_PROFIT_PCT = 0.05;
const FEE_RATE = OKX_TAKER_FEE_RATE; // 0.001 per side

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    // ── 1. Check auto-mode flag on latest kill switch ────────────
    const switches = await base44.asServiceRole.entities.TradingKillSwitch.list('-created_date', 3);
    const killSwitch = switches[0] || null;
    const autoModeEnabled = killSwitch?.reason === 'AUTO_MODE_ENABLED';

    if (!autoModeEnabled) {
      return Response.json({
        executed: false,
        error: 'AUTO_MODE_DISABLED',
        message: 'Auto mode is OFF. Enable it via setAutoMode function or Dashboard toggle.',
      }, { status: 400 });
    }

    if (killSwitch?.enabled === false) {
      return Response.json({
        executed: false,
        error: 'KILL_SWITCH_OFF',
        message: 'Kill switch is OFF — trading is globally blocked.',
      }, { status: 400 });
    }

    // ── 2. Fetch latest Claude signal ────────────────────────────
    const signals = await base44.asServiceRole.entities.SignalSnapshot.list('-created_date', 5);
    const claudeSignal = signals.find(s => s.mode === 'CLAUDE_ENGINE') || null;

    if (!claudeSignal) {
      return Response.json({
        executed: false,
        error: 'NO_CLAUDE_SIGNAL',
        message: 'No CLAUDE_ENGINE signal found. Run claudeSignalEngine first.',
      }, { status: 400 });
    }

    // Signal must be recent (< 2 min old)
    const signalAgeMs = Date.now() - new Date(claudeSignal.timestamp).getTime();
    if (signalAgeMs > 120000) {
      return Response.json({
        executed: false,
        error: 'STALE_SIGNAL',
        message: `Signal is ${Math.round(signalAgeMs / 1000)}s old. Max 120s.`,
      }, { status: 400 });
    }

    if (claudeSignal.claudeAction !== 'BUY') {
      return Response.json({
        executed: false,
        error: 'NOT_BUY_SIGNAL',
        action: claudeSignal.claudeAction,
        message: `Signal action is ${claudeSignal.claudeAction}, not BUY.`,
      }, { status: 400 });
    }

    if ((claudeSignal.claudeConfidence || 0) < MIN_CONFIDENCE) {
      return Response.json({
        executed: false,
        error: 'CONFIDENCE_TOO_LOW',
        confidence: claudeSignal.claudeConfidence,
        required: MIN_CONFIDENCE,
      }, { status: 400 });
    }

    // ── 3. Check no open auto trades ─────────────────────────────
    const openTrades = await base44.asServiceRole.entities.PaperTrade.filter({
      phase: 'PHASE_5_AUTO',
      status: 'OPEN',
      instId: PAIR,
    });
    if (openTrades.length > 0) {
      return Response.json({
        executed: false,
        error: 'OPEN_TRADE_EXISTS',
        message: `Already ${openTrades.length} open auto trade(s). Close first.`,
        openTradeId: openTrades[0].id,
      }, { status: 400 });
    }

    // ── 4. Fetch available balance ────────────────────────────────
    const conns = await base44.asServiceRole.entities.ExchangeConnection.filter({ exchange: 'okx' });
    const okxConn = conns[0] || null;
    const availableUSDT = parseFloat(okxConn?.balance_usdt || 0);

    if (availableUSDT < 1) {
      return Response.json({
        executed: false,
        error: 'INSUFFICIENT_BALANCE',
        availableUSDT,
      }, { status: 400 });
    }

    // ── 5. Compute position size (aggressive, up to full balance) ─
    const requestedUSDT = claudeSignal.claudePositionUSDT || availableUSDT;
    const positionUSDT = Math.min(requestedUSDT, availableUSDT);

    if (positionUSDT < 1) {
      return Response.json({
        executed: false,
        error: 'POSITION_TOO_SMALL',
        positionUSDT,
      }, { status: 400 });
    }

    // ── 6. Fee-aware net profit filter ───────────────────────────
    const tpPercent = claudeSignal.claudeTpPercent || 1.2;
    const slPercent = claudeSignal.claudeSlPercent || 0.6;
    const spreadPct = claudeSignal.lastPrice
      ? 0.02 // conservative spread estimate
      : 0.02;

    const grossProfit = positionUSDT * (tpPercent / 100);
    const totalFees = positionUSDT * FEE_RATE * 2;
    const spreadCost = positionUSDT * (spreadPct / 100);
    const netProfit = grossProfit - totalFees - spreadCost;
    const netPct = (netProfit / positionUSDT) * 100;

    if (netPct < MIN_NET_PROFIT_PCT) {
      return Response.json({
        executed: false,
        error: 'FEE_FILTER_FAILED',
        grossProfit,
        totalFees,
        spreadCost,
        netProfit,
        netPct,
        requiredNetPct: MIN_NET_PROFIT_PCT,
        message: `Net profit ${netPct.toFixed(4)}% < required ${MIN_NET_PROFIT_PCT}%. Fees eat the edge.`,
      }, { status: 400 });
    }

    // ── 7. Fetch live BTC price ──────────────────────────────────
    const ticker = await fetchOkxTicker(PAIR);
    if (!ticker || !ticker.last) {
      return Response.json({
        executed: false,
        error: 'PRICE_UNAVAILABLE',
      }, { status: 500 });
    }
    const lastPrice = ticker.last;

    // ── 8. OKX credentials ───────────────────────────────────────
    const OKX_API_KEY = Deno.env.get('OKX_API_KEY');
    const OKX_SECRET_KEY = Deno.env.get('OKX_SECRET_KEY');
    const OKX_PASSPHRASE = Deno.env.get('OKX_PASSPHRASE');

    if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
      return Response.json({
        executed: false,
        error: 'OKX_CREDENTIALS_NOT_SET',
        message: 'OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE secrets required.',
      }, { status: 500 });
    }

    // ── 9. Place real OKX market buy order ───────────────────────
    const qty = (positionUSDT / lastPrice).toFixed(6);
    const tpPrice = (lastPrice * (1 + tpPercent / 100)).toFixed(2);
    const slPrice = (lastPrice * (1 - slPercent / 100)).toFixed(2);
    const clOrdId = `P5AUTO_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const method = 'POST';
    const path = '/api/v5/trade/order';
    const orderBody = JSON.stringify({
      instId: PAIR,
      tdMode: 'cash',
      side: 'buy',
      ordType: 'market',
      sz: qty,
      clOrdId,
      tpTriggerPx: tpPrice,
      tpOrdPx: '-1',
      slTriggerPx: slPrice,
      slOrdPx: '-1',
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
          'Content-Type': 'application/json',
          'OK-ACCESS-KEY': OKX_API_KEY,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
        },
        body: orderBody,
      });
      okxResponse = await r.json();
    } catch (e) {
      return Response.json({
        executed: false,
        error: 'OKX_REQUEST_FAILED',
        message: e.message,
      }, { status: 500 });
    }

    const orderId = okxResponse?.data?.[0]?.ordId;
    const okxCode = okxResponse?.code;

    if (okxCode !== '0' || !orderId) {
      console.error(`[PHASE5_AUTO] OKX rejected: code=${okxCode} msg=${okxResponse?.msg}`);
      return Response.json({
        executed: false,
        error: 'OKX_ORDER_REJECTED',
        okxCode,
        okxMsg: okxResponse?.msg,
        okxResponse,
      }, { status: 400 });
    }

    // ── 10. Record trade in PaperTrade ───────────────────────────
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const trade = await base44.asServiceRole.entities.PaperTrade.create({
      instId: PAIR,
      side: 'buy',
      entryPrice: lastPrice,
      sizeUSDT: positionUSDT,
      qty: parseFloat(qty),
      tpPrice: parseFloat(tpPrice),
      slPrice: parseFloat(slPrice),
      tpPercent,
      slPercent,
      status: 'OPEN',
      phase: 'PHASE_5_AUTO',
      engineMode: 'CLAUDE_AUTO_EXECUTE',
      openedAt: now,
      expiresAt,
      reason: `AUTO_EXECUTE signalId=${claudeSignal.id} conf=${claudeSignal.claudeConfidence} by=${user.email}`,
      signalScore: claudeSignal.claudeConfidence,
      entryFeeUSDT: parseFloat((positionUSDT * FEE_RATE).toFixed(4)),
    });

    console.log(`[PHASE5_AUTO] ✅ REAL ORDER ordId=${orderId} qty=${qty} BTC @ ${lastPrice} tradeId=${trade.id}`);

    return Response.json({
      executed: true,
      orderId,
      clOrdId,
      instId: PAIR,
      side: 'buy',
      qty,
      entryPrice: lastPrice,
      sizeUSDT: positionUSDT,
      tpPrice,
      slPrice,
      tpPercent,
      slPercent,
      tradeId: trade.id,
      signalId: claudeSignal.id,
      confidence: claudeSignal.claudeConfidence,
      feeBreakdown: {
        grossProfit: parseFloat(grossProfit.toFixed(4)),
        totalFees: parseFloat(totalFees.toFixed(4)),
        spreadCost: parseFloat(spreadCost.toFixed(4)),
        netProfit: parseFloat(netProfit.toFixed(4)),
        netPct: parseFloat(netPct.toFixed(4)),
      },
      executedAt: now,
      executedBy: user.email,
    });
  } catch (error) {
    console.error('[PHASE5_AUTO] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});