/**
 * Копиране на едри играчи.
 *
 * Следи списък от адреси по веригата и когато в тях влезе токен, вдига сигнал
 * за същия токен на OKX. Работи през `alchemy_getAssetTransfers` - най-бързият
 * път, който имаме: един разговор дава последните преводи на адрес, с време и
 * символ, без да се държи възел.
 *
 * ТРИ ОГРАНИЧЕНИЯ, КОИТО НЕ БИВА ДА СЕ КРИЯТ
 *
 * 1. Влязъл токен НЕ значи покупка. Може да е депозит от борса, въздушна
 *    раздача, преместване между собствени портфейли или получено плащане.
 *    Затова тук се говори за "движение", не за "сделка", и затова сигналът
 *    минава през същите порти като всеки друг - ако икономиката не излиза,
 *    няма значение кой е купил.
 *
 * 2. Винаги сме назад. Блокът се потвърждава, после ние питаме - между двете
 *    минават секунди до минута. Едрият играч е взел по-добра цена. Копирането
 *    е залог на посоката, не на цената, и не бива да се продава като второто.
 *
 * 3. Копира се само това, което OKX търгува срещу USDT. Токен без двойка е
 *    невидим за нас, колкото и да го е купил някой.
 */
import { bus } from './eventBus.ts';
import type { AlchemyClient } from '../market/alchemy.ts';
import type { Database } from '../store/db.ts';

/** Мрежите, на които Alchemy дава преводи и в които има смисъл да се гледа. */
export const CHAINS: Record<string, string> = {
  eth: 'https://eth-mainnet.g.alchemy.com/v2/',
  polygon: 'https://polygon-mainnet.g.alchemy.com/v2/',
  arbitrum: 'https://arb-mainnet.g.alchemy.com/v2/',
  base: 'https://base-mainnet.g.alchemy.com/v2/',
  optimism: 'https://opt-mainnet.g.alchemy.com/v2/',
};

export interface WatchedWallet {
  id?: string;
  address: string;
  chain: keyof typeof CHAINS | string;
  label?: string;
  active?: boolean;
  /** Времето на последното видяно движение - за да не се повтаря. */
  lastSeenAt?: string;
}

export interface WhaleMove {
  address: string;
  label: string;
  chain: string;
  asset: string;
  value: number;
  at: string;
  txHash: string;
  /** Двойката в OKX, ако изобщо се търгува. */
  instId: string | null;
  tradable: boolean;
}

/** Стабилни монети и обвивки - движението им не е мнение за пазара. */
const IGNORED = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDE', 'PYUSD',
  'WETH', 'WBTC', 'STETH', 'WSTETH',
]);

export class CopyTrading {
  private readonly alchemy: AlchemyClient;
  private readonly apiKey: string;
  private readonly db: Database;
  private tradablePairs = new Set<string>();
  private pairsAt = 0;

  constructor(options: { alchemy: AlchemyClient; apiKey?: string; db: Database }) {
    this.alchemy = options.alchemy;
    this.apiKey = options.apiKey ?? '';
    this.db = options.db;
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  // ---- следени адреси -------------------------------------------------------

  async wallets(): Promise<WatchedWallet[]> {
    const rows = (await this.db
      .collection('WatchedWallet')
      .list({ limit: 500 })
      .catch(() => [])) as Array<Record<string, unknown>>;
    return rows
      .filter((r) => r.active !== false)
      .map((r) => ({
        id: String(r.id),
        address: String(r.address),
        chain: String(r.chain ?? 'eth'),
        label: String(r.label ?? r.address),
        lastSeenAt: r.lastSeenAt ? String(r.lastSeenAt) : undefined,
      }));
  }

  async addWallet(w: WatchedWallet): Promise<{ ok: boolean; error?: string }> {
    const address = w.address?.trim();
    // Адресът идва отвън и влиза в адрес на заявка - проверява се строго.
    if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? '')) {
      return { ok: false, error: 'адресът не е валиден EVM адрес' };
    }
    if (!CHAINS[w.chain as string]) {
      return { ok: false, error: `непозната мрежа "${w.chain}" - има: ${Object.keys(CHAINS).join(', ')}` };
    }
    await this.db.collection('WatchedWallet').create({
      address, chain: w.chain, label: w.label ?? address, active: true,
    });
    return { ok: true };
  }

  // ---- какво търгува OKX ----------------------------------------------------

  /**
   * Списъкът с двойки се пази пет минути.
   *
   * Той се мени рядко, а всяко движение би тръгнало да го тегли наново - при
   * десет адреса това са десет излишни разговора на минаване.
   */
  private async tradable(): Promise<Set<string>> {
    if (Date.now() - this.pairsAt < 300_000 && this.tradablePairs.size > 0) {
      return this.tradablePairs;
    }
    try {
      const res = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT', {
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json()) as { data?: Array<{ instId?: string }> };
      const set = new Set<string>();
      for (const row of json.data ?? []) {
        if (row.instId?.endsWith('-USDT')) set.add(row.instId);
      }
      if (set.size > 0) {
        this.tradablePairs = set;
        this.pairsAt = Date.now();
      }
    } catch {
      // Старият списък е по-добър от празен: празен би обявил всичко за
      // нетъргуемо и копирането би замлъкнало без причина.
    }
    return this.tradablePairs;
  }

  // ---- движения -------------------------------------------------------------

  /** Последните входящи преводи към един адрес. */
  private async transfersFor(w: WatchedWallet, maxCount = 10): Promise<WhaleMove[]> {
    const base = CHAINS[w.chain as string];
    if (!base || !this.apiKey) return [];

    try {
      const res = await fetch(`${base}${this.apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            toAddress: w.address,
            category: ['erc20'],
            withMetadata: true,
            excludeZeroValue: true,
            maxCount: `0x${maxCount.toString(16)}`,
            order: 'desc',
          }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const json = (await res.json()) as {
        result?: { transfers?: Array<Record<string, any>> };
        error?: { message?: string };
      };
      if (json.error || !json.result?.transfers) return [];

      const pairs = await this.tradable();
      const out: WhaleMove[] = [];

      for (const t of json.result.transfers) {
        const asset = String(t.asset ?? '').toUpperCase();
        if (!asset || IGNORED.has(asset)) continue;
        const at = String(t.metadata?.blockTimestamp ?? '');
        if (w.lastSeenAt && at <= w.lastSeenAt) continue;

        const instId = `${asset}-USDT`;
        out.push({
          address: w.address,
          label: w.label ?? w.address,
          chain: String(w.chain),
          asset,
          value: Number(t.value ?? 0),
          at,
          txHash: String(t.hash ?? ''),
          instId: pairs.has(instId) ? instId : null,
          tradable: pairs.has(instId),
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  /**
   * Едно минаване през всички следени адреси.
   *
   * Връща само НОВИТЕ движения. Времето на последното видяно се записва, за
   * да не се вдига сигнал два пъти за една и съща сделка - иначе роботът би
   * влизал наново при всяко минаване, докато преводът е най-скорошен.
   */
  async poll(): Promise<WhaleMove[]> {
    if (!this.available) return [];
    const list = await this.wallets();
    if (list.length === 0) return [];

    const all: WhaleMove[] = [];
    for (const w of list) {
      const moves = await this.transfersFor(w);
      if (moves.length === 0) continue;

      const newest = moves.reduce((a, b) => (a.at > b.at ? a : b));
      if (w.id) {
        await this.db
          .collection('WatchedWallet')
          .update(w.id, { lastSeenAt: newest.at })
          .catch(() => undefined);
      }

      for (const m of moves) {
        all.push(m);
        bus.emitEvent(
          m.tradable ? 'signal' : 'cycle',
          m.tradable
            ? `${m.label} взе ${m.asset} - има двойка ${m.instId} на OKX`
            : `${m.label} взе ${m.asset} - OKX няма такава двойка, пропуска се`,
          { botId: 'shadow', instId: m.instId ?? undefined, data: { move: m } }
        );
      }
    }
    return all.sort((a, b) => (a.at < b.at ? 1 : -1));
  }
}
