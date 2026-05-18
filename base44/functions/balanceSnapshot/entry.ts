import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Records a BalanceSnapshot — called by scheduled automation every 5 minutes.
// READ-ONLY: fetches OKX balance, BTC price, and paper PnL. Does NOT trade.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [balRes, btcRes, paperRes] = await Promise.allSettled([
      base44.functions.invoke('okxLiveBalance', {}),
      base44.functions.invoke('okxMarketData', { action: 'ticker', instId: 'BTC-USDT' }),
      base44.asServiceRole.entities.PaperTrade.list('-openedAt', 500),
    ]);

    const bal     = balRes.status === 'fulfilled' ? (balRes.value?.data || {}) : {};
    const ticker  = btcRes.status === 'fulfilled' ? (btcRes.value?.data?.data?.[0] || {}) : {};
    const papers  = paperRes.status === 'fulfilled' ? paperRes.value : [];

    const paperNetPnL = papers
      .filter(t => t.status !== 'OPEN')
      .reduce((s, t) => s + (t.netPnLUSDT ?? t.netPnL ?? 0), 0);

    const totalFees = papers.reduce((s, t) => {
      const f = t.fees ?? ((t.entryFeeUSDT ?? 0) + (t.exitFeeUSDT ?? 0));
      return s + f;
    }, 0);

    const snapshot = {
      totalEquityUSDT: parseFloat(bal.totalEquityUSDT || bal.totalEquity || 0),
      availableUSDT:   parseFloat(bal.availableUSDT || 0),
      frozenUSDT:      parseFloat(bal.frozenUSDT || 0),
      btcPrice:        parseFloat(ticker.last || ticker.price || 0),
      paperNetPnL:     parseFloat(paperNetPnL.toFixed(6)),
      realNetPnL:      0, // placeholder for future real trade PnL
      totalFees:       parseFloat(totalFees.toFixed(6)),
      snapshotAt:      new Date().toISOString(),
    };

    const saved = await base44.asServiceRole.entities.BalanceSnapshot.create(snapshot);

    console.log('[balanceSnapshot] Saved:', JSON.stringify(snapshot));
    return Response.json({ success: true, snapshot: saved });
  } catch (error) {
    console.error('[balanceSnapshot] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});