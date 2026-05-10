import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT'];

// ==================== CRYPTO ====================
async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('okx-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decrypt(encryptedStr) {
  const key = await deriveKey(MASTER_SECRET);
  const [ivB64, dataB64] = encryptedStr.split(':');
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

async function sign(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function okxRequest(apiKey, secret, passphrase, method, path, body = '') {
  const timestamp = new Date().toISOString();
  const message = timestamp + method + path + body;
  const signature = await sign(secret, message);
  const res = await fetch('https://www.okx.com' + path, {
    method,
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json'
    },
    body: body || undefined
  });
  return res.json();
}

// ==================== MAIN HANDLER ====================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const audit = {
      timestamp: new Date().toISOString(),
      kill_switch_status: 'CHECKING',
      automations_status: 'CHECKING',
      okx_fills_last_30min: [],
      okx_balance: null,
      dashboard_verified_trades: 0,
      dashboard_order_ledger_count: 0,
      emergency_status: 'PAUSED_KILL_SWITCH'
    };

    // ========== CHECK KILL SWITCH ==========
    const switches = await base44.asServiceRole.entities.TradingKillSwitch.list();
    const killSwitch = switches && switches.length > 0 ? switches[0] : null;
    audit.kill_switch_status = killSwitch?.enabled ? 'ACTIVE' : 'INACTIVE';
    audit.kill_switch_reason = killSwitch?.reason || '—';

    // ========== CHECK AUTOMATIONS ==========
    // Note: automations list is not directly available in SDK, but we can check runtime state
    // by looking at execution logs and verified trades
    
    // ========== GET OKX CREDENTIALS & BALANCE ==========
    const connection = await base44.asServiceRole.entities.ExchangeConnection.filter(
      { exchange: 'okx' },
      '-updated_date',
      1
    );

    if (!connection || connection.length === 0) {
      return Response.json({ error: 'No OKX connection found' }, { status: 400 });
    }

    const conn = connection[0];
    let apiKey, apiSecret, passphrase;
    
    try {
      apiKey = await decrypt(conn.api_key_encrypted);
      apiSecret = await decrypt(conn.api_secret_encrypted);
      passphrase = await decrypt(conn.encryption_iv);
    } catch (e) {
      return Response.json({ error: `Credential decryption failed: ${e.message}` }, { status: 400 });
    }

    // Fetch live balance
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    if (balRes.code === '0' && balRes.data && balRes.data.length > 0) {
      const details = balRes.data[0].details || [];
      let totalEquity = 0;
      let freeUSDT = 0;
      const balances = {};

      for (const d of details) {
        if (d.ccy === 'USDT') {
          freeUSDT = parseFloat(d.availBal || 0);
          totalEquity = parseFloat(d.usdtValue || d.balance || d.availBal || 0);
        }
        if (parseFloat(d.availBal || 0) > 0) {
          balances[d.ccy] = {
            available: parseFloat(d.availBal),
            frozen: parseFloat(d.frozenBal),
            total: parseFloat(d.balance)
          };
        }
      }

      audit.okx_balance = {
        total_equity_usdt: totalEquity,
        free_usdt: freeUSDT,
        balances
      };
    }

    // ========== FETCH OKX FILLS FROM LAST 30 MINUTES ==========
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const thirtyMinAgoTs = thirtyMinAgo.getTime().toString();

    const allFills = [];

    for (const pair of ALLOWED_PAIRS) {
      await new Promise(r => setTimeout(r, 200)); // Rate limit throttle
      const histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/fills?instId=${pair}&instType=SPOT`);
      
      if (histRes.code !== '0' || !histRes.data) continue;

      for (const fill of histRes.data) {
        const fillTime = parseInt(fill.fillTime || 0);
        if (fillTime >= parseInt(thirtyMinAgoTs)) {
          allFills.push({
            ordId: fill.ordId,
            instId: fill.instId,
            side: fill.side.toUpperCase(),
            fillPx: parseFloat(fill.fillPx),
            fillSz: parseFloat(fill.fillSz),
            fillTime: new Date(fillTime).toISOString(),
            fee: parseFloat(fill.fee),
            feeCcy: fill.feeCcy,
            tradeId: fill.tradeId || null
          });
        }
      }
    }

    audit.okx_fills_last_30min = allFills.sort((a, b) => new Date(b.fillTime).getTime() - new Date(a.fillTime).getTime());
    audit.okx_fills_count = allFills.length;

    // ========== CHECK DASHBOARD COUNTERS ==========
    const verifiedTrades = await base44.asServiceRole.entities.VerifiedTrade.filter(
      { robotId: 'robot1', status: 'closed' }
    );
    audit.dashboard_verified_trades = verifiedTrades.length;

    const ledgerOrders = await base44.asServiceRole.entities.OXXOrderLedger.list();
    audit.dashboard_order_ledger_count = ledgerOrders.length;

    // ========== CRITICAL: DID TRADES EXECUTE AFTER KILL SWITCH? ==========
    const killSwitchCreatedAt = killSwitch?.activated_at ? new Date(killSwitch.activated_at).getTime() : null;
    
    let tradesAfterKillSwitch = 0;
    if (killSwitchCreatedAt) {
      for (const fill of allFills) {
        const fillTimeMs = new Date(fill.fillTime).getTime();
        if (fillTimeMs > killSwitchCreatedAt) {
          tradesAfterKillSwitch++;
        }
      }
    }

    audit.trades_after_kill_switch_activated = tradesAfterKillSwitch;
    audit.kill_switch_effective = tradesAfterKillSwitch === 0 ? 'YES' : 'NO_TRADES_STILL_EXECUTING';

    // ========== FINAL STATUS ==========
    if (killSwitch?.enabled && tradesAfterKillSwitch === 0) {
      audit.emergency_status = 'PAUSED_KILL_SWITCH_EFFECTIVE';
      audit.final_message = '✓ KILL SWITCH ACTIVE AND EFFECTIVE — No new trades since activation';
    } else if (!killSwitch?.enabled) {
      audit.emergency_status = 'KILL_SWITCH_INACTIVE';
      audit.final_message = '⚠️ WARNING: Kill switch is NOT active';
    } else {
      audit.emergency_status = 'CRITICAL: TRADING STILL EXECUTING';
      audit.final_message = '🛑 CRITICAL: Trades are executing despite kill switch being active!';
    }

    return Response.json(audit, { status: 200 });

  } catch (error) {
    console.error('ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});