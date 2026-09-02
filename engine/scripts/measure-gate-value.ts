/**
 * Какво дава всяка порта - и струва ли си.
 *
 * Порта, която реже сделки без да вдига процента печеливши, е чиста вреда:
 * плащаш пропуснати входове и не получаваш нищо. Затова тук се мери не колко
 * реже, а КОЛКО ВДИГА - и двете едновременно.
 *
 * Мярката е "точки над нулата": процент печеливши минус точката на
 * изравняване. Само тя има значение - 55% при нужни 53% е печалба, 55% при
 * нужни 60% е загуба.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { loadConfig, breakevenWinRate } from '../src/config.ts';
import { ROBOTS } from '../src/core/robots.ts';
import { fetchOkxCandles, calcEMA, calcRSI, type Candle } from '../shared/microMarketData.ts';

const config = loadConfig();

/** Измереното на OKX, не предположеното: spread ≈ exp(a) · V^b. */
const SPREAD_LAW = { a: 8.032, bVol: -0.752 };

const res = await fetch(`${config.okx.baseUrl}/api/v5/market/tickers?instType=SPOT`);
const tickers = ((await res.json()) as any).data ?? [];
const universe = tickers
  .filter((d: any) => d.instId.endsWith('-USDT'))
  .map((d: any) => {
    const last = parseFloat(d.last);
    const bid = parseFloat(d.bidPx || last), ask = parseFloat(d.askPx || last);
    const mid = (bid + ask) / 2;
    return {
      instId: d.instId as string,
      volumeUsd: parseFloat(d.volCcy24h || 0),
      spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : 99,
    };
  })
  .filter((t: any) => t.volumeUsd >= 10_000_000)
  .sort((a: any, b: any) => b.volumeUsd - a.volumeUsd)
  .slice(0, 10);

const SETUP: Record<string, { bar: string; horizon: number }> = {
  scalp: { bar: '1m', horizon: 10 }, momentum: { bar: '5m', horizon: 12 },
  grid: { bar: '15m', horizon: 16 }, steady: { bar: '1H', horizon: 24 },
  dca: { bar: '4H', horizon: 12 }, swing: { bar: '1D', horizon: 10 }, copy: { bar: '1H', horizon: 24 },
};
const WARMUP = 30;

type Entry = { win: boolean; trend: boolean; rsi: number; range: number; spreadOdds: number };

console.log('За всяка порта: колко сделки остават и колко точки НАД НУЛАТА дава.\n');
console.log('робот        порта              сделки   печеливши   над нулата');
console.log('─'.repeat(66));

for (const p of ROBOTS) {
  const s = SETUP[p.strategy]!;
  const be = breakevenWinRate({
    stopDistancePct: p.stopDistancePct, rewardRiskRatio: p.rewardRiskRatio,
    fees: config.fees, spreadPct: 0.0002, takerEntry: p.entry === 'market',
  }) * 100;

  const entries: Entry[] = [];

  for (const t of universe) {
    const candles: Candle[] = await fetchOkxCandles(t.instId, s.bar, 300);
    if (candles.length < WARMUP + s.horizon + 10) continue;

    // Колко пъти спредът е над очакваното от обема - законът #89, но с
    // измерените наклони, не с обявените.
    const expected = Math.exp(SPREAD_LAW.a) * Math.pow(t.volumeUsd, SPREAD_LAW.bVol);
    const spreadOdds = expected > 0 ? t.spreadPct / expected : 99;

    for (let i = WARMUP; i + s.horizon < candles.length; i++) {
      const entry = candles[i]!.close;
      const target = entry * (1 + p.stopDistancePct * p.rewardRiskRatio);
      const stop = entry * (1 - p.stopDistancePct);
      let res: boolean | null = null;
      for (let j = i + 1; j <= i + s.horizon; j++) {
        const c = candles[j]!;
        if (c.low <= stop) { res = false; break; }
        if (c.high >= target) { res = true; break; }
      }
      if (res === null) continue;

      const past = candles.slice(0, i + 1);
      const closes = past.map((c) => c.close);
      const ema9 = calcEMA(closes, 9), ema21 = calcEMA(closes, 21), rsi = calcRSI(closes, 14);
      if (ema9 === null || ema21 === null || rsi === null) continue;
      const recent = past.slice(-24);
      const hi = Math.max(...recent.map((c) => c.high)), lo = Math.min(...recent.map((c) => c.low));

      entries.push({
        win: res, trend: ema9 > ema21, rsi,
        range: lo > 0 ? ((hi - lo) / lo) * 100 : 0,
        spreadOdds,
      });
    }
  }

  if (entries.length < 50) { console.log(`${p.name.padEnd(12)} малко данни`); continue; }

  const show = (label: string, kept: Entry[]) => {
    if (kept.length === 0) { console.log(`${''.padEnd(12)} ${label.padEnd(18)}      0        —          —`); return; }
    const wr = (kept.filter((e) => e.win).length / kept.length) * 100;
    const edge = wr - be;
    console.log(
      `${''.padEnd(12)} ${label.padEnd(18)}${String(kept.length).padStart(6)}` +
      `${wr.toFixed(1).padStart(11)}%${(edge >= 0 ? '+' : '') + edge.toFixed(1).padStart(10)} ${edge >= 0 ? '✓' : ''}`
    );
  };

  console.log(`${p.name} (нула при ${be.toFixed(1)}%)`);
  show('без порти', entries);
  show('само тренд', entries.filter((e) => e.trend));
  show('само RSI', entries.filter((e) => e.rsi <= p.gates.maxRsi));
  show('само движение', entries.filter((e) => e.range >= p.gates.minDailyRangePct));
  show('само спред #89', entries.filter((e) => e.spreadOdds <= 2));
  show('трите стари', entries.filter((e) => e.trend && e.rsi <= p.gates.maxRsi && e.range >= p.gates.minDailyRangePct));
  show('+ спред #89', entries.filter((e) => e.trend && e.rsi <= p.gates.maxRsi && e.range >= p.gates.minDailyRangePct && e.spreadOdds <= 2));
  console.log();
}
