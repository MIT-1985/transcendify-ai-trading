/**
 * Хартиено проследяване на живите сигнали.
 *
 * Абонира се за потока на оркестратора и при всеки сигнал отваря позиция по
 * ТЕКУЩАТА цена, със стопа и целта на съответния робот. После следи цената и
 * затваря, когато някое от двете бъде докоснато.
 *
 * ЗАЩО НАПРЕД, А НЕ НАЗАД
 *
 * Проверката върху история има един вечен недостатък: правилата се пипат,
 * докато числата станат добри, и после не работят на живо. Тук няма как да се
 * подбира - сигналите идват в момента, в който се случват, и изходът е
 * известен чак после.
 *
 * ЗАЩО ЦЕНАТА, А НЕ СВЕЩИТЕ
 *
 * Стопът се проверява спрямо цената на секунда, както прави и борсата. Ако се
 * гледаха свещи, минутна свещ, която е слязла под стопа и се е върнала, би
 * минала за печеливша - грешка, която прави всеки резултат по-хубав от
 * истината.
 */
import { bus, type BotEvent } from './eventBus.ts';
import { robotById } from './robots.ts';
import type { Orchestrator } from './orchestrator.ts';
import type { Database } from '../store/db.ts';

export interface PaperPosition {
  id: string;
  botId: string;
  botName: string;
  instId: string;
  entry: number;
  stop: number;
  target: number;
  openedAt: string;
  closedAt?: string;
  exit?: number;
  outcome?: 'target' | 'stop';
  /** Нетен резултат в проценти, СЛЕД такси. */
  netPct?: number;
}

export class PaperRunner {
  private readonly orchestrator: Orchestrator;
  private readonly db: Database;
  private readonly feeRoundTripPct: number;
  private readonly open = new Map<string, PaperPosition>();
  private readonly closed: PaperPosition[] = [];
  private listener: ((e: BotEvent) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private startedAt: string | null = null;

  constructor(options: {
    orchestrator: Orchestrator;
    db: Database;
    takerFee: number;
  }) {
    this.orchestrator = options.orchestrator;
    this.db = options.db;
    this.feeRoundTripPct = options.takerFee * 2 * 100;
  }

  get isRunning(): boolean {
    return this.listener !== null;
  }

  start(): void {
    if (this.listener) return;
    this.startedAt = new Date().toISOString();

    this.listener = (e: BotEvent) => {
      if (e.kind !== 'signal' || !e.botId || !e.instId) return;
      this.openPosition(e.botId, e.instId);
    };
    bus.on('event', this.listener);

    // Изходът се проверява всяка секунда, защото и цената идва всяка секунда.
    this.timer = setInterval(() => this.checkExits(), 1000);
    bus.emitEvent('cycle', 'хартиеното проследяване тръгна', {});
  }

  stop(): void {
    if (this.listener) bus.off('event', this.listener);
    if (this.timer) clearInterval(this.timer);
    this.listener = null;
    this.timer = null;
    bus.emitEvent('cycle', 'хартиеното проследяване спря', {});
  }

  private openPosition(botId: string, instId: string): void {
    const p = robotById(botId);
    if (!p) return;

    // Един робот, една двойка - иначе същият сигнал, повтарян на всеки такт,
    // би отворил десетки позиции за едно и също нещо.
    const key = `${botId}:${instId}`;
    if (this.open.has(key)) return;
    if ([...this.open.values()].filter((x) => x.botId === botId).length >= p.maxConcurrent) return;

    const price = this.orchestrator.price(instId);
    if (!price || price <= 0) return;

    const position: PaperPosition = {
      id: `${key}:${Date.now()}`,
      botId,
      botName: p.name,
      instId,
      entry: price,
      stop: price * (1 - p.stopDistancePct),
      target: price * (1 + p.stopDistancePct * p.rewardRiskRatio),
      openedAt: new Date().toISOString(),
    };
    this.open.set(key, position);

    bus.emitEvent('order', `${p.name}: хартиен вход ${instId} на ${price}`, {
      botId, instId, data: { stop: position.stop, target: position.target },
    });
  }

  private checkExits(): void {
    for (const [key, pos] of [...this.open.entries()]) {
      const price = this.orchestrator.price(pos.instId);
      if (!price) continue;

      let outcome: 'target' | 'stop' | null = null;
      // Стопът се проверява ПРЪВ. При едновременно докосване в един такт
      // допускането трябва да е в полза на лошия изход - иначе резултатът
      // излиза по-хубав от истината.
      if (price <= pos.stop) outcome = 'stop';
      else if (price >= pos.target) outcome = 'target';
      if (!outcome) continue;

      const grossPct = ((price - pos.entry) / pos.entry) * 100;
      pos.exit = price;
      pos.outcome = outcome;
      pos.closedAt = new Date().toISOString();
      pos.netPct = Math.round((grossPct - this.feeRoundTripPct) * 1000) / 1000;

      this.open.delete(key);
      this.closed.push(pos);
      this.db.collection('PaperTrade').create({ ...pos }).catch(() => undefined);

      bus.emitEvent(
        'close',
        `${pos.botName}: ${pos.instId} затворена на ${outcome === 'target' ? 'целта' : 'стопа'}, ${pos.netPct}% след такси`,
        { botId: pos.botId, instId: pos.instId, data: { outcome, netPct: pos.netPct } }
      );
    }
  }

  report() {
    const byBot = new Map<string, { name: string; wins: number; losses: number; netPct: number; open: number }>();

    for (const pos of this.closed) {
      const row = byBot.get(pos.botId) ?? { name: pos.botName, wins: 0, losses: 0, netPct: 0, open: 0 };
      if (pos.outcome === 'target') row.wins++;
      else row.losses++;
      row.netPct += pos.netPct ?? 0;
      byBot.set(pos.botId, row);
    }
    for (const pos of this.open.values()) {
      const row = byBot.get(pos.botId) ?? { name: pos.botName, wins: 0, losses: 0, netPct: 0, open: 0 };
      row.open++;
      byBot.set(pos.botId, row);
    }

    return {
      running: this.isRunning,
      startedAt: this.startedAt,
      openPositions: this.open.size,
      closedPositions: this.closed.length,
      feeRoundTripPct: this.feeRoundTripPct,
      robots: [...byBot.entries()].map(([botId, r]) => ({
        botId,
        name: r.name,
        wins: r.wins,
        losses: r.losses,
        open: r.open,
        // Процентът се смята само върху ЗАТВОРЕНИТЕ. Отворените нямат изход и
        // броенето им би било гадаене.
        winRatePct: r.wins + r.losses > 0
          ? Math.round((r.wins / (r.wins + r.losses)) * 1000) / 10
          : null,
        netPct: Math.round(r.netPct * 1000) / 1000,
      })),
      open: [...this.open.values()],
    };
  }
}
