/**
 * Дреболията, която прави старите функции изпълними в Node.
 *
 * Сто и пет файла бяха писани за Deno и започват с `Deno.serve(handler)`.
 * Пренаписването им едно по едно е седмици работа и внася грешки в код, който
 * работи. Вместо това тук се дава `Deno` с двете неща, които тези файлове
 * ползват: `env.get` и `serve`.
 *
 * `serve` не вдига сървър - само запомня функцията. Локалният сървър после я
 * вика като най-обикновена функция. Така един и същ файл работи и на двете
 * места, а зависимостта от Deno изчезва, без нищо да се пренаписва.
 */

export type DenoHandler = (request: Request) => Response | Promise<Response>;

let captured: DenoHandler | null = null;

export function installDenoShim(): void {
  if ((globalThis as Record<string, unknown>).Deno) return;
  (globalThis as Record<string, unknown>).Deno = {
    env: {
      get: (key: string) => process.env[key],
      set: (key: string, value: string) => {
        process.env[key] = value;
      },
      has: (key: string) => key in process.env,
      toObject: () => ({ ...process.env }),
    },
    serve: (handler: DenoHandler) => {
      captured = handler;
      return { finished: Promise.resolve() };
    },
    exit: (code = 0) => {
      throw new Error(`функцията извика Deno.exit(${code})`);
    },
  };
}

/** Взима и изчиства последно регистрирания обработчик. */
export function takeHandler(): DenoHandler | null {
  const handler = captured;
  captured = null;
  return handler;
}
