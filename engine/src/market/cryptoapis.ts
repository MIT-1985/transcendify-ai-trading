/**
 * Независима цена от CryptoAPIs.
 *
 * Тук е само за едно: да се хване, ако цената на OKX е крива, преди роботът
 * да търгува по нея. Заседнал поток, спряла борса или грешка в отговора
 * изглеждат като нормална цена - единственият начин да се различат е втори
 * източник, който няма нищо общо с първия.
 *
 * Планът дава САМО текущ обменен курс. Проверено: свещи, история, инструменти
 * и борси връщат uri_not_found. Затова тук няма история и не бива да се
 * очаква - за дневния тренд служи [AlchemyClient] или Polygon.
 */

export class CryptoApisClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey?: string; baseUrl?: string } = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://rest.cryptoapis.io';
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  /** Курс към долар. null при липса на ключ или отказ - не 0. */
  async rate(instId: string): Promise<number | null> {
    if (!this.apiKey) return null;
    const symbol = (instId || '').split('-')[0]!.toUpperCase();
    try {
      const response = await fetch(
        `${this.baseUrl}/market-data/exchange-rates/by-symbol/${symbol}/USD`,
        { headers: { 'X-API-Key': this.apiKey }, signal: AbortSignal.timeout(8000) }
      );
      const json = (await response.json()) as { data?: { item?: { rate?: string } } };
      const value = Number(json.data?.item?.rate ?? 0);
      return value > 0 ? value : null;
    } catch {
      return null;
    }
  }
}

export interface PriceAgreement {
  /** true = двата източника се разминават над допустимото. */
  suspicious: boolean;
  okxPrice: number;
  reference: number | null;
  diffPct: number | null;
  source: string | null;
  note: string;
}

/**
 * Сравнява цената на OKX с независим източник.
 *
 * Прагът е широк нарочно. Различните източници смятат по различни борси и
 * малко разминаване е нормално - целта не е да се лови шум, а счупен поток.
 * Тесен праг би спирал търговията през половината време без причина.
 */
export function comparePrices(
  okxPrice: number,
  reference: number | null,
  source: string | null,
  tolerancePct = 1.0
): PriceAgreement {
  if (reference === null || !(okxPrice > 0)) {
    return {
      suspicious: false,
      okxPrice,
      reference,
      diffPct: null,
      source,
      // Липсата на втори източник НЕ спира търговията: тази проверка е
      // предпазна мрежа, не порта. Ако беше порта, падането на CryptoAPIs
      // би спряло всичко без нищо да се е случило с борсата.
      note: 'няма втори източник - проверката се пропуска',
    };
  }

  const diffPct = Math.abs((okxPrice - reference) / reference) * 100;
  return {
    suspicious: diffPct > tolerancePct,
    okxPrice,
    reference,
    diffPct: Math.round(diffPct * 1000) / 1000,
    source,
    note:
      diffPct > tolerancePct
        ? `OKX се разминава с ${source} с ${diffPct.toFixed(2)}% при таван ${tolerancePct}%`
        : `съгласие с ${source} (${diffPct.toFixed(3)}%)`,
  };
}
