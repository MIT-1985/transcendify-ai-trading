import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ============================================================
// PHASE 5 — GET OPEN REAL TRADE STATUS
// ============================================================
// Returns current open Phase 5 real BTC-USDT trade + live P&L.
// READ-ONLY. Does not place or close any orders.
// ============================================================

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Fetch open Phase 5 trades ────────────────────────────────
  const openTrades = await base44.asServiceRole.entities.PaperTrade.filter({
    phase: 'PHASE_5_MANUAL_REAL_TEST',
    status: 'OPEN',
    instId: 'BTC-USDT',
  });

  const trade = openTrades[0] || null;

  // ── Fetch live BTC price ─────────────────────────────────────
  let lastPrice = null;
  let livePnL = null;
  try {
    const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
    const d = await r.json();
    lastPrice = parseFloat(d?.data?.[0]?.last ?? 0) || null;
    if (trade && lastPrice) {
      livePnL = (lastPrice - trade.entryPrice) * trade.qty;
    }
  } catch (_) {}

  // ── TP/SL hit check ──────────────────────────────────────────
  let tpHit = false;
  let slHit = false;
  if (trade && lastPrice) {
    tpHit = lastPrice >= (trade.tpPrice || Infinity);
    slHit = lastPrice <= (trade.slPrice || 0);
  }

  console.log(`[PHASE5_GET_TRADE] requested by ${user.email} openTrades=${openTrades.length} livePnL=${livePnL?.toFixed(4)}`);

  return Response.json({
    hasOpenTrade:   !!trade,
    trade:          trade || null,
    lastPrice,
    livePnL:        livePnL !== null ? parseFloat(livePnL.toFixed(6)) : null,
    livePnLPercent: trade && livePnL !== null ? ((livePnL / trade.sizeUSDT) * 100).toFixed(3) : null,
    tpHit,
    slHit,
    tpPrice:        trade?.tpPrice || null,
    slPrice:        trade?.slPrice || null,
    openCount:      openTrades.length,
    maxOpen:        1,
    realTradeAllowed:     false,
    autoTradingAllowed:   false,
    manualConfirmRequired: true,
    generatedAt:    new Date().toISOString(),
    requestedBy:    user.email,
  });
});