/**
 * Пренася старите функции от base44/ в engine/legacy/ и им маха платформата.
 *
 * Замяните са три и всяка е механична:
 *   npm:@base44/sdk@x  -> локалният заместител
 *   npm:<пакет>@версия -> обикновен внос от node_modules
 *   останалото         -> непокътнато
 *
 * Логиката НЕ се пипа. Целта на този скрипт е да няма чужд доставчик, а не да
 * пренаписва стратегии - това е отделна работа и се прави с тестове, не с
 * търсене и замяна.
 *
 * Пуска се веднъж: `npx tsx scripts/port-legacy.ts ../base44/functions`
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, process.argv[2] ?? '../../base44/functions');
const target = resolve(here, '../legacy/functions');

if (!existsSync(source)) {
  console.error(`няма папка ${source}`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });

const SDK_IMPORT = /from\s+['"]npm:@base44\/sdk@?[^'"]*['"]/g;
const NPM_IMPORT = /from\s+['"]npm:([^@'"]+(?:@[^'"]*)?)['"]/g;

let ported = 0;
const skipped: string[] = [];

for (const name of readdirSync(source)) {
  const entry = join(source, name, 'entry.ts');
  if (!existsSync(entry)) {
    skipped.push(name);
    continue;
  }

  let code = readFileSync(entry, 'utf8');
  code = code.replace(SDK_IMPORT, "from '../../src/compat/base44Client.ts'");
  code = code.replace(NPM_IMPORT, (_match, spec: string) => {
    // "ccxt@4.2.0" -> "ccxt"; "@scope/pkg@1.0" -> "@scope/pkg"
    const at = spec.lastIndexOf('@');
    const bare = at > 0 ? spec.slice(0, at) : spec;
    return `from '${bare}'`;
  });

  const header = [
    '// Пренесена от base44/functions - виж engine/scripts/port-legacy.ts.',
    '// Логиката е непроменена; сменени са само вносовете и платформата.',
    '',
  ].join('\n');

  writeFileSync(join(target, `${name}.ts`), header + code, 'utf8');
  ported++;
}

console.log(`пренесени: ${ported}`);
if (skipped.length > 0) console.log(`без entry.ts: ${skipped.join(', ')}`);
