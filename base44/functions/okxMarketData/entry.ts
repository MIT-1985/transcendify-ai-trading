import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, instId, bar, limit } = body;

  const BASE = 'https://www.okx.com/api/v5';

  if (action === 'ticker') {
    const res = await fetch(`${BASE}/market/ticker?instId=${instId || 'BTC-USDT'}`);
    const json = await res.json();
    return Response.json({ success: true, data: json.data?.[0] });
  }

  if (action === 'tickers') {
    // Multiple tickers
    const symbols = body.symbols || ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'ADA-USDT'];
    const results = await Promise.all(
      symbols.map(async (s) => {
        const r = await fetch(`${BASE}/market/ticker?instId=${s}`);
        const j = await r.json();
        const d = j.data?.[0];
        if (!d) return null;
        const price = parseFloat(d.last);
        const open24h = parseFloat(d.open24h);
        return {
          symbol: s.replace('-USDT', '/USDT').replace('-USDC', '/USDC'),
          instId: s,
          price,
          change: ((price - open24h) / open24h) * 100,
          volume: parseFloat(d.vol24h),
          high: parseFloat(d.high24h),
          low: parseFloat(d.low24h)
        };
      })
    );
    return Response.json({ success: true, data: results.filter(Boolean) });
  }

  if (action === 'candles') {
    const res = await fetch(`${BASE}/market/candles?instId=${instId || 'BTC-USDT'}&bar=${bar || '1H'}&limit=${limit || 100}`);
    const json = await res.json();
    // OKX candles: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    const candles = (json.data || []).map(d => ({
      time: parseInt(d[0]),
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5])
    })).reverse();
    return Response.json({ success: true, data: candles });
  }

  if (action === 'orderbook') {
    const res = await fetch(`${BASE}/market/books?instId=${instId || 'BTC-USDT'}&sz=20`);
    const json = await res.json();
    return Response.json({ success: true, data: json.data?.[0] });
  }

  if (action === 'instruments') {
    const res = await fetch(`${BASE}/public/instruments?instType=SPOT`);
    const json = await res.json();
    return Response.json({ success: true, data: json.data });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
});