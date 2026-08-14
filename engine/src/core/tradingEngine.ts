import type { EngineConfig } from '../config.ts';
import { breakevenWinRate } from '../config.ts';
import type { Database } from '../store/db.ts';
import { OkxClient, OkxError, roundToLotSize } from '../exchange/okxClient.ts';
import { PolygonClient, crossCheck } from '../market/polygon.ts';
import { ClaudeSignals } from '../ai/claude.ts';
import { snapshot } from '../strategy/indicators.ts';
import { RiskEngine, type ClosedTrade, type OpenPosition } from '../risk/riskEngine.ts';

/**
 * Целият път на една сделка: данни -> преценка -> риск -> изпълнение -> запис.
 *
 * Редът НЕ Е случаен и не бива да се разменя. Рискът се смята след като има
 * реална цена и реален спред, а не върху предположения; изпълнението става
 * само след одобрение от риска; записът става веднага след изпълнението, за да
 * не съществува позиция, за която няма следа.
 */

export interface CycleResult {
  instId: string;
  outcome: 'opened' | 'skipped' | 'blocked' | 'error';
  reason?: string;
  detail?: Record<string, unknown>;
}

export interface TradeRow {
  id: string;
  instId: string;
  side: 'buy' | 'sell';
  size: number;
  entry_price: number;
  stop_price: number;
  take_profit_price: number;
  status: 'OPEN' | 'CLOSED';
  realized_pnl?: number;
  fees_paid?: number;
  closed_at?: string;
  close_price?: number;
  close_reason?: string;
  entry_ord_id?: string;
  algo_id?: string;
  protection?: string;
  mode: 'paper' | 'live';
  decision?: unknown;
}

export class TradingEngine {
  private readonly risk: RiskEngine;

  constructor(
    private readonly config: EngineConfig,
    private readonly db: Database,
    private readonly okx: OkxClient,
    private readonly polygon: PolygonClient,
    private readonly claude: ClaudeSignals
  ) {
    this.risk = new RiskEngine(config);
  }

  private get trades() {
    return this.db.collection('trades');
  }

  private get journal() {
    return this.db.collection('journal');
  }

  /** Днешните затворени сделки - основата на дневния лимит. */
  private async closedToday(): Promise<ClosedTrade[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.trades.filter({ status: 'CLOSED' });
    return rows
      .filter((row) => String(row.closed_at ?? '').startsWith(today))
      .map((row) => ({
        status: 'CLOSED' as const,
        realized_pnl: row.realized_pnl as number,
        closed_at: row.closed_at as string,
      }));
  }

  private async openPositions(): Promise<OpenPosition[]> {
    const rows = await this.trades.filter({ status: 'OPEN' });
    return rows.map((row) => ({
      instId: row.instId as string,
      size: row.size as number,
      entryPrice: row.entry_price as number,
      stopPrice: row.stop_price as number,
    }));
  }

  /** Измереният процент печеливши. Малко сделки = не се вярва, връща 0. */
  async measuredWinRate(instId?: string): Promise<{ winRate: number; sample: number }> {
    const filter = instId ? { status: 'CLOSED', instId } : { status: 'CLOSED' };
    const rows = await this.trades.filter(filter);
    const scored = rows.filter((row) => typeof row.realized_pnl === 'number');
    if (scored.length < 20) return { winRate: 0, sample: scored.length };
    const wins = scored.filter((row) => (row.realized_pnl as number) > 0).length;
    return { winRate: wins / scored.length, sample: scored.length };
  }

  private async equity(): Promise<{ equity: number; peakEquity: number }> {
    const snapshots = await this.db.collection('equity').list('-created_date', 1);
    const stored = snapshots[0];

    let equity: number;
    if (this.config.mode === 'live' && this.okx.authenticated) {
      equity = await this.okx.balance('USDT');
    } else {
      equity = (stored?.equity as number) ?? Number(process.env.PAPER_START_EQUITY ?? 1000);
    }

    const peakEquity = Math.max(equity, (stored?.peakEquity as number) ?? equity);
    await this.db.collection('equity').create({ equity, peakEquity });
    return { equity, peakEquity };
  }

  /**
   * Един пълен оглед на един инструмент.
   *
   * Всеки отказ се записва в дневника с причина. Това е нарочно: най-често
   * задаваният въпрос към такава система е "защо не търгува", а отговорът
   * трябва да е запис, не предположение.
   */
  async runCycle(instId: string): Promise<CycleResult> {
    try {
      const [candles, ticker] = await Promise.all([
        this.okx.candles(instId, '5m', 120),
        this.okx.ticker(instId),
      ]);

      if (candles.length < 30) {
        return this.skip(instId, 'няма достатъчно история за показателите');
      }

      const market = snapshot(instId, candles);

      // Втори източник: ако Polygon е настроен и се разминава силно с борсата,
      // единият поток е стар. Не се търгува на стари данни.
      let divergence: number | undefined;
      if (this.polygon.available) {
        try {
          const reference = await this.polygon.candles(instId, { multiplier: 5, limit: 3 });
          const referenceLast = reference.at(-1)?.close;
          if (referenceLast) {
            divergence = crossCheck(ticker.last, referenceLast);
            if (divergence > 0.003) {
              return this.skip(
                instId,
                `източниците се разминават с ${(divergence * 100).toFixed(2)}% - данните не са надеждни`,
                { okx: ticker.last, polygon: referenceLast }
              );
            }
          }
        } catch (error) {
          // Липсващият втори източник не бива да спира всичко - записва се и се продължава.
          await this.journal.create({
            type: 'polygon_unavailable',
            instId,
            message: (error as Error).message,
          });
        }
      }

      const { winRate, sample } = await this.measuredWinRate();
      const provisionalStopPct = Math.max(market.atrPct * 1.5, this.config.strategy.minStopDistancePct);
      const breakeven = breakevenWinRate({
        stopDistancePct: provisionalStopPct,
        rewardRiskRatio: this.config.strategy.rewardRiskRatio,
        fees: this.config.fees,
        spreadPct: ticker.spreadPct,
        takerEntry: true,
      });

      const news = this.polygon.available
        ? await this.polygon.news(instId, 5).catch(() => [])
        : [];

      const decision = await this.claude.decide({
        snapshot: market,
        news,
        dataDivergencePct: divergence,
        historicalWinRate: winRate,
        breakevenWinRate: breakeven,
      });

      await this.journal.create({ type: 'decision', instId, decision, breakeven, sample });

      if (decision.action === 'hold') {
        return this.skip(instId, `моделът препоръчва изчакване: ${decision.rationale}`);
      }

      const side = decision.action;
      const price = side === 'buy' ? ticker.ask : ticker.bid;
      const stopMultiple = Math.min(Math.max(decision.stopAtrMultiple, 0.8), 3);
      const stopDistance = market.atr * stopMultiple;
      const stopPrice = side === 'buy' ? price - stopDistance : price + stopDistance;

      const { equity, peakEquity } = await this.equity();
      const tradesToday = (await this.trades.filter({})).filter((row) =>
        String(row.created_date).startsWith(new Date().toISOString().slice(0, 10))
      ).length;

      const verdict = this.risk.evaluate(
        {
          instId,
          side,
          price,
          stopPrice,
          spreadPct: ticker.spreadPct,
          confidence: decision.confidence,
          // Без достатъчно история няма измерено предимство и рискът ще откаже.
          // Това е нарочно: първите сделки се правят на хартия.
          historicalWinRate: sample >= 20 ? winRate : 0,
          takerEntry: true,
        },
        {
          account: { equity, peakEquity },
          openPositions: await this.openPositions(),
          closedToday: await this.closedToday(),
          tradesToday,
        }
      );

      if (!verdict.approved) {
        await this.journal.create({ type: 'risk_block', instId, reason: verdict.reason, detail: verdict.detail });
        return { instId, outcome: 'blocked', reason: verdict.reason, detail: verdict.detail };
      }

      return await this.open(instId, side, price, stopPrice, verdict.takeProfitPrice, verdict.size, decision);
    } catch (error) {
      await this.journal.create({ type: 'error', instId, message: (error as Error).message });
      return { instId, outcome: 'error', reason: (error as Error).message };
    }
  }

  private async skip(
    instId: string,
    reason: string,
    detail?: Record<string, unknown>
  ): Promise<CycleResult> {
    await this.journal.create({ type: 'skip', instId, reason, detail });
    return { instId, outcome: 'skipped', reason, detail };
  }

  private async open(
    instId: string,
    side: 'buy' | 'sell',
    price: number,
    stopPrice: number,
    takeProfitPrice: number,
    rawSize: number,
    decision: unknown
  ): Promise<CycleResult> {
    const clOrdId = `tx${Date.now().toString(36)}`;

    if (this.config.mode !== 'live' || !this.config.allowRealOrders) {
      // Хартиена сделка: същите числа, същият запис, без поръчка към борсата.
      const row = await this.trades.create({
        instId,
        side,
        size: rawSize,
        entry_price: price,
        stop_price: stopPrice,
        take_profit_price: takeProfitPrice,
        status: 'OPEN',
        mode: 'paper',
        protection: 'simulated',
        decision,
      });
      return { instId, outcome: 'opened', detail: { id: row.id, mode: 'paper' } };
    }

    const instrument = await this.okx.instrument(instId);
    const size = roundToLotSize(rawSize, instrument.lotSz);
    if (size < instrument.minSz) {
      return this.skip(
        instId,
        `сметнатият размер ${rawSize} пада под минималния на борсата ${instrument.minSz}`
      );
    }

    try {
      const placed = await this.okx.placeProtectedEntry({
        instId,
        side,
        size,
        stopPrice: Number(stopPrice.toFixed(countDecimals(instrument.tickSz))),
        takeProfitPrice: Number(takeProfitPrice.toFixed(countDecimals(instrument.tickSz))),
        clOrdId,
      });

      const row = await this.trades.create({
        instId,
        side,
        size,
        entry_price: price,
        stop_price: placed.stopPrice,
        take_profit_price: placed.takeProfitPrice,
        status: 'OPEN',
        mode: 'live',
        entry_ord_id: placed.entry.ordId,
        algo_id: placed.entry.algoId,
        protection: placed.protection,
        decision,
      });

      return {
        instId,
        outcome: 'opened',
        detail: { id: row.id, protection: placed.protection, ordId: placed.entry.ordId },
      };
    } catch (error) {
      const message = error instanceof OkxError ? `${error.code}: ${error.message}` : (error as Error).message;
      await this.journal.create({ type: 'execution_error', instId, message });
      return { instId, outcome: 'error', reason: message };
    }
  }

  /**
   * Затваря позиция и ЗАПИСВА резултата.
   *
   * `realized_pnl` се смята тук и се записва задължително. Дневният лимит чете
   * точно това поле; докато никой не го пишеше, лимитът беше украса.
   *
   * Таксите се вадят от резултата, а не се показват отделно - иначе всяка
   * сделка изглежда с 0.2% по-добра, отколкото е, и това се натрупва.
   */
  async closeTrade(
    tradeId: string,
    closePrice: number,
    reason: 'stop' | 'target' | 'manual' | 'timeout'
  ): Promise<TradeRow> {
    const row = await this.trades.get(tradeId);
    if (!row) throw new Error(`няма сделка ${tradeId}`);
    if (row.status === 'CLOSED') return row as unknown as TradeRow;

    const side = row.side as 'buy' | 'sell';
    const size = row.size as number;
    const entryPrice = row.entry_price as number;

    const gross = side === 'buy' ? (closePrice - entryPrice) * size : (entryPrice - closePrice) * size;

    // Такси и на двата края - и двете страни се изпълняват като пазарни.
    const fees = (entryPrice * size + closePrice * size) * this.config.fees.taker;
    const realized = gross - fees;

    const updated = await this.trades.update(tradeId, {
      status: 'CLOSED',
      close_price: closePrice,
      close_reason: reason,
      closed_at: new Date().toISOString(),
      realized_pnl: realized,
      fees_paid: fees,
    });

    // Капиталът се движи с резултата, за да работят дневният лимит и спадането
    // от върха и на хартия.
    const snapshots = await this.db.collection('equity').list('-created_date', 1);
    const previous = snapshots[0];
    const equity = ((previous?.equity as number) ?? 1000) + realized;
    await this.db.collection('equity').create({
      equity,
      peakEquity: Math.max(equity, (previous?.peakEquity as number) ?? equity),
    });

    await this.journal.create({ type: 'closed', instId: row.instId, realized, reason });
    return updated as unknown as TradeRow;
  }

  /**
   * Сверява отворените позиции с борсата: ако стоп/цел вече са изпълнени там,
   * сделката се затваря и тук.
   *
   * Без това записът се разминава с действителността - позицията е затворена на
   * борсата, а системата още смята, че е отворена, и отказва нови сделки.
   */
  async reconcile(): Promise<{ closed: number }> {
    const open = await this.trades.filter({ status: 'OPEN' });
    let closed = 0;

    for (const row of open) {
      const instId = row.instId as string;
      const ticker = await this.okx.ticker(instId).catch(() => null);
      if (!ticker) continue;

      const side = row.side as 'buy' | 'sell';
      const stop = row.stop_price as number;
      const target = row.take_profit_price as number;
      const last = ticker.last;

      const stopHit = side === 'buy' ? last <= stop : last >= stop;
      const targetHit = side === 'buy' ? last >= target : last <= target;

      if (stopHit) {
        await this.closeTrade(row.id, stop, 'stop');
        closed++;
      } else if (targetHit) {
        await this.closeTrade(row.id, target, 'target');
        closed++;
      }
    }

    return { closed };
  }
}

function countDecimals(tickSize: number): number {
  const text = String(tickSize);
  if (!text.includes('.')) return 0;
  return text.split('.')[1]!.length;
}
