import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breakevenWinRate, expectedValuePerTrade, loadConfig } from '../src/config.ts';
import { RiskEngine, type RiskContext, type TradeProposal } from '../src/risk/riskEngine.ts';
import { roundToLotSize } from '../src/exchange/okxClient.ts';

const config = loadConfig({ DATA_DIR: '/tmp/transcendify-test' });
const fees = { taker: 0.001, maker: 0.0008 };

// ---- сметките, заради които старата стратегия губеше ------------------------

test('старите настройки искат нереален процент печеливши', () => {
  // TP +0.35%, SL -0.20% значи съотношение цел/риск 1.75 при стоп 0.20%.
  const be = breakevenWinRate({
    stopDistancePct: 0.002,
    rewardRiskRatio: 1.75,
    fees,
    spreadPct: 0.0008,
    takerEntry: true,
  });
  // Над 80% - тоест стратегията беше губеща по конструкция, не заради изпълнение.
  assert.ok(be > 0.8, `очаквано >80%, получено ${(be * 100).toFixed(1)}%`);
});

test('по-широк стоп и съотношение 2:1 свалят изискването до постижимо', () => {
  const be = breakevenWinRate({
    stopDistancePct: 0.01,
    rewardRiskRatio: 2,
    fees,
    spreadPct: 0.0006,
    takerEntry: true,
  });
  // 42% е постижимо; 80%+ от старите настройки не е.
  assert.ok(be < 0.43, `очаквано под 43%, получено ${(be * 100).toFixed(1)}%`);
});

test('таксите могат да изядат цялата цел - тогава няма възможен процент печеливши', () => {
  const be = breakevenWinRate({
    stopDistancePct: 0.0005,
    rewardRiskRatio: 1.2,
    fees,
    spreadPct: 0.0008,
    takerEntry: true,
  });
  assert.equal(be, 1);
});

test('очакваната стойност е отрицателна под точката на нулата', () => {
  const stopDistancePct = 0.01;
  const be = breakevenWinRate({ stopDistancePct, rewardRiskRatio: 2, fees, spreadPct: 0.0006, takerEntry: true });
  const below = expectedValuePerTrade({
    winRate: be - 0.05,
    stopDistancePct,
    rewardRiskRatio: 2,
    fees,
    spreadPct: 0.0006,
    takerEntry: true,
  });
  const above = expectedValuePerTrade({
    winRate: be + 0.05,
    stopDistancePct,
    rewardRiskRatio: 2,
    fees,
    spreadPct: 0.0006,
    takerEntry: true,
  });
  assert.ok(below < 0);
  assert.ok(above > 0);
});

// ---- риск-двигателят --------------------------------------------------------

const baseProposal: TradeProposal = {
  instId: 'BTC-USDT',
  side: 'buy',
  price: 60_000,
  stopPrice: 59_400, // 1% под цената
  spreadPct: 0.0003,
  confidence: 0.75,
  historicalWinRate: 0.55,
  takerEntry: true,
};

const baseContext: RiskContext = {
  account: { equity: 10_000, peakEquity: 10_000 },
  openPositions: [],
  closedToday: [],
  tradesToday: 0,
};

test('размерът идва от разстоянието до стопа, не от произволна сума', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate(baseProposal, baseContext);
  assert.ok(decision.approved, 'сделката трябваше да мине');

  // 0.5% от 10 000 = 50 долара риск; стоп на 600 долара => 0.0833 BTC.
  assert.ok(Math.abs(decision.size - 50 / 600) < 1e-9);
  // Загубата при удрян стоп е точно рискуваната сума.
  const lossAtStop = decision.size * (baseProposal.price - baseProposal.stopPrice);
  assert.ok(Math.abs(lossAtStop - 50) < 1e-6);
});

test('по-далечен стоп дава по-малка позиция при същия риск', () => {
  const risk = new RiskEngine(config);
  const near = risk.evaluate(baseProposal, baseContext);
  const far = risk.evaluate({ ...baseProposal, stopPrice: 58_800 }, baseContext);
  assert.ok(near.approved && far.approved);
  assert.ok(far.size < near.size);

  const nearLoss = near.size * (60_000 - 59_400);
  const farLoss = far.size * (60_000 - 58_800);
  assert.ok(Math.abs(nearLoss - farLoss) < 1e-6, 'рискът в пари трябва да е един и същ');
});

test('дневният лимит спира търговията - и се смята от реални резултати', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate(baseProposal, {
    ...baseContext,
    closedToday: [
      { status: 'CLOSED', realized_pnl: -150, closed_at: new Date().toISOString() },
      { status: 'CLOSED', realized_pnl: -60, closed_at: new Date().toISOString() },
    ],
  });
  // 2% от 10 000 = 200; загубени са 210.
  assert.ok(!decision.approved);
  assert.match(decision.reason, /дневната загуба/);
});

test('затворена сделка без резултат е ГРЕШКА, а не нула', () => {
  const risk = new RiskEngine(config);
  assert.throws(
    () =>
      risk.realizedLossToday([
        { status: 'CLOSED', closed_at: new Date().toISOString() } as never,
      ]),
    /realized_pnl/
  );
});

test('спадането от върха спира всичко', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate(baseProposal, {
    ...baseContext,
    account: { equity: 8_000, peakEquity: 10_000 },
  });
  assert.ok(!decision.approved);
  assert.match(decision.reason, /спадане от върха/);
});

test('без измерено предимство сделка не се прави', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate({ ...baseProposal, historicalWinRate: 0.3 }, baseContext);
  assert.ok(!decision.approved);
  assert.match(decision.reason, /няма предимство/);
});

test('широкият спред отказва сделката', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate({ ...baseProposal, spreadPct: 0.002 }, baseContext);
  assert.ok(!decision.approved);
  assert.match(decision.reason, /спред/);
});

test('прекалено близък стоп отказва сделката - таксите го изяждат', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate({ ...baseProposal, stopPrice: 59_940 }, baseContext);
  assert.ok(!decision.approved);
  assert.match(decision.reason, /стопът е на/);
});

test('втора позиция в същия инструмент не се отваря', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate(baseProposal, {
    ...baseContext,
    openPositions: [{ instId: 'BTC-USDT', size: 0.1, entryPrice: 59_000, stopPrice: 58_000 }],
  });
  assert.ok(!decision.approved);
  assert.match(decision.reason, /вече има отворена позиция/);
});

test('таванът върху дела на капитала се спазва при много близък стоп', () => {
  const risk = new RiskEngine(config);
  // Стоп на 0.4% иска 65% печеливши само за да не се губи - затова и извадката
  // тук е с по-висок процент, иначе сделката пада още на проверката за предимство.
  const decision = risk.evaluate(
    { ...baseProposal, stopPrice: 59_760, historicalWinRate: 0.65 },
    baseContext
  );
  assert.ok(decision.approved, decision.approved ? '' : decision.reason);

  // Само от риска размерът щеше да е 50 / 240 = 0.208 BTC, тоест 12 500 долара -
  // повече от целия капитал. Таванът реже на 50%.
  assert.ok(decision.notional <= 5_000 + 1e-6, `получено ${decision.notional}`);
});

test('целта е на зададеното кратно от риска', () => {
  const risk = new RiskEngine(config);
  const decision = risk.evaluate(baseProposal, baseContext);
  assert.ok(decision.approved);
  // Стоп 600 долара, съотношение 2 => цел 1200 над входа.
  assert.ok(Math.abs(decision.takeProfitPrice - 61_200) < 1e-6);
});

// ---- дреболии, които чупят поръчки -----------------------------------------

test('количеството се закръгля НАДОЛУ към стъпката на борсата', () => {
  assert.equal(roundToLotSize(0.083333, 0.00001), 0.08333);
  assert.equal(roundToLotSize(1.999, 1), 1);
  assert.equal(roundToLotSize(0.5, 0.1), 0.5);
});
