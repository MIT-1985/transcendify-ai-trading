import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDenoShim, takeHandler, type DenoHandler } from './denoShim.ts';

/**
 * Зарежда пренесена стара функция и я вика като обикновена функция.
 *
 * Зареждането е лениво и се пази: сто и четири файла, всеки с внасяния, не бива
 * да се четат при всеки старт. Първото извикване плаща, следващите не.
 */

const here = dirname(fileURLToPath(import.meta.url));
const LEGACY_DIR = resolve(here, '../../legacy/functions');

const cache = new Map<string, DenoHandler>();

export function legacyExists(name: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(name) && existsSync(join(LEGACY_DIR, `${name}.ts`));
}

export async function invokeLegacy(name: string, payload: unknown): Promise<Response> {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`недопустимо име на функция: ${name}`);
  }

  let handler = cache.get(name);
  if (!handler) {
    installDenoShim();
    const file = join(LEGACY_DIR, `${name}.ts`);
    if (!existsSync(file)) throw new Error(`няма функция ${name}`);
    await import(/* @vite-ignore */ file);
    const captured = takeHandler();
    if (!captured) throw new Error(`${name} не регистрира обработчик (липсва Deno.serve)`);
    handler = captured;
    cache.set(name, handler);
  }

  const request = new Request(`http://local/functions/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });

  return handler(request);
}
