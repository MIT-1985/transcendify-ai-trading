import type { EngineConfig, FeeModel, StrategyParams } from '../config.ts';
import { breakevenWinRate, expectedValuePerTrade } from '../config.ts';

/**
 * Рискът - единственото място, което може да КАЖЕ НЕ.
 *
 * Три конкретни поправки спрямо стария код:
 *
 * 1. Размерът на позицията се смята от РАЗСТОЯНИЕТО ДО СТОПА, а не от
 *    произволен процент от капитала. Иначе "20 долара на сделка" значи различен
 *    риск при спокоен и при бурен пазар - същата сума, съвсем различна загуба.
 *
 * 2. Стойността на поръчката се смята по ТЕКУЩАТА цена. Старият код правеше
 *    `order.quantity * (order.limit_price || 1000)` - при пазарна поръчка
 *    limit_price липсва, тоест всяка позиция се оценяваше все едно активът
 *    струва 1000 долара. При биткойн това занижава стойността десетки пъти и
 *    проверката за размер на позицията минаваше винаги.
 *
 * 3. Дневната загуба се смята от ЗАТВОРЕНИ сделки с реален резултат. Старият
 *    код четеше `t.profit_loss`, но никой никога не го записваше - полето беше
 *    все undefined, сборът все нула, ограничението не се задейства нито веднъж.
 *    Затова тук се брои само `status === 'CLOSED'` и `realized_pnl` е
 *    задължително число; липсва ли - това е грешка, не нула.
 */

export interface AccountState {
  /** Свободен капитал в котираната валута (USDT). */
  equity: number;
  /** Най-високият достигнат капитал - за спадането от върха. */
  peakEquity: number;
}

export interface ClosedTrade {
  status: 'CLOSED';
  realized_pnl: number;
  closed_at: string;
}

export interface OpenPosition {
  instId: string;
  size: number;
  entryPrice: number;
  stopPrice: number;
}

export interface TradeProposal {
  instId: string;
  side: 'buy' | 'sell';
  /** Текущата цена, по която реално ще влезем - не лимитна, не последна сделка. */
  price: number;
  stopPrice: number;
  spreadPct: number;
  confidence: number;
  /** Измерен процент печеливши на стратегията (от бектест или от историята). */
  historicalWinRate: number;
  takerEntry: boolean;
}

export type RiskDecision =
  | {
      approved: true;
      size: number;
      notional: number;
      riskAmount: number;
      takeProfitPrice: number;
      stopDistancePct: number;
      breakeven: number;
      expectedValue: number;
    }
  | { approved: false; reason: string; detail?: Record<string, unknown> };

export interface RiskContext {
  account: AccountState;
  openPositions: OpenPosition[];
  /** Сделките, затворени ДНЕС. Отворените нямат резултат и не се броят. */
  closedToday: ClosedTrade[];
  tradesToday: number;
}

export class RiskEngine {
  private readonly params: StrategyParams;
  private readonly fees: FeeModel;

  constructor(config: EngineConfig) {
    this.params = config.strategy;
    this.fees = config.fees;
  }

  /**
   * Реализираната загуба за деня, като положително число.
   *
   * Хвърля, ако затворена сделка няма резултат: тихото третиране на липсващото
   * поле като нула е точно начинът, по който старият дневен лимит не сработи
   * нито веднъж.
   */
  realizedLossToday(closedToday: ClosedTrade[]): number {
    let loss = 0;
    for (const trade of closedToday) {
      if (typeof trade.realized_pnl !== 'number' || !Number.isFinite(trade.realized_pnl)) {
        throw new Error(
          `затворена сделка без realized_pnl (closed_at=${trade.closed_at}) - дневният лимит не може да се сметне`
        );
      }
      if (trade.realized_pnl < 0) loss += -trade.realized_pnl;
    }
    return loss;
  }

  evaluate(proposal: TradeProposal, context: RiskContext): RiskDecision {
    const p = this.params;
    const { account, openPositions, closedToday, tradesToday } = context;

    if (!(account.equity > 0)) {
      return { approved: false, reason: 'няма капитал' };
    }

    // ---- спиране на цялата дейност ----------------------------------------

    const drawdown =
      account.peakEquity > 0 ? (account.peakEquity - account.equity) / account.peakEquity : 0;
    if (drawdown >= p.maxDrawdownPct) {
      return {
        approved: false,
        reason: `спадане от върха ${(drawdown * 100).toFixed(1)}% достигна тавана ${(p.maxDrawdownPct * 100).toFixed(1)}%`,
        detail: { drawdown, peakEquity: account.peakEquity, equity: account.equity },
      };
    }

    const lossToday = this.realizedLossToday(closedToday);
    const dailyLimit = account.equity * p.maxDailyLossPct;
    if (lossToday >= dailyLimit) {
      return {
        approved: false,
        reason: `дневната загуба ${lossToday.toFixed(2)} достигна лимита ${dailyLimit.toFixed(2)}`,
        detail: { lossToday, dailyLimit },
      };
    }

    if (tradesToday >= p.maxTradesPerDay) {
      return { approved: false, reason: `${tradesToday} сделки днес - таванът е ${p.maxTradesPerDay}` };
    }

    if (openPositions.length >= p.maxOpenPositions) {
      return {
        approved: false,
        reason: `${openPositions.length} отворени позиции - таванът е ${p.maxOpenPositions}`,
      };
    }

    if (openPositions.some((position) => position.instId === proposal.instId)) {
      return { approved: false, reason: `вече има отворена позиция в ${proposal.instId}` };
    }

    // ---- качество на конкретната сделка -----------------------------------

    if (proposal.confidence < p.minConfidence) {
      return {
        approved: false,
        reason: `увереност ${proposal.confidence.toFixed(2)} под прага ${p.minConfidence}`,
      };
    }

    if (proposal.spreadPct > p.maxSpreadPct) {
      return {
        approved: false,
        reason: `спред ${(proposal.spreadPct * 100).toFixed(3)}% над позволения ${(p.maxSpreadPct * 100).toFixed(3)}%`,
        detail: { spreadPct: proposal.spreadPct },
      };
    }

    if (!(proposal.price > 0)) {
      return { approved: false, reason: 'няма валидна текуща цена' };
    }

    const stopDistance = Math.abs(proposal.price - proposal.stopPrice);
    const stopDistancePct = stopDistance / proposal.price;

    if (stopDistancePct < p.minStopDistancePct) {
      return {
        approved: false,
        reason: `стопът е на ${(stopDistancePct * 100).toFixed(3)}% - под ${(p.minStopDistancePct * 100).toFixed(3)}% таксите изяждат целта`,
      };
    }
    if (stopDistancePct > p.maxStopDistancePct) {
      return {
        approved: false,
        reason: `стопът е на ${(stopDistancePct * 100).toFixed(2)}% - над тавана ${(p.maxStopDistancePct * 100).toFixed(2)}%`,
      };
    }

    // ---- има ли изобщо предимство -----------------------------------------

    const breakeven = breakevenWinRate({
      stopDistancePct,
      rewardRiskRatio: p.rewardRiskRatio,
      fees: this.fees,
      spreadPct: proposal.spreadPct,
      takerEntry: proposal.takerEntry,
    });

    const expectedValue = expectedValuePerTrade({
      winRate: proposal.historicalWinRate,
      stopDistancePct,
      rewardRiskRatio: p.rewardRiskRatio,
      fees: this.fees,
      spreadPct: proposal.spreadPct,
      takerEntry: proposal.takerEntry,
    });

    if (proposal.historicalWinRate < breakeven + p.minEdgeMargin) {
      return {
        approved: false,
        reason:
          `няма предимство: измерени ${(proposal.historicalWinRate * 100).toFixed(1)}% печеливши, ` +
          `а след такси трябват поне ${((breakeven + p.minEdgeMargin) * 100).toFixed(1)}%`,
        detail: { breakeven, historicalWinRate: proposal.historicalWinRate, expectedValue },
      };
    }

    if (expectedValue <= 0) {
      return {
        approved: false,
        reason: 'отрицателна очаквана стойност след такси и спред',
        detail: { expectedValue },
      };
    }

    // ---- размер -----------------------------------------------------------

    // Рискуваната сума дели се на разстоянието до стопа: колкото по-далеч е
    // стопът, толкова по-малка позиция. Така загубата при удрян стоп е една и
    // съща в лева, независимо колко бурен е пазарът.
    const riskAmount = account.equity * p.riskPerTrade;
    let size = riskAmount / stopDistance;
    let notional = size * proposal.price;

    // Таван върху дела на капитала - пази от една огромна позиция при много
    // близък стоп.
    const maxNotional = account.equity * p.maxPositionPct;
    if (notional > maxNotional) {
      notional = maxNotional;
      size = notional / proposal.price;
    }

    if (!(size > 0) || !Number.isFinite(size)) {
      return { approved: false, reason: 'сметнатият размер не е валиден' };
    }

    const takeProfitPrice =
      proposal.side === 'buy'
        ? proposal.price + stopDistance * p.rewardRiskRatio
        : proposal.price - stopDistance * p.rewardRiskRatio;

    return {
      approved: true,
      size,
      notional,
      riskAmount: Math.min(riskAmount, notional * stopDistancePct),
      takeProfitPrice,
      stopDistancePct,
      breakeven,
      expectedValue,
    };
  }
}
