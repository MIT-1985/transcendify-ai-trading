import { loadConfig, breakevenWinRate, expectedValuePerTrade } from './config.ts';
import { Database } from './store/db.ts';
import { OkxClient } from './exchange/okxClient.ts';
import { PolygonClient } from './market/polygon.ts';
import { ClaudeSignals } from './ai/claude.ts';
import { TradingEngine } from './core/tradingEngine.ts';
import { setDatabase } from './compat/base44Client.ts';

/**
 * Команден ред - за да може всичко да се пусне и провери без интерфейс.
 *
 * `edge` е първата команда, която трябва да се пусне при промяна на настройките:
 * тя казва колко печеливши сделки са нужни само за да се излезе на нула. Ако
 * това число изглежда непостижимо, стратегията не се оправя с настройки.
 */

const config = loadConfig();
const db = new Database(config.dataDir);
setDatabase(db);

const okx = new OkxClient({
  credentials: {
    apiKey: config.okx.apiKey,
    secretKey: config.okx.secretKey,
    passphrase: config.okx.passphrase,
  },
  baseUrl: config.okx.baseUrl,
  demo: config.okx.demo,
});
const polygon = new PolygonClient({ apiKey: config.polygon.apiKey, baseUrl: config.polygon.baseUrl });
const claude = new ClaudeSignals(config);
const engine = new TradingEngine(config, db, okx, polygon, claude);

const [command, ...args] = process.argv.slice(2);

function table(rows: Record<string, unknown>[]): void {
  console.table(rows);
}

async function main(): Promise<void> {
  switch (command) {
    case 'edge': {
      // Точката на нулата при различни разстояния до стопа.
      const rows = [0.004, 0.006, 0.008, 0.01, 0.015, 0.02].map((stop) => {
        const be = breakevenWinRate({
          stopDistancePct: stop,
          rewardRiskRatio: config.strategy.rewardRiskRatio,
          fees: config.fees,
          spreadPct: config.strategy.maxSpreadPct,
          takerEntry: true,
        });
        return {
          'стоп %': (stop * 100).toFixed(2),
          'цел %': (stop * config.strategy.rewardRiskRatio * 100).toFixed(2),
          'нужни печеливши %': (be * 100).toFixed(1),
          'нужни + резерв %': ((be + config.strategy.minEdgeMargin) * 100).toFixed(1),
          'EV при 55% печеливши': (
            expectedValuePerTrade({
              winRate: 0.55,
              stopDistancePct: stop,
              rewardRiskRatio: config.strategy.rewardRiskRatio,
              fees: config.fees,
              spreadPct: config.strategy.maxSpreadPct,
              takerEntry: true,
            }) * 100
          ).toFixed(3),
        };
      });
      table(rows);
      console.log(
        `\nтакси: ${(config.fees.taker * 100).toFixed(3)}% при взимане, ` +
          `${(config.fees.maker * 100).toFixed(3)}% при подаване; ` +
          `съотношение цел/риск ${config.strategy.rewardRiskRatio}`
      );
      break;
    }

    case 'scan': {
      const instruments = args.length > 0 ? args : ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
      for (const instId of instruments) {
        const result = await engine.runCycle(instId);
        console.log(`${instId}: ${result.outcome}${result.reason ? ` - ${result.reason}` : ''}`);
      }
      break;
    }

    case 'reconcile': {
      console.log(await engine.reconcile());
      break;
    }

    case 'state': {
      const trades = db.collection('trades');
      const open = await trades.filter({ status: 'OPEN' });
      const closed = await trades.filter({ status: 'CLOSED' });
      const { winRate, sample } = await engine.measuredWinRate();
      const realized = closed.reduce((sum, row) => sum + Number(row.realized_pnl ?? 0), 0);
      console.log({
        режим: config.mode,
        'истински поръчки': config.allowRealOrders,
        отворени: open.length,
        затворени: closed.length,
        'реализиран резултат': realized.toFixed(2),
        'печеливши %': sample >= 20 ? (winRate * 100).toFixed(1) : `няма извадка (${sample}/20)`,
      });
      break;
    }

    case 'close': {
      const [id, price] = args;
      if (!id || !price) throw new Error('употреба: close <id> <цена>');
      console.log(await engine.closeTrade(id, Number(price), 'manual'));
      break;
    }

    default:
      console.log(
        [
          'команди:',
          '  edge                     - колко печеливши сделки трябват само за нула',
          '  scan [ИНСТРУМЕНТИ...]    - един оглед и евентуално отваряне на позиция',
          '  reconcile                - сверява отворените позиции с борсата',
          '  state                    - накратко какво се е случило',
          '  close <id> <цена>        - ръчно затваряне и записване на резултата',
        ].join('\n')
      );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
