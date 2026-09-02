/**
 * Вдигат ли портите процента печеливши.
 *
 * КОЕ Е ПРОВЕРЕНО: тренд (EMA9 > EMA21), сила (RSI под тавана) и движение
 * (дневен обхват). Те се смятат само от свещи, значи и от историята.
 *
 * КОЕ НЕ Е: натискът от тиковете и потвърждението от Polygon. OKX не дава
 * историческа книга със сделки, а Polygon иска ключ, какъвто няма. Тези две
 * порти може да помагат или да пречат - тук не се знае и не се твърди.
 *
 * Индикаторите се смятат САМО от свещите ПРЕДИ входа. Ако се смятат от целия
 * ред, резултатът поглежда в бъдещето и излиза чудесен, без да значи нищо.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { loadConfig, breakevenWinRate } from '../src/config.ts';
import { ROBOTS } from '../src/core/robots.ts';
import { fetchOkxCandles, calcEMA, calcRSI, type Candle } from '../shared/microMarketData.ts';

const config = loadConfig();
const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'UNI-USDT', 'XRP-USDT', 'DOGE-USDT'];

const SETUP: Record<string, { bar: string; horizon: number }> = {
  scalp: { bar: '1m', horizon: 10 },
  momentum: { bar: '5m', horizon: 12 },
  grid: { bar: '15m', horizon: 16 },
  steady: { bar: '1H', horizon: 24 },
  dca: { bar: '4H', horizon: 12 },
  swing: { bar: '1D', horizon: 10 },
};

const WARMUP = 30; // толкова свещи са нужни за EMA21 и RSI14

function outcome(candles: Candle[], i: number, horizon: number, stop: number, rr: number) {
  const entry = candles[i]!.close;
  const target = entry * (1 + stop * rr);
  const stopPx = entry * (1 - stop);
  for (let j = i + 1; j <= i + horizon && j < candles.length; j++) {
    const c = candles[j]!;
    if (c.low <= stopPx) return 'loss';
    if (c.high >= target) return 'win';
  }
  return null; // неразрешено в срока
}

console.log('Портите, които се смятат от свещи: тренд, сила, движение.');
console.log('НЕ са проверени: натиск от тикове и Polygon.\n');
console.log('робот        без порти          с порти            нула при   решение');
console.log('─'.repeat(76));

for (const p of ROBOTS) {
  const s = SETUP[p.strategy]!;
  const be = breakevenWinRate({
    stopDistancePct: p.stopDistancePct,
    rewardRiskRatio: p.rewardRiskRatio,
    fees: config.fees,
    spreadPct: 0.0002,
    takerEntry: p.entry === 'market',
  }) * 100;

  let rawWins = 0, rawN = 0, gatedWins = 0, gatedN = 0;

  for (const pair of PAIRS) {
    const candles = await fetchOkxCandles(pair, s.bar, 300);
    if (candles.length < WARMUP + s.horizon + 10) continue;

    for (let i = WARMUP; i + s.horizon < candles.length; i++) {
      const res = outcome(candles, i, s.horizon, p.stopDistancePct, p.rewardRiskRatio);
      if (!res) continue;
      rawN++;
      if (res === 'win') rawWins++;

      // Само миналото - срезът свършва на i включително.
      const past = candles.slice(0, i + 1);
      const closes = past.map((c) => c.close);
      const ema9 = calcEMA(closes, 9);
      const ema21 = calcEMA(closes, 21);
      const rsi = calcRSI(closes, 14);
      if (ema9 === null || ema21 === null || rsi === null) continue;

      const recent = past.slice(-24);
      const hi = Math.max(...recent.map((c) => c.high));
      const lo = Math.min(...recent.map((c) => c.low));
      const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : 0;

      const passes =
        ema9 > ema21 &&
        rsi <= p.gates.maxRsi &&
        rangePct >= p.gates.minDailyRangePct;

      if (!passes) continue;
      gatedN++;
      if (res === 'win') gatedWins++;
    }
  }

  const rawPct = rawN ? (rawWins / rawN) * 100 : 0;
  const gatedPct = gatedN ? (gatedWins / gatedN) * 100 : 0;
  const verdict = gatedN < 30 ? 'малко сделки' : gatedPct >= be ? 'ПЕЧЕЛИ ✓' : 'губи ✗';

  console.log(
    `${p.name.padEnd(12)} ${rawPct.toFixed(1).padStart(5)}% (${String(rawN).padStart(4)})    ` +
    `${gatedPct.toFixed(1).padStart(5)}% (${String(gatedN).padStart(4)})    ` +
    `${be.toFixed(1).padStart(6)}%   ${verdict}`
  );
}
