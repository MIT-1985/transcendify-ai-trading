import type { Candle } from '../exchange/okxClient.ts';

/**
 * Polygon.io - независим източник за цени и новини.
 *
 * Защо изобщо втори източник, щом OKX дава свещи: борсата е и източникът, и
 * контрагентът. Ако нейният поток замръзне или закъснее, стратегията вижда стар
 * пазар и влиза срещу движение, което вече е станало. Затова свещите от двата
 * източника се сравняват ([crossCheck]) и при разминаване сделката отпада.
 */

export interface PolygonOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface NewsItem {
  title: string;
  publishedUtc: string;
  publisher: string;
  /** Настроението според Polygon, ако го дава. */
  sentiment?: string;
  url: string;
}

export class PolygonError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'PolygonError';
  }
}

export class PolygonClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(options: PolygonOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.polygon.io';
    this.doFetch = options.fetchImpl ?? fetch;
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    if (!this.apiKey) throw new PolygonError('липсва POLYGON_API_KEY');
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    url.searchParams.set('apiKey', this.apiKey);

    const response = await this.doFetch(url.toString());
    if (!response.ok) {
      throw new PolygonError(`Polygon ${path} върна ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  }

  /** "BTC-USDT" на OKX е "X:BTCUSD" в Polygon. */
  static toPolygonTicker(instId: string): string {
    const [base, quote] = instId.split('-');
    const normalizedQuote = quote === 'USDT' ? 'USD' : (quote ?? 'USD');
    return `X:${base}${normalizedQuote}`;
  }

  async candles(
    instId: string,
    options: { multiplier?: number; timespan?: 'minute' | 'hour' | 'day'; limit?: number } = {}
  ): Promise<Candle[]> {
    const { multiplier = 5, timespan = 'minute', limit = 200 } = options;
    const ticker = PolygonClient.toPolygonTicker(instId);
    const to = Date.now();
    const spanMs = timespan === 'day' ? 86_400_000 : timespan === 'hour' ? 3_600_000 : 60_000;
    const from = to - multiplier * spanMs * limit;

    const payload = await this.get<{
      results?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
    }>(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, {
      adjusted: 'true',
      sort: 'asc',
      limit,
    });

    return (payload.results ?? []).map((row) => ({
      ts: row.t,
      open: row.o,
      high: row.h,
      low: row.l,
      close: row.c,
      volume: row.v,
    }));
  }

  async news(instId: string, limit = 5): Promise<NewsItem[]> {
    const [base] = instId.split('-');
    const payload = await this.get<{
      results?: {
        title: string;
        published_utc: string;
        publisher?: { name?: string };
        article_url: string;
        insights?: { sentiment?: string }[];
      }[];
    }>('/v2/reference/news', { 'ticker.gte': `X:${base}USD`, limit, order: 'desc' });

    return (payload.results ?? []).map((row) => ({
      title: row.title,
      publishedUtc: row.published_utc,
      publisher: row.publisher?.name ?? 'unknown',
      sentiment: row.insights?.[0]?.sentiment,
      url: row.article_url,
    }));
  }
}

/**
 * Сравнява последната цена от двата източника.
 *
 * @returns разминаването като част от цената. Над ~0.3% значи, че единият поток
 *   е закъснял - тогава не се търгува, вместо да се гадае кой е прав.
 */
export function crossCheck(exchangeLast: number, referenceLast: number): number {
  if (!(exchangeLast > 0) || !(referenceLast > 0)) return Number.POSITIVE_INFINITY;
  const mid = (exchangeLast + referenceLast) / 2;
  return Math.abs(exchangeLast - referenceLast) / mid;
}
