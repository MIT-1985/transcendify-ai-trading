import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config.ts';
import { Database } from './store/db.ts';
import { OkxClient } from './exchange/okxClient.ts';
import { PolygonClient } from './market/polygon.ts';
import { ClaudeSignals } from './ai/claude.ts';
import { TradingEngine } from './core/tradingEngine.ts';
import { hasFunction, invokeFunction, type FunctionContext } from './core/functions.ts';
import { setDatabase, setFunctionInvoker, setLlmInvoker } from './compat/base44Client.ts';

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

const context: FunctionContext = { config, db, okx, polygon, claude, engine };

setFunctionInvoker(async (name, payload) => {
  const result = await invokeFunction(name, (payload ?? {}) as Record<string, unknown>, context);
  return result.body;
});

setLlmInvoker(async ({ prompt }) => {
  // Старият InvokeLLM беше свободен текст. Тук се пренасочва към същия модел,
  // но без структура - структурираните решения минават през ClaudeSignals.
  const decision = await claude.decide({
    snapshot: { instId: 'N/A', price: 0, atr: 0, atrPct: 0, rsi: 50, trend: 0, volumeRatio: 1, candles: [] },
    news: [{ title: prompt, publishedUtc: new Date().toISOString(), publisher: 'prompt', url: '' }],
  });
  return decision;
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
