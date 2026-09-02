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
 *   тренд (OKX) → сила (RSI) → натиск (тик) → макро (дневна история)
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
 * Макрото е втори НЕЗАВИСИМ източник - Alchemy или Polygon, не OKX. Липсата на данни от
 * него не се брои за минаване: липса на потвърждение и потвърждение са
 * различни неща. Затова роботите с requireMacro търгуват само там, където и
 * двата източника говорят - обикновено големите двойки.
 *
 * Всяка спряна сделка носи името на портата, която я е спряла. Иначе "роботът
 * не търгува" изглежда като повреда.
 */
import { robotById, type RobotProfile } from './robots.ts';
import { AlchemyClient } from '../market/alchemy.ts';
import { activeAdjustment } from './marketRules.ts';
import type { Trok } from './trok.ts';
import {
  fetchOkxCandles, fetchOkxTrades, analyzeMicroTick, calcEMA, calcRSI,
  fetchPolygonDaily, analyzePolygonMacro,
} from '../../shared/microMarketData.ts';

/**
 * Източниците за дневната история.
 *
 * Alchemy е основният: измерено на четиринайсет символа, връща по 30-31 дневни
 * точки за ВСИЧКИ, включително GRVT, HYPE и ENA. Polygon дава пълни свещи с
 * обем, но само за големите двойки - затова остава, но втори.
 */
export interface DataSources {
  polygonApiKey?: string;
  alchemy?: AlchemyClient;
  /**
   * Диспечерът на този робот.
   *
   * Подава се отвън, защото носи ПАМЕТ - тежестите му се местят след всяко
   * решение. Ако се създаваше тук, всяко минаване щеше да тръгва от нула и
   * ученето нямаше да съществува.
   */
  trok?: Trok;
  /** Колко позиции държи роботът в момента - вход за заетостта. */
  openPositions?: number;
  /** Вече изтеглен списък с всички двойки - спестява по един разговор на робот. */
  tickers?: RawTicker[];
}

const OKX_TICKERS = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT';

export type GateName =
  | 'liquidity' | 'spread' | 'movement' | 'economics'
  | 'trend' | 'strength' | 'pressure' | 'macro'
  | 'regime' | 'trok';

export interface Gate {
  name: GateName;
  label: string;
  /** null = не се прилага за тази двойка (и това НЕ е тихо преминаване). */
  passed: boolean | null;
  value: string;
  threshold: string;
  note?: string;
  /**
   * Спира ли сделка при провал.
   *
   * Порта, за която НЯМА измерено доказателство, че вдига процента печеливши,
   * не бива да спира вход. Остава видима - числото ѝ помага на човека - но
   * не решава вместо измерването.
   */
  blocking: boolean;
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
  /** Какъв размер избра TROK и защо. */
  size: { fraction: number; label: string; j: number } | null;
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
  alchemy: boolean;
  scannedAt: string;
}

export type RawTicker = { instId: string; volumeUsd: number; spreadPct: number; change24hPct: number; last: number };

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
  sources: DataSources = {},
  depth = 10,
): Promise<ScanResult | { error: string }> {
  const p = robotById(robotId);
  if (!p) return { error: `няма робот "${robotId}"` };
  const g = p.gates;

  // Готовият списък се ползва, ако някой вече го е взел. Шест робота, които
  // теглят един и същ списък по едно и също време, сами си причиняват
  // ограничаването, което после ги оставя без свещи.
  const tickers = sources.tickers ?? (await allTickers());
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
    shortlist.map((t) => evaluate(p, t, bar, budget, sources)),
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
    polygon: Boolean(sources.polygonApiKey),
    alchemy: Boolean(sources.alchemy?.available),
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
  sources: DataSources,
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

  const sourceList = ['OKX'];
  const { gate: macro, spoke, via } = await macroGate(p, t.instId, sources);
  if (spoke && via) sourceList.push(via);

  // Икономиката: целта е stop × съотношение. От нея се плащат две такси и
  // един спред. Ако не остане нищо, двойката е губеща по устройство - и това
  // няма как да се поправи с по-добър сигнал.
  const targetPct = p.stopDistancePct * p.rewardRiskRatio * 100;
  const costPct = (p.entry === 'market' ? 0.2 : 0.18) + t.spreadPct;
  const netPct = targetPct - costPct;

  const gates: Gate[] = [
    {
      // Структурна, не сигнална: пази от книга, в която поръчката сама си
      // мърда цената. Не е филтър за качество на сигнала и затова не е
      // измервана като такъв.
      name: 'liquidity', label: 'Ликвидност', passed: t.volumeUsd >= g.minVolumeUsd,
      value: `$${(t.volumeUsd / 1e6).toFixed(0)}M`, threshold: `≥ $${(g.minVolumeUsd / 1e6).toFixed(0)}M`,
      blocking: true,
    },
    {
      name: 'spread', label: 'Спред', passed: t.spreadPct <= budget,
      value: `${t.spreadPct.toFixed(4)}%`, threshold: `≤ ${budget.toFixed(3)}%`,
      blocking: true,
    },
    {
      // ИЗМЕРЕНА И ОСТАВЕНА БЕЗ ПРАВО НА ВЕТО.
      //
      // Върху десет двойки и шест робота движението не вдигна процента
      // печеливши никъде. При Стълба веригата с него дава +12.7 точки над
      // нулата, а само трендът - +19.7. Тоест добавянето му ВРЕДИ.
      name: 'movement', label: 'Движение', passed: Math.abs(t.change24hPct) >= g.minDailyRangePct,
      value: `${t.change24hPct.toFixed(2)}%`, threshold: `≥ ${g.minDailyRangePct}% за 24ч`,
      blocking: false,
    },
    {
      // Структурна: двойка, на която целта не надживява таксите, е губеща по
      // устройство. Не е въпрос на процент печеливши.
      name: 'economics', label: 'Икономика', passed: netPct > 0,
      value: `остават ${netPct.toFixed(2)}%`, threshold: `цел ${targetPct.toFixed(2)}% − разходи ${costPct.toFixed(2)}%`,
      blocking: true,
    },
    {
      // Липсата на свещи е ОТКАЗ, не "не се прилага".
      //
      // Дотук беше null и не блокираше. Значеше, че когато OKX ни ограничи и
      // спре да дава свещи, роботът минава БЕЗ проверка за тренд - тоест
      // натоварването го правеше по-смел, вместо по-предпазлив. Точно
      // обратното на това, което трябва да прави липсата на данни.
      name: 'trend', label: 'Тренд (OKX)',
      passed: ema9 !== null && ema21 !== null ? ema9 > ema21 : false,
      value: ema9 !== null && ema21 !== null
        ? (ema9 > ema21 ? 'EMA9 над EMA21' : 'EMA9 под EMA21')
        : `няма свещи (${candles.length}/30)`,
      threshold: `EMA9 > EMA21 на ${bar}`,
      note: ema9 === null ? 'OKX не върна достатъчно свещи - вход без проверка не се допуска' : undefined,
      // ЕДИНСТВЕНАТА СИГНАЛНА ПОРТА С ДОКАЗАТЕЛСТВО.
      // Стълба: 44.4% без порти → 54.3% само с тренда, +19.7 точки над нулата.
      blocking: true,
    },
    {
      // ИЗМЕРЕНА И ОСТАВЕНА БЕЗ ПРАВО НА ВЕТО.
      // При Стълба сваля процента от 44.4% на 37.5%, тоест избира ПО-ЛОШИ
      // входове. Числото остава на екрана, защото е полезно да се види.
      name: 'strength', label: 'Сила (RSI)',
      passed: rsi !== null ? rsi <= g.maxRsi : false,
      value: rsi !== null ? String(rsi) : 'няма свещи', threshold: `≤ ${g.maxRsi}`,
      blocking: false,
    },
    {
      // НЕИЗМЕРЕНА: OKX не дава историческа книга със сделки, значи няма как
      // да се провери назад. Оставена без вето по същото правило - порта без
      // доказателство не спира сделка.
      name: 'pressure', label: 'Натиск (тик)', passed: tick.tickScore >= g.minTickScore,
      value: `${tick.tickScore}/25 · ${tick.buyPressurePercent}% купувачи`,
      threshold: `≥ ${g.minTickScore}/25`,
      blocking: false,
    },
    macro,
    regimeGate(),
  ];

  // TROK решава РАЗМЕРА, след като всичко останало е минало.
  //
  // Досега този диспечер стоеше написан и неизползван, а праговете на портите
  // бяха числа, които аз избрах на ръка и които не се учеха от нищо. Тук той
  // получава четири измерими стойности и връща дял от размера. Когато върне
  // нула, това е отказ - и той се брои като порта, за да се вижда наравно с
  // останалите, а не да изчезва тихо.
  let size: Candidate['size'] = null;
  if (sources.trok && !gates.some((x) => x.passed === false && x.blocking)) {
    const volPct = volatilityOf(candles);
    const chosen = sources.trok.chooseSize({
      // Колко близо е обичайното люлеене до стопа. Над 1 значи, че стопът
      // стои вътре в шума и ще бъде удрян без пазарът да е тръгнал.
      riskNow: clamp01(volPct / (p.stopDistancePct * 100)),
      // Каква част от целта изяждат таксите и спредът.
      costRatio: clamp01(costPct / Math.max(targetPct, 1e-9)),
      edgeNow: clamp01(scoreOf(gates, rsi, tick.tickScore) / 100),
      exposureNow: clamp01((sources.openPositions ?? 0) / Math.max(p.maxConcurrent, 1)),
      instId: t.instId,
    });
    size = { fraction: chosen.fraction, label: chosen.label, j: Math.round(chosen.j * 1000) / 1000 };
    gates.push({
      name: 'trok',
      label: 'TROK (размер)',
      passed: chosen.fraction > 0,
      value: `${chosen.label} (${Math.round(chosen.fraction * 100)}%)`,
      threshold: 'над нула',
      note: `цена на решението J=${size.j}`,
      // Структурна: нулев размер значи "не влизай", а не мнение за посоката.
      blocking: true,
    });
  }

  const blocked = gates.find((x) => x.passed === false && x.blocking);
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
    size,
    sources: sourceList,
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
  sources: DataSources,
): Promise<{ gate: Gate; spoke: boolean; via: string | null }> {
  const base: Gate = {
    name: 'macro', label: 'Макро (дневна)', passed: null,
    value: '—', threshold: p.gates.requireMacro ? 'дневната посока да не противоречи' : 'не се изисква',
    // Втори НЕЗАВИСИМ източник. Не е измерена назад - Polygon и Alchemy
    // покриват само дневни затваряния, а роботите, които я изискват, работят
    // на часова и по-дребна свещ. Оставя вето, защото не е сигнална порта, а
    // проверка че двата източника изобщо се съгласяват за посоката.
    blocking: p.gates.requireMacro,
  };
  if (!p.gates.requireMacro) {
    return { gate: { ...base, note: 'този робот съди само по OKX' }, spoke: false, via: null };
  }

  // Polygon пръв - дава пълни свещи. Но покрива само големите двойки, затова
  // Alchemy го догонва там, където мълчи: измерено, той връща по трийсет
  // дневни точки и за GRVT, HYPE и ENA, каквито скенерът реално намира.
  let closes: number[] = [];
  let via: string | null = null;

  if (sources.alchemy?.available) {
    const points = await sources.alchemy.dailyCloses(instId, 30).catch(() => []);
    if (points.length >= 21) {
      closes = points.map((x) => x.close);
      via = 'Alchemy';
    }
  }

  // Polygon е резервата: пълни свещи, но само за големите двойки.
  if (closes.length < 21 && sources.polygonApiKey) {
    const daily = await fetchPolygonDaily(sources.polygonApiKey, instId).catch(() => []);
    if (daily.length >= 21) {
      closes = daily.map((b) => b.close);
      via = 'Polygon';
    }
  }

  if (closes.length < 21) {
    const reason = !sources.polygonApiKey && !sources.alchemy?.available
      ? 'няма източник за дневна история'
      : `нито Polygon, нито Alchemy имат дневна история за ${instId}`;
    return {
      gate: { ...base, passed: false, value: reason,
        note: 'този робот иска втори източник и без него не влиза в сделка' },
      spoke: false, via: null,
    };
  }

  // Посоката се смята от затварянията - Alchemy дава цена, не свещ, затова
  // тук няма нищо, което да иска обхват или обем.
  const bars = closes.map((close) => ({ ts: 0, open: close, high: close, low: close, close, vol: 0 }));
  const macro = analyzePolygonMacro(bars, []);

  return {
    gate: {
      ...base,
      label: `Макро (${via})`,
      passed: macro.dailyDirection !== 'BEARISH',
      value: macro.dailyDirection === 'BULLISH' ? 'дневна посока нагоре'
        : macro.dailyDirection === 'BEARISH' ? 'дневна посока надолу' : 'дневна посока встрани',
    },
    spoke: true, via,
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
  sources: DataSources = {},
): Promise<Candidate | { error: string }> {
  const p = robotById(robotId);
  if (!p) return { error: `няма робот "${robotId}"` };

  const tickers = await allTickers();
  const t = tickers.find((x) => x.instId === instId);
  if (!t) return { error: `OKX не познава ${instId}` };

  return evaluate(p, t, barFor(p), spreadBudgetFor(p), sources);
}

export { barFor };


/** 0..1, за входовете на TROK. */
function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

/** Обичайното люлеене в проценти - най-високото минус най-ниското за 20 свещи. */
function volatilityOf(candles: Array<{ high: number; low: number }>): number {
  const slice = candles.slice(-20);
  if (slice.length < 5) return 0;
  const hi = Math.max(...slice.map((c) => c.high));
  const lo = Math.min(...slice.map((c) => c.low));
  return lo > 0 ? ((hi - lo) / lo) * 100 : 0;
}

/**
 * Часът на денонощието.
 *
 * `data/market_patterns_rules.csv` описва 92 наблюдавани прозореца - кога
 * ликвидността пада, кога спредът се разширява, кога има емисии. Каталогът
 * стоеше прочетен и неизползван; тук става порта.
 *
 * Спира се САМО при недвусмислено "Halt trading". Останалите правила
 * намаляват размера и това минава през TROK, вместо да блокира - тихо
 * блокиране по неразбрано правило е по-лошо от никакво.
 */
function regimeGate(now = new Date()): Gate {
  const adj = activeAdjustment(now);
  const names = adj.matched.map((r) => r.pattern).slice(0, 2).join(', ');
  return {
    name: 'regime',
    label: 'Пазарен режим',
    passed: adj.sizeMultiplier > 0,
    value: adj.matched.length === 0
      ? 'няма активно правило'
      : `${adj.matched.length} правила · размер ×${adj.sizeMultiplier}${adj.tightenStops ? ' · стегнати стопове' : ''}`,
    threshold: 'без "Halt trading"',
    note: names || undefined,
    blocking: true,
  };
}
