import type { EngineConfig } from '../config.ts';
import type { Database } from '../store/db.ts';
import type { OkxClient } from '../exchange/okxClient.ts';
import type { PolygonClient } from '../market/polygon.ts';
import type { ClaudeSignals } from '../ai/claude.ts';
import type { TradingEngine } from './tradingEngine.ts';
import { snapshot } from '../strategy/indicators.ts';
import { invokeLegacy, legacyExists } from '../compat/legacyLoader.ts';
import { GoogleImageClient } from '../ai/images.ts';
import { join } from 'node:path';

/**
 * Рутерът на функциите - това, което фронтендът вика като `functions.invoke`.
 *
 * Има два слоя. Отгоре са пренаписаните функции: те минават през новия
 * риск-двигател и през защитените поръчки. Отдолу е старият пласт - пренесен
 * дословно, за да не се счупи нищо, което вече работи.
 *
 * Редът е нарочен: ако име съществува и в двата слоя, печели новият. Така
 * пренаписването може да върви функция по функция, без прекъсване.
 */

export interface FunctionContext {
  config: EngineConfig;
  db: Database;
  okx: OkxClient;
  polygon: PolygonClient;
  claude: ClaudeSignals;
  engine: TradingEngine;
}

type Handler = (payload: Record<string, unknown>, context: FunctionContext) => Promise<unknown>;

const DEFAULT_UNIVERSE = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];

const native: Record<string, Handler> = {
  /** Един оглед на един или няколко инструмента. */
  async robot1Scalp(payload, context) {
    const instruments = (payload.instruments as string[]) ?? DEFAULT_UNIVERSE;
    const results = [];
    for (const instId of instruments) {
      results.push(await context.engine.runCycle(instId));
    }
    return { mode: context.config.mode, results };
  },

  /** Сверява отворените позиции с борсата и затваря удрените. */
  async reconcile(_payload, context) {
    return context.engine.reconcile();
  },

  async closeTrade(payload, context) {
    const id = payload.id as string;
    const price = Number(payload.price);
    if (!id || !Number.isFinite(price)) throw new Error('нужни са id и price');
    return context.engine.closeTrade(id, price, (payload.reason as 'manual') ?? 'manual');
  },

  async okxMarketData(payload, context) {
    const instId = (payload.instId as string) ?? 'BTC-USDT';
    const [ticker, candles] = await Promise.all([
      context.okx.ticker(instId),
      context.okx.candles(instId, (payload.bar as string) ?? '5m', 100),
    ]);
    return { ticker, indicators: stripCandles(snapshot(instId, candles)) };
  },

  async polygonMarketData(payload, context) {
    if (!context.polygon.available) {
      return { available: false, reason: 'липсва POLYGON_API_KEY' };
    }
    const instId = (payload.instId as string) ?? 'BTC-USDT';
    const candles = await context.polygon.candles(instId, {
      multiplier: Number(payload.multiplier ?? 5),
      timespan: (payload.timespan as 'minute') ?? 'minute',
      limit: Number(payload.limit ?? 100),
    });
    return { available: true, instId, candles, indicators: stripCandles(snapshot(instId, candles)) };
  },

  async okxLiveBalance(_payload, context) {
    if (!context.okx.authenticated) return { available: false, reason: 'няма ключове за OKX' };
    return { available: true, usdt: await context.okx.balance('USDT') };
  },

  async okxConnect(_payload, context) {
    if (!context.okx.authenticated) return { connected: false, reason: 'няма ключове за OKX' };
    try {
      const balance = await context.okx.balance('USDT');
      return { connected: true, demo: context.config.okx.demo, usdt: balance };
    } catch (error) {
      return { connected: false, reason: (error as Error).message };
    }
  },

  async aiTradingAnalysis(payload, context) {
    const instId = (payload.instId as string) ?? 'BTC-USDT';
    const candles = await context.okx.candles(instId, '5m', 120);
    const news = context.polygon.available ? await context.polygon.news(instId, 5).catch(() => []) : [];
    const decision = await context.claude.decide({ snapshot: snapshot(instId, candles), news });
    return { instId, decision };
  },

  /**
   * Рисува снимка и я ЗАПИСВА като файл.
   *
   * Връща адрес, не base64: base64 в JSON отговор надува паметта и лога, а
   * браузърът и без това иска адрес, за да я покаже.
   */
  async generateImage(payload, context) {
    const prompt = String(payload.prompt ?? '').trim();
    if (!prompt) throw new Error('нужна е подсказка (prompt)');

    const client = new GoogleImageClient();
    if (!client.available) {
      return { ok: false, reason: 'липсва GOOGLE_API_KEY (или GEMINI_API_KEY)' };
    }

    const saved = await client.generateToFiles(
      {
        prompt,
        model: payload.model as string | undefined,
        format: (payload.format as 'png' | 'jpg') ?? 'png',
        count: Number(payload.count ?? 1),
      },
      join(context.config.dataDir, 'images')
    );

    return {
      ok: true,
      images: saved.map((image) => ({
        url: `/api/images/${image.file}`,
        mimeType: image.mimeType,
        bytes: image.bytes,
      })),
    };
  },

  /** Състоянието накратко - за таблото. */
  async systemTrailTradingState(_payload, context) {
    const trades = context.db.collection('trades');
    const open = await trades.filter({ status: 'OPEN' });
    const closed = await trades.filter({ status: 'CLOSED' }, '-closed_at', 50);
    const equity = (await context.db.collection('equity').list('-created_date', 1))[0];
    const { winRate, sample } = await context.engine.measuredWinRate();

    const realized = closed.reduce((sum, row) => sum + Number(row.realized_pnl ?? 0), 0);

    return {
      mode: context.config.mode,
      realOrdersAllowed: context.config.allowRealOrders,
      openPositions: open.length,
      closedTrades: closed.length,
      realizedPnl: realized,
      winRate,
      sample,
      equity: equity?.equity ?? null,
      peakEquity: equity?.peakEquity ?? null,
      riskPerTrade: context.config.strategy.riskPerTrade,
      rewardRiskRatio: context.config.strategy.rewardRiskRatio,
    };
  },

  /** Защо не се търгува - последните откази с причина. */
  async phase4FWhyNoTrade(payload, context) {
    const limit = Number(payload.limit ?? 25);
    const rows = await context.db.collection('journal').list('-created_date', limit);
    return {
      entries: rows.filter((row) => row.type === 'skip' || row.type === 'risk_block'),
    };
  },
};

function stripCandles<T extends { candles: unknown }>(value: T): Omit<T, 'candles'> {
  const { candles: _ignored, ...rest } = value;
  return rest;
}

export function hasFunction(name: string): boolean {
  return name in native || legacyExists(name);
}

export async function invokeFunction(
  name: string,
  payload: Record<string, unknown>,
  context: FunctionContext
): Promise<{ status: number; body: unknown }> {
  const handler = native[name];
  if (handler) {
    return { status: 200, body: await handler(payload ?? {}, context) };
  }

  if (legacyExists(name)) {
    const response = await invokeLegacy(name, payload);
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  return {
    status: 404,
    body: { error: `няма функция "${name}"` },
  };
}
