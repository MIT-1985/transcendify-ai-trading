/**
 * Дневна история от Alchemy.
 *
 * Съществува заради едно измерено ограничение: Polygon покрива само големите
 * двойки. Проверено на четиринайсет символа - Alchemy връща по 30-31 дневни
 * точки за всичките, включително GRVT, HYPE и ENA, които скенерът реално
 * намира и на които Polygon мълчи.
 *
 * Дава ЦЕНА, не свещ - една стойност на ден, без high/low/обем. За посоката
 * на дневния тренд стига, защото EMA и RSI се смятат от затваряния. За нещо,
 * което иска обхват или обем, не става и не бива да се ползва.
 */

export interface AlchemyPoint {
  ts: number;
  close: number;
}

export class AlchemyClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.g.alchemy.com';
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  /** 'BTC-USDT' → 'BTC'. Alchemy пита по символ, не по двойка. */
  static symbolOf(instId: string): string {
    return (instId || '').split('-')[0]!.toUpperCase();
  }

  /**
   * Дневни цени за последните `days` дни, най-старата първа.
   *
   * Празен масив при липса на ключ или при отказ - викащият трябва да различи
   * "няма данни" от "данните казват надолу", затова тук няма подразбираща се
   * стойност.
   */
  async dailyCloses(instId: string, days = 30): Promise<AlchemyPoint[]> {
    if (!this.apiKey) return [];

    const symbol = AlchemyClient.symbolOf(instId);
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);

    try {
      const response = await fetch(`${this.baseUrl}/prices/v1/${this.apiKey}/tokens/historical`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol,
          startTime: start.toISOString().replace(/\.\d+Z$/, 'Z'),
          endTime: end.toISOString().replace(/\.\d+Z$/, 'Z'),
          interval: '1d',
        }),
        signal: AbortSignal.timeout(12_000),
      });

      const json = (await response.json()) as {
        data?: Array<{ value?: string; timestamp?: string }>;
        error?: unknown;
      };
      if (!Array.isArray(json.data)) return [];

      return json.data
        .map((row) => ({
          ts: Date.parse(row.timestamp ?? ''),
          close: Number(row.value ?? 0),
        }))
        .filter((row) => Number.isFinite(row.ts) && row.close > 0)
        .sort((a, b) => a.ts - b.ts);
    } catch {
      return [];
    }
  }

  /** Текуща цена по символ - за бърза проверка, не за решение. */
  async spot(instId: string): Promise<number | null> {
    if (!this.apiKey) return null;
    const symbol = AlchemyClient.symbolOf(instId);
    try {
      const response = await fetch(
        `${this.baseUrl}/prices/v1/${this.apiKey}/tokens/by-symbol?symbols=${symbol}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const json = (await response.json()) as {
        data?: Array<{ prices?: Array<{ currency?: string; value?: string }> }>;
      };
      const usd = json.data?.[0]?.prices?.find((p) => p.currency === 'usd');
      const value = Number(usd?.value ?? 0);
      return value > 0 ? value : null;
    } catch {
      return null;
    }
  }
}
