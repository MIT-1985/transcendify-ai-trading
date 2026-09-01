/** Проверка, че пазарният слой връща истински числа, а не празни масиви. */
import { buildMicroSignal, fetchOkxCandles1s } from '../shared/microMarketData.ts';

const key = process.env.POLYGON_API_KEY || '';
for (const p of ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  const c = await fetchOkxCandles1s(p);
  const s = await buildMicroSignal(p, key);
  console.log(
    p.padEnd(9),
    'свещи=' + String(c.length).padEnd(4),
    'цена=' + String(s.lastPrice).padEnd(10),
    'score=' + String(s.compositeScore).padEnd(4),
    'tick=' + s.micro.tickDirection.padEnd(14),
    'rsi=' + s.rsi,
    'polygon=' + s.polygonMacro.available,
    s.ready ? '' : '| ' + s.reason,
  );
}
