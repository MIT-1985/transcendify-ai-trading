/**
 * Клиентът към ЛОКАЛНИЯ двигател.
 *
 * Досега тук се създаваше клиент на base44: приложението не тръгваше без техен
 * `appId`, техен сървър и техен токен. Сега говори с `engine/`, който върви на
 * твоята машина.
 *
 * Външният вид е нарочно същият - `base44.entities.Trade.filter(...)`,
 * `base44.functions.invoke(...)`, `base44.auth.me()`. Така над четиристотин
 * места в интерфейса останаха недокоснати: сменен е доставчикът, не езикът.
 * Пренаписване на всяко от тях щеше да значи стотици възможности за нова
 * грешка в код, който работи.
 */

const BASE_URL = import.meta.env?.VITE_ENGINE_URL ?? 'http://127.0.0.1:8787';

async function request(path, { method = 'GET', body, query } = {}) {
  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload?.error ?? `двигателят върна ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

/** Една колекция - същите методи, които старият SDK даваше. */
function entity(name) {
  return {
    list: (sort, limit) => request(`/api/entities/${name}`, { query: { sort, limit } }),
    filter: (filter, sort, limit) =>
      request(`/api/entities/${name}`, {
        query: { filter: JSON.stringify(filter ?? {}), sort, limit },
      }),
    get: (id) => request(`/api/entities/${name}/${id}`),
    create: (data) => request(`/api/entities/${name}`, { method: 'POST', body: data }),
    bulkCreate: (items) => request(`/api/entities/${name}`, { method: 'POST', body: items }),
    update: (id, patch) => request(`/api/entities/${name}/${id}`, { method: 'PATCH', body: patch }),
    delete: (id) => request(`/api/entities/${name}/${id}`, { method: 'DELETE' }),
  };
}

// Колекциите се създават при първо докосване - няма списък, който да се
// поддържа ръчно и да изостава от кода.
const entities = new Proxy(
  {},
  {
    get: (cache, name) => {
      if (typeof name !== 'string') return undefined;
      if (!cache[name]) cache[name] = entity(name);
      return cache[name];
    },
  }
);

const notAvailable = (what) => async () => ({
  ok: false,
  reason: `${what} беше услуга на платформата и не е налично локално`,
});

export const base44 = {
  entities,

  // Локално няма разделение на права - машината е на собственика. Пътят се
  // запазва само защото старият код го вика.
  asServiceRole: { entities },

  auth: {
    me: () => request('/api/auth/me'),
    login: () => request('/api/auth/me'),
    logout: async () => undefined,
    updateMyUserData: async () => undefined,
  },

  functions: {
    invoke: (name, payload) =>
      request(`/api/functions/${name}`, { method: 'POST', body: payload ?? {} }),
  },

  integrations: {
    Core: {
      InvokeLLM: (args) => request('/api/functions/aiTradingAnalysis', { method: 'POST', body: args }),
      SendEmail: notAvailable('изпращането на поща'),
      SendSMS: notAvailable('изпращането на SMS'),
      UploadFile: notAvailable('качването на файлове'),
      GenerateImage: notAvailable('генерирането на изображения'),
      ExtractDataFromUploadedFile: notAvailable('извличането на данни от файл'),
    },
  },

  appLogs: {
    logUserInApp: async () => undefined,
  },
};

export default base44;
