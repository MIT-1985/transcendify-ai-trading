import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// zod/v4 нарочно: помощникът на SDK-то работи с тази версия на схемите.
// Обикновеното `from 'zod'` дава друг тип и се проваля чак при сглобяване.
import * as z from 'zod/v4';
import type { EngineConfig } from '../config.ts';
import type { MarketSnapshot } from '../strategy/indicators.ts';
import type { NewsItem } from '../market/polygon.ts';

/**
 * Claude като СЪВЕТНИК, не като изпълнител.
 *
 * Границата е нарочна и важна. Моделът получава числата и връща мнение с
 * увереност; той НЕ определя размера на позицията, НЕ вижда капитала и НЕ може
 * да заобиколи риск-двигателя. Всичко, което върне, минава през [RiskEngine] и
 * може да бъде отказано.
 *
 * Причината: езиковият модел е добър в разчитането на обстановка (новини,
 * противоречиви сигнали, "това прилича на капан"), но няма как да гарантира
 * аритметика върху капитала. Затова аритметиката е в код и се тества, а
 * преценката е в модела и се ограничава.
 */

export const TradeDecisionSchema = z.object({
  action: z.enum(['buy', 'sell', 'hold']),
  /** 0..1 - под прага в настройките сделката не се прави. */
  confidence: z.number().min(0).max(1),
  /** Стопът като кратно на ATR. Ограничава се в кода, не се вярва сляпо. */
  stopAtrMultiple: z.number().min(0.5).max(5),
  /** Кратко обяснение - влиза в дневника, за да може решението да се провери после. */
  rationale: z.string().max(600),
  /** Кое НЕ се вписва в тезата - най-полезното поле при преглед на загубите. */
  againstThesis: z.string().max(400),
});

export type TradeDecision = z.infer<typeof TradeDecisionSchema>;

const SYSTEM_PROMPT = `Ти си дисциплиниран анализатор на краткосрочна търговия с криптовалути.

Работиш при следните истини:
- Такси и спред изяждат малките движения. Сделка без ясен ход в твоя полза е губеща по подразбиране.
- "hold" е напълно приемлив и често правилен отговор. Не търси сделка на всяка цена.
- Увереност над 0.8 се дава само при съвпадение на посока, обем и липса на противоречиви новини.
- Никога не предлагай сделка срещу ясен по-голям тренд само заради един показател.

Не смяташ размер на позиция и не виждаш капитала - за това отговаря отделен слой.
Твоята работа е посока, увереност и къде е невалидна тезата (оттам идва стопът).

Отговаряй само със структурата, която ти е зададена.`;

export interface SignalRequest {
  snapshot: MarketSnapshot;
  news?: NewsItem[];
  /** Разминаването между борсата и независимия източник. */
  dataDivergencePct?: number;
  /** Измереният досегашен процент печеливши на стратегията. */
  historicalWinRate?: number;
  /** Какъв процент печеливши е нужен само за да се излезе на нула. */
  breakevenWinRate?: number;
}

export class ClaudeSignals {
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly effort: EngineConfig['anthropic']['effort'];

  constructor(config: EngineConfig, client?: Anthropic) {
    this.model = config.anthropic.model;
    this.effort = config.anthropic.effort;
    // Същото като в LlmGateway: ANTHROPIC_BASE_URL пренасочва към препращащ
    // сървър, без нищо друго да се променя.
    const baseURL = process.env.ANTHROPIC_BASE_URL;
    this.client =
      client ??
      (config.anthropic.apiKey
        ? new Anthropic({ apiKey: config.anthropic.apiKey, ...(baseURL ? { baseURL } : {}) })
        : null);
  }

  get available(): boolean {
    return this.client !== null;
  }

  private static describe(request: SignalRequest): string {
    const { snapshot, news = [], dataDivergencePct, historicalWinRate, breakevenWinRate } = request;
    const recent = snapshot.candles.slice(-12);

    const lines = [
      `Инструмент: ${snapshot.instId}`,
      `Цена: ${snapshot.price}`,
      `ATR(14): ${snapshot.atr.toFixed(6)} (${(snapshot.atrPct * 100).toFixed(3)}% от цената)`,
      `RSI(14): ${snapshot.rsi.toFixed(1)}`,
      `Тренд (EMA12 срещу EMA26): ${(snapshot.trend * 100).toFixed(3)}%`,
      `Обем спрямо средния: ${snapshot.volumeRatio.toFixed(2)}x`,
      '',
      'Последни свещи (време, отваряне, връх, дъно, затваряне, обем):',
      ...recent.map(
        (candle) =>
          `  ${new Date(candle.ts).toISOString()} ${candle.open} ${candle.high} ${candle.low} ${candle.close} ${candle.volume}`
      ),
    ];

    if (typeof dataDivergencePct === 'number') {
      lines.push('', `Разминаване между източниците на цена: ${(dataDivergencePct * 100).toFixed(3)}%`);
    }
    if (typeof historicalWinRate === 'number' && typeof breakevenWinRate === 'number') {
      lines.push(
        '',
        `Досегашни печеливши: ${(historicalWinRate * 100).toFixed(1)}%`,
        `Необходими след такси, за да не се губи: ${(breakevenWinRate * 100).toFixed(1)}%`
      );
    }
    if (news.length > 0) {
      lines.push('', 'Новини:');
      for (const item of news) {
        lines.push(`  [${item.publishedUtc}] ${item.title}${item.sentiment ? ` (${item.sentiment})` : ''}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Пита модела за посока. При липсващ ключ или отказ връща "hold" - никога
   * не отваря позиция по подразбиране.
   */
  async decide(request: SignalRequest): Promise<TradeDecision> {
    if (!this.client) {
      return {
        action: 'hold',
        confidence: 0,
        stopAtrMultiple: 1.5,
        rationale: 'няма ANTHROPIC_API_KEY - без мнение от модела',
        againstThesis: 'решението е взето без анализ',
      };
    }

    // Отказът на доставчика НЕ бива да сваля цикъла.
    //
    // Липсващ ключ връщаше вежливо "hold"; празна сметка хвърляше и целият
    // /api/functions/... падаше с 500. Тоест същият по същество проблем -
    // няма мнение от модела - в единия случай беше решение, а в другия
    // повреда. Двигателят има собствени порти и трябва да продължи да съди по
    // тях, а причината да се каже с думи.
    let response;
    try {
      response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: this.effort,
        format: zodOutputFormat(TradeDecisionSchema),
      },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Указанията не се менят между заявките - кешират се и не се плащат пак.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: ClaudeSignals.describe(request) }],
      });
    } catch (error) {
      const message = (error as Error).message ?? '';
      const outOfCredit = /credit balance is too low/i.test(message);
      return {
        action: 'hold',
        confidence: 0,
        stopAtrMultiple: 1.5,
        rationale: outOfCredit
          ? 'сметката в Anthropic е празна - без мнение от модела'
          : `моделът не отговори: ${message.slice(0, 140)}`,
        againstThesis: 'решението е взето само по портите на робота',
      };
    }

    if (response.stop_reason === 'refusal') {
      return {
        action: 'hold',
        confidence: 0,
        stopAtrMultiple: 1.5,
        rationale: 'моделът отказа да отговори',
        againstThesis: 'няма анализ',
      };
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return {
        action: 'hold',
        confidence: 0,
        stopAtrMultiple: 1.5,
        rationale: 'отговорът не се разчете',
        againstThesis: 'няма анализ',
      };
    }

    return TradeDecisionSchema.parse(parsed);
  }
}
