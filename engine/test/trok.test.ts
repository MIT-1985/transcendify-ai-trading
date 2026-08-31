import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Trok, type TrokEpochRow } from '../src/core/trok.ts';

test('при висок разход печели "пропусни"', () => {
  const t = new Trok();
  const r = t.chooseSize({ riskNow: 0.9, costRatio: 0.95, edgeNow: 0.2, exposureNow: 0.9 });
  assert.equal(r.fraction, 0, `избра ${r.label}`);
});

test('при добри условия търгува', () => {
  const t = new Trok();
  const r = t.chooseSize({ riskNow: 0.2, costRatio: 0.1, edgeNow: 0.95, exposureNow: 0.2 });
  assert.ok(r.fraction > 0, `избра ${r.label}`);
});

test('константите остават в границите', () => {
  const t = new Trok();
  for (let i = 0; i < 500; i++) {
    t.chooseSize({ riskNow: 1, costRatio: 1, edgeNow: 0, exposureNow: 1 });
  }
  for (const v of Object.values(t.state().k)) {
    assert.ok(v >= 0.25 && v <= 4.0, `константа избяга: ${v}`);
  }
});

test('еднакви входове дават еднакъв изход', () => {
  const a = new Trok();
  const b = new Trok();
  const input = { riskNow: 0.4, costRatio: 0.3, edgeNow: 0.8, exposureNow: 0.4 };
  assert.equal(a.chooseSize(input).label, b.chooseSize(input).label);
});

test('всеки избор записва НОВ epoch, не презаписва', () => {
  const t = new Trok();
  const rows: TrokEpochRow[] = [];
  t.attachStore((r) => { rows.push(r); }, 'bot-1');
  const input = { riskNow: 0.4, costRatio: 0.3, edgeNow: 0.8, exposureNow: 0.4 };
  t.chooseSize(input);
  t.chooseSize(input);
  t.chooseSize(input);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.epoch), [1, 2, 3]);
  assert.equal(rows[0]?.botId, 'bot-1');
});

test('състоянието се възстановява след рестарт', () => {
  const first = new Trok();
  const rows: TrokEpochRow[] = [];
  first.attachStore((r) => { rows.push(r); });
  for (let i = 0; i < 5; i++) {
    first.chooseSize({ riskNow: 0.8, costRatio: 0.6, edgeNow: 0.4, exposureNow: 0.7 });
  }
  const last = rows.at(-1)!;

  const revived = new Trok();
  revived.restore(last);
  assert.equal(revived.state().steps, first.state().steps);
  assert.equal(revived.currentEpoch(), last.epoch);
  assert.deepEqual(revived.state().k, first.state().k);
});
