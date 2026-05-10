import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MASTER_SECRET = Deno.env.get('BASE44_APP_ID') || 'okx-master-secret';
const ALLOWED_PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT', 'XRP-USDT', 'BNB-USDT', 'ADA-USDT', 'LINK-USDT', 'AVAX-USDT', 'LTC-USDT'];

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
      user_email: user.email,
      
      // OKX Live Balance
      okx_balance: {
        total_equity_usdt: 0,
        free_usdt: 0,
        assets: []
      },
      
      // Today's Fills from OKX
      okx_fills_today: [],
      
      // Completed BUY->SELL cycles
      completed_cycles: [],
      
      // Unmatched positions
      open_positions: [],
      
      // P&L Breakdown
      pnl_breakdown: {
        session_start_equity: 0,
        current_equity: 0,
        equity_change: 0,
        realized_pnl: 0,
        unrealized_pnl: 0,
        total_fees_usdt: 0,
        estimated_spread_loss: 0,
        dust_value: 0,
        total_fills: 0
      },
      
      // Safety Status
      safety: {
        drawdown_exceeded: false,
        consecutive_losses: 0,
        fees_exceed_profit: false,
        reason: 'OK'
      }
    };

    // ========== GET OKX CREDENTIALS ==========
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

    // ========== FETCH LIVE OKX BALANCE ==========
    const balRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', '/api/v5/account/balance');
    if (balRes.code !== '0') {
      return Response.json({ error: `OKX balance query failed: ${balRes.msg}` }, { status: 400 });
    }

    let totalEquityUSDT = 0;
    let freeUSDT = 0;
    const assets = [];

    for (const d of (balRes.data?.[0]?.details || [])) {
      const free = parseFloat(d.availBal || 0);
      const locked = parseFloat(d.lockedBal || 0);
      const total = free + locked;

      if (d.ccy === 'USDT') {
        freeUSDT = free;
      }

      if (total > 0.00001) {
        assets.push({
          ccy: d.ccy,
          free,
          locked,
          total,
          eq: d.eq || d.eqUsd || '0'
        });
      }
    }

    totalEquityUSDT = parseFloat(balRes.data?.[0]?.totalEq || 0);
    
    audit.okx_balance = {
      total_equity_usdt: totalEquityUSDT,
      free_usdt: freeUSDT,
      assets
    };

    audit.pnl_breakdown.current_equity = totalEquityUSDT;

    // ========== FETCH TODAY'S FILLS ==========
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startTs = todayStart.getTime().toString();

    const fillsMap = {};

    for (const pair of ALLOWED_PAIRS) {
      const histRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET',
        `/api/v5/trade/fills?instId=${pair}&instType=SPOT`);
      
      if (histRes.code !== '0' || !histRes.data) continue;

      for (const fill of histRes.data) {
        const fillTime = parseInt(fill.fillTime || 0);
        if (fillTime >= parseInt(startTs)) {
          const key = fill.ordId;
          fillsMap[key] = fill;
          
          audit.okx_fills_today.push({
            ordId: fill.ordId,
            instId: fill.instId,
            side: fill.side,
            fillPx: parseFloat(fill.fillPx),
            fillSz: parseFloat(fill.fillSz),
            fillTime: new Date(fillTime).toISOString(),
            fee: parseFloat(fill.fee),
            feeCcy: fill.feeCcy
          });
        }
      }
    }

    audit.pnl_breakdown.total_fills = audit.okx_fills_today.length;

    // ========== GROUP FILLS INTO CYCLES ==========
    const buyFills = audit.okx_fills_today.filter(f => f.side === 'buy').sort((a, b) => new Date(a.fillTime).getTime() - new Date(b.fillTime).getTime());
    const sellFills = audit.okx_fills_today.filter(f => f.side === 'sell').sort((a, b) => new Date(a.fillTime).getTime() - new Date(b.fillTime).getTime());

    for (const buy of buyFills) {
      const matchingSell = sellFills.find(s => 
        s.instId === buy.instId && 
        new Date(s.fillTime).getTime() > new Date(buy.fillTime).getTime()
      );

      if (matchingSell) {
        const grossPnL = (matchingSell.fillPx * matchingSell.fillSz) - (buy.fillPx * buy.fillSz);
        const totalFees = Math.abs(buy.fee) + Math.abs(matchingSell.fee);
        const netPnL = grossPnL - totalFees;
        const holdTime = (new Date(matchingSell.fillTime).getTime() - new Date(buy.fillTime).getTime()) / 1000;

        audit.completed_cycles.push({
          buyOrdId: buy.ordId,
          sellOrdId: matchingSell.ordId,
          pair: buy.instId,
          buyPx: buy.fillPx,
          sellPx: matchingSell.fillPx,
          qty: buy.fillSz,
          grossPnL,
          buyFee: buy.fee,
          sellFee: matchingSell.fee,
          totalFeesUSDT: totalFees,
          netPnL,
          holdTimeSeconds: holdTime,
          status: 'completed'
        });
      } else {
        // Unmatched BUY
        audit.open_positions.push({
          pair: buy.instId,
          qty: buy.fillSz,
          entryPx: buy.fillPx,
          entryTime: buy.fillTime,
          entryOrdId: buy.ordId,
          status: 'open_buy_unmatched'
        });
      }
    }

    // Find unmatched SELLs (shouldn't happen but track them)
    for (const sell of sellFills) {
      const matchingBuy = buyFills.find(b => 
        b.instId === sell.instId && 
        new Date(b.fillTime).getTime() < new Date(sell.fillTime).getTime()
      );
      if (!matchingBuy) {
        audit.open_positions.push({
          pair: sell.instId,
          qty: sell.fillSz,
          exitPx: sell.fillPx,
          exitTime: sell.fillTime,
          exitOrdId: sell.ordId,
          status: 'orphaned_sell'
        });
      }
    }

    // ========== CALCULATE P&L ==========
    const realizedPnL = audit.completed_cycles.reduce((s, c) => s + c.netPnL, 0);
    const totalFees = audit.completed_cycles.reduce((s, c) => s + c.totalFeesUSDT, 0);
    
    audit.pnl_breakdown.realized_pnl = realizedPnL;
    audit.pnl_breakdown.total_fees_usdt = totalFees;

    // Estimate spread loss from open positions
    let spreadLoss = 0;
    for (const pos of audit.open_positions) {
      if (pos.status === 'open_buy_unmatched') {
        // Current price estimate from OKX ticker
        const tickRes = await okxRequest(apiKey, apiSecret, passphrase, 'GET', `/api/v5/market/ticker?instId=${pos.pair}`);
        if (tickRes.code === '0' && tickRes.data?.[0]) {
          const currentPrice = parseFloat(tickRes.data[0].last || 0);
          const unrealizedOnPosition = (currentPrice - pos.entryPx) * pos.qty;
          if (unrealizedOnPosition < 0) {
            spreadLoss += Math.abs(unrealizedOnPosition);
          }
        }
      }
    }

    audit.pnl_breakdown.estimated_spread_loss = spreadLoss;

    // ========== LOAD SESSION START EQUITY (from storage or estimate) ==========
    // Try to get from execution logs or assume 1st fill balance
    const sessionStartEstimate = audit.okx_fills_today.length > 0 
      ? totalEquityUSDT + Math.abs(realizedPnL) + totalFees + spreadLoss
      : totalEquityUSDT;

    audit.pnl_breakdown.session_start_equity = sessionStartEstimate;
    audit.pnl_breakdown.equity_change = totalEquityUSDT - sessionStartEstimate;

    // Dust value (small holdings)
    let dustValue = 0;
    for (const asset of assets) {
      if (asset.ccy !== 'USDT' && asset.total < 0.001) {
        dustValue += parseFloat(asset.eq || 0);
      }
    }
    audit.pnl_breakdown.dust_value = dustValue;

    // ========== SAFETY CHECKS ==========
    // Check 1: Drawdown limit
    if (audit.pnl_breakdown.equity_change <= -1.0) {
      audit.safety.drawdown_exceeded = true;
      audit.safety.reason = `DRAWDOWN_LIMIT: Equity dropped ${Math.abs(audit.pnl_breakdown.equity_change).toFixed(2)} USDT`;
    }

    // Check 2: Consecutive losses (from completed cycles)
    let consecutiveLosses = 0;
    for (let i = 0; i < audit.completed_cycles.length; i++) {
      if (audit.completed_cycles[i].netPnL < 0) {
        consecutiveLosses++;
        if (consecutiveLosses >= 2) {
          audit.safety.consecutive_losses = consecutiveLosses;
          audit.safety.reason = `CONSECUTIVE_LOSSES: ${consecutiveLosses} losing cycles`;
          break;
        }
      } else {
        consecutiveLosses = 0;
      }
    }

    // Check 3: Fees exceed profit
    if (totalFees > realizedPnL && realizedPnL > 0) {
      audit.safety.fees_exceed_profit = true;
      audit.safety.reason = `FEES_EXCEED_PROFIT: Fees=${totalFees.toFixed(4)} > Profit=${realizedPnL.toFixed(4)}`;
    }

    return Response.json(audit, { status: 200 });

  } catch (error) {
    console.error('ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});