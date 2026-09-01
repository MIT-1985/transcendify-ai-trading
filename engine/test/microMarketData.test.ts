import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcEMA, calcRSI, analyzeMicroTick, toPolygonTicker, analyzePolygonMacro,
  OKX_TAKER_FEE_RATE, type Trade, type PolygonBar,
} from '../shared/microMarketData.ts';

/**
 * Този файл беше изгубен и с него петте функции, които решават дали да се
 * търгува. Възстановен е от местните копия в phase3/phase4 - тестовете тук
 * заковават именно това: числата да съвпаднат със старите, а не да са просто
 * "някакви".
 */

test('EMA връща null, докато свещите не стигнат за периода', () => {
  assert.equal(calcEMA([1, 2, 3], 5), null);
  assert.equal(calcEMA([1, 2, 3, 4, 5], 5), 3);
});

test('EMA тежи към последните стойности', () => {
  const flat = calcEMA([10, 10, 10, 10, 10, 10], 3)!;
  assert.equal(flat, 10);
  const rising = calcEMA([10, 10, 10, 10, 10, 20], 3)!;
  assert.ok(rising > 10 && rising < 20, `EMA ${rising} трябва да е между старото и новото`);
});

test('RSI на непрекъснато качване е 100', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(calcRSI(closes, 14), 100);
});

test('RSI иска поне период+1 свещи', () => {
  assert.equal(calcRSI([1, 2, 3], 14), null);
});

const tradesWith = (buy: number, sell: number, drift: number): Trade[] => {
  const out: Trade[] = [];
  // Най-новата сделка е първа - точно както ги връща OKX.
  for (let i = 0; i < buy; i++) out.push({ ts: 2000 - i, price: 100 + drift, size: 1, side: 'buy' });
  for (let i = 0; i < sell; i++) out.push({ ts: 1000 - i, price: 100, size: 1, side: 'sell' });
  return out;
};

test('под десет сделки няма мнение, а не измислено мнение', () => {
  const m = analyzeMicroTick(tradesWith(3, 3, 1));
  assert.equal(m.tickDirection, 'NEUTRAL');
  assert.equal(m.tickScore, 0);
  assert.equal(m.confidence, 0);
});

test('натиск за покупка иска И обем, И движение на цената нагоре', () => {
  const withDrift = analyzeMicroTick(tradesWith(40, 10, +1));
  assert.equal(withDrift.tickDirection, 'BUY_PRESSURE');

  // Същият обем, но цената не мърда - това НЕ е сигнал.
  const noDrift = analyzeMicroTick(tradesWith(40, 10, 0));
  assert.equal(noDrift.tickDirection, 'NEUTRAL');
});

test('tickScore е стъпаловидна, за да е сравним прагът', () => {
  assert.equal(analyzeMicroTick(tradesWith(70, 30, 1)).tickScore, 25);
  assert.equal(analyzeMicroTick(tradesWith(60, 40, 1)).tickScore, 18);
  assert.equal(analyzeMicroTick(tradesWith(50, 50, 1)).tickScore, 10);
  assert.equal(analyzeMicroTick(tradesWith(30, 70, 1)).tickScore, 5);
});

test("OKX BTC-USDT става Polygon X:BTCUSD", () => {
  assert.equal(toPolygonTicker('BTC-USDT'), 'X:BTCUSD');
  assert.equal(toPolygonTicker('SOL-USDT'), 'X:SOLUSD');
});

test('без данни от Polygon макрото е "не знам", а не "мечи пазар"', () => {
  const m = analyzePolygonMacro([], []);
  assert.equal(m.available, false);
  assert.equal(m.dailyDirection, 'NEUTRAL');
  assert.equal(m.macroConfirmed, false);
});

test('качващ се месец дава BULLISH макро', () => {
  const bars: PolygonBar[] = Array.from({ length: 30 }, (_, i) => ({
    ts: i, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, vol: 1,
  }));
  const m = analyzePolygonMacro(bars, []);
  assert.equal(m.available, true);
  assert.equal(m.dailyDirection, 'BULLISH');
});

test('таксата е такава, каквато я взима OKX', () => {
  assert.equal(OKX_TAKER_FEE_RATE, 0.001);
  // Двете посоки: всяка цел под 0.2% е загуба преди да е започнала.
  assert.equal(OKX_TAKER_FEE_RATE * 2, 0.002);
});
