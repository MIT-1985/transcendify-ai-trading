/**
 * Какво прави честотата.
 *
 * Таксата се плаща на ВСЯКА сделка, независимо дали е печеливша. Тя е
 * единственото, което се знае предварително - затова се смята, а не се гадае.
 */
import { loadConfig } from '../src/config.ts';
import { robotById } from '../src/core/robots.ts';

const config = loadConfig();
const CAPITAL = 100;
const roundTrip = config.fees.taker * 2;

console.log(`Такса за влизане+излизане: ${(roundTrip * 100).toFixed(2)}% от размера на сделката\n`);

for (const id of ['sprinter', 'momentum', 'grid']) {
  const p = robotById(id)!;
  const size = Math.min((CAPITAL * config.strategy.riskPerTrade) / p.stopDistancePct, CAPITAL);
  const target = p.stopDistancePct * p.rewardRiskRatio;
  const feePerTrade = size * roundTrip;
  const winPerTrade = size * target - feePerTrade;
  const lossPerTrade = size * p.stopDistancePct + feePerTrade;

  console.log(`── ${p.name} (стоп ${(p.stopDistancePct*100).toFixed(2)}%, изчакване ${p.cooldownMinutes} мин) ──`);
  console.log(`   размер $${size.toFixed(0)} · такса $${feePerTrade.toFixed(3)} на сделка`);

  for (const perDay of [6, 24, 96, 288]) {
    const everyMin = Math.round(24 * 60 / perDay);
    const fees = feePerTrade * perDay;
    // При 50% познати: половината печелят, половината губят.
    const net50 = (winPerTrade * perDay / 2) - (lossPerTrade * perDay / 2);
    const net55 = (winPerTrade * perDay * 0.55) - (lossPerTrade * perDay * 0.45);
    console.log(
      `   ${String(perDay).padStart(3)}/ден (на ~${String(everyMin).padStart(3)} мин): ` +
      `такси $${fees.toFixed(2).padStart(6)} = ${(fees/CAPITAL*100).toFixed(1).padStart(5)}% от капитала   ` +
      `при 50% познати: $${net50.toFixed(2).padStart(7)}   при 55%: $${net55.toFixed(2).padStart(7)}`
    );
  }
  console.log();
}
