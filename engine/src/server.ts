import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

/**
 * Локалният сървър - това, което фронтендът вика вместо облака на платформата.
 *
 * Слуша САМО на 127.0.0.1. Тук минават ключове за борса и нареждания за
 * поръчки; отваряне навън е решение, което се взима съзнателно, с обратен
 * посредник и удостоверяване отпред, а не по подразбиране.
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
        claude: claude.available,
        images: images_.available,
      });
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
      return send(response, result.status, result.body);
    }

    send(response, 404, { error: 'непознат път' });
  } catch (error) {
    // Грешката се показва цяла: това е локален инструмент за един човек, а
    // скритото съобщение струва час търсене.
    send(response, 500, { error: (error as Error).message, stack: (error as Error).stack });
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
