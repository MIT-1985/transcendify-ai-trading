/**
 * Micro market-data layer — shared by robot1Execute, phase4FBTCOnlyPaperMode,
 * and aiTradingAnalysis.
 *
 * Data sources (finest available without a paid Polygon crypto plan):
 *   - OKX 1s candles      (sub-minute intraday momentum / volume)
 *   - OKX trades          (tick-level, millisecond timestamps — "micro" layer)
 *   - Polygon daily + historical minute (macro confirmation only;
 *     real-time second/minute returns 403 on the current plan)
 *
 * analyzeMicroTick buckets the OKX trades into ~1s windows and computes
 * micro-momentum (drift), buy-pressure %, bull/bear bucket counts.
 */

const POLYGON_TICKER = 'X:BTCUSD';
const OKX_TAKER_FEE = 0.001;

export const OKX_TAKER_FEE_RATE = OKX_TAKER_FEE;

export async function fetchOkxTicker(instId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      const d = j?.data?.[0];
      if (d) {
        const bid = parseFloat(d.bidPx || d.last);
        const ask = parseFloat(d.askPx || d.last);
        const mid = (bid + ask) / 2;
        return { last: parseFloat(d.last), bid, ask, spreadPct: mid > 0 ? (ask - bid) / mid * 100 : 0 };
      }
    } catch {}
  }
  return null;
}

export async function fetchOkxCandles1s(instId) {
  const parse = (j) => (j?.data || []).map(c => ({
    ts: Number(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
    low: parseFloat(c[3]), close: parseFloat(c[4]), vol: parseFloat(c[5]),
  })).reverse();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1s&limit=300`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j?.data?.length) return parse(j);
    } catch {}
  }
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1s&limit=100`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (j?.data?.length) return parse(j);
  } catch {}
  return [];
}

export async function fetchOkxTrades(instId, limit = 500) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://www.okx.com/api/v5/market/trades?instId=${instId}&limit=${limit}`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      if (j?.data?.length) {
        return j.data.map(t => ({ ts: Number(t.ts), price: parseFloat(t.px), size: parseFloat(t.sz), side: t.side }));
      }
    } catch {}
  }
  return [];
}

// Sub-second (micro) tick analysis — bucket trades into ~1s windows.
export function analyzeMicroTick(trades) {
  if (!trades || trades.length < 10) {
    return { tickDirection: 'NEUTRAL', buyPressurePercent: 50, tickScore: 10, microMomentumPct: 0, buckets: 0, bullBuckets: 0, bearBuckets: 0 };
  }
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const buyVol = sorted.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
  const sellVol = sorted.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
  const total = buyVol + sellVol;
  const buyPct = total > 0 ? buyVol / total * 100 : 50;

  const first = sorted[0].price;
  const last = sorted[sorted.length - 1].price;
  const microMomentumPct = first > 0 ? (last - first) / first * 100 : 0;

  const bucketMs = 1000;
  const buckets = {};
  for (const t of sorted) {
    const b = Math.floor(t.ts / bucketMs) * bucketMs;
    if (!buckets[b]) buckets[b] = { buy: 0, sell: 0 };
    t.side === 'buy' ? (buckets[b].buy += t.size) : (buckets[b].sell += t.size);
  }
  const bucketKeys = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  const bullBuckets = bucketKeys.filter(b => buckets[b].buy > buckets[b].sell).length;
  const bearBuckets = bucketKeys.length - bullBuckets;

  const drift = microMomentumPct;
  const tickDirection = buyPct >= 58 && drift > 0 ? 'BUY_PRESSURE'
    : (100 - buyPct) >= 58 && drift < 0 ? 'SELL_PRESSURE' : 'NEUTRAL';
  const tickScore = buyPct >= 65 ? 25 : buyPct >= 55 ? 18 : buyPct >= 45 ? 10 : 5;

  return {
    tickDirection,
    buyPressurePercent: parseFloat(buyPct.toFixed(2)),
    tickScore,
    microMomentumPct: parseFloat(drift.toFixed(6)),
    buckets: bucketKeys.length,
    bullBuckets,
    bearBuckets,
  };
}

export async function fetchPolygonDaily(apiKey) {
  if (!apiKey) return [];
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  try {
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${POLYGON_TICKER}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const j = await r.json();
    return (j?.results || []).map(b => ({ ts: b.t, close: b.c, open: b.o, high: b.h, low: b.l, vol: b.v }));
  } catch { return []; }
}

export async function fetchPolygonHistMinute(apiKey) {
  if (!apiKey) return [];
  const dayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  try {
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${POLYGON_TICKER}/range/1/minute/${dayStr}/${dayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const j = await r.json();
    return (j?.results || []).map(b => ({ ts: b.t, close: b.c, vol: b.v }));
  } catch { return []; }
}

export function calcEMA(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

export function calcRSI(values, period = 14) {
  if (values.length < period + 1) return null;
  const changes = values.slice(1).map((c, i) => c - values[i]);
  let ag = 0, al = 0;
  for (let i = 0; i < period; i++) { if (changes[i] > 0) ag += changes[i]; else al += Math.abs(changes[i]); }
  ag /= period; al /= period;
  for (let i = period; i < changes.length; i++) {
    ag = (ag * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
    al = (al * (period - 1) + (changes[i] < 0 ? Math.abs(changes[i]) : 0)) / period;
  }
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

/**
 * buildMicroSignal — unified micro-level real-trade signal for one pair.
 * Blends OKX 1s intraday, OKX tick (ms) micro-pressure, and Polygon macro.
 */
export async function buildMicroSignal(instId, polyApiKey) {
  const [ticker, candles, trades, polyDaily, polyMinute] = await Promise.all([
    fetchOkxTicker(instId),
    fetchOkxCandles1s(instId),
    fetchOkxTrades(instId),
    fetchPolygonDaily(polyApiKey),
    fetchPolygonHistMinute(polyApiKey),
  ]);

  const base = {
    instId,
    okx1sCandles: candles.length,
    okxTickTrades: trades.length,
    polygonDailyBars: polyDaily.length,
    polygonMinuteBars: polyMinute.length,
    ticker,
    source: 'OKX_1S_PLUS_TICK_MS_PLUS_POLYGON_DAILY_MINUTE',
  };

  if (!ticker || candles.length < 30 || trades.length < 10) {
    return { ...base, ready: false, reason: `insufficient data ticker=${!!ticker} candles=${candles.length} trades=${trades.length}` };
  }

  const closes = candles.map(c => c.close);
  const emaFast = calcEMA(closes, 9);
  const emaSlow = calcEMA(closes, 21);
  const rsi = calcRSI(closes, 14);
  const mom10 = closes.length >= 10 ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100 : 0;
  const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
  const priorVol = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
  const volMom = priorVol > 0 ? (recentVol - priorVol) / priorVol * 100 : 0;

  const micro = analyzeMicroTick(trades);

  let polyMacro = { available: false, dailyDirection: 'NEUTRAL', minuteMomentum: 0, macroConfirmed: false };
  if (polyDaily.length >= 21) {
    const dc = polyDaily.map(b => b.close);
    const dEmaF = calcEMA(dc, 9);
    const dEmaS = calcEMA(dc, 21);
    const dRsi = calcRSI(dc, 14);
    const vote = (dEmaF > dEmaS ? 1 : -1) + (dRsi > 55 ? 1 : dRsi < 45 ? -1 : 0);
    polyMacro.dailyDirection = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';
    polyMacro.available = true;
  }
  if (polyMinute.length >= 30) {
    const last = polyMinute.slice(-120);
    polyMacro.minuteMomentum = (last[last.length - 1].close - last[0].close) / last[0].close * 100;
  }
  polyMacro.macroConfirmed = polyMacro.dailyDirection !== 'NEUTRAL' &&
    ((polyMacro.minuteMomentum > 0.1 && polyMacro.dailyDirection === 'BULLISH') ||
     (polyMacro.minuteMomentum < -0.1 && polyMacro.dailyDirection === 'BEARISH'));

  // Composite (0-100): 40% intraday (1s), 35% micro-tick (ms), 25% polygon macro
  const intScore = (emaFast > emaSlow ? 60 : 40) + (rsi > 55 ? 15 : rsi < 45 ? -15 : 0);
  const tickBlended = micro.tickDirection === 'BUY_PRESSURE' ? 75 : micro.tickDirection === 'NEUTRAL' ? 50 : 20;
  const polyScore = polyMacro.available ? (polyMacro.dailyDirection === 'BULLISH' ? 78 : polyMacro.dailyDirection === 'BEARISH' ? 22 : 50) : 50;
  const composite = Math.round(Math.max(0, Math.min(100, intScore)) * 0.40 + tickBlended * 0.35 + polyScore * 0.25);

  const microBullish = micro.tickDirection === 'BUY_PRESSURE' && mom10 > 0;
  const microBearish = micro.tickDirection === 'SELL_PRESSURE' && mom10 < 0;

  return {
    ...base,
    ready: true,
    emaFast, emaSlow, rsi,
    momentum10s: parseFloat(mom10.toFixed(4)),
    volumeMomentum: parseFloat(volMom.toFixed(2)),
    micro,
    polygonMacro: polyMacro,
    compositeScore: composite,
    microBullish,
    microBearish,
    signal: microBullish && polyMacro.dailyDirection !== 'BEARISH' ? 'BUY'
      : microBearish && polyMacro.dailyDirection !== 'BULLISH' ? 'SELL'
      : 'WAIT',
    spreadPct: ticker.spreadPct,
    lastPrice: ticker.last,
  };
}