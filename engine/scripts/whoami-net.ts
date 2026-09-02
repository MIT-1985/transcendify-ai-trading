/**
 * Кой адрес вижда борсата, когато двигателят се обажда.
 *
 * Проверява СЛЕД настройката ipv4first в server.ts - иначе отговорът е
 * различен при всяко пускане.
 */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

const seen = new Set<string>();
for (let i = 0; i < 5; i++) {
  const r = await fetch('https://api64.ipify.org?format=json').then(r => r.json()).catch(() => null);
  if ((r as any)?.ip) seen.add((r as any).ip);
}
console.log('адреси, видени при 5 заявки:', [...seen].join(', '));
console.log(seen.size === 1 ? '✓ постоянен - става за списък на OKX' : '✗ сменя се - списък не може да се направи');
