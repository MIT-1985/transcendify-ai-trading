/**
 * Всеки робот, измерен по СВОИТЕ числа - стоп, цел и свещи.
 *
 * Влиза се във всеки момент, без порти. Това е основата: какво дава пазарът
 * сам по себе си на тази геометрия. Портите после трябва да вдигнат това
 * число - ако основата е много под нулата, портите имат непосилна работа.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { loadConfig, breakevenWinRate } from '../src/config.ts';
import { ROBOTS } from '../src/core/robots.ts';
import { fetchOkxCandles } from '../shared/microMarketData.ts';

const config = loadConfig();
const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'UNI-USDT', 'XRP-USDT'];

// Свещта и срокът вървят заедно: скалпърът има десет минути, суингът - дни.
const SETUP: Record<string, { bar: string; horizon: number; label: string }> = {
  scalp:    { bar: '1m',  horizon: 10, label: '10 минути' },
  momentum: { bar: '5m',  horizon: 12, label: '1 час' },
  grid:     { bar: '15m', horizon: 16, label: '4 часа' },
  steady:   { bar: '1H',  horizon: 24, label: '1 ден' },
  dca:      { bar: '4H',  horizon: 12, label: '2 дни' },
  swing:    { bar: '1D',  horizon: 10, label: '10 дни' },
};

console.log('Вход във всеки момент, без порти. Печеливши = целта преди стопа.\n');
console.log('робот        срок       решени  печеливши   нула при   разлика');
console.log('─'.repeat(66));

for (const p of ROBOTS) {
  const s = SETUP[p.strategy]!;
  const be = breakevenWinRate({
    stopDistancePct: p.stopDistancePct,
    rewardRiskRatio: p.rewardRiskRatio,
    fees: config.fees,
    spreadPct: 0.0002,
    takerEntry: p.entry === 'market',
  }) * 100;

  let wins = 0, decided = 0;
  for (const pair of PAIRS) {
    const candles = await fetchOkxCandles(pair, s.bar, 300);
    if (candles.length < 60) continue;
    for (let i = 0; i + s.horizon < candles.length; i++) {
      const entry = candles[i]!.close;
      const target = entry * (1 + p.stopDistancePct * p.rewardRiskRatio);
      const stop = entry * (1 - p.stopDistancePct);
      for (let j = i + 1; j <= i + s.horizon; j++) {
        const c = candles[j]!;
        if (c.low <= stop) { decided++; break; }
        if (c.high >= target) { decided++; wins++; break; }
      }
    }
  }

  const pct = decided ? (wins / decided) * 100 : 0;
  const diff = pct - be;
  console.log(
    `${p.name.padEnd(12)} ${s.label.padEnd(10)} ${String(decided).padStart(5)}   ` +
    `${pct.toFixed(1).padStart(6)}%    ${be.toFixed(1).padStart(6)}%   ` +
    `${(diff >= 0 ? '+' : '')}${diff.toFixed(1).padStart(6)} ${diff >= 0 ? '✓' : '✗'}`
  );
}
