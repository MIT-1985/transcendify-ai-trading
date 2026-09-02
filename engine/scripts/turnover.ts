/**
 * Капиталът се върти - таксата се плаща на всяко завъртане.
 *
 * Симулира един ден, сделка по сделка, като размерът се смята от ТЕКУЩИЯ
 * капитал. Точно затова таксите хапят: те не се вадят веднъж от стоте
 * долара, а от всяко следващо салдо.
 */
import { loadConfig } from '../src/config.ts';
import { robotById } from '../src/core/robots.ts';

const config = loadConfig();
const fee = config.fees.taker; // на страна

function day(robotId: string, trades: number, winRate: number, start = 100) {
  const p = robotById(robotId)!;
  let equity = start;
  let volume = 0;
  let paidFees = 0;
  let wins = 0;

  for (let i = 0; i < trades; i++) {
    // Размерът следва текущия капитал, както прави и двигателят.
    const size = Math.min((equity * config.strategy.riskPerTrade) / p.stopDistancePct, equity);
    if (size <= 0) break;

    const f = size * fee * 2;
    volume += size;
    paidFees += f;

    // Редуваме печалба и загуба в зададеното съотношение - без случайност,
    // за да е повторимо.
    const win = (i % 100) < winRate * 100;
    if (win) wins++;
    const gross = win ? size * p.stopDistancePct * p.rewardRiskRatio : -size * p.stopDistancePct;
    equity += gross - f;
  }
  return { name: p.name, equity, volume, paidFees, wins, trades };
}

for (const [id, label] of [['sprinter', 'Спринтьор'], ['momentum', 'Инерция']] as const) {
  console.log(`── ${label} · един ден, 50% познати ──────────────`);
  for (const n of [6, 96, 288]) {
    const r = day(id, n, 0.5);
    console.log(
      `  ${String(n).padStart(3)} сделки: оборот $${r.volume.toFixed(0).padStart(6)}  ` +
      `такси $${r.paidFees.toFixed(2).padStart(6)}  ` +
      `остават $${r.equity.toFixed(2).padStart(7)}  (${((r.equity/100-1)*100).toFixed(1)}%)`
    );
  }
  console.log();
}

console.log('── Спринтьор: колко познати са нужни, за да не губи ──');
for (const wr of [0.50, 0.53, 0.55, 0.60]) {
  const r = day('sprinter', 288, wr);
  console.log(`  ${(wr*100).toFixed(0)}% познати → остават $${r.equity.toFixed(2)}`);
}
