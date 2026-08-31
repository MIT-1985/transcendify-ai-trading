import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpret, inWindow, loadRules, activeAdjustment } from '../src/core/marketRules.ts';

test('чете процент от указанието', () => {
  assert.equal(interpret('Reduce position sizes by 30%').sizeMultiplier, 0.7);
});

test('спирането е нула, не намаление', () => {
  const r = interpret('Halt trading, assess counterparty risk');
  assert.equal(r.sizeMultiplier, 0);
  assert.equal(r.tightenStops, true);
});

test('непознато указание не променя размера', () => {
  assert.equal(interpret('Monitor for emission dilution').sizeMultiplier, 1);
});

test('прозорецът през полунощ работи', () => {
  assert.equal(inWindow('22:00-02:00', new Date('2026-01-01T23:30:00Z')), true);
  assert.equal(inWindow('22:00-02:00', new Date('2026-01-01T01:30:00Z')), true);
  assert.equal(inWindow('22:00-02:00', new Date('2026-01-01T12:00:00Z')), false);
});

test('каталогът се чете и има правила', () => {
  const rules = loadRules();
  assert.ok(rules.length > 50, `очаквах над 50 правила, имам ${rules.length}`);
});

test('при застъпени прозорци печели най-предпазливото', () => {
  // 08:00 UTC хваща и "Monday Asia close" (намали 30%), и "Monday EU open".
  const adj = activeAdjustment(new Date('2026-01-05T08:30:00Z'));
  assert.ok(adj.sizeMultiplier <= 0.7, `множител ${adj.sizeMultiplier}`);
});
