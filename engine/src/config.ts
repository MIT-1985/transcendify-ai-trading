/**
 * Всички настройки на двигателя на едно място.
 *
 * ВАЖНО ЗА ЧИСЛАТА ПО-ДОЛУ. Старите стойности (TP +0.35%, SL -0.20%) изглеждаха
 * предпазливи, но бяха математически губещи. При такса 0.1% на страна:
 *
 *   печалба нето = +0.35% - 0.20% (такси) = +0.15%
 *   загуба нето  = -0.20% - 0.20% (такси) = -0.40%
 *
 * Тоест губещата сделка струва 2.67 пъти повече от печелившата. За да излезеш
 * на нула, трябват 72.7% печеливши сделки; ако се брои и позволеният спред от
 * 0.08% при пазарни поръчки - около 87%. Такъв процент не се постига трайно.
 *
 * Затова тук всичко се смята от РИСК НА СДЕЛКА, а не от произволни проценти:
 * стопът определя размера на позицията, а целта е кратно на риска (RR).
 * Правилото за оцеляване е едно: очакваната стойност трябва да е положителна
 * СЛЕД такси и спред, иначе сделката просто не се прави.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Env = Record<string, string | undefined>;

const num = (env: Env, key: string, fallback: number): number => {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key}="${raw}" не е число`);
  }
  return parsed;
};

const bool = (env: Env, key: string, fallback: boolean): boolean => {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
};

/** Такси на OKX spot, ниво 1. По-високо ниво = по-ниски такси, но не разчитай на това. */
export interface FeeModel {
  /** Такса при взимане на ликвидност (пазарна поръчка). */
  taker: number;
  /** Такса при подаване на ликвидност (лимитна поръчка, която стои в книгата). */
  maker: number;
}

export interface StrategyParams {
  /**
   * Каква част от капитала се губи при удрян стоп. ТОВА Е ЕДИНСТВЕНОТО ЧИСЛО,
   * което трябва да избереш съзнателно - всичко останало се смята от него.
   *
   * 0.005 (0.5%) значи: 20 поредни загуби свалят сметката с ~10%. Консервативно
   * е 0.0025, агресивно 0.01. Над 0.02 фалитът е въпрос на време, не на късмет.
   */
  riskPerTrade: number;

  /** Цел = толкова пъти риска. Под 1.5 изискваният процент печеливши става нереален. */
  rewardRiskRatio: number;

  /** Разстояние до стопа като част от цената. Реалният стоп идва от ATR - това е таван. */
  maxStopDistancePct: number;
  /** Под този стоп таксите изяждат всичко - сделката се отказва. */
  minStopDistancePct: number;

  /** Максимален позволен спред. По-широк = скрит разход, който не се вижда в P&L. */
  maxSpreadPct: number;

  /** Дневен таван на загубата като част от капитала. При достигане - край за деня. */
  maxDailyLossPct: number;
  /** Общо спадане от върха. При достигане - двигателят спира докрай. */
  maxDrawdownPct: number;

  /** Най-много едновременно отворени позиции. */
  maxOpenPositions: number;
  /** Най-много сделки на ден - спира "отмъщението" след загуба. */
  maxTradesPerDay: number;

  /**
   * Максимална част от капитала в една позиция, независимо от стопа.
   *
   * Това е предпазител, не основен лост. Той се задейства само при много
   * близък стоп: рискът в пари се дели на разстоянието до стопа, тоест при
   * стоп под `riskPerTrade / maxPositionPct` (при подразбиране 0.005/0.5 = 1%)
   * сметнатият размер надхвърля тавана и се орязва. Ако таванът се задейства
   * често, значи стоповете са прекалено близки, а не че таванът е малък.
   */
  maxPositionPct: number;

  /** Минимална увереност на модела, за да се отвори позиция изобщо. */
  minConfidence: number;

  /**
   * Изисквано предимство над точката на нулата. 0.05 значи: моделният процент
   * печеливши трябва да е поне 5 пункта над математически необходимия.
   */
  minEdgeMargin: number;
}

export interface EngineConfig {
  mode: 'paper' | 'live';
  fees: FeeModel;
  strategy: StrategyParams;
  okx: {
    apiKey?: string;
    secretKey?: string;
    passphrase?: string;
    /** OKX demo trading - изпраща заглавка x-simulated-trading: 1. */
    demo: boolean;
    baseUrl: string;
  };
  polygon: {
    apiKey?: string;
    baseUrl: string;
  };
  anthropic: {
    apiKey?: string;
    model: string;
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  };
  dataDir: string;
  port: number;
  /**
   * Истинска търговия изисква ДВЕ отделни разрешения: този флаг и mode='live'.
   * Едно не стига - твърде лесно се включва по невнимание.
   */
  allowRealOrders: boolean;
}

/**
 * Чете engine/.env, ако го има.
 *
 * Файлът съществуваше в примера и в указанията, но никой не го зареждаше -
 * двигателят четеше само process.env. Ключ, записан в .env, стигаше доникъде
 * и изглеждаше, че не работи, вместо да е ясно, че не е прочетен.
 *
 * Стойности, вече зададени в средата, НЕ се презаписват: изричното при
 * пускането трябва да бие записаното във файл.
 */
function loadEnvFile(): void {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}

export function loadConfig(env: Env = process.env): EngineConfig {
  loadEnvFile();
  const mode = (env.TRADING_MODE ?? 'paper') as 'paper' | 'live';
  if (mode !== 'paper' && mode !== 'live') {
    throw new Error(`TRADING_MODE трябва да е "paper" или "live", а не "${mode}"`);
  }

  return {
    mode,
    fees: {
      taker: num(env, 'FEE_TAKER', 0.001),
      maker: num(env, 'FEE_MAKER', 0.0008),
    },
    strategy: {
      riskPerTrade: num(env, 'RISK_PER_TRADE', 0.005),
      rewardRiskRatio: num(env, 'REWARD_RISK_RATIO', 2.0),
      maxStopDistancePct: num(env, 'MAX_STOP_DISTANCE_PCT', 0.02),
      minStopDistancePct: num(env, 'MIN_STOP_DISTANCE_PCT', 0.004),
      maxSpreadPct: num(env, 'MAX_SPREAD_PCT', 0.0006),
      maxDailyLossPct: num(env, 'MAX_DAILY_LOSS_PCT', 0.02),
      maxDrawdownPct: num(env, 'MAX_DRAWDOWN_PCT', 0.15),
      maxOpenPositions: num(env, 'MAX_OPEN_POSITIONS', 2),
      maxTradesPerDay: num(env, 'MAX_TRADES_PER_DAY', 6),
      maxPositionPct: num(env, 'MAX_POSITION_PCT', 0.5),
      minConfidence: num(env, 'MIN_CONFIDENCE', 0.62),
      minEdgeMargin: num(env, 'MIN_EDGE_MARGIN', 0.05),
    },
    okx: {
      apiKey: env.OKX_API_KEY,
      secretKey: env.OKX_SECRET_KEY,
      passphrase: env.OKX_PASSPHRASE,
      demo: bool(env, 'OKX_DEMO', mode !== 'live'),
      baseUrl: env.OKX_BASE_URL ?? 'https://www.okx.com',
    },
    polygon: {
      apiKey: env.POLYGON_API_KEY,
      baseUrl: env.POLYGON_BASE_URL ?? 'https://api.polygon.io',
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL ?? 'claude-opus-5',
      effort: (env.ANTHROPIC_EFFORT ?? 'high') as EngineConfig['anthropic']['effort'],
    },
    dataDir: env.DATA_DIR ?? new URL('../data', import.meta.url).pathname,
    port: num(env, 'PORT', 8787),
    allowRealOrders: bool(env, 'ALLOW_REAL_ORDERS', false),
  };
}

/**
 * Точката на нулата: при какъв процент печеливши сделки стратегията не губи и
 * не печели, СЛЕД такси и спред.
 *
 * Смята се от нетните суми, не от брутните - това е разликата между стратегия,
 * която изглежда добре в таблица, и такава, която не изпразва сметката.
 */
export function breakevenWinRate(params: {
  stopDistancePct: number;
  rewardRiskRatio: number;
  fees: FeeModel;
  spreadPct: number;
  /** true, ако влизаме с пазарна поръчка (плащаме taker и спреда). */
  takerEntry: boolean;
}): number {
  const { stopDistancePct, rewardRiskRatio, fees, spreadPct, takerEntry } = params;

  const entryFee = takerEntry ? fees.taker : fees.maker;
  // Изходът е стоп или цел - и двете реално се изпълняват като пазарни.
  const exitFee = fees.taker;
  const cost = entryFee + exitFee + (takerEntry ? spreadPct : 0);

  const grossWin = stopDistancePct * rewardRiskRatio;
  const netWin = grossWin - cost;
  const netLoss = stopDistancePct + cost;

  if (netWin <= 0) return 1; // невъзможно - таксите изяждат цялата цел
  return netLoss / (netWin + netLoss);
}

/**
 * Очаквана стойност на една сделка като част от капитала.
 * Отрицателна = не търгувай. Няма умна настройка, която да оправи това.
 */
export function expectedValuePerTrade(params: {
  winRate: number;
  stopDistancePct: number;
  rewardRiskRatio: number;
  fees: FeeModel;
  spreadPct: number;
  takerEntry: boolean;
}): number {
  const { winRate, stopDistancePct, rewardRiskRatio, fees, spreadPct, takerEntry } = params;
  const entryFee = takerEntry ? fees.taker : fees.maker;
  const cost = entryFee + fees.taker + (takerEntry ? spreadPct : 0);

  const netWin = stopDistancePct * rewardRiskRatio - cost;
  const netLoss = stopDistancePct + cost;

  return winRate * netWin - (1 - winRate) * netLoss;
}
