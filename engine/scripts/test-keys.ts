/** Проверява ключовете срещу самите доставчици, не срещу нашия код. */
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config.ts';

const config = loadConfig();

console.log('── Anthropic ──────────────────────────────');
if (!config.anthropic.apiKey) {
  console.log('няма ключ');
} else {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const t0 = Date.now();
  try {
    const r = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Отговори само с думата: работи' }],
    });
    const text = r.content.map((c: any) => c.text ?? '').join('').trim();
    console.log(`  модел    ${r.model}`);
    console.log(`  отговор  "${text}"`);
    console.log(`  токени   ${r.usage.input_tokens} вход / ${r.usage.output_tokens} изход`);
    console.log(`  време    ${Date.now() - t0} ms`);
  } catch (e: any) {
    console.log(`  ГРЕШКА ${e.status ?? ''} ${e.message?.slice(0, 160)}`);
  }
}

console.log('\n── Polygon ────────────────────────────────');
if (!config.polygon.apiKey) {
  console.log('  няма ключ - трите търпеливи робота остават спрени');
} else {
  const r = await fetch(
    `https://api.polygon.io/v2/aggs/ticker/X:BTCUSD/prev?adjusted=true&apiKey=${config.polygon.apiKey}`,
  );
  const j = (await r.json()) as any;
  console.log(`  HTTP ${r.status}  status=${j.status}  резултати=${j.resultsCount ?? 0}`);
}

console.log('\n── OKX ────────────────────────────────────');
console.log(config.okx.apiKey ? '  има ключове' : '  няма ключове - само публични данни, без поръчки');
