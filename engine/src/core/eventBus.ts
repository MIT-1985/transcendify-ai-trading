/**
 * Живият поток от решения на робота.
 *
 * Двигателят досега работеше мълчаливо: смяташе, подаваше поръчки и
 * записваше в базата, но нищо не излизаше навън в момента, в който се
 * случва. Затова готовите панели във фронтенда - RealTimeMonitor,
 * LiveStats, TROKIndicator - нямаха какво да покажат освен това, което
 * сами изтеглят на интервали.
 *
 * Тук няма нова зависимост: EventEmitter е част от Node. Абонатите са
 * малко и краткоживеещи (един поток на отворен екран), затова буферът е
 * пръстеновиден и с таван - екран, отворен цяла нощ, не бива да държи
 * историята на целия ден в паметта.
 */
import { EventEmitter } from 'node:events';

export type BotEventKind =
  | 'cycle'        // започнат цикъл по инструмент
  | 'signal'       // Claude върна намерение
  | 'trok'         // диспечерът избра режим/квантование
  | 'risk'         // риск двигателят разреши или спря
  | 'order'        // поръчка подадена в OKX
  | 'fill'         // изпълнение
  | 'close'        // затворена позиция
  | 'error';

export interface BotEvent {
  seq: number;
  ts: string;
  kind: BotEventKind;
  botId?: string;
  instId?: string;
  /** Кратко изречение за екрана - на езика на потребителя, не на кода. */
  message: string;
  data?: Record<string, unknown>;
}

const MAX_BUFFER = 500;

class BotEventBus extends EventEmitter {
  private seq = 0;
  private readonly buffer: BotEvent[] = [];

  emitEvent(kind: BotEventKind, message: string, extra: Partial<BotEvent> = {}): BotEvent {
    const ev: BotEvent = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      kind,
      message,
      ...extra,
    };
    this.buffer.push(ev);
    // Пръстен: най-старото отпада, вместо паметта да расте без край.
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    this.emit('event', ev);
    return ev;
  }

  /** История за екран, който току-що се е отворил. */
  recent(afterSeq = 0): BotEvent[] {
    return this.buffer.filter((e) => e.seq > afterSeq);
  }
}

export const bus = new BotEventBus();
