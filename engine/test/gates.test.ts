import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOTS, robotById } from '../src/core/robots.ts';
import { spreadBudgetFor } from '../src/core/scanner.ts';

/**
 * Портите са това, което прави роботите различни. Тестовете тук пазят
 * разликите да не се изгладят при следваща промяна - шест еднакви робота с
 * различни имена биха били по-лоши от един.
 */

test('всеки робот има порти', () => {
  for (const p of ROBOTS) {
    assert.ok(p.gates, `${p.name} няма порти`);
    assert.ok(p.gates.minVolumeUsd > 0, `${p.name} приема нулева ликвидност`);
  }
});

test('бюджетът за спред е част от стопа, не общо число', () => {
  const fastest = robotById('momentum')!;
  const guardian = robotById('guardian')!;
  // Стоп 0.3% срещу 2% - по-стегнатият робот трябва да иска по-тесен спред.
  assert.ok(spreadBudgetFor(fastest) < spreadBudgetFor(guardian),
    'по-стегнатият робот не бива да търпи същия спред като суинга');
  // И трябва да е под самия стоп - иначе входът яде целия запас.
  for (const p of ROBOTS) {
    assert.ok(spreadBudgetFor(p) < p.stopDistancePct * 100, `${p.name}: спредът яде стопа`);
  }
});

test('никой робот не приема книга под 5 милиона', () => {
  for (const p of ROBOTS) {
    assert.ok(p.gates.minVolumeUsd >= 5_000_000, `${p.name} приема твърде тънка книга`);
  }
});

test('целта на всеки робот надживява таксите и спреда си', () => {
  for (const p of ROBOTS) {
    const targetPct = p.stopDistancePct * p.rewardRiskRatio * 100;
    const cost = (p.entry === 'market' ? 0.2 : 0.18) + spreadBudgetFor(p);
    assert.ok(targetPct > cost,
      `${p.name}: цел ${targetPct.toFixed(2)}% срещу разходи ${cost.toFixed(2)}% - губещ по устройство`);
  }
});

test('портите на шестте не са едни и същи', () => {
  const fingerprints = new Set(
    ROBOTS.map((p) => JSON.stringify(p.gates)),
  );
  assert.equal(fingerprints.size, ROBOTS.length,
    'два робота имат еднакви порти - тогава са един робот с две имена');
});

/**
 * Кои порти изобщо съществуват.
 *
 * Четири бяха махнати, след като измерването показа, че не помагат: RSI и
 * движението свалят процента печеливши, натискът е неизмерим назад, а макрото
 * не се задейства никога при половината роботи и вреди при другата.
 *
 * Тестът пази да не се върнат по навик. Всяка нова порта минава първо през
 * scripts/measure-gate-value.ts.
 */
test('веригата съдържа само доказаните и структурните порти', async () => {
  const { evaluate } = await import('../src/core/scanner.ts');
  const candidate = await evaluate(
    robotById('steady')!,
    { instId: 'BTC-USDT', volumeUsd: 4e8, spreadPct: 0.001, change24hPct: 2, last: 77000 },
    '1H', 0.2, {},
  );

  const names = new Set(candidate.gates.map((g) => g.name));
  for (const gone of ['strength', 'movement', 'pressure', 'macro']) {
    assert.ok(!names.has(gone as never), `${gone} е махната - не бива да се връща без измерване`);
  }
  for (const kept of ['liquidity', 'spread', 'economics', 'trend', 'regime']) {
    assert.ok(names.has(kept as never), `${kept} липсва`);
  }
  // Всичко останало има вето - иначе не би трябвало да е тук.
  for (const g of candidate.gates) {
    assert.equal(g.blocking, true, `${g.name} стои във веригата без вето - или го получава, или се маха`);
  }
});
