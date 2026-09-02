import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { setDefaultResultOrder } from 'node:dns';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { Database } from './store/db.ts';
import { OkxClient } from './exchange/okxClient.ts';
import { PolygonClient } from './market/polygon.ts';
import { ClaudeSignals } from './ai/claude.ts';
import { TradingEngine } from './core/tradingEngine.ts';
import { hasFunction, invokeFunction, type FunctionContext } from './core/functions.ts';
import {
  setDatabase,
  setFunctionInvoker,
  setImageGenerator,
  setLlmInvoker,
} from './compat/base44Client.ts';
import { LlmGateway } from './ai/llm.ts';
import { GoogleImageClient, mimeForExtension } from './ai/images.ts';
import { bus, type BotEvent } from './core/eventBus.js';
import { catalogue, buyRobot, robotMarket } from './core/catalogue.ts';
import { scanFor, type DataSources } from './core/scanner.ts';
import { AlchemyClient } from './market/alchemy.ts';
import { CryptoApisClient } from './market/cryptoapis.ts';
import { Orchestrator } from './core/orchestrator.ts';
import { CopyTrading } from './core/copyTrading.ts';

/**
 * Локалният сървър - това, което фронтендът вика вместо облака на платформата.
 *
 * Слуша САМО на 127.0.0.1. Тук минават ключове за борса и нареждания за
 * поръчки; отваряне навън е решение, което се взима съзнателно, с обратен
 * посредник и удостоверяване отпред, а не по подразбиране.
 */

/**
 * Излизаме винаги през IPv4.
 *
 * OKX връзва ключа за списък с адреси. Node по подразбиране пробва IPv6 и
 * IPv4 успоредно и взима който отговори пръв - тоест адресът, който борсата
 * вижда, се сменя от заявка на заявка. Ключ, вързан за един адрес, работи
 * през половината време и пада без обяснение през другата.
 *
 * По-лошо: адресът IPv6 на тази машина е `temporary` (privacy extensions) и
 * се сменя сам всеки ден. Списък с него е безсмислен по устройство.
 *
 * Затова изборът се фиксира: каквото сложиш в списъка на OKX, това ще е и
 * адресът, от който се обажда двигателят.
 */
setDefaultResultOrder('ipv4first');

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
// Alchemy покрива дневната история за всички двойки, които скенерът намира.
// CryptoAPIs е за внасяне на пари, не за пазарни данни.
const alchemy = new AlchemyClient({ apiKey: config.alchemy.apiKey, baseUrl: config.alchemy.baseUrl });
const cryptoapis = new CryptoApisClient({ apiKey: config.cryptoapis.apiKey, baseUrl: config.cryptoapis.baseUrl });
const dataSources: DataSources = { polygonApiKey: config.polygon.apiKey, alchemy };

const orchestrator = new Orchestrator(dataSources);
const copy = new CopyTrading({ alchemy, apiKey: config.alchemy.apiKey, db });

const polygon = new PolygonClient({ apiKey: config.polygon.apiKey, baseUrl: config.polygon.baseUrl });
const claude = new ClaudeSignals(config);
const engine = new TradingEngine(config, db, okx, polygon, claude);
const llm = new LlmGateway(config);
const images_ = new GoogleImageClient();

const context: FunctionContext = { config, db, okx, polygon, claude, engine };

setFunctionInvoker(async (name, payload) => {
  const result = await invokeFunction(name, (payload ?? {}) as Record<string, unknown>, context);
  return result.body;
});

// InvokeLLM е ИСТИНСКО общо извикване на модел - Claude или GPT, по името,
// което старият код подава. Първата версия тук пренасочваше всичко към
// съветника за сделки, тоест функция, поискала константи, получаваше решение
// "hold" и мълчаливо работеше с грешни числа.
setLlmInvoker(async (args) => llm.invoke(args as never));

// Генерирането на изображения минава през Google със същия ключ, който вече
// се ползва за Gemini другаде. Върнатото е base64 - викащият решава какво
// да го прави.
setImageGenerator(async (args) => {
  const images = await images_.generate(args as never);
  return { images, count: images.length };
});

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  response.end(payload);
}


/**
 * Превежда отказите на доставчика на човешки език.
 *
 * Суровият JSON блок от Anthropic не казва нищо на човека пред екрана, а
 * "500" го праща да търси повреда в кода, каквато няма. Празната сметка и
 * отхвърленият ключ са различни неща и заслужават различни кодове.
 */
function translateProviderError(text: string): { status: number; body: unknown } | null {
  if (/credit balance is too low/i.test(text)) {
    return {
      status: 402,
      body: {
        error: 'BILLING',
        message: 'Сметката в Anthropic е празна. Ключът е валиден, но няма кредит.',
        where: 'https://console.anthropic.com/settings/billing',
      },
    };
  }
  if (/authentication_error|invalid x-api-key/i.test(text)) {
    return {
      status: 401,
      body: {
        error: 'BAD_KEY',
        message: 'Anthropic отхвърли ключа. Провери ANTHROPIC_API_KEY в engine/.env.',
      },
    };
  }
  return null;
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, null);

  const url = new URL(request.url ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);

  try {
    // GET /api/health
    if (segments[0] === 'api' && segments[1] === 'health') {
      return send(response, 200, {
        ok: true,
        mode: config.mode,
        realOrdersAllowed: config.allowRealOrders,
        okx: okx.authenticated,
        polygon: polygon.available,
        alchemy: alchemy.available,
        cryptoapis: cryptoapis.available,
        orchestrator: orchestrator.isRunning,
        copyTrading: copy.available,
        claude: claude.available,
        images: images_.available,
      });
    }

    // Оркестраторът: всички роботи будни, без някой да гледа екрана.
    //   GET  /api/orchestrator        - какво прави в момента
    //   POST /api/orchestrator/start  - пускане
    //   POST /api/orchestrator/stop   - спиране
    if (segments[0] === 'api' && segments[1] === 'orchestrator') {
      if (request.method === 'POST' && segments[2] === 'start') {
        orchestrator.start();
        return send(response, 200, orchestrator.snapshot());
      }
      if (request.method === 'POST' && segments[2] === 'stop') {
        orchestrator.stop();
        return send(response, 200, orchestrator.snapshot());
      }
      if (!segments[2]) return send(response, 200, orchestrator.snapshot());
    }

    // Копиране на едри играчи.
    //   GET  /api/whales          - следени адреси
    //   POST /api/whales          - добавяне {address, chain, label}
    //   GET  /api/whales/moves    - какво са направили от последната проверка
    if (segments[0] === 'api' && segments[1] === 'whales') {
      if (!copy.available) {
        return send(response, 400, { error: 'NO_KEY', message: 'няма ALCHEMY_API_KEY в engine/.env' });
      }
      if (segments[2] === 'moves') {
        const moves = await copy.poll();
        return send(response, 200, { moves, count: moves.length, at: new Date().toISOString() });
      }
      if (request.method === 'POST') {
        const body = await readBody(request);
        const result = await copy.addWallet(body as never);
        return send(response, result.ok ? 200 : 400, result);
      }
      return send(response, 200, { wallets: await copy.wallets() });
    }

    // GET /api/balance - спот салдото по ключа
    if (segments[0] === 'api' && segments[1] === 'balance') {
      if (!okx.authenticated) {
        return send(response, 400, { error: 'NO_KEY', message: 'няма OKX ключове в engine/.env' });
      }
      const rows = await okx.spotBalances();
      return send(response, 200, {
        assets: rows,
        totalUsd: rows.reduce((sum, r) => sum + r.usd, 0),
        at: new Date().toISOString(),
      });
    }

    // GET /api/events - жив поток от решенията на роботите
    //
    // Server-Sent Events, не websocket: потокът е еднопосочен (двигателят
    // говори, екранът слуша), минава през обикновен HTTP и се вдига сам при
    // прекъсване, без код от страна на браузъра. Websocket би добавил
    // зависимост и ръчно преизграждане на връзката без нищо в замяна.
    if (segments[0] === 'api' && segments[1] === 'events') {
      const afterSeq = Number(url.searchParams.get('after') ?? 0);

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        // Без това nginx буферира потока и събитията излизат на пакети.
        'X-Accel-Buffering': 'no',
      });

      const write = (ev: BotEvent) => {
        response.write(`id: ${ev.seq}\n`);
        response.write(`event: ${ev.kind}\n`);
        response.write(`data: ${JSON.stringify(ev)}\n\n`);
      };

      // Каквото е пропуснал, докато е бил затворен - по seq, не по време.
      for (const ev of bus.recent(afterSeq)) write(ev);

      const onEvent = (ev: BotEvent) => write(ev);
      bus.on('event', onEvent);

      // Посредниците затварят тиха връзка. Двоеточието е коментар в
      // протокола - стига, за да я държи жива, без да стига до екрана.
      const ping = setInterval(() => response.write(': ping\n\n'), 20_000);

      request.on('close', () => {
        clearInterval(ping);
        bus.off('event', onEvent);
      });
      return;
    }

    // GET  /api/robots            - витрината: шест робота, цени, точка на нулата
    // POST /api/robots/:id/buy     - доживотен лиценз
    // GET  /api/robots/:id/market  - цена, свещи, индикатори, присъда, сделки
    //
    // Три маршрута за целия продукт. Не защото е малко, а защото това е
    // всичко, което човек прави: гледа, купува, следи.
    if (segments[0] === 'api' && segments[1] === 'robots') {
      const id = segments[2];
      if (!id) return send(response, 200, await catalogue(config, db));

      if (segments[3] === 'buy' && request.method === 'POST') {
        const result = await buyRobot(db, id);
        return send(response, result.ok ? 200 : 404, result);
      }

      // GET /api/robots/:id/scan - къде би търгувал този робот сега
      if (segments[3] === 'scan') {
        const depth = Number(url.searchParams.get('depth') ?? 8);
        const result = await scanFor(id, dataSources, Math.max(1, Math.min(20, depth)));
        return send(response, 'error' in result ? 502 : 200, result);
      }

      if (segments[3] === 'market') {
        const view = await robotMarket(db, id, url.searchParams.get('pair') ?? undefined, dataSources);
        return send(response, 'error' in view ? 502 : 200, view);
      }
    }

    // GET /api/auth/me
    if (segments[0] === 'api' && segments[1] === 'auth' && segments[2] === 'me') {
      return send(response, 200, {
        id: 'local-owner',
        email: process.env.OWNER_EMAIL ?? 'owner@localhost',
        full_name: process.env.OWNER_NAME ?? 'Owner',
        role: 'admin',
      });
    }

    // /api/entities/:name[/:id]
    if (segments[0] === 'api' && segments[1] === 'entities' && segments[2]) {
      const collection = db.collection(segments[2]);
      const id = segments[3];

      if (request.method === 'GET') {
        const rawFilter = url.searchParams.get('filter');
        const sort = url.searchParams.get('sort') ?? undefined;
        const limit = url.searchParams.get('limit');
        const options = { sort, limit: limit ? Number(limit) : undefined };

        if (id) return send(response, 200, await collection.get(id));
        const rows = rawFilter
          ? await collection.filter(JSON.parse(rawFilter), options)
          : await collection.list(options);
        return send(response, 200, rows);
      }

      if (request.method === 'POST') {
        const body = await readBody(request);
        if (Array.isArray(body)) return send(response, 200, await collection.bulkCreate(body));
        return send(response, 200, await collection.create(body));
      }

      if (request.method === 'PATCH' && id) {
        return send(response, 200, await collection.update(id, await readBody(request)));
      }

      if (request.method === 'DELETE' && id) {
        await collection.delete(id);
        return send(response, 200, { ok: true });
      }
    }

    // GET /api/images/:file - отдава нарисуваното.
    //
    // Името се проверява със строг образец, а не само за "..": пътят идва от
    // адрес, тоест от външния свят, и единственото безопасно допускане е, че
    // всичко в него е враждебно, докато не се докаже обратното.
    if (segments[0] === 'api' && segments[1] === 'images' && segments[2]) {
      const name = segments[2];
      if (!/^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp|bin)$/.test(name)) {
        return send(response, 400, { error: 'недопустимо име на файл' });
      }
      const file = join(config.dataDir, 'images', name);
      if (!existsSync(file)) return send(response, 404, { error: 'няма такава снимка' });

      const extension = name.split('.').pop() ?? '';
      response.writeHead(200, {
        'content-type': mimeForExtension(extension),
        'access-control-allow-origin': '*',
        // Съдържанието на един файл никога не се мени - името носи време и
        // случайна част, тоест кеширането е безопасно.
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return void createReadStream(file).pipe(response);
    }

    // GET /api/videos/:file
    if (segments[0] === 'api' && segments[1] === 'videos' && segments[2]) {
      const name = segments[2];
      if (!/^[A-Za-z0-9_-]+\.mp4$/.test(name)) {
        return send(response, 400, { error: 'недопустимо име на файл' });
      }
      const file = join(config.dataDir, 'videos', name);
      if (!existsSync(file)) return send(response, 404, { error: 'няма такова видео' });
      response.writeHead(200, {
        'content-type': 'video/mp4',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return void createReadStream(file).pipe(response);
    }

    // POST /api/functions/:name
    if (segments[0] === 'api' && segments[1] === 'functions' && segments[2]) {
      const name = segments[2];
      if (!hasFunction(name)) return send(response, 404, { error: `няма функция "${name}"` });
      const payload = await readBody(request);
      const result = await invokeFunction(name, payload, context);
      const translated = translateProviderError(JSON.stringify(result.body ?? ''));
      if (translated) return send(response, translated.status, translated.body);
      return send(response, result.status, result.body);
    }

    send(response, 404, { error: 'непознат път' });
  } catch (error) {
    const message = (error as Error).message ?? '';
    const translated = translateProviderError(message);
    if (translated) return send(response, translated.status, translated.body);

    // Всичко останало се показва цяло: това е локален инструмент за един
    // човек, а скритото съобщение струва час търсене.
    send(response, 500, { error: message, stack: (error as Error).stack });
  }
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`двигателят слуша на http://127.0.0.1:${config.port}`);
  console.log(`режим: ${config.mode}, истински поръчки: ${config.allowRealOrders ? 'ДА' : 'не'}`);
  console.log(
    `OKX: ${okx.authenticated ? (config.okx.demo ? 'демо' : 'ИСТИНСКИ') : 'без ключове'} | ` +
      `Polygon: ${polygon.available ? 'да' : 'не'} | Claude: ${claude.available ? 'да' : 'не'}`
  );
});
