import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  // Get the real user IP from request headers (set by the platform)
  const userIP = 
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';

  console.log('User IP detected:', userIP);
  console.log('CF-Connecting-IP:', req.headers.get('cf-connecting-ip'));
  console.log('X-Forwarded-For:', req.headers.get('x-forwarded-for'));
  console.log('X-Real-IP:', req.headers.get('x-real-ip'));

  // Try Binance with user real IP forwarded
  let result = {};
  try {
    const r = await fetch('https://api.binance.com/api/v3/account', {
      headers: {
        'X-MBX-APIKEY': 'testkey123',
        'X-Forwarded-For': userIP !== 'unknown' ? userIP : undefined,
        'X-Real-IP': userIP !== 'unknown' ? userIP : undefined,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000)
    });
    const data = await r.json();
    result = { 
      status: r.status, 
      data,
      // 400 = reachable (bad signature), 401 = reachable (no auth), 451 = geo-blocked
      reachable: r.status !== 451,
      userIP 
    };
  } catch (e) {
    result = { error: e.message, userIP };
  }

  return Response.json({ userIP, result });
});