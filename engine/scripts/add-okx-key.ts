/**
 * Въвежда ключовете за OKX, без те да минат през нищо, което ги помни.
 *
 * Защо е отделна програма, а не редактиране на .env на ръка:
 *
 *   - Въведеното НЕ се показва на екрана и НЕ влиза в историята на обвивката.
 *     Ключ, подаден като аргумент на команда, остава в ~/.zsh_history и се
 *     вижда в `ps` от всеки процес на машината, докато командата тече.
 *   - Ключът се проверява СРЕЩУ OKX преди да бъде записан. Ключ с право на
 *     теглене се отказва и не се записва никъде - по-добре нищо, отколкото
 *     нещо опасно на диск.
 *   - Файлът се затваря с права 600 веднага.
 *
 * Пуска се така:
 *     cd engine && npx tsx scripts/add-okx-key.ts
 */
import { createInterface } from 'node:readline';
import { chmodSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDefaultResultOrder } from 'node:dns';
import { OkxClient } from '../src/exchange/okxClient.ts';

// Същият избор като в двигателя - иначе проверката тръгва от един адрес, а
// работата после от друг, и списъкът в OKX пуска едното, но не и другото.
setDefaultResultOrder('ipv4first');

const ENV = resolve(process.cwd(), '.env');
const EXAMPLE = resolve(process.cwd(), '.env.example');

/** Чете ред, без да го изписва. Ехото се маха на ниво терминал. */
function askHidden(question: string): Promise<string> {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = (rl as unknown as { output: NodeJS.WriteStream }).output;
    const onData = (chunk: Buffer | string) => {
      // Всичко освен нов ред се поглъща, за да не се появи на екрана.
      const s = String(chunk);
      if (s !== '\r' && s !== '\n' && s !== '\r\n') output.write('');
    };
    rl.question(question, (answer) => {
      process.stdin.removeListener('data', onData);
      output.write('\n');
      rl.close();
      done(answer.trim());
    });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (s: string) {
      if (s.includes(question)) output.write(question);
      // иначе - нищо: въведеното остава невидимо
    };
    process.stdin.on('data', onData);
  });
}

function ask(question: string): Promise<string> {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); done(a.trim()); });
  });
}

console.log('\nКлючове за OKX — само търговия, без теглене.');
console.log('Въведеното не се вижда на екрана и не влиза в историята.\n');

const apiKey = await askHidden('API Key:        ');
const secretKey = await askHidden('Secret Key:     ');
const passphrase = await askHidden('Passphrase:     ');

if (!apiKey || !secretKey || !passphrase) {
  console.error('\nНепълни данни - нищо не е записано.');
  process.exit(1);
}

const demoAnswer = (await ask('\nДемо сметка? [Д/н]: ')).toLowerCase();
const demo = demoAnswer !== 'н' && demoAnswer !== 'n';

console.log('\nПроверявам при OKX...');

const client = new OkxClient({
  credentials: { apiKey, secretKey, passphrase },
  demo,
});

try {
  await client.assertSafeForTrading();
  const { perms } = await client.permissions();
  console.log(`  ✓ права: ${perms.join(', ')}`);
  console.log('  ✓ теглене: НЕ');
} catch (error) {
  const e = error as Error & { code?: string };
  console.error(`\n  ✗ ${e.message}`);
  // Кодовете на OKX са точни, но не казват КОЕ поле е сбъркано. Тук се
  // превеждат, за да не се гадае кой от трите низа е грешният.
  const hint =
    e.code === 'KEY_ALLOWS_WITHDRAW'
      ? 'Нищо не е записано. Направи нов ключ в OKX само с право "Trade".'
      : e.code === 'KEY_READ_ONLY'
        ? 'Ключът е само за четене. Трябва право "Trade".'
        : /50111/.test(e.message) ? 'API Key не е верен (или е за другия режим - демо срещу истински).'
        : /50113/.test(e.message) ? 'Подписът не излиза - Secret Key е грешен.'
        : /50105/.test(e.message) ? 'Passphrase не е вярна. Това е фразата, зададена при създаването на ключа.'
        : /50110/.test(e.message) ? 'Адресът на тази машина не е в списъка на ключа.\n' +
            'Виж кой е с:  npx tsx scripts/whoami-net.ts'
        : null;
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

if (!existsSync(ENV)) copyFileSync(EXAMPLE, ENV);
let text = readFileSync(ENV, 'utf8');
const set = (name: string, value: string) => {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, `${name}=${value}`) : `${text}\n${name}=${value}`;
};
set('OKX_API_KEY', apiKey);
set('OKX_SECRET_KEY', secretKey);
set('OKX_PASSPHRASE', passphrase);
set('OKX_DEMO', String(demo));
writeFileSync(ENV, text, 'utf8');
chmodSync(ENV, 0o600);

console.log('\nЗаписано в engine/.env (права 600, файлът е в .gitignore).');
console.log(`Режим: ${demo ? 'ДЕМО - истинска борса, нереални пари' : 'ИСТИНСКА СМЕТКА'}`);
console.log('\nИстинските поръчки остават спрени. За да се пуснат, трябват ДВЕ');
console.log('промени в .env:  TRADING_MODE=live  и  ALLOW_REAL_ORDERS=true');
