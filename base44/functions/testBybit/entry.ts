import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Test OKX authenticated trading endpoint accessibility
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const path = '/api/v5/account/balance';

    // Use dummy keys - a 401 means server is reachable, 403 = geo-blocked
    const headers = {
      'OK-ACCESS-KEY': 'test-key',
      'OK-ACCESS-SIGN': 'test-sign',
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': 'test-pass',
      'x-simulated-trading': '1', // testnet mode
      'Content-Type': 'application/json'
    };

    const r = await fetch('https://www.okx.com' + path, { headers });
    const text = await r.text();
    const isJson = text.trim().startsWith('{');

    // Also test OKX demo trading
    const r2 = await fetch('https://www.okx.com/api/v5/account/balance', { 
      headers: { ...headers, 'x-simulated-trading': '1' } 
    });
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