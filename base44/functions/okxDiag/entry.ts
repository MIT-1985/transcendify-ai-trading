import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = 'cb70536d-aafa-4c39-af83-863b86ebaccc';
    const apiSecret = '3C7385AF4CE9DD8B6161A2A69464F3C7';
    const passphrase = 'Georgakiev1$';
    const path = '/api/v5/account/balance';
    const method = 'GET';

    // Test public endpoint first
    const pubRes = await fetch('https://www.okx.com/api/v5/public/time');
    const pubData = await pubRes.json();
    console.log('Public time:', JSON.stringify(pubData));

    // Main endpoint
    const ts1 = new Date().toISOString();
    const sig1 = await sign(apiSecret, ts1 + method + path);
    const res1 = await fetch('https://www.okx.com' + path, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': sig1,
        'OK-ACCESS-TIMESTAMP': ts1,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json'
      }
    });
    const data1 = await res1.json();
    console.log('Main OKX result - code:', data1.code, 'msg:', data1.msg);

    return Response.json({
      public_time: pubData,
      main_endpoint: { code: data1.code, msg: data1.msg, data: data1.data },
      key_prefix: apiKey.substring(0, 8)
    });
  } catch (e) {
    console.error('Error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});