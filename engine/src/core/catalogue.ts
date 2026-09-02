/**
 * Витрината: шестте робота с цена, и за всеки - живите данни, графиката и
 * сделките.
 *
 * Прави се на едно място, защото това е целият продукт: купуваш робот,
 * виждаш данните, виждаш графиката, виждаш сделките. Досега тези четири неща
 * бяха разпръснати из трийсет и пет екрана и никой от тях не показваше и
 * четирите.
 */
import { ROBOTS, BUNDLE_PRICE_USD, profileBreakeven, robotById, type RobotProfile } from './robots.ts';
import {
  fetchOkxTicker, fetchOkxCandles, fetchOkxTrades, analyzeMicroTick,
  calcEMA, calcRSI, type Candle,
} from '../../shared/microMarketData.ts';
import { evaluateOne, type DataSources, type Gate } from './scanner.ts';
import type { EngineConfig } from '../config.ts';
import type { Database } from '../store/db.ts';

export interface CatalogueEntry {
  id: string;
  name: string;
  strategy: string;
  summary: string;
  priceUsd: number;
  pairs: string[];
  stopPct: number;
  rewardRisk: number;
  entry: string;
  /** Процентът печеливши, под който роботът губи пари. Смятан, не рекламен. */
  breakevenWinRatePct: number;
  maxConcurrent: number;
  cooldownMinutes: number;
  owned: boolean;
}

/**
 * Кой робот е купен.
 *
 * Собствеността е запис в базата, не флаг в браузъра: иначе всеки може да
 * отвори конзолата и да си "купи" всичко.
 */
async function ownedIds(db: Database): Promise<Set<string>> {
  try {
    const rows = (await db.collection('RobotLicense').list({ limit: 500 })) as Array<Record<string, unknown>>;
    return new Set(rows.filter(r => r.active !== false).map(r => String(r.robotId)));
  } catch {
    return new Set();
  }
}

export async function catalogue(config: EngineConfig, db: Database) {
  const owned = await ownedIds(db);
  const items: CatalogueEntry[] = ROBOTS.map((p) => ({
    id: p.id,
    name: p.name,
    strategy: p.strategy,
    summary: p.summary,
    priceUsd: p.priceUsd,
    pairs: p.pairs,
    stopPct: p.stopDistancePct * 100,
    rewardRisk: p.rewardRiskRatio,
    entry: p.entry,
    breakevenWinRatePct: Math.round(profileBreakeven(p, config.fees) * 1000) / 10,
    maxConcurrent: p.maxConcurrent,
    cooldownMinutes: p.cooldownMinutes,
    owned: owned.has(p.id),
  }));

  return {
    robots: items,
    bundlePriceUsd: BUNDLE_PRICE_USD,
    ownedCount: items.filter((r) => r.owned).length,
    // Показва се на витрината, а не се крие: докато е false, никой робот не
    // праща поръчка към борсата, колкото и купен да е.
    realOrdersAllowed: config.allowRealOrders,
    mode: config.mode,
  };
}

export async function buyRobot(db: Database, robotId: string) {
  const p = robotById(robotId);
  if (!p) return { ok: false as const, error: `няма робот "${robotId}"` };
  const owned = await ownedIds(db);
  if (owned.has(robotId)) return { ok: true as const, alreadyOwned: true, robotId };

  await db.collection('RobotLicense').create({
    robotId,
    name: p.name,
    priceUsd: p.priceUsd,
    // Доживотно - няма дата на изтичане нарочно. Това е обещанието, което се
    // продава, и то трябва да личи в записа, а не само в рекламата.
    lifetime: true,
    active: true,
    purchasedAt: new Date().toISOString(),
  });
  return { ok: true as const, alreadyOwned: false, robotId };
}

export interface RobotMarketView {
  robot: { id: string; name: string; strategy: string; pairs: string[] };
  pair: string;
  /** Големината на свещта - екранът форматира оста според нея. */
  bar: string;
  price: number;
  spreadPct: number;
  change24hPct: number;
  candles: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
  indicators: { ema9: number | null; ema21: number | null; rsi14: number | null };
  tick: { direction: string; buyPressurePercent: number; tickScore: number; tradeCount: number };
  verdict: { action: 'BUY' | 'WAIT' | 'AVOID'; reason: string };
  /** Осемте порти за тази двойка - същите, по които съди и сканирането. */
  gates: Gate[];
  blockedBy: string | null;
  trades: Array<Record<string, unknown>>;
  dataAt: string;
}

/**
 * Всичко за един робот и една двойка, в едно извикване.
 *
 * Барът на свещите зависи от робота: скалпърът гледа минути, суингът - часове.
 * Показването на едни и същи свещи за всички правеше графиката декорация.
 */
export async function robotMarket(
  db: Database,
  robotId: string,
  pair?: string,
  sources: DataSources = {},
): Promise<RobotMarketView | { error: string }> {
  const p = robotById(robotId);
  if (!p) return { error: `няма робот "${robotId}"` };
  // Двойката вече не е ограничена до трите по подразбиране: сканирането
  // предлага от целия OKX и екранът трябва да може да покаже избраното.
  // Образецът е за безопасност - името идва от адрес, тоест отвън.
  const instId = pair && /^[A-Z0-9]{2,12}-USDT$/.test(pair) ? pair : p.pairs[0]!;
  const bar = barFor(p);

  const [ticker, candles, trades, verdictRow] = await Promise.all([
    fetchOkxTicker(instId),
    fetchOkxCandles(instId, bar, 200),
    fetchOkxTrades(instId, 200),
    evaluateOne(robotId, instId, sources),
  ]);

  if (!ticker || candles.length < 30) {
    return { error: `OKX не върна достатъчно данни за ${instId}` };
  }

  const closes = candles.map((c) => c.close);
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const rsi14 = calcRSI(closes, 14);
  const tick = analyzeMicroTick(trades);

  const myTrades = (await db
    .collection('VerifiedTrade')
    .list({ sort: '-created_date', limit: 50 })
    .catch(() => [])) as Array<Record<string, unknown>>;

  return {
    robot: { id: p.id, name: p.name, strategy: p.strategy, pairs: p.pairs },
    pair: instId,
    bar,
    price: ticker.last,
    spreadPct: Math.round(ticker.spreadPct * 10000) / 10000,
    change24hPct: ticker.open24h > 0
      ? Math.round(((ticker.last - ticker.open24h) / ticker.open24h) * 10000) / 100
      : 0,
    candles: candles.map((c: Candle) => ({ t: c.ts, o: c.open, h: c.high, l: c.low, c: c.close, v: c.vol })),
    indicators: { ema9, ema21, rsi14 },
    tick: {
      direction: tick.tickDirection,
      buyPressurePercent: tick.buyPressurePercent,
      tickScore: tick.tickScore,
      tradeCount: tick.tradeCount,
    },
    verdict: 'error' in verdictRow
      ? { action: 'WAIT' as const, reason: verdictRow.error }
      : { action: verdictRow.verdict, reason: verdictRow.reason },
    gates: 'error' in verdictRow ? [] : verdictRow.gates,
    blockedBy: 'error' in verdictRow ? null : verdictRow.blockedBy,
    trades: myTrades.filter((t) => !t.botId || t.botId === p.id),
    dataAt: new Date().toISOString(),
  };
}

function barFor(p: RobotProfile): string {
  switch (p.strategy) {
    case 'scalp': return '1m';
    case 'momentum': return '5m';
    case 'grid': return '15m';
    case 'steady': return '1H';
    case 'dca': return '4H';
    case 'swing': return '1D';
    default: return '15m';
  }
}


