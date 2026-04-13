import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Test multiple crypto APIs
    const endpoints = [
      { name: 'Kraken', url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD' },
      { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd' },
      { name: 'Bitfinex', url: 'https://api-pub.bitfinex.com/v2/tickers?symbols=tBTCUSD' },
      { name: 'OKX', url: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT' },
      { name: 'Gate.io', url: 'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT' },
      { name: 'CoinCap', url: 'https://api.coincap.io/v2/assets/bitcoin' }
    ];

    const results = [];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, { headers: { 'Accept': 'application/json' } });
        const text = await r.text();
        const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
        results.push({ name: ep.name, status: r.status, ok: r.ok && isJson, preview: text.substring(0, 150) });
      } catch (e) {
        results.push({ name: ep.name, error: e.message });
      }
    }

    return Response.json({ results });

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