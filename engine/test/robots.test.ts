import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOTS, robotById, profileBreakeven, trokFor } from '../src/core/robots.ts';

const fees = { maker: 0.0008, taker: 0.001 };

test('всеки профил е постижим - под 60% нужни печеливши', () => {
  for (const p of ROBOTS) {
    const be = profileBreakeven(p, fees);
    assert.ok(be < 0.60, `${p.name} иска ${(be * 100).toFixed(1)}% - непостижимо`);
  }
});

test('няма профил под 0.3% стоп', () => {
  for (const p of ROBOTS) {
    assert.ok(p.stopDistancePct >= 0.003, `${p.name} има стоп ${p.stopDistancePct}`);
  }
});

test('подредени са от най-прощаващ към най-труден', () => {
  const bes = ROBOTS.map((p) => profileBreakeven(p, fees));
  for (let i = 1; i < bes.length; i++) {
    assert.ok(bes[i]! > bes[i - 1]!, `${ROBOTS[i]!.name} не е по-труден от предишния`);
  }
});

test('най-агресивният е само с лимитен вход', () => {
  const sprinter = robotById('sprinter')!;
  assert.equal(sprinter.entry, 'limit');
  // С пазарен вход същият профил би станал забележимо по-труден.
  const asMarket = profileBreakeven({ ...sprinter, entry: 'market' }, fees);
  const asLimit = profileBreakeven(sprinter, fees);
  assert.ok(asMarket > asLimit, 'пазарният вход трябва да е по-скъп');
});

test('всеки робот получава своите цели за TROK', () => {
  for (const p of ROBOTS) {
    const t = trokFor(p);
    assert.deepEqual(t.state().target, p.trokTargets, `${p.name} не получи целите си`);
  }
});

test('предпазливият държи риска по-ниско от агресивния', () => {
  const guardian = robotById('guardian')!;
  const sprinter = robotById('sprinter')!;
  assert.ok(guardian.trokTargets.risk < sprinter.trokTargets.risk);
});
