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
    assert.ok(p.gates.minTickScore >= 0 && p.gates.minTickScore <= 25, `${p.name}: натиск извън 0-25`);
    assert.ok(p.gates.maxRsi > 50 && p.gates.maxRsi <= 100, `${p.name}: RSI таван извън смисъла`);
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

test('бързият иска повече натиск от суинга', () => {
  assert.ok(robotById('momentum')!.gates.minTickScore > robotById('guardian')!.gates.minTickScore,
    'който държи позиция минути живее от натиска - трябва да иска повече');
});

test('търпеливите роботи искат втори източник, бързите - не', () => {
  // Който държи позиция дни, има време да е прав по-бавно; който я държи
  // минути, не може да чака дневна свещ от Polygon.
  assert.equal(robotById('guardian')!.gates.requireMacro, true);
  assert.equal(robotById('steady')!.gates.requireMacro, true);
  assert.equal(robotById('momentum')!.gates.requireMacro, false);
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
