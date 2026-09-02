/**
 * Колко често се случва движението, което скалпърът иска - и колко от тези
 * случаи са печеливши.
 *
 * ВАЖНО за числата: брои се само когато изходът е РЕШЕН в дадения срок -
 * или целта, или стопът. Влизания, при които нищо не се случва, не са нито
 * печалба, нито загуба и биха развалили процента, ако се броят.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { loadConfig } from '../src/config.ts';
import { fetchOkxCandles } from '../shared/microMarketData.ts';
import { breakevenWinRate } from '../src/config.ts';

const config = loadConfig();

const res = await fetch(`${config.okx.baseUrl}/api/v5/market/tickers?instType=SPOT`);
const json = (await res.json()) as any;
const liquid = (json.data ?? [])
  .filter((d: any) => d.instId.endsWith('-USDT'))
  .map((d: any) => ({ instId: d.instId as string, vol: parseFloat(d.volCcy24h || 0) }))
  .filter((d: any) => d.vol >= 10_000_000)
  .sort((a: any, b: any) => b.vol - a.vol)
  .slice(0, 12);

const STOP = 0.003;
const HORIZON = 10;

const be2 = breakevenWinRate({ stopDistancePct: STOP, rewardRiskRatio: 2, fees: config.fees, spreadPct: 0.0002, takerEntry: false }) * 100;
const be3 = breakevenWinRate({ stopDistancePct: STOP, rewardRiskRatio: 3, fees: config.fees, spreadPct: 0.0002, takerEntry: false }) * 100;

console.log(`Стоп 0.3%, срок ${HORIZON} мин, 1m свещи (~5 часа назад).`);
console.log(`Нула при: цел 1:2 → ${be2.toFixed(1)}%   цел 1:3 → ${be3.toFixed(1)}%\n`);
console.log('двойка       решени 1:2  печеливши   решени 1:3  печеливши');
console.log('─'.repeat(62));

for (const { instId } of liquid) {
  const candles = await fetchOkxCandles(instId, '1m', 300);
  if (candles.length < 60) continue;

  const measure = (rr: number) => {
    let wins = 0, decided = 0;
    for (let i = 0; i + HORIZON < candles.length; i++) {
      const entry = candles[i]!.close;
      const target = entry * (1 + STOP * rr);
      const stop = entry * (1 - STOP);
      for (let j = i + 1; j <= i + HORIZON; j++) {
        const c = candles[j]!;
        if (c.low <= stop) { decided++; break; }
        if (c.high >= target) { decided++; wins++; break; }
      }
    }
    return { wins, decided, pct: decided ? (wins / decided) * 100 : 0 };
  };

  const a = measure(2), b = measure(3);
  const mark = (m: { pct: number; decided: number }, be: number) =>
    m.decided < 20 ? ' малко данни' : m.pct >= be ? ' ✓' : ' ✗';

  console.log(
    `${instId.replace('-USDT','').padEnd(12)} ` +
    `${String(a.decided).padStart(6)}  ${a.pct.toFixed(1).padStart(6)}%${mark(a, be2).padEnd(13)}` +
    `${String(b.decided).padStart(4)}  ${b.pct.toFixed(1).padStart(6)}%${mark(b, be3)}`
  );
}
