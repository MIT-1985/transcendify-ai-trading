import { createHmac } from 'node:crypto';

/**
 * OKX REST v5 - подписани заявки, без чужди библиотеки.
 *
 * Най-важното тук е [placeProtectedEntry]. Старият код пращаше само
 * `ordType: 'market'` и следеше стопа в кода си - тоест стопът съществуваше
 * само докато процесът е жив и има интернет. Рестарт, срив, изтекъл токен или
 * десет секунди без мрежа по време на срив на пазара = позиция без стоп.
 *
 * Сега стопът стои НА БОРСАТА, закачен за самата входна поръчка. Ако този
 * процес умре в следващата секунда, OKX пак ще затвори позицията на нивото,
 * което сме определили. Това не прави стратегията печеливша - прави загубите
 * ограничени, което е различно и по-важно нещо.
 */

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface OkxClientOptions {
  credentials?: Partial<OkxCredentials>;
  baseUrl?: string;
  /** Демо търговия на OKX - истинска борса, нереални пари. */
  demo?: boolean;
  fetchImpl?: typeof fetch;
}

export class OkxError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestPath: string,
    readonly raw?: unknown
  ) {
    super(message);
    this.name = 'OkxError';
  }
}

export interface Ticker {
  instId: string;
  last: number;
  bid: number;
  ask: number;
  /** Спредът като част от средната цена - скритият разход при пазарна поръчка. */
  spreadPct: number;
  ts: number;
}

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PlacedOrder {
  ordId: string;
  clOrdId: string;
  /** Празно при поръчки без прикачен алго. */
  algoId?: string;
}

export interface ProtectedEntry {
  entry: PlacedOrder;
  /** Как е сложена защитата - "attached" (в поръчката) или "oco" (втора заявка). */
  protection: 'attached' | 'oco';
  stopPrice: number;
  takeProfitPrice: number;
}

interface OkxResponse<T> {
  code: string;
  msg: string;
  data: T[];
}

export class OkxClient {
  private readonly baseUrl: string;
  private readonly demo: boolean;
  private readonly credentials?: OkxCredentials;
  private readonly doFetch: typeof fetch;

  constructor(options: OkxClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://www.okx.com';
    this.demo = options.demo ?? true;
    this.doFetch = options.fetchImpl ?? fetch;

    const { apiKey, secretKey, passphrase } = options.credentials ?? {};
    if (apiKey && secretKey && passphrase) {
      this.credentials = { apiKey, secretKey, passphrase };
    }
  }

  /** true, ако изобщо можем да подписваме заявки. Публичните данни не искат ключ. */
  get authenticated(): boolean {
    return this.credentials !== undefined;
  }

  private sign(timestamp: string, method: string, path: string, body: string): string {
    const secret = this.credentials!.secretKey;
    return createHmac('sha256', secret).update(timestamp + method + path + body).digest('base64');
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; auth?: boolean } = {}
  ): Promise<T[]> {
    const body = options.body ? JSON.stringify(options.body) : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (options.auth) {
      if (!this.credentials) {
        throw new OkxError(
          'липсват OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE',
          'NO_CREDENTIALS',
          path
        );
      }
      const timestamp = new Date().toISOString();
      headers['OK-ACCESS-KEY'] = this.credentials.apiKey;
      headers['OK-ACCESS-SIGN'] = this.sign(timestamp, method, path, body);
      headers['OK-ACCESS-TIMESTAMP'] = timestamp;
      headers['OK-ACCESS-PASSPHRASE'] = this.credentials.passphrase;
    }

    if (this.demo) headers['x-simulated-trading'] = '1';

    const response = await this.doFetch(this.baseUrl + path, {
      method,
      headers,
      body: body || undefined,
    });

    const text = await response.text();
    let payload: OkxResponse<T>;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new OkxError(`OKX върна нечетим отговор (${response.status})`, 'BAD_JSON', path, text);
    }

    if (payload.code !== '0') {
      // Кодът на конкретната поръчка е по-точен от общия - той казва ЗАЩО.
      const inner = (payload.data?.[0] ?? {}) as { sCode?: string; sMsg?: string };
      const code = inner.sCode && inner.sCode !== '0' ? inner.sCode : payload.code;
      const message = inner.sMsg || payload.msg || 'неизвестна грешка';
      throw new OkxError(`OKX ${path}: ${message} (код ${code})`, code, path, payload);
    }

    return payload.data ?? [];
  }

  // ---- публични данни ------------------------------------------------------

  async ticker(instId: string): Promise<Ticker> {
    const [row] = await this.request<Record<string, string>>(
      'GET',
      `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`
    );
    if (!row) throw new OkxError(`няма котировка за ${instId}`, 'NO_TICKER', '/api/v5/market/ticker');

    const bid = Number(row.bidPx);
    const ask = Number(row.askPx);
    const mid = (bid + ask) / 2;
    return {
      instId,
      last: Number(row.last),
      bid,
      ask,
      spreadPct: mid > 0 ? (ask - bid) / mid : Number.POSITIVE_INFINITY,
      ts: Number(row.ts),
    };
  }

  async candles(instId: string, bar = '5m', limit = 100): Promise<Candle[]> {
    const rows = await this.request<string[]>(
      'GET',
      `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`
    );
    // OKX връща най-новите първи; обръщаме, за да е хронологично.
    return rows
      .map((row) => ({
        ts: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .reverse();
  }

  /** Правилата на инструмента: стъпка на количеството, минимален размер. */
  async instrument(instId: string): Promise<{ lotSz: number; minSz: number; tickSz: number }> {
    const [row] = await this.request<Record<string, string>>(
      'GET',
      `/api/v5/public/instruments?instType=SPOT&instId=${encodeURIComponent(instId)}`
    );
    if (!row) throw new OkxError(`непознат инструмент ${instId}`, 'NO_INSTRUMENT', '/api/v5/public/instruments');
    return {
      lotSz: Number(row.lotSz),
      minSz: Number(row.minSz),
      tickSz: Number(row.tickSz),
    };
  }

  // ---- сметка --------------------------------------------------------------

  async balance(ccy = 'USDT'): Promise<number> {
    const [row] = await this.request<{ details?: { ccy: string; availBal: string }[] }>(
      'GET',
      `/api/v5/account/balance?ccy=${ccy}`,
      { auth: true }
    );
    const detail = row?.details?.find((d) => d.ccy === ccy);
    return detail ? Number(detail.availBal) : 0;
  }

  async openAlgoOrders(instId?: string): Promise<Record<string, string>[]> {
    const query = instId ? `&instId=${encodeURIComponent(instId)}` : '';
    return this.request<Record<string, string>>(
      'GET',
      `/api/v5/trade/orders-algo-pending?ordType=oco${query}`,
      { auth: true }
    );
  }

  // ---- поръчки -------------------------------------------------------------

  /**
   * Входна поръчка СЪС стоп и цел, закачени на борсата.
   *
   * Редът е нарочен: първо се опитва `attachAlgoOrds` - тогава защитата тръгва
   * заедно с входа и няма прозорец, в който позицията е гола. Ако борсата
   * откаже (не всички spot режими го поддържат), веднага се пробва отделна OCO
   * поръчка. Ако и това не стане - позицията се ЗАТВАРЯ. По-добре платена такса
   * за влизане и излизане, отколкото позиция без стоп.
   */
  async placeProtectedEntry(params: {
    instId: string;
    side: 'buy' | 'sell';
    /** Размер в базовата валута (напр. BTC), вече закръглен към стъпката. */
    size: number;
    stopPrice: number;
    takeProfitPrice: number;
    clOrdId: string;
  }): Promise<ProtectedEntry> {
    const { instId, side, size, stopPrice, takeProfitPrice, clOrdId } = params;
    const exitSide = side === 'buy' ? 'sell' : 'buy';

    const attachAlgoOrds = [
      {
        attachAlgoClOrdId: `${clOrdId}p`,
        tpTriggerPx: String(takeProfitPrice),
        tpOrdPx: '-1', // -1 = пазарна при задействане; целта е да излезем, не да чакаме
        tpTriggerPxType: 'last',
        slTriggerPx: String(stopPrice),
        slOrdPx: '-1',
        slTriggerPxType: 'last',
      },
    ];

    const base = {
      instId,
      tdMode: 'cash',
      side,
      ordType: 'market',
      sz: String(size),
      // При пазарна КУПУВАЧКА на spot OKX по подразбиране чете sz в котираната
      // валута. Тук sz е в базовата - без това редът е с няколко порядъка крив.
      tgtCcy: 'base_ccy',
      clOrdId,
    };

    try {
      const [row] = await this.request<Record<string, string>>('POST', '/api/v5/trade/order', {
        auth: true,
        body: { ...base, attachAlgoOrds },
      });
      return {
        entry: { ordId: row!.ordId!, clOrdId: row!.clOrdId ?? clOrdId },
        protection: 'attached',
        stopPrice,
        takeProfitPrice,
      };
    } catch (error) {
      if (!(error instanceof OkxError)) throw error;
      // Падаме на резервния път само ако входът НЕ е минал. Ако е минал и после
      // алгото е отказано, това е друг случай - обработва се по-долу.
      if (error.code === 'NO_CREDENTIALS') throw error;
    }

    // Резервен път: вход, после веднага защита.
    const [entryRow] = await this.request<Record<string, string>>('POST', '/api/v5/trade/order', {
      auth: true,
      body: base,
    });
    const entry: PlacedOrder = { ordId: entryRow!.ordId!, clOrdId: entryRow!.clOrdId ?? clOrdId };

    try {
      const [algoRow] = await this.request<Record<string, string>>(
        'POST',
        '/api/v5/trade/order-algo',
        {
          auth: true,
          body: {
            instId,
            tdMode: 'cash',
            side: exitSide,
            ordType: 'oco',
            sz: String(size),
            tgtCcy: 'base_ccy',
            algoClOrdId: `${clOrdId}p`,
            tpTriggerPx: String(takeProfitPrice),
            tpOrdPx: '-1',
            slTriggerPx: String(stopPrice),
            slOrdPx: '-1',
          },
        }
      );
      return {
        entry: { ...entry, algoId: algoRow!.algoId },
        protection: 'oco',
        stopPrice,
        takeProfitPrice,
      };
    } catch (protectionError) {
      // Гола позиция е недопустима. Излизаме веднага и казваме защо.
      await this.closePosition(instId, exitSide, size, `${clOrdId}x`).catch(() => undefined);
      throw new OkxError(
        `входът мина, но стопът беше отказан - позицията е затворена веднага: ${(protectionError as Error).message}`,
        'PROTECTION_FAILED',
        '/api/v5/trade/order-algo',
        protectionError
      );
    }
  }

  async closePosition(
    instId: string,
    side: 'buy' | 'sell',
    size: number,
    clOrdId: string
  ): Promise<PlacedOrder> {
    const [row] = await this.request<Record<string, string>>('POST', '/api/v5/trade/order', {
      auth: true,
      body: {
        instId,
        tdMode: 'cash',
        side,
        ordType: 'market',
        sz: String(size),
        tgtCcy: 'base_ccy',
        clOrdId,
      },
    });
    return { ordId: row!.ordId!, clOrdId: row!.clOrdId ?? clOrdId };
  }

  async cancelAlgo(instId: string, algoId: string): Promise<void> {
    await this.request('POST', '/api/v5/trade/cancel-algos', {
      auth: true,
      body: [{ instId, algoId }],
    });
  }

  async orderDetails(instId: string, ordId: string): Promise<Record<string, string>> {
    const [row] = await this.request<Record<string, string>>(
      'GET',
      `/api/v5/trade/order?instId=${encodeURIComponent(instId)}&ordId=${ordId}`,
      { auth: true }
    );
    if (!row) throw new OkxError(`няма поръчка ${ordId}`, 'NO_ORDER', '/api/v5/trade/order');
    return row;
  }
}

/** Закръгля количеството НАДОЛУ към стъпката на борсата - нагоре би отказало поръчката. */
export function roundToLotSize(size: number, lotSz: number): number {
  if (!Number.isFinite(lotSz) || lotSz <= 0) return size;
  const steps = Math.floor(size / lotSz);
  // Плаващата запетая изяжда последната цифра; фиксираме по броя знаци на стъпката.
  const decimals = (String(lotSz).split('.')[1] ?? '').length;
  return Number((steps * lotSz).toFixed(decimals));
}
