/**
 * Какво може да се направи със сто долара - смятано, не гадано.
 *
 * Не прогнозира печалба. Показва размера на сделката, таксите и колко остава
 * при печалба и при загуба. Това са числа, които се знаят предварително,
 * за разлика от посоката на пазара.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { ROBOTS, profileBreakeven } from '../src/core/robots.ts';
import { loadConfig } from '../src/config.ts';
import { OkxClient } from '../src/exchange/okxClient.ts';

const config = loadConfig();
const CAPITAL = 100;
const risk = config.strategy.riskPerTrade;

console.log(`Капитал $${CAPITAL} · риск на сделка ${(risk * 100).toFixed(2)}% = $${(CAPITAL * risk).toFixed(2)}`);
console.log(`Такси: ${(config.fees.taker * 100).toFixed(2)}% на страна, ${(config.fees.taker * 200).toFixed(2)}% за влизане+излизане`);
console.log(`Таван сделки на ден: ${config.strategy.maxTradesPerDay}\n`);

console.log('робот         размер   при печалба   при загуба   нужни печеливши');
console.log('─'.repeat(70));

for (const p of ROBOTS) {
  const riskUsd = CAPITAL * risk;
  // Размерът излиза от риска и стопа, но не може да мине капитала.
  const wanted = riskUsd / p.stopDistancePct;
  const size = Math.min(wanted, CAPITAL);
  const feeUsd = size * config.fees.taker * 2;

  const winUsd = size * p.stopDistancePct * p.rewardRiskRatio - feeUsd;
  const lossUsd = size * p.stopDistancePct + feeUsd;
  const be = profileBreakeven(p, config.fees) * 100;

  console.log(
    `${p.name.padEnd(12)} $${size.toFixed(0).padStart(5)}   ` +
    `+$${winUsd.toFixed(2).padStart(6)}      -$${lossUsd.toFixed(2).padStart(5)}      ${be.toFixed(1)}%` +
    (wanted > CAPITAL ? '   (размерът е орязан от капитала)' : '')
  );
}

console.log('\n── минимални размери на OKX ───────────────────────────────');
const okx = new OkxClient({ baseUrl: config.okx.baseUrl, demo: false });
for (const pair of ['BTC-USDT', 'ETH-USDT', 'SOL-USDT']) {
  try {
    const i = await okx.instrument(pair);
    const t = await okx.ticker(pair).catch(() => null);
    const px = t ? Number((t as any).last ?? 0) : 0;
    const minUsd = px > 0 ? i.minSz * px : 0;
    console.log(`  ${pair.padEnd(10)} минимум ${i.minSz} = $${minUsd.toFixed(2)}`);
  } catch (e) {
    console.log(`  ${pair.padEnd(10)} ${(e as Error).message.slice(0, 60)}`);
  }
}
