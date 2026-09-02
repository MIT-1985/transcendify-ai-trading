/**
 * Оркестраторът: държи всички роботи будни едновременно.
 *
 * Досега скенерът тръгваше само когато някой отвори екран. Между две
 * отваряния роботите не съществуваха - "автоматична търговия", която работи
 * само докато я гледаш, не е автоматична.
 *
 * ЗАЩО ДВА РИТЪМА, А НЕ ЕДИН
 *
 * Пълната оценка на един робот обхожда десетина двойки и за всяка тегли свещи
 * и сделки - около двайсет заявки. На секунда това са хиляда заявки в минута
 * към OKX и борсата спира да отговаря. Затова:
 *
 *   - Цените се обновяват всяка секунда с ЕДИН разговор, който връща всичките
 *     1385 инструмента. Оттам идва секундната реакция.
 *   - Портите се пресмятат по-рядко и всеки робот има свой ритъм, вързан за
 *     свещта му: скалпърът на 15 секунди, суингът на пет минути. Няма смисъл
 *     дневна свещ да се проверява всяка секунда - тя не се мени.
 *
 * Резултатът е бърза реакция там, където има значение, без да ни спрат.
 *
 * ЗАЩО НЕ setInterval
 *
 * Ако едно минаване се проточи повече от периода, setInterval трупа
 * застъпващи се минавания и натоварването расте, докато процесът падне. Тук
 * следващото минаване се насрочва СЛЕД края на предишното.
 */
import { bus } from './eventBus.ts';
import { ROBOTS, type RobotProfile } from './robots.ts';
import { scanFor, type DataSources, type ScanResult } from './scanner.ts';

/** Колко често се пресмятат портите за всеки вид робот, в милисекунди. */
const GATE_PERIOD: Record<string, number> = {
  scalp: 15_000,
  momentum: 30_000,
  grid: 60_000,
  steady: 180_000,
  dca: 300_000,
  swing: 300_000,
};

const PRICE_PERIOD = 1_000;
const OKX_TICKERS = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT';

export interface RobotState {
  robotId: string;
  name: string;
  lastScan: ScanResult | null;
  lastScanAt: string | null;
  lastError: string | null;
  scans: number;
  /** Колко пъти този робот е стигал до "всички порти минават". */
  signals: number;
}

export class Orchestrator {
  private readonly sources: DataSources;
  private readonly states = new Map<string, RobotState>();
  private prices = new Map<string, number>();
  private priceTimer: NodeJS.Timeout | null = null;
  private gateTimers: NodeJS.Timeout[] = [];
  private running = false;
  private priceAt: string | null = null;

  constructor(sources: DataSources) {
    this.sources = sources;
    for (const p of ROBOTS) {
      this.states.set(p.id, {
        robotId: p.id, name: p.name, lastScan: null,
        lastScanAt: null, lastError: null, scans: 0, signals: 0,
      });
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    bus.emitEvent('cycle', 'оркестраторът тръгна - шест робота будни', {});
    this.tickPrices();
    for (const p of ROBOTS) this.tickGates(p);
  }

  stop(): void {
    this.running = false;
    if (this.priceTimer) clearTimeout(this.priceTimer);
    for (const t of this.gateTimers) clearTimeout(t);
    this.gateTimers = [];
    this.priceTimer = null;
    bus.emitEvent('cycle', 'оркестраторът спря', {});
  }

  snapshot() {
    return {
      running: this.running,
      pricesAt: this.priceAt,
      pairsTracked: this.prices.size,
      robots: [...this.states.values()].map((s) => ({
        robotId: s.robotId,
        name: s.name,
        lastScanAt: s.lastScanAt,
        scans: s.scans,
        signals: s.signals,
        lastError: s.lastError,
        best: s.lastScan?.best?.instId ?? null,
        bestReason: s.lastScan?.best?.reason ?? null,
        candidates: s.lastScan?.candidates.length ?? 0,
      })),
    };
  }

  price(instId: string): number | null {
    return this.prices.get(instId) ?? null;
  }

  /** Един разговор, всички цени. Това е секундният ритъм. */
  private async tickPrices(): Promise<void> {
    if (!this.running) return;
    try {
      const res = await fetch(OKX_TICKERS, { signal: AbortSignal.timeout(5000) });
      const json = (await res.json()) as { data?: Array<{ instId?: string; last?: string }> };
      if (Array.isArray(json.data)) {
        const next = new Map<string, number>();
        for (const row of json.data) {
          const px = Number(row.last ?? 0);
          if (row.instId && px > 0) next.set(row.instId, px);
        }
        this.prices = next;
        this.priceAt = new Date().toISOString();
      }
    } catch {
      // Пропуснат такт не се съобщава: борсата примигва по няколко пъти на
      // час и известие за всяко би удавило истинските събития.
    }
    if (this.running) this.priceTimer = setTimeout(() => void this.tickPrices(), PRICE_PERIOD);
  }

  /** Пълната верига от порти за един робот, по неговия ритъм. */
  private async tickGates(p: RobotProfile): Promise<void> {
    if (!this.running) return;
    const state = this.states.get(p.id)!;

    try {
      const result = await scanFor(p.id, this.sources, 10);
      if ('error' in result) {
        state.lastError = result.error;
        bus.emitEvent('error', `${p.name}: ${result.error}`, { botId: p.id });
      } else {
        state.lastError = null;
        state.lastScan = result;
        state.lastScanAt = new Date().toISOString();
        state.scans++;

        if (result.best) {
          state.signals++;
          bus.emitEvent(
            'signal',
            `${p.name}: всички порти минават за ${result.best.instId}`,
            {
              botId: p.id,
              instId: result.best.instId,
              data: { score: result.best.score, sources: result.best.sources },
            }
          );
        } else {
          // Спрените също са решение и трябва да се виждат - иначе тишината
          // изглежда като повреда. Съобщава се КОЯ порта е спряла най-често.
          const counts = new Map<string, number>();
          for (const c of result.candidates) {
            if (c.blockedBy) counts.set(c.blockedBy, (counts.get(c.blockedBy) ?? 0) + 1);
          }
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
          bus.emitEvent(
            'cycle',
            top
              ? `${p.name}: чака - ${result.candidates.length} двойки, най-често спира "${top[0]}"`
              : `${p.name}: чака - няма кандидати`,
            { botId: p.id, data: { candidates: result.candidates.length } }
          );
        }
      }
    } catch (error) {
      state.lastError = (error as Error).message;
      bus.emitEvent('error', `${p.name}: ${state.lastError}`, { botId: p.id });
    }

    if (!this.running) return;
    const period = GATE_PERIOD[p.strategy] ?? 60_000;
    const timer = setTimeout(() => void this.tickGates(p), period);
    this.gateTimers.push(timer);
    // Списъкът се чисти, за да не расте безкрайно при дълга работа.
    if (this.gateTimers.length > ROBOTS.length * 4) {
      this.gateTimers = this.gateTimers.slice(-ROBOTS.length);
    }
  }
}
