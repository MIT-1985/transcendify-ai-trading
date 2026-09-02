/** Има ли такса, при която Спринтьорът става смислен. */
import { breakevenWinRate } from '../src/config.ts';
import { robotById } from '../src/core/robots.ts';

const sprinter = robotById('sprinter')!;
const guardian = robotById('guardian')!;

console.log('Спринтьор (стоп 0.3%, цел 1:2) при различни нива на такси в OKX\n');
console.log('ниво           taker    maker    нула при');
console.log('─'.repeat(48));

// Нивата на OKX за обикновени потребители и първите VIP стъпала.
const tiers: Array<[string, number, number]> = [
  ['обикновен',   0.0010, 0.0008],
  ['VIP1',        0.0009, 0.00075],
  ['VIP2',        0.0008, 0.0007],
  ['VIP3',        0.0007, 0.0006],
  ['VIP5',        0.0006, 0.0004],
  ['без такса',   0.0000, 0.0000],
];

for (const [name, taker, maker] of tiers) {
  const fees = { taker, maker };
  const be = breakevenWinRate({
    stopDistancePct: sprinter.stopDistancePct,
    rewardRiskRatio: sprinter.rewardRiskRatio,
    fees, spreadPct: 0.0002, takerEntry: false,
  }) * 100;
  console.log(`${name.padEnd(14)} ${(taker*100).toFixed(2)}%   ${(maker*100).toFixed(3)}%   ${be.toFixed(1)}%`);
}

console.log('\nЗа сравнение, Пазител при обикновени такси:',
  (breakevenWinRate({
    stopDistancePct: guardian.stopDistancePct,
    rewardRiskRatio: guardian.rewardRiskRatio,
    fees: { taker: 0.001, maker: 0.0008 }, spreadPct: 0.0002, takerEntry: false,
  }) * 100).toFixed(1) + '%');

console.log('\n\nКолко оборот трябва за VIP нива в OKX (30 дни):');
console.log('  VIP1 ≈ $1 000 000 оборот или 50 000 OKB');
console.log('  VIP2 ≈ $5 000 000');
console.log('  VIP3 ≈ $10 000 000');
console.log('\nСъс $100 капитал и 288 сделки на ден оборотът е около');
console.log('  $30 000/ден → $900 000 за 30 дни → едва до прага на VIP1.');
