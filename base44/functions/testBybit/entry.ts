import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Test OKX public endpoints - rate limits, instruments, trading rules
    const tests = [
      { name: 'Instruments (spot)', url: 'https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=BTC-USDT' },
      { name: 'Order book depth', url: 'https://www.okx.com/api/v5/market/books?instId=BTC-USDT&sz=5' },
      { name: 'Candlesticks 1m', url: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=5' },
      { name: 'Ticker BTC', url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT' },
      { name: 'All USDT pairs', url: 'https://www.okx.com/api/v5/public/instruments?instType=SPOT' },
      { name: 'Fee schedule', url: 'https://www.okx.com/api/v5/public/discount-rate-interest-free-quota' },
    ];

    const results = [];
    for (const t of tests) {
      try {
        const r = await fetch(t.url, { headers: { 'Accept': 'application/json' } });
        const json = await r.json();
        // Extract trading limits from instruments
        let info = json;
        if (t.name.includes('Instruments') && json.data?.[0]) {
          const d = json.data[0];
          info = { minSz: d.minSz, lotSz: d.lotSz, tickSz: d.tickSz, maxLmtSz: d.maxLmtSz, maxMktSz: d.maxMktSz };
        } else if (t.name.includes('Candlesticks')) {
          info = { count: json.data?.length, sample: json.data?.[0] };
        } else if (t.name.includes('All USDT')) {
          info = { total_pairs: json.data?.length };
        } else if (t.name.includes('Ticker')) {
          const d = json.data?.[0];
          info = { price: d?.last, bid: d?.bidPx, ask: d?.askPx, vol24h: d?.vol24h };
        }
        results.push({ name: t.name, status: r.status, data: info });
      } catch(e) {
        results.push({ name: t.name, error: e.message });
      }
    }

    return Response.json({ results });
    const text2 = await r2.text();

    return Response.json({
      main_api: { status: r.status, preview: text.substring(0, 300), isJson },
      demo_api: { status: r2.status, preview: text2.substring(0, 300) },
      conclusion: r.status === 401 || (isJson && text.includes('code')) ? 
        'OKX trading API is REACHABLE - can trade with real keys!' : 
        'OKX trading API may be blocked'
    });

    const response = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT');
    const data = await response.json();

    if (data.retCode === 0) {
      const ticker = data.result?.list?.[0];
      return Response.json({
        success: true,
        message: 'Bybit API is accessible!',
        btc_price: ticker?.lastPrice,
        symbol: ticker?.symbol,
        volume: ticker?.volume24h
      });
    } else {
      return Response.json({ success: false, error: data.retMsg, raw: data });
    }
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});