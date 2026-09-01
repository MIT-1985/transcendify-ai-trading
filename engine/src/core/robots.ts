/**
 * Профили на роботите.
 *
 * Разграничението е по СТРАТЕГИЯ, не по капитал. Причината е смятана, не
 * избрана: точката на изравняване зависи от стопа, съотношението и таксите,
 * а те са проценти - еднакви за сметка от сто и за сметка от пет хиляди.
 * Робот "за $100" и робот "за $1000" биха били един и същи робот.
 *
 * Числата долу идват от breakevenWinRate при такси на OKX (taker 0.10%,
 * maker 0.08%, спред 0.02%):
 *
 *   стоп 0.15%, 1:1  -> НЕВЪЗМОЖНО, таксите изяждат целта
 *   стоп 0.30%, 1:2  -> 57.8% с пазарна, 53.3% с лимитна
 *   стоп 0.50%, 1:2  -> 48.0% / 45.3%
 *   стоп 1.00%, 1:2  -> 40.7% / 39.3%
 *   стоп 2.00%, 1:3  -> 27.8% / 27.3%
 *
 * Устойчива стратегия рядко държи над 55% печеливши. Затова тук НЯМА профил
 * под 0.3% стоп - той би бил продукт, който математиката отхвърля.
 *
 * Всеки профил носи и собствени цели за TROK. Това е истинската разлика
 * между роботите: не различни индикатори, а различно КАКВО ЦЕНЯТ - предпазлив
 * робот държи риска нисък и приема по-малко предимство; агресивният обратното.
 */
import { Trok, type TrokCriterion, type TrokLimits } from './trok.ts';
import { breakevenWinRate } from '../config.ts';
import type { FeeModel } from '../config.ts';

export type EntryStyle = 'limit' | 'market';

export interface RobotProfile {
  id: string;
  name: string;
  summary: string;
  /** Разстояние до стопа като част от цената. */
  stopDistancePct: number;
  rewardRiskRatio: number;
  entry: EntryStyle;
  /** Колко позиции може да държи едновременно. */
  maxConcurrent: number;
  /** Минимални минути между две сделки по същата двойка. */
  cooldownMinutes: number;
  /** Какво цени този робот - подава се на TROK. */
  trokTargets: Record<TrokCriterion, number>;
  trokLimits?: Partial<TrokLimits>;
}

export const ROBOTS: RobotProfile[] = [
  {
    id: 'guardian',
    name: 'Пазител',
    summary:
      'Широк стоп, редки сделки, лимитен вход. Най-прощаващият - нужни са под 30% печеливши, ' +
      'за да е на плюс. За търпелив човек, който не иска да гледа екрана.',
    stopDistancePct: 0.02,
    rewardRiskRatio: 3,
    entry: 'limit',
    maxConcurrent: 1,
    cooldownMinutes: 240,
    trokTargets: { risk: 0.20, cost: 0.20, edge: 0.85, exposure: 0.30 },
  },
  {
    id: 'steady',
    name: 'Постоянен',
    summary:
      'Средносрочен. Стоп 1%, цел 1:2, лимитен вход. Нужни са около 39% печеливши. ' +
      'Балансът между честота и запас.',
    stopDistancePct: 0.01,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 2,
    cooldownMinutes: 60,
    trokTargets: { risk: 0.30, cost: 0.25, edge: 0.90, exposure: 0.50 },
  },
  {
    id: 'momentum',
    name: 'Инерция',
    summary:
      'По-активен. Стоп 0.5%, цел 1:2. Нужни са около 45% печеливши с лимитен вход. ' +
      'Работи, когато има ясна посока; мълчи в тесен пазар.',
    stopDistancePct: 0.005,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 3,
    cooldownMinutes: 15,
    trokTargets: { risk: 0.40, cost: 0.30, edge: 0.90, exposure: 0.60 },
  },
  {
    id: 'sprinter',
    name: 'Спринтьор',
    summary:
      'Най-агресивният, който математиката допуска. Стоп 0.3%, цел 1:2, САМО лимитен вход - ' +
      'с пазарен таксите правят нивото непостижимо. Нужни са над 53% печеливши, което е ' +
      'на ръба на постижимото. Не е за начало.',
    stopDistancePct: 0.003,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 2,
    cooldownMinutes: 5,
    trokTargets: { risk: 0.50, cost: 0.35, edge: 0.95, exposure: 0.70 },
  },
];

export function robotById(id: string): RobotProfile | undefined {
  return ROBOTS.find((r) => r.id === id);
}

/** Точката на изравняване за профил - смятана, не записана на ръка. */
export function profileBreakeven(
  p: RobotProfile,
  fees: FeeModel,
  spreadPct = 0.0002
): number {
  return breakevenWinRate({
    stopDistancePct: p.stopDistancePct,
    rewardRiskRatio: p.rewardRiskRatio,
    fees,
    spreadPct,
    takerEntry: p.entry === 'market',
  });
}

/**
 * Създава диспечера на робота с неговите цели.
 *
 * Целите се подават тук, а не се пипат отвън: профилът е това, което клиентът
 * купува, и не бива да се променя мълчаливо между два цикъла.
 */
export function trokFor(p: RobotProfile): Trok {
  const t = new Trok(
    p.trokLimits ? { rate: 0.08, kMin: 0.25, kMax: 4.0, ...p.trokLimits } : undefined
  );
  const state = t.state();
  // Целите на профила заместват подразбиращите се.
  Object.assign(state.target, p.trokTargets);
  t.restore({
    epoch: 0,
    kRisk: state.k.risk, kCost: state.k.cost,
    kEdge: state.k.edge, kExposure: state.k.exposure,
    tRisk: p.trokTargets.risk, tCost: p.trokTargets.cost,
    tEdge: p.trokTargets.edge, tExposure: p.trokTargets.exposure,
    steps: 0,
  });
  return t;
}
