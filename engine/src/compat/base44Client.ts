import { Database } from '../store/db.ts';
import { loadConfig } from '../config.ts';

/**
 * Заместител на `@base44/sdk` - същият външен вид, локална реализация.
 *
 * Смисълът е един: старият код (и фронтендът, и стотината функции) говори на
 * определен език - `entities.Trade.filter(...)`, `auth.me()`,
 * `functions.invoke(...)`. Този език остава, но отдолу вече няма чужда
 * платформа, чужд сървър и чужд акаунт - има локални файлове.
 *
 * Така премахването на base44 не изисква пренаписване на 400 места, а замяна на
 * един слой. Кодът, който вика, не знае и не му трябва да знае.
 */

export interface LocalUser {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
}

const OWNER: LocalUser = {
  id: 'local-owner',
  email: process.env.OWNER_EMAIL ?? 'owner@localhost',
  full_name: process.env.OWNER_NAME ?? 'Owner',
  role: 'admin',
};

let database: Database | null = null;

export function getDatabase(): Database {
  if (!database) database = new Database(loadConfig().dataDir);
  return database;
}

/** Само за тестове - подменя хранилището. */
export function setDatabase(db: Database): void {
  database = db;
}

type EntityProxy = ReturnType<typeof entityProxy>;

function entityProxy(): Record<string, unknown> {
  const db = getDatabase();
  return new Proxy(
    {},
    {
      get(_target, name: string) {
        const collection = db.collection(name);
        return {
          list: (sort?: string, limit?: number) => collection.list(sort, limit),
          filter: (filter: Record<string, unknown>, sort?: string, limit?: number) =>
            collection.filter(filter, sort, limit),
          get: (id: string) => collection.get(id),
          create: (data: Record<string, unknown>) => collection.create(data, OWNER.email),
          bulkCreate: (items: Record<string, unknown>[]) => collection.bulkCreate(items, OWNER.email),
          update: (id: string, patch: Record<string, unknown>) => collection.update(id, patch),
          delete: (id: string) => collection.delete(id),
        };
      },
    }
  ) as Record<string, unknown>;
}

export interface LocalBase44Client {
  entities: EntityProxy;
  asServiceRole: { entities: EntityProxy };
  auth: {
    me(): Promise<LocalUser>;
    login(): Promise<LocalUser>;
    logout(): Promise<void>;
  };
  functions: {
    invoke(name: string, payload?: unknown): Promise<unknown>;
  };
  integrations: {
    Core: {
      InvokeLLM(args: { prompt: string; response_json_schema?: unknown }): Promise<unknown>;
      SendEmail(args: unknown): Promise<{ ok: false; reason: string }>;
      SendSMS(args: unknown): Promise<{ ok: false; reason: string }>;
      UploadFile(args: unknown): Promise<{ ok: false; reason: string }>;
      GenerateImage(args: unknown): Promise<{ ok: false; reason: string }>;
      ExtractDataFromUploadedFile(args: unknown): Promise<{ ok: false; reason: string }>;
    };
  };
  appLogs: { logUserInApp(...args: unknown[]): Promise<void> };
}

/**
 * Функциите се викат през подадена отвън препратка, за да няма кръгов внос:
 * рутерът на функциите използва клиента, а клиентът - рутера.
 */
let functionInvoker: ((name: string, payload: unknown) => Promise<unknown>) | null = null;
export function setFunctionInvoker(fn: (name: string, payload: unknown) => Promise<unknown>): void {
  functionInvoker = fn;
}

let llmInvoker: ((args: { prompt: string; response_json_schema?: unknown }) => Promise<unknown>) | null =
  null;
export function setLlmInvoker(
  fn: (args: { prompt: string; response_json_schema?: unknown }) => Promise<unknown>
): void {
  llmInvoker = fn;
}

const notAvailable = (what: string) => async () => ({
  ok: false as const,
  reason: `${what} не е налично в локалния режим - беше услуга на платформата`,
});

export function createClient(): LocalBase44Client {
  const entities = entityProxy();
  return {
    entities,
    asServiceRole: { entities },
    auth: {
      async me() {
        return OWNER;
      },
      async login() {
        return OWNER;
      },
      async logout() {
        /* локално няма сесия за прекратяване */
      },
    },
    functions: {
      async invoke(name, payload) {
        if (!functionInvoker) throw new Error('рутерът на функциите не е инициализиран');
        return functionInvoker(name, payload);
      },
    },
    integrations: {
      Core: {
        async InvokeLLM(args) {
          if (!llmInvoker) throw new Error('няма настроен модел за InvokeLLM');
          return llmInvoker(args);
        },
        SendEmail: notAvailable('изпращането на поща'),
        SendSMS: notAvailable('изпращането на SMS'),
        UploadFile: notAvailable('качването на файлове'),
        GenerateImage: notAvailable('генерирането на изображения'),
        ExtractDataFromUploadedFile: notAvailable('извличането на данни от файл'),
      },
    },
    appLogs: {
      async logUserInApp(...args) {
        getDatabase().collection('app_logs').create({ args });
      },
    },
  };
}

/**
 * Старите функции получаваха клиент от заявката, защото носеше сесията на
 * потребителя. Локално потребителят е един - собственикът на машината - затова
 * заявката не се използва.
 */
export function createClientFromRequest(_request?: unknown): LocalBase44Client {
  return createClient();
}
