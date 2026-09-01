/**
 * Общият пазарен слой: OKX за секундите, Polygon за дните.
 *
 * Този файл липсваше и заради него петте функции, които решават дали да се
 * търгува - claudeSignalEngine, robot1Execute, phase4FBTCOnlyPaperMode,
 * phase5AutoExecute, aiTradingAnalysis - падаха с "Cannot find module".
 * Възстановен е от собствените им извиквания и от местните копия на същите
 * сметки в phase3OKXOnlyReadOnlySignalValidator и phase4FBTCOnlyPaperMode,
 * така че числата излизат същите, а не измислени наново.
 *
 * Двата източника не се дублират, а се проверяват взаимно: OKX казва какво
 * става в момента, Polygon - накъде е гледал пазарът последните тридесет дни.
 * Сделка се взима само когато двата гледат в една посока.
 */

// OKX taker: 0.1% на посока, тоест 0.2% за влизане и излизане. Всяка цел за
// печалба под 0.2% е загуба преди да е започнала - затова е константа, а не
// настройка.
export const OKX_TAKER_FEE_RATE = 0.001;
export const OKX_MAKER_FEE_RATE = 0.0008;

const OKX_BASE = 'https://www.okx.com/api/v5';

export type OkxTicker = {
  ok: boolean;
  instId: string;
  last: number;
  lastPrice: number;
  price: number;
  bid: number;
  ask: number;
  bidPx: number;
  askPx: number;
  spreadPct: number;
  vol24h: number;
  volCcy24h: number;
  open24h: number;
  httpStatus: number;
};

export type Candle = { ts: number; open: number; high: number; low: number; close: number; vol: number };
export type Trade = { ts: number; price: number; size: number; side: string };
export type PolygonBar = { ts: number; open: number; high: number; low: number; close: number; vol: number };

/** Три опита с нарастващо изчакване. OKX връща празно при натоварване, не грешка. */
async function getJson(url: string, timeoutMs = 6000, attempts = 3): Promise<any> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const json = await res.json();
      return { json, status: res.status };
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  return { json: null, status: 0, error: lastErr };
}

/**
 * Публичният тикер. Връща null при неуспех, а не празен обект - викащите
 * проверяват с `if (!ticker)` и мълчалива нула би минала за истинска цена.
 */
export async function fetchOkxTicker(instId: string): Promise<OkxTicker | null> {
  const { json, status } = await getJson(`${OKX_BASE}/market/ticker?instId=${instId}`);
  const d = json?.data?.[0];
  if (!d) return null;

  const last = parseFloat(d.last);
  const bid = parseFloat(d.bidPx || d.last);
  const ask = parseFloat(d.askPx || d.last);
  const mid = (bid + ask) / 2;

  return {
    ok: true,
    instId,
    last,
    lastPrice: last,
    price: last,
    bid,
    ask,
    bidPx: bid,
    askPx: ask,
    spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : 0,
    vol24h: parseFloat(d.vol24h || 0),
    volCcy24h: parseFloat(d.volCcy24h || 0),
    open24h: parseFloat(d.open24h || last),
    httpStatus: status,
  };
}

/** Свещи, най-старата първа. OKX ги дава обърнати. */
export async function fetchOkxCandles(instId: string, bar = '1m', limit = 300): Promise<Candle[]> {
  const { json } = await getJson(`${OKX_BASE}/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`, 8000);
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((c: string[]) => ({
      ts: Number(c[0] ?? 0),
      open: parseFloat(c[1] ?? '0'),
      high: parseFloat(c[2] ?? '0'),
      low: parseFloat(c[3] ?? '0'),
      close: parseFloat(c[4] ?? '0'),
      vol: parseFloat(c[5] ?? '0'),
    }))
    .reverse();
}

/**
 * Секундни свещи с връщане към минутни.
 *
 * OKX дава 1s бар само за скорошни данни и не за всеки инструмент. Без
 * връщането празният отговор стигаше до claudeSignalEngine като
 * INSUFFICIENT_MARKET_DATA и роботът мълчеше, без да е ясно защо. По-добре
 * по-груби свещи, отколкото никакви - решението пак се взима, само с по-малко
 * подробност.
 */
export async function fetchOkxCandles1s(instId: string, limit = 300): Promise<Candle[]> {
  const seconds = await fetchOkxCandles(instId, '1s', limit);
  if (seconds.length >= 30) return seconds;
  return fetchOkxCandles(instId, '1m', limit);
}

/** Последните сделки, най-новата първа - точно както ги връща OKX. */
export async function fetchOkxTrades(instId: string, limit = 500): Promise<Trade[]> {
  const { json } = await getJson(`${OKX_BASE}/market/trades?instId=${instId}&limit=${limit}`);
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data.map((t: any) => ({
    ts: Number(t.ts),
    price: parseFloat(t.px),
    size: parseFloat(t.sz),
    side: t.side,
  }));
}

// ── Индикатори ───────────────────────────────────────────────────────────────
// Пренесени дословно от местните копия в phase3/phase4, за да не се разминат
// числата между старите функции и новите.

export function calcEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i]! * k + ema * (1 - k);
  return ema;
}

export function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]!);
  let ag = 0, al = 0;
  for (let i = 0; i < period; i++) {
    const d = changes[i]!;
    if (d > 0) ag += d;
    else al += Math.abs(d);
  }
  ag /= period;
  al /= period;
  for (let i = period; i < changes.length; i++) {
    const d = changes[i]!;
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
  }
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(2));
}

export type MicroTick = {
  buyPressurePercent: number;
  sellPressurePercent: number;
  tradeCount: number;
  tickDirection: 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'NEUTRAL';
  confidence: number;
  microMomentumPct: number;
  tickScore: number;
  confirmed: boolean;
  signal: string;
  reason: string;
  details: string;
};

/**
 * Кой натиска - купувачите или продавачите - по последните сделки.
 *
 * Обемът, не броят: сто дребни покупки не тежат колкото една едра продажба.
 * tickScore е стъпаловидна, не непрекъсната, защото прагът за сделка се
 * настройва на цели числа (minTickScore 12 → 15) и плаваща стойност би
 * направила настройката недоказуема.
 */
export function analyzeMicroTick(trades: Trade[]): MicroTick {
  const empty: MicroTick = {
    buyPressurePercent: 0, sellPressurePercent: 0, tradeCount: trades?.length || 0,
    tickDirection: 'NEUTRAL', confidence: 0, microMomentumPct: 0, tickScore: 0,
    confirmed: false, signal: 'NEUTRAL',
    reason: 'Insufficient trades', details: 'нужни са поне 10 сделки',
  };
  if (!Array.isArray(trades) || trades.length < 10) return empty;

  const buyVol = trades.filter(t => t.side === 'buy').reduce((s, t) => s + t.size, 0);
  const sellVol = trades.filter(t => t.side === 'sell').reduce((s, t) => s + t.size, 0);
  const totalVol = buyVol + sellVol;

  const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
  const sellPct = 100 - buyPct;

  // OKX връща най-новата сделка първа, затова "най-старата" е последната.
  const oldest = trades[trades.length - 1]!.price;
  const newest = trades[0]!.price;
  const priceDrift = oldest > 0 ? ((newest - oldest) / oldest) * 100 : 0;

  const tickDirection =
    buyPct >= 58 && priceDrift > 0 ? 'BUY_PRESSURE' :
    sellPct >= 58 && priceDrift < 0 ? 'SELL_PRESSURE' :
    'NEUTRAL';

  let confidence = 50;
  if (tickDirection === 'BUY_PRESSURE') confidence = Math.min(100, 50 + (buyPct - 50) * 2.5);
  if (tickDirection === 'SELL_PRESSURE') confidence = Math.min(100, 50 + (sellPct - 50) * 2.5);

  const tickScore = buyPct >= 65 ? 25 : buyPct >= 55 ? 18 : buyPct >= 45 ? 10 : 5;

  return {
    buyPressurePercent: parseFloat(buyPct.toFixed(2)),
    sellPressurePercent: parseFloat(sellPct.toFixed(2)),
    tradeCount: trades.length,
    tickDirection,
    confidence: parseFloat(confidence.toFixed(1)),
    microMomentumPct: parseFloat(priceDrift.toFixed(4)),
    tickScore,
    confirmed: tickDirection === 'BUY_PRESSURE',
    signal: tickDirection,
    reason: `buyVol=${buyVol.toFixed(4)} sellVol=${sellVol.toFixed(4)} priceDrift=${priceDrift.toFixed(4)}%`,
    details: `${trades.length} сделки, ${buyPct.toFixed(1)}% натиск за покупка`,
  };
}

// ── Polygon: макро потвърждение ──────────────────────────────────────────────
// Дневните и вчерашните минутни агрегати са в текущия план. Днешните минутни в
// реално време връщат 403 - затова тук се ползва само история. Ако това се
// смени с по-висок план, ограничението е на едно място.

/** OKX 'BTC-USDT' → Polygon 'X:BTCUSD'. */
export function toPolygonTicker(instId: string): string {
  const base = (instId || 'BTC-USDT').split('-')[0]!.toUpperCase();
  return `X:${base}USD`;
}

export async function fetchPolygonDaily(apiKey: string, instId = 'BTC-USDT'): Promise<PolygonBar[]> {
  if (!apiKey) return [];
  const ticker = toPolygonTicker(instId);
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const { json } = await getJson(
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${apiKey}`,
    8000, 2,
  );
  return (json?.results || []).map((b: any) => ({
    ts: b.t, close: b.c, open: b.o, high: b.h, low: b.l, vol: b.v,
  }));
}

export async function fetchPolygonHistMinute(apiKey: string, instId = 'BTC-USDT'): Promise<PolygonBar[]> {
  if (!apiKey) return [];
  const ticker = toPolygonTicker(instId);
  const day = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const { json } = await getJson(
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${day}/${day}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`,
    8000, 2,
  );
  return (json?.results || []).map((b: any) => ({
    ts: b.t, close: b.c, open: b.o, high: b.h, low: b.l, vol: b.v,
  }));
}

export type PolygonMacro = {
  dailyDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  dailyScore: number;
  minuteMomentum: number;
  macroConfirmed: boolean;
  available: boolean;
};

/** Накъде гледа дневната графика. Без ключ за Polygon връща NEUTRAL и available:false - това не е "мечи пазар", а липса на данни. */
export function analyzePolygonMacro(dailyBars: PolygonBar[], minuteBars: PolygonBar[]): PolygonMacro {
  const closes = dailyBars.map(b => b.close);
  if (closes.length < 21) {
    return { dailyDirection: 'NEUTRAL', dailyScore: 50, minuteMomentum: 0, macroConfirmed: false, available: false };
  }

  const emaF = calcEMA(closes, 9)!;
  const emaS = calcEMA(closes, 21)!;
  const rsi = calcRSI(closes, 14) ?? 50;
  const mom = closes.length >= 10
    ? (closes[closes.length - 1]! - closes[closes.length - 10]!) / closes[closes.length - 10]! * 100
    : 0;

  const vote = (emaF > emaS ? 1 : -1)
    + (rsi > 55 ? 1 : rsi < 45 ? -1 : 0)
    + (mom > 0.5 ? 1 : mom < -0.5 ? -1 : 0);

  const dailyDirection = vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';
  const dailyScore = Math.max(0, Math.min(100, 50 + vote * 15));

  const mCloses = minuteBars.map(b => b.close);
  const minuteMomentum = mCloses.length >= 60
    ? parseFloat(((mCloses[mCloses.length - 1]! - mCloses[mCloses.length - 60]!) / mCloses[mCloses.length - 60]! * 100).toFixed(4))
    : 0;

  return {
    dailyDirection,
    dailyScore,
    minuteMomentum,
    macroConfirmed: dailyDirection === 'BULLISH' && minuteMomentum > -0.5,
    available: true,
  };
}

export type MicroSignal = {
  ready: boolean;
  reason: string;
  source: string;
  instId: string;
  lastPrice: number;
  spreadPct: number;
  emaFast: number | null;
  emaSlow: number | null;
  rsi: number | null;
  momentum10s: number;
  volumeMomentum: number;
  compositeScore: number;
  micro: MicroTick;
  polygonMacro: PolygonMacro;
};

/**
 * Едно обаждане, което събира всичко нужно за решение.
 *
 * `ready:false` е нормален изход, не грешка: празен пазар в четири сутринта
 * изглежда точно така. Причината се връща в текст, за да не се гадае защо
 * роботът мълчи.
 */
export async function buildMicroSignal(instId = 'BTC-USDT', polygonApiKey = ''): Promise<MicroSignal> {
  const [ticker, candles, trades, daily, minute] = await Promise.all([
    fetchOkxTicker(instId),
    fetchOkxCandles1s(instId),
    fetchOkxTrades(instId),
    fetchPolygonDaily(polygonApiKey, instId),
    fetchPolygonHistMinute(polygonApiKey, instId),
  ]);

  const micro = analyzeMicroTick(trades);
  const polygonMacro = analyzePolygonMacro(daily, minute);
  const closes = candles.map(c => c.close);

  const base = {
    source: 'okx+polygon',
    instId,
    lastPrice: ticker?.last ?? 0,
    spreadPct: ticker?.spreadPct ?? 0,
    micro,
    polygonMacro,
  };

  if (!ticker) {
    return { ...base, ready: false, reason: 'OKX не върна тикер', emaFast: null, emaSlow: null, rsi: null, momentum10s: 0, volumeMomentum: 0, compositeScore: 0 };
  }
  if (closes.length < 30) {
    return { ...base, ready: false, reason: `недостатъчно свещи (${closes.length}/30)`, emaFast: null, emaSlow: null, rsi: null, momentum10s: 0, volumeMomentum: 0, compositeScore: 0 };
  }

  const emaFast = calcEMA(closes, 9);
  const emaSlow = calcEMA(closes, 21);
  const rsi = calcRSI(closes, 14);
  const momentum10s = closes.length >= 10
    ? parseFloat(((closes[closes.length - 1]! - closes[closes.length - 10]!) / closes[closes.length - 10]! * 100).toFixed(4))
    : 0;

  const recentVol = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
  const priorVol = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
  const volumeMomentum = priorVol > 0 ? parseFloat(((recentVol - priorVol) / priorVol * 100).toFixed(2)) : 0;

  // Тежести: половината на самата графика, а спредът и таксата не добавят
  // точки - те само отнемат. Скъпият вход не става добър, защото посоката е
  // вярна.
  let trend = 50;
  if (emaFast !== null && emaSlow !== null) trend += emaFast > emaSlow ? 15 : -15;
  if (rsi !== null) trend += rsi > 55 ? 8 : rsi < 45 ? -8 : 0;
  trend += momentum10s > 0.02 ? 7 : momentum10s < -0.02 ? -7 : 0;
  trend += volumeMomentum > 10 ? 5 : 0;
  trend = Math.max(0, Math.min(100, trend));

  const macroPart = polygonMacro.available ? polygonMacro.dailyScore : 50;
  const spreadPenalty = ticker.spreadPct > 0.05 ? 12 : 0;

  const compositeScore = Math.round(
    Math.max(0, trend * 0.50 + micro.tickScore * 4 * 0.30 + macroPart * 0.20 - spreadPenalty),
  );

  return {
    ...base,
    ready: true,
    reason: 'ok',
    emaFast,
    emaSlow,
    rsi,
    momentum10s,
    volumeMomentum,
    compositeScore,
  };
}
