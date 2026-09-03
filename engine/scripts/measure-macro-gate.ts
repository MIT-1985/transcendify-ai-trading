/**
 * Струва ли си макро портата.
 *
 * Тя единствена от неизмерените още има вето - за Пазител, Постоянен и
 * Стълба. Оправданието беше "втори независим източник", не "вдига процента".
 * Но правилото важи и за нея: порта без доказателство не спира сделка.
 *
 * Дневната посока се смята от СЪЩОТО, което дава Alchemy - дневни затваряния.
 * Затова OKX 1D свещите са годен заместител за проверката назад.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { loadConfig, breakevenWinRate } from '../src/config.ts';
import { ROBOTS } from '../src/core/robots.ts';
import { fetchOkxCandles, calcEMA, calcRSI, type Candle } from '../shared/microMarketData.ts';

const config = loadConfig();
const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT', 'DOGE-USDT', 'ZEC-USDT', 'FIL-USDT', 'UNI-USDT'];
const SETUP: Record<string, { bar: string; horizon: number }> = {
  scalp: { bar: '1m', horizon: 10 }, momentum: { bar: '5m', horizon: 12 },
  grid: { bar: '15m', horizon: 16 }, steady: { bar: '1H', horizon: 24 },
  dca: { bar: '4H', horizon: 12 }, swing: { bar: '1D', horizon: 10 }, copy: { bar: '1H', horizon: 24 },
};

/** Дневната посока към даден момент - само от миналото. */
function macroAt(daily: Candle[], atMs: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null {
  const past = daily.filter((d) => d.ts <= atMs);
  if (past.length < 21) return null;
  const closes = past.map((c) => c.close);
  const f = calcEMA(closes, 9), s = calcEMA(closes, 21), r = calcRSI(closes, 14);
  if (f === null || s === null || r === null) return null;
  const mom = closes.length >= 10
    ? (closes[closes.length - 1]! - closes[closes.length - 10]!) / closes[closes.length - 10]! * 100 : 0;
  const vote = (f > s ? 1 : -1) + (r > 55 ? 1 : r < 45 ? -1 : 0) + (mom > 0.5 ? 1 : mom < -0.5 ? -1 : 0);
  return vote >= 2 ? 'BULLISH' : vote <= -2 ? 'BEARISH' : 'NEUTRAL';
}

console.log('Макро портата пуска, когато дневната посока НЕ е надолу.\n');
console.log('робот         без макро            с макро              промяна');
console.log('─'.repeat(66));

for (const p of ROBOTS) {
  const s = SETUP[p.strategy]!;
  const be = breakevenWinRate({
    stopDistancePct: p.stopDistancePct, rewardRiskRatio: p.rewardRiskRatio,
    fees: config.fees, spreadPct: 0.0002, takerEntry: p.entry === 'market',
  }) * 100;

  const rows: Array<{ win: boolean; macroOk: boolean }> = [];

  for (const pair of PAIRS) {
    const [candles, daily] = await Promise.all([
      fetchOkxCandles(pair, s.bar, 300),
      fetchOkxCandles(pair, '1D', 300),
    ]);
    if (candles.length < 60 || daily.length < 30) continue;

    for (let i = 30; i + s.horizon < candles.length; i++) {
      const entry = candles[i]!.close;
      const target = entry * (1 + p.stopDistancePct * p.rewardRiskRatio);
      const stop = entry * (1 - p.stopDistancePct);
      let win: boolean | null = null;
      for (let j = i + 1; j <= i + s.horizon; j++) {
        const c = candles[j]!;
        if (c.low <= stop) { win = false; break; }
        if (c.high >= target) { win = true; break; }
      }
      if (win === null) continue;

      // Само трендът, както е сега.
      const closes = candles.slice(0, i + 1).map((c) => c.close);
      const ema9 = calcEMA(closes, 9), ema21 = calcEMA(closes, 21);
      if (ema9 === null || ema21 === null || ema9 <= ema21) continue;

      const m = macroAt(daily, candles[i]!.ts);
      rows.push({ win, macroOk: m !== null && m !== 'BEARISH' });
    }
  }

  if (rows.length < 40) { console.log(`${p.name.padEnd(12)} малко данни (${rows.length})`); continue; }

  const show = (r: typeof rows) => {
    if (r.length === 0) return { n: 0, edge: 0, txt: '     0        —' };
    const wr = r.filter((x) => x.win).length / r.length * 100;
    return { n: r.length, edge: wr - be, txt: `${String(r.length).padStart(6)}${(wr - be >= 0 ? '+' : '') + (wr - be).toFixed(1).padStart(9)}` };
  };
  const a = show(rows), b = show(rows.filter((x) => x.macroOk));
  const delta = b.n > 0 ? b.edge - a.edge : 0;
  console.log(
    `${p.name.padEnd(12)}${a.txt}      ${b.txt}      ${(delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(7)}` +
    ` ${b.n === 0 ? 'реже всичко' : delta >= 0 ? '✓' : ''}`
  );
}
