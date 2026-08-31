/**
 * TROK - адаптивен многокритериален диспечер за търговия.
 *
 * Пренесен от ядрото на Arhont (trok.c) в точния му защитим вид:
 * адаптивна претеглена сума, не физика и не доказателство, а евристика
 * за управление.
 *
 *      J(x) = Σ k_i · (f_i(x) - target_i)²
 *
 * В ядрото критериите са закъснение, памет, термика и точност. Тук са
 * това, което всъщност решава дали една сделка си струва:
 *
 *   risk      колко от капитала е изложено
 *   cost      такси плюс спред спрямо очакваното движение
 *   edge      измерена печеливша част спрямо точката на изравняване
 *   exposure  колко позиции вече текат едновременно
 *
 * Тезата на TROK е, че константите са относителни спрямо режима, а не
 * универсални. Тук тя е проверима по същия начин както в ядрото:
 * критерият е дали контролерът стабилизира сметката, или не.
 *
 * ВАЖНО: адаптацията е ограничена, детерминистична и записваема. Няма
 * скрито състояние. При еднакви входове дава еднакви изходи - иначе
 * клиентът не може да провери какво е правил роботът му, а точно това
 * му се продава.
 */
import { bus } from './eventBus.ts';

export const TROK_CRITERIA = ['risk', 'cost', 'edge', 'exposure'] as const;
export type TrokCriterion = (typeof TROK_CRITERIA)[number];

export interface TrokState {
  k: Record<TrokCriterion, number>;
  target: Record<TrokCriterion, number>;
  steps: number;
  epoch: number;
}

export interface TrokLimits {
  rate: number;
  kMin: number;
  kMax: number;
}

/** Кандидат за действие: част от нормалния размер, която да се вземе. */
export interface SizeCandidate {
  label: string;
  sizeFraction: number;
}

const DEFAULT_LIMITS: TrokLimits = { rate: 0.08, kMin: 0.25, kMax: 4.0 };

/** Един запис в историята - същите полета като таблицата TrokEpoch. */
export interface TrokEpochRow {
  epoch: number;
  botId?: string;
  kRisk: number; kCost: number; kEdge: number; kExposure: number;
  tRisk: number; tCost: number; tEdge: number; tExposure: number;
  steps: number;
  decision?: string;
  costJ?: number;
  sizeFrac?: number;
}

/** Записва нов epoch. Никога не презаписва - историята е одитът. */
export type TrokPersist = (row: TrokEpochRow) => void | Promise<void>;

export class Trok {
  private readonly k: Record<TrokCriterion, number>;
  private readonly target: Record<TrokCriterion, number>;
  private steps = 0;
  private epoch = 0;
  private persist?: TrokPersist;
  private botId?: string;

  constructor(private readonly limits: TrokLimits = DEFAULT_LIMITS) {
    // Равна начална тежест, после системата ги коригира сама.
    this.k = { risk: 1, cost: 1, edge: 1, exposure: 1 };

    // Рискът тежи повече от началото. Това е ЦЕННОСТНО решение, не
    // оптимизационно, и затова стои явно тук: роботът предпочита да
    // пропусне сделка, отколкото да сложи повече на карта.
    this.k.risk = 2.0;

    this.target = {
      risk: 0.30,     // искаме ниска изложеност
      cost: 0.25,     // таксите да са малка част от очакваното движение
      edge: 0.90,     // предимството да е високо
      exposure: 0.50, // средна заетост на портфейла
    };
  }

  /** Стойността, която се минимизира. */
  cost(f: Record<TrokCriterion, number>): number {
    let j = 0;
    for (const c of TROK_CRITERIA) {
      const d = f[c] - this.target[c];
      j += this.k[c] * d * d;
    }
    return j;
  }

  /**
   * Константа на критерий, който постоянно се отклонява от целта си,
   * расте - системата започва да го цени повече. Константа на критерий,
   * който е в целта, бавно спада. Всичко е между kMin и kMax, за да не
   * избяга адаптацията.
   */
  adapt(f: Record<TrokCriterion, number>): void {
    for (const c of TROK_CRITERIA) {
      const d = Math.abs(f[c] - this.target[c]);
      const e = Math.min(d, 1);
      this.k[c] += this.limits.rate * (e - 0.5) * this.k[c];
      this.k[c] = Math.min(Math.max(this.k[c], this.limits.kMin), this.limits.kMax);
    }
    this.steps++;
  }

  /**
   * Избира каква част от нормалния размер да се вземе.
   *
   * Кандидатът "пропусни" е равноправен, а не краен случай: ако всички
   * критерии са зле, най-евтиното действие е да не се търгува. Точно
   * това прави разликата между диспечер и оптимизатор, който винаги
   * намира какво да купи.
   */
  chooseSize(input: {
    riskNow: number;
    costRatio: number;
    edgeNow: number;
    exposureNow: number;
    instId?: string;
  }): { fraction: number; label: string; j: number; k: Record<TrokCriterion, number> } {
    const candidates: SizeCandidate[] = [
      { label: 'пълен размер', sizeFraction: 1.0 },
      { label: 'намален размер', sizeFraction: 0.6 },
      { label: 'малък размер', sizeFraction: 0.35 },
      { label: 'пропусни', sizeFraction: 0 },
    ];

    // Първият кандидат е винаги наличен, но TypeScript не го знае от
    // индексирането - затова е явно, а не с извикване на !.
    let best: SizeCandidate = { label: 'пропусни', sizeFraction: 0 };
    let bestJ = Infinity;

    for (const cand of candidates) {
      const f: Record<TrokCriterion, number> = {
        // По-малък размер значи по-малък риск и по-малка заетост.
        risk: input.riskNow * cand.sizeFraction,
        exposure: input.exposureNow * cand.sizeFraction,
        // Таксите НЕ падат с размера - те са дял от движението, тоест
        // малка сделка носи същия относителен разход. Затова при висок
        // разход единственото евтино действие остава "пропусни".
        cost: cand.sizeFraction === 0 ? 0 : input.costRatio,
        edge: cand.sizeFraction === 0 ? this.target.edge : input.edgeNow,
      };
      const j = this.cost(f);
      if (j < bestJ) {
        bestJ = j;
        best = cand;
      }
    }

    this.adapt({
      risk: input.riskNow * best.sizeFraction,
      cost: best.sizeFraction === 0 ? 0 : input.costRatio,
      edge: input.edgeNow,
      exposure: input.exposureNow * best.sizeFraction,
    });

    bus.emitEvent('trok', `TROK: ${best.label}`, {
      instId: input.instId,
      data: { fraction: best.sizeFraction, j: bestJ, k: { ...this.k }, steps: this.steps },
    });

    this.record(best.label, bestJ, best.sizeFraction);

    return { fraction: best.sizeFraction, label: best.label, j: bestJ, k: { ...this.k } };
  }

  /**
   * Възстановява последното състояние след рестарт.
   *
   * Без това роботът се връща към началните тежести при всяко пускане и
   * забравя какво е научил - тоест адаптацията не значи нищо, а клиентът
   * вижда различно поведение без причина.
   */
  restore(row: TrokEpochRow): void {
    this.k.risk = row.kRisk; this.k.cost = row.kCost;
    this.k.edge = row.kEdge; this.k.exposure = row.kExposure;
    this.target.risk = row.tRisk; this.target.cost = row.tCost;
    this.target.edge = row.tEdge; this.target.exposure = row.tExposure;
    this.steps = row.steps;
    this.epoch = row.epoch;
  }

  attachStore(persist: TrokPersist, botId?: string): void {
    this.persist = persist;
    this.botId = botId;
  }

  private record(decision: string, costJ: number, sizeFrac: number): void {
    if (!this.persist) return;
    this.epoch++;
    const row: TrokEpochRow = {
      epoch: this.epoch,
      botId: this.botId,
      kRisk: this.k.risk, kCost: this.k.cost,
      kEdge: this.k.edge, kExposure: this.k.exposure,
      tRisk: this.target.risk, tCost: this.target.cost,
      tEdge: this.target.edge, tExposure: this.target.exposure,
      steps: this.steps,
      decision, costJ, sizeFrac,
    };
    // Провалът на записа не бива да събори търговията - историята е важна,
    // но не по-важна от това роботът да продължи да работи.
    void Promise.resolve(this.persist(row)).catch(() => undefined);
  }

  currentEpoch(): number {
    return this.epoch;
  }

  state(): TrokState {
    return { k: { ...this.k }, target: { ...this.target }, steps: this.steps, epoch: this.epoch };
  }
}
