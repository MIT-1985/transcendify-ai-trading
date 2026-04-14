import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function testEndpoint(url, apiKey, apiSecret, passphrase, path, method) {
  const ts = new Date().toISOString();
  const sig = await sign(apiSecret, ts + method + path);
  const res = await fetch(url + path, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sig,
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  return { code: data.code, msg: data.msg, data: data.data };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const apiKey = body.api_key;
    const apiSecret = body.api_secret;
    const passphrase = body.passphrase;
    const path = '/api/v5/account/balance';
    const method = 'GET';

    console.log('Testing key:', apiKey?.substring(0, 8) + '...');

    const pubRes = await fetch('https://www.okx.com/api/v5/public/time');
    const pubData = await pubRes.json();
    console.log('Public time:', JSON.stringify(pubData));

    const www = await testEndpoint('https://www.okx.com', apiKey, apiSecret, passphrase, path, method);
    console.log('www result - code:', www.code, 'msg:', www.msg);

    const eea = await testEndpoint('https://eea.okx.com', apiKey, apiSecret, passphrase, path, method);
    console.log('EEA result - code:', eea.code, 'msg:', eea.msg);

    return Response.json({
      public_time: pubData,
      www: { code: www.code, msg: www.msg },
      eea: { code: eea.code, msg: eea.msg },
      key_tested: apiKey?.substring(0, 8) + '...'
    });
  } catch (e) {
    console.error('Error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});