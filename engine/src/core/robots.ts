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

/**
 * Шестте стратегии.
 *
 * Списъкът идва от първия Base44 вариант, където бяха scalping, swing, grid,
 * DCA, arbitrage и momentum. Пет от шестте се пренасят както са. Шестата -
 * arbitrage - НЕ се предлага: тя означава да купиш на една борса и да продадеш
 * на друга в същата секунда, а тук борсата е една. С един OKX това е реклама
 * за нещо, което няма как да се случи, затова мястото ѝ заема `steady`.
 */
export type Strategy = 'scalp' | 'momentum' | 'swing' | 'grid' | 'dca' | 'steady' | 'copy';

/** Стълбата на "Мрежа": стъпка и брой нива. */
export interface GridParams {
  /** Разстояние между две нива, като част от цената. */
  rungSpacingPct: number;
  /** Колко нива има стълбата надолу. */
  rungs: number;
}

/** Разписанието на "Стълба" (DCA). */
export interface DcaParams {
  /** През колко часа влиза следващият транш. */
  intervalHours: number;
  /** Максимален брой транша - таванът, който не позволява мартингейл. */
  maxEntries: number;
}

/**
 * Портите на робота.
 *
 * Всяка сделка минава през верига от проверки и ВСЯКА трябва да пусне. Това е
 * разликата между роботите: не различни индикатори, а различно строги порти на
 * едни и същи места. Скалпърът иска силен натиск и тесен спред, но приема
 * плитка книга; суингът иска дълбока книга и потвърждение от дневната графика,
 * но му е все едно какъв е натискът в последните двеста сделки.
 *
 * Когато порта спре сделка, се записва КОЯ - иначе "роботът не търгува" е
 * необяснимо и изглежда като повреда.
 */
export interface GateConfig {
  /** Под този оборот книгата е твърде тънка. */
  minVolumeUsd: number;
  /** Каква част от разстоянието до стопа може да отиде за спред. */
  spreadBudgetOfStop: number;
  /** Под това движение за 24ч двойката е закотвена - само такси. */
  minDailyRangePct: number;
  /** Натиск на купувачите, 0-25. */
  minTickScore: number;
  /** Над това е купено твърде високо. */
  maxRsi: number;
  /** Трябва ли Polygon да потвърди посоката, когато има данни за двойката. */
  requireMacro: boolean;
}

export interface RobotProfile {
  id: string;
  name: string;
  strategy: Strategy;
  summary: string;
  /** Цена за доживотно ползване, в долари. */
  priceUsd: number;
  /** Двойките, по които работи. */
  pairs: string[];
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
  grid?: GridParams;
  dca?: DcaParams;
  gates: GateConfig;
}

/** Трите двойки, които двигателят покрива. Не е "всички пазари" - това е истината. */
const PAIRS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];

/** Пакетна цена за всичките шест. */
export const BUNDLE_PRICE_USD = 349;

export const ROBOTS: RobotProfile[] = [
  {
    id: 'guardian',
    name: 'Пазител',
    strategy: 'swing',
    priceUsd: 149,
    pairs: PAIRS,
    summary:
      'Широк стоп, редки сделки, лимитен вход. Най-прощаващият - нужни са под 30% печеливши, ' +
      'за да е на плюс. За търпелив човек, който не иска да гледа екрана.',
    stopDistancePct: 0.02,
    rewardRiskRatio: 3,
    entry: 'limit',
    maxConcurrent: 1,
    cooldownMinutes: 240,
    trokTargets: { risk: 0.20, cost: 0.20, edge: 0.85, exposure: 0.30 },
    gates: { minVolumeUsd: 25_000_000, spreadBudgetOfStop: 0.20, minDailyRangePct: 0.5, minTickScore: 10, maxRsi: 72, requireMacro: true },
  },
  {
    id: 'ladder',
    name: 'Стълба',
    strategy: 'dca',
    priceUsd: 79,
    pairs: PAIRS,
    summary:
      'Купува на равни части през равно време, до най-много осем транша. ' +
      'Размерът НЕ расте при спад - това би било мартингейл, а мартингейлът ' +
      'не е стратегия, а отложена загуба. Таванът от осем транша е границата, ' +
      'която го прави преброима.',
    stopDistancePct: 0.05,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 8,
    cooldownMinutes: 360,
    dca: { intervalHours: 6, maxEntries: 8 },
    trokTargets: { risk: 0.25, cost: 0.20, edge: 0.70, exposure: 0.90 },
    gates: { minVolumeUsd: 20_000_000, spreadBudgetOfStop: 0.10, minDailyRangePct: 0.3, minTickScore: 5,  maxRsi: 80, requireMacro: true },
  },
  {
    id: 'shadow',
    name: 'Сянка',
    strategy: 'copy',
    priceUsd: 199,
    pairs: PAIRS,
    summary:
      'Следи едри портфейли по веригата и влиза след тях. Не гадае посоката - ' +
      'чака някой с повече пари да я е избрал. Две неща, които трябва да знаеш: ' +
      'винаги влиза СЛЕД тях, тоест на по-лоша цена, и влязъл токен не значи ' +
      'непременно покупка. Затова сигналът минава през същите порти като всеки ' +
      'друг робот - чужда сделка не отменя сметката.',
    stopDistancePct: 0.03,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 3,
    cooldownMinutes: 30,
    gates: { minVolumeUsd: 10_000_000, spreadBudgetOfStop: 0.15, minDailyRangePct: 0.5, minTickScore: 5, maxRsi: 80, requireMacro: false },
    trokTargets: { risk: 0.35, cost: 0.25, edge: 0.80, exposure: 0.60 },
  },
  {
    id: 'steady',
    name: 'Постоянен',
    strategy: 'steady',
    priceUsd: 99,
    pairs: PAIRS,
    summary:
      'Средносрочен. Стоп 1%, цел 1:2, лимитен вход. Нужни са около 39% печеливши. ' +
      'Балансът между честота и запас.',
    stopDistancePct: 0.01,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 2,
    cooldownMinutes: 60,
    trokTargets: { risk: 0.30, cost: 0.25, edge: 0.90, exposure: 0.50 },
    gates: { minVolumeUsd: 15_000_000, spreadBudgetOfStop: 0.20, minDailyRangePct: 0.5, minTickScore: 12, maxRsi: 75, requireMacro: true },
  },
  {
    id: 'momentum',
    name: 'Инерция',
    strategy: 'momentum',
    priceUsd: 89,
    pairs: PAIRS,
    summary:
      'По-активен. Стоп 0.5%, цел 1:2. Нужни са около 45% печеливши с лимитен вход. ' +
      'Работи, когато има ясна посока; мълчи в тесен пазар.',
    stopDistancePct: 0.005,
    rewardRiskRatio: 2,
    entry: 'limit',
    maxConcurrent: 3,
    cooldownMinutes: 15,
    trokTargets: { risk: 0.40, cost: 0.30, edge: 0.90, exposure: 0.60 },
    gates: { minVolumeUsd: 10_000_000, spreadBudgetOfStop: 0.20, minDailyRangePct: 1.0, minTickScore: 15, maxRsi: 78, requireMacro: false },
  },
  {
    id: 'grid',
    name: 'Мрежа',
    strategy: 'grid',
    priceUsd: 129,
    pairs: PAIRS,
    summary:
      'Стълба от лимитни поръчки на всеки 0.5% надолу, всяка с изход +0.5% нагоре. ' +
      'Печели от люлеенето, не от посоката. Стъпката е 0.5%, защото при 0.2% такси ' +
      'за влизане и излизане по-тясна стълба не оставя нищо. Пет нива, твърд стоп ' +
      'под последното - без него падащ пазар пълни стълбата догоре.',
    // Стопът е под цялата стълба: 5 нива по 0.5% = 2.5%, плюс запас.
    stopDistancePct: 0.03,
    rewardRiskRatio: 1,
    entry: 'limit',
    maxConcurrent: 5,
    cooldownMinutes: 0,
    grid: { rungSpacingPct: 0.005, rungs: 5 },
    trokTargets: { risk: 0.35, cost: 0.20, edge: 0.75, exposure: 0.80 },
    gates: { minVolumeUsd: 15_000_000, spreadBudgetOfStop: 0.15, minDailyRangePct: 1.5, minTickScore: 5,  maxRsi: 85, requireMacro: false },
  },
  {
    id: 'sprinter',
    name: 'Спринтьор',
    strategy: 'scalp',
    priceUsd: 69,
    pairs: ['BTC-USDT'],
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
    gates: { minVolumeUsd: 5_000_000,  spreadBudgetOfStop: 0.15, minDailyRangePct: 0.5, minTickScore: 18, maxRsi: 80, requireMacro: false },
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
