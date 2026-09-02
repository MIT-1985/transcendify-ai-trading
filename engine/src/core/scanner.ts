/**
 * Къде да търгува роботът.
 *
 * Досега отговорът беше "където му кажеш" - три бутона BTC/ETH/SOL, които
 * натиска човекът. Това не е избор на робота, а избор вместо него.
 *
 * Тук изборът е негов и е в два хода, защото трите хиляди заявки за свещи не
 * се събират в един екран:
 *
 *   1. Един разговор с OKX дава ВСИЧКИ двойки наведнъж - оборот и спред за
 *      1385 инструмента. Оттам отпадат неликвидните и скъпите.
 *   2. Само за оцелелите се теглят свещи и сделки и се смята присъда.
 *
 * Решението минава през ОСЕМ порти и всяка трябва да пусне:
 *
 *   ликвидност → спред → движение → икономика →
 *   тренд (OKX) → сила (RSI) → натиск (тик) → макро (Polygon)
 *
 * Портите са едни и същи за всички роботи; праговете НЕ са. Точно това ги
 * прави различни: Спринтьорът иска натиск 18/25 и се задоволява с $5M книга;
 * Пазителят приема натиск 10/25, но иска $25M и потвърждение от Polygon.
 *
 * Portата "икономика" е тази, която другите нямат: тя проверява дали целта на
 * робота изобщо надживява таксите и спреда за ТАЗИ двойка. Двойка, на която
 * 0.6% цел струва 0.65% разходи, е губеща по устройство и никакъв сигнал не я
 * поправя.
 *
 * Макрото е втори НЕЗАВИСИМ източник - Polygon, не OKX. Липсата на данни от
 * него не се брои за минаване: липса на потвърждение и потвърждение са
 * различни неща. Затова роботите с requireMacro търгуват само там, където и
 * двата източника говорят - обикновено големите двойки.
 *
 * Всяка спряна сделка носи името на портата, която я е спряла. Иначе "роботът
 * не търгува" изглежда като повреда.
 */
import { robotById, type RobotProfile } from './robots.ts';
import {
  fetchOkxCandles, fetchOkxTrades, analyzeMicroTick, calcEMA, calcRSI,
  fetchPolygonDaily, analyzePolygonMacro,
} from '../../shared/microMarketData.ts';

const OKX_TICKERS = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT';

export type GateName =
  | 'liquidity' | 'spread' | 'movement' | 'economics'
  | 'trend' | 'strength' | 'pressure' | 'macro';

export interface Gate {
  name: GateName;
  label: string;
  /** null = не се прилага за тази двойка (и това НЕ е тихо преминаване). */
  passed: boolean | null;
  value: string;
  threshold: string;
  note?: string;
}

export interface Candidate {
  instId: string;
  volumeUsd: number;
  spreadPct: number;
  change24hPct: number;
  last: number;
  gates: Gate[];
  /** Първата порта, която е спряла - причината с едно име. */
  blockedBy: GateName | null;
  verdict: 'BUY' | 'WAIT' | 'AVOID';
  reason: string;
  score: number;
  rsi: number | null;
  tickScore: number;
  /** Кои източници са говорили за тази двойка. */
  sources: string[];
}

export interface ScanResult {
  robot: { id: string; name: string; strategy: string; stopPct: number; bar: string };
  gateConfig: Record<string, number | boolean>;
  universe: { total: number; usdt: number; liquid: number; affordable: number; moving: number };
  candidates: Candidate[];
  best: Candidate | null;
  polygon: boolean;
  scannedAt: string;
}

type RawTicker = { instId: string; volumeUsd: number; spreadPct: number; change24hPct: number; last: number };

/** Един разговор, всички двойки. */
async function allTickers(): Promise<RawTicker[]> {
  const res = await fetch(OKX_TICKERS, { signal: AbortSignal.timeout(10_000) });
  const json = (await res.json()) as { data?: unknown };
  const data = json?.data;
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => {
    const last = parseFloat(d.last);
    const bid = parseFloat(d.bidPx || d.last);
    const ask = parseFloat(d.askPx || d.last);
    const mid = (bid + ask) / 2;
    const open = parseFloat(d.open24h || last);
    return {
      instId: String(d.instId),
      // volCcy24h е оборотът в котираната валута - при -USDT това са долари.
      volumeUsd: parseFloat(d.volCcy24h || 0),
      spreadPct: mid > 0 ? ((ask - bid) / mid) * 100 : 99,
      change24hPct: open > 0 ? ((last - open) / open) * 100 : 0,
      last,
    };
  });
}

export function spreadBudgetFor(p: RobotProfile): number {
  return p.stopDistancePct * 100 * p.gates.spreadBudgetOfStop;
}

export async function scanFor(
  robotId: string,
  polygonApiKey = '',
  depth = 10,
): Promise<ScanResult | { error: string }> {
  const p = robotById(robotId);
  if (!p) return { error: `няма робот "${robotId}"` };
  const g = p.gates;

  const tickers = await allTickers();
  if (tickers.length === 0) return { error: 'OKX не върна списък с двойки' };

  const budget = spreadBudgetFor(p);

  // Първите три порти са евтини - минават през целия пазар наведнъж.
  const usdt = tickers.filter((t) => t.instId.endsWith('-USDT'));
  const liquid = usdt.filter((t) => t.volumeUsd >= g.minVolumeUsd);
  const affordable = liquid.filter((t) => t.spreadPct <= budget);
  const moving = affordable.filter((t) => Math.abs(t.change24hPct) >= g.minDailyRangePct);

  const shortlist = moving.sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, depth);
  const bar = barFor(p);

  const candidates = await Promise.all(
    shortlist.map((t) => evaluate(p, t, bar, budget, polygonApiKey)),
  );

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.find((c) => c.verdict === 'BUY') ?? null;

  return {
    robot: { id: p.id, name: p.name, strategy: p.strategy, stopPct: p.stopDistancePct * 100, bar },
    gateConfig: {
      minVolumeUsd: g.minVolumeUsd,
      spreadBudgetPct: Math.round(budget * 10000) / 10000,
      minDailyRangePct: g.minDailyRangePct,
      minTickScore: g.minTickScore,
      maxRsi: g.maxRsi,
      requireMacro: g.requireMacro,
    },
    universe: {
      total: tickers.length, usdt: usdt.length,
      liquid: liquid.length, affordable: affordable.length, moving: moving.length,
    },
    candidates,
    best,
    polygon: Boolean(polygonApiKey),
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Веригата за една двойка.
 *
 * Портите се пресмятат ВСИЧКИТЕ, дори след първата спряла. По-бавно е, но
 * "спрян от натиска" не казва дали трендът е бил наред - а точно това трябва
 * да се види, за да се разбере колко близо е бил входът.
 */
export async function evaluate(
  p: RobotProfile,
  t: RawTicker,
  bar: string,
  budget: number,
  polygonApiKey: string,
): Promise<Candidate> {
  const g = p.gates;
  const [candles, trades] = await Promise.all([
    fetchOkxCandles(t.instId, bar, 120).catch(() => []),
    fetchOkxTrades(t.instId, 200).catch(() => []),
  ]);

  const closes = candles.map((c) => c.close);
  const ema9 = closes.length >= 30 ? calcEMA(closes, 9) : null;
  const ema21 = closes.length >= 30 ? calcEMA(closes, 21) : null;
  const rsi = closes.length >= 30 ? calcRSI(closes, 14) : null;
  const tick = analyzeMicroTick(trades);

  const sources = ['OKX'];
  const { gate: macro, spoke } = await macroGate(p, t.instId, polygonApiKey);
  if (spoke) sources.push('Polygon');

  // Икономиката: целта е stop × съотношение. От нея се плащат две такси и
  // един спред. Ако не остане нищо, двойката е губеща по устройство - и това
  // няма как да се поправи с по-добър сигнал.
  const targetPct = p.stopDistancePct * p.rewardRiskRatio * 100;
  const costPct = (p.entry === 'market' ? 0.2 : 0.18) + t.spreadPct;
  const netPct = targetPct - costPct;

  const gates: Gate[] = [
    {
      name: 'liquidity', label: 'Ликвидност', passed: t.volumeUsd >= g.minVolumeUsd,
      value: `$${(t.volumeUsd / 1e6).toFixed(0)}M`, threshold: `≥ $${(g.minVolumeUsd / 1e6).toFixed(0)}M`,
    },
    {
      name: 'spread', label: 'Спред', passed: t.spreadPct <= budget,
      value: `${t.spreadPct.toFixed(4)}%`, threshold: `≤ ${budget.toFixed(3)}%`,
    },
    {
      name: 'movement', label: 'Движение', passed: Math.abs(t.change24hPct) >= g.minDailyRangePct,
      value: `${t.change24hPct.toFixed(2)}%`, threshold: `≥ ${g.minDailyRangePct}% за 24ч`,
    },
    {
      name: 'economics', label: 'Икономика', passed: netPct > 0,
      value: `остават ${netPct.toFixed(2)}%`, threshold: `цел ${targetPct.toFixed(2)}% − разходи ${costPct.toFixed(2)}%`,
    },
    {
      name: 'trend', label: 'Тренд (OKX)',
      passed: ema9 !== null && ema21 !== null ? ema9 > ema21 : null,
      value: ema9 !== null && ema21 !== null ? (ema9 > ema21 ? 'EMA9 над EMA21' : 'EMA9 под EMA21') : 'няма свещи',
      threshold: `EMA9 > EMA21 на ${bar}`,
    },
    {
      name: 'strength', label: 'Сила (RSI)',
      passed: rsi !== null ? rsi <= g.maxRsi : null,
      value: rsi !== null ? String(rsi) : '—', threshold: `≤ ${g.maxRsi}`,
    },
    {
      name: 'pressure', label: 'Натиск (тик)', passed: tick.tickScore >= g.minTickScore,
      value: `${tick.tickScore}/25 · ${tick.buyPressurePercent}% купувачи`,
      threshold: `≥ ${g.minTickScore}/25`,
    },
    macro,
  ];

  const blocked = gates.find((x) => x.passed === false);
  const verdict: Candidate['verdict'] =
    !blocked ? 'BUY'
      : blocked.name === 'economics' || blocked.name === 'spread' || blocked.name === 'liquidity'
        ? 'AVOID' : 'WAIT';

  return {
    instId: t.instId,
    volumeUsd: Math.round(t.volumeUsd),
    spreadPct: Math.round(t.spreadPct * 10000) / 10000,
    change24hPct: Math.round(t.change24hPct * 100) / 100,
    last: t.last,
    gates,
    blockedBy: blocked?.name ?? null,
    verdict,
    reason: blocked ? `${blocked.label}: ${blocked.value} при ${blocked.threshold}` : 'всички порти минават',
    score: scoreOf(gates, rsi, tick.tickScore),
    rsi,
    tickScore: tick.tickScore,
    sources,
  };
}

/**
 * Втората независима гледна точка.
 *
 * Polygon покрива само големите двойки - за повечето алткойни няма нищо. Това
 * НЕ се брои за успешно преминаване: липсата на потвърждение и потвърждението
 * са различни неща. Затова портата връща null и роботите, които изискват
 * макро, спират дотук - те търгуват само там, където и двата източника
 * говорят.
 */
async function macroGate(
  p: RobotProfile,
  instId: string,
  apiKey: string,
): Promise<{ gate: Gate; spoke: boolean }> {
  const base: Gate = {
    name: 'macro', label: 'Макро (Polygon)', passed: null,
    value: '—', threshold: p.gates.requireMacro ? 'дневната посока да не противоречи' : 'не се изисква',
  };
  if (!p.gates.requireMacro) {
    return { gate: { ...base, note: 'този робот съди само по OKX' }, spoke: false };
  }
  if (!apiKey) {
    return {
      gate: { ...base, passed: false, value: 'липсва POLYGON_API_KEY',
        note: 'този робот иска втори източник и без ключ не влиза в сделка' },
      spoke: false,
    };
  }

  const daily = await fetchPolygonDaily(apiKey, instId).catch(() => []);
  if (daily.length < 21) {
    return {
      gate: { ...base, passed: false, value: `Polygon няма данни за ${instId}`,
        note: 'Polygon покрива само големите двойки' },
      spoke: false,
    };
  }
  const macro = analyzePolygonMacro(daily, []);
  return {
    gate: {
      ...base,
      passed: macro.dailyDirection !== 'BEARISH',
      value: macro.dailyDirection === 'BULLISH' ? 'дневна посока нагоре'
        : macro.dailyDirection === 'BEARISH' ? 'дневна посока надолу' : 'дневна посока встрани',
    },
    spoke: true,
  };
}

/**
 * Оценката е за ПОДРЕДБА, не за реклама.
 *
 * Казва коя двойка е по-близо до вход от коя, не колко ще се спечели. Затова
 * присъдата стои до нея - самò "82" би изглеждало като обещание.
 */
function scoreOf(gates: Gate[], rsi: number | null, tickScore: number): number {
  const applicable = gates.filter((x) => x.passed !== null);
  const passed = applicable.filter((x) => x.passed).length;
  const ratio = applicable.length > 0 ? passed / applicable.length : 0;

  let score = ratio * 70;
  if (rsi !== null) score += rsi > 45 && rsi < 65 ? 10 : 0;
  score += Math.min(20, tickScore * 0.8);
  return Math.max(0, Math.min(100, Math.round(score)));
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


/**
 * Портите за една конкретна двойка.
 *
 * Съществува, защото екранът за робота показваше собствена присъда с твърдо
 * зашит праг (натиск < 12), докато сканирането отдолу съдеше по прага на
 * робота. За Мрежа с праг 5 това значеше "ЧАКА" горе и "ВХОД" долу за една и
 * съща двойка в един и същи миг.
 */
export async function evaluateOne(
  robotId: string,
  instId: string,
  polygonApiKey = '',
): Promise<Candidate | { error: string }> {
  const p = robotById(robotId);
  if (!p) return { error: `няма робот "${robotId}"` };

  const tickers = await allTickers();
  const t = tickers.find((x) => x.instId === instId);
  if (!t) return { error: `OKX не познава ${instId}` };

  return evaluate(p, t, barFor(p), spreadBudgetFor(p), polygonApiKey);
}

export { barFor };
