/** Пълна проверка на сметката с текущия ключ. */
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
import { loadConfig } from '../src/config.ts';
import { OkxClient } from '../src/exchange/okxClient.ts';

const config = loadConfig();
const okx = new OkxClient({
  credentials: {
    apiKey: config.okx.apiKey,
    secretKey: config.okx.secretKey,
    passphrase: config.okx.passphrase,
  },
  baseUrl: config.okx.baseUrl,
  demo: config.okx.demo,
});

console.log(`адрес: ${config.okx.baseUrl}   демо: ${config.okx.demo}`);
console.log(`режим: ${config.mode}   истински поръчки: ${config.allowRealOrders ? 'ДА' : 'не'}\n`);

console.log('── права на ключа ─────────────────────────');
const p = await okx.permissions();
console.log(`  права:   ${p.perms.join(', ') || '(няма)'}`);
console.log(`  търговия: ${p.canTrade ? 'ДА' : 'не'}`);
console.log(`  теглене:  ${p.canWithdraw ? '⚠ ДА — ОПАСНО' : 'не ✓'}`);

console.log('\n── спот салдо ─────────────────────────────');
const rows = await okx.spotBalances();
if (rows.length === 0) {
  console.log('  сметката е празна');
} else {
  for (const r of rows) {
    console.log(
      `  ${r.ccy.padEnd(8)} ${r.total.toFixed(8).padStart(18)}   ` +
      `свободни ${r.available.toFixed(8).padStart(16)}   $${r.usd.toFixed(2).padStart(10)}`
    );
  }
  console.log(`\n  ОБЩО: $${rows.reduce((s, r) => s + r.usd, 0).toFixed(2)}`);
}
