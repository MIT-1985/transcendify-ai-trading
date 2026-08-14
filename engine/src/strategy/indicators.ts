import type { Candle } from '../exchange/okxClient.ts';

/**
 * Показатели. Нарочно малко на брой: всеки допълнителен показател, нагласен на
 * същите данни, изглежда като предимство и не е.
 */

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i]! * k + out[i - 1]! * (1 - k));
  }
  return out;
}

/**
 * Средно истинско движение - мярка за това колко се движи цената.
 *
 * Стопът се слага на кратно на ATR, а не на фиксиран процент. Фиксираният
 * процент значи, че в спокоен ден стопът е далеч (излишен риск), а в бурен е
 * вътре в обичайния шум (изнасяне от позицията без причина).
 */
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]!;
    const previousClose = candles[i - 1]!.close;
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose)
      )
    );
  }
  const window = trueRanges.slice(-period);
  if (window.length === 0) return 0;
  return window.reduce((sum, value) => sum + value, 0) / window.length;
}

export function rsi(candles: Candle[], period = 14): number {
  if (candles.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  const window = candles.slice(-(period + 1));
  for (let i = 1; i < window.length; i++) {
    const change = window[i]!.close - window[i - 1]!.close;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Наклонът на бърза срещу бавна EMA - посоката на пазара с една стойност. */
export function trend(candles: Candle[], fast = 12, slow = 26): number {
  const closes = candles.map((candle) => candle.close);
  if (closes.length < slow) return 0;
  const fastLine = ema(closes, fast).at(-1)!;
  const slowLine = ema(closes, slow).at(-1)!;
  return (fastLine - slowLine) / slowLine;
}

/** Обемът на последната свещ спрямо средния - потвърждение, че движението е истинско. */
export function volumeRatio(candles: Candle[], period = 20): number {
  if (candles.length < 2) return 1;
  const window = candles.slice(-period);
  const average = window.reduce((sum, candle) => sum + candle.volume, 0) / window.length;
  if (average <= 0) return 1;
  return candles.at(-1)!.volume / average;
}

export interface MarketSnapshot {
  instId: string;
  price: number;
  atr: number;
  atrPct: number;
  rsi: number;
  trend: number;
  volumeRatio: number;
  candles: Candle[];
}

export function snapshot(instId: string, candles: Candle[]): MarketSnapshot {
  const price = candles.at(-1)?.close ?? 0;
  const atrValue = atr(candles);
  return {
    instId,
    price,
    atr: atrValue,
    atrPct: price > 0 ? atrValue / price : 0,
    rsi: rsi(candles),
    trend: trend(candles),
    volumeRatio: volumeRatio(candles),
    candles,
  };
}
