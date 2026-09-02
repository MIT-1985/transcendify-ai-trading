/**
 * Какво прави всеки робот при 60% познати - и колко има запас над нулата си.
 *
 * Размерът следва текущия капитал, както в двигателя, затова числата са от
 * симулация, а не от умножение.
 */
import { loadConfig } from '../src/config.ts';
import { ROBOTS, profileBreakeven } from '../src/core/robots.ts';

const config = loadConfig();
const fee = config.fees.taker;

function day(p: (typeof ROBOTS)[number], trades: number, winRate: number, start = 100) {
  let equity = start;
  for (let i = 0; i < trades; i++) {
    const size = Math.min((equity * config.strategy.riskPerTrade) / p.stopDistancePct, equity);
    if (size <= 0) break;
    const f = size * fee * 2;
    const win = (i % 100) < winRate * 100;
    equity += (win ? size * p.stopDistancePct * p.rewardRiskRatio : -size * p.stopDistancePct) - f;
  }
  return equity;
}

console.log('При 60% познати, капитал $100, един ден\n');
console.log('робот         нула при   запас     10 сделки   50 сделки   200 сделки');
console.log('─'.repeat(72));

for (const p of ROBOTS) {
  const be = profileBreakeven(p, config.fees) * 100;
  const margin = 60 - be;
  const row = [10, 50, 200].map((n) => {
    const e = day(p, n, 0.60);
    return `${(e - 100 >= 0 ? '+' : '')}$${(e - 100).toFixed(2)}`.padStart(10);
  });
  console.log(
    `${p.name.padEnd(12)} ${be.toFixed(1).padStart(6)}%  ${margin.toFixed(1).padStart(6)}т.` +
    row.join('  ')
  );
}

console.log('\n\nКолко познати са нужни, за да НЕ губи при 200 сделки на ден:');
for (const p of ROBOTS) {
  let need = 0;
  for (let wr = 30; wr <= 80; wr++) {
    if (day(p, 200, wr / 100) >= 100) { need = wr; break; }
  }
  console.log(`  ${p.name.padEnd(12)} ${need ? need + '%' : 'не се получава под 80%'}`);
}
