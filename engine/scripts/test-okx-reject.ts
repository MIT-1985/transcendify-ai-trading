/** Невалиден ключ трябва да падне с ясно съобщение, не със сурова грешка. */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { OkxClient } from '../src/exchange/okxClient.ts';

const c = new OkxClient({
  credentials: { apiKey: 'invalid', secretKey: 'invalid', passphrase: 'invalid' },
  demo: true,
});
try {
  await c.assertSafeForTrading();
  console.log('ПРИЕ невалиден ключ - лошо');
} catch (e) {
  const err = e as Error & { code?: string };
  console.log('отказ:', err.code ?? '(без код)', '|', String(err.message).slice(0, 120));
}
