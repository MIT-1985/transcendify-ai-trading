import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleImageClient, extensionFor, mimeForExtension } from '../src/ai/images.ts';

/**
 * Че наистина излиза СНИМКА, а не успешен отговор.
 *
 * Разликата не е дребна: клиент, който връща base64 и никой не го записва, е
 * "работещ" във всеки лог и безполезен за човека отсреща. Затова тук се проверява
 * съдържанието на файла, а не кодът на отговора.
 */

/** Най-малкият валиден PNG - един прозрачен пиксел. */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function fakeFetch(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }) as unknown as Response) as unknown as typeof fetch;
}

test('записаният файл е истински PNG, не просто байтове', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tx-img-'));
  try {
    const client = new GoogleImageClient({
      apiKey: 'test',
      fetchImpl: fakeFetch({
        candidates: [
          { content: { parts: [{ inlineData: { data: ONE_PIXEL_PNG, mimeType: 'image/png' } }] } },
        ],
      }),
    });

    const saved = await client.generateToFiles({ prompt: 'котка' }, directory);
    assert.equal(saved.length, 1);
    assert.ok(saved[0]!.file.endsWith('.png'));

    // Подписът на PNG: \x89 P N G \r \n \x1a \n. Ако тук има JSON или празно,
    // значи някъде по пътя се е записал отговорът, а не съдържанието му.
    const bytes = await readFile(saved[0]!.path);
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );
    assert.ok(bytes.length > 20, 'файлът е подозрително малък');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('jpeg отговор се записва с разширение jpg', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tx-img-'));
  try {
    const client = new GoogleImageClient({
      apiKey: 'test',
      fetchImpl: fakeFetch({
        predictions: [{ bytesBase64Encoded: ONE_PIXEL_PNG, mimeType: 'image/jpeg' }],
      }),
    });
    const saved = await client.generateToFiles({ prompt: 'куче', format: 'jpg' }, directory);
    assert.ok(saved[0]!.file.endsWith('.jpg'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('поискан jpg, но върнат png се записва като png - разширението не лъже', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tx-img-'));
  try {
    const client = new GoogleImageClient({
      apiKey: 'test',
      fetchImpl: fakeFetch({
        candidates: [
          { content: { parts: [{ inlineData: { data: ONE_PIXEL_PNG, mimeType: 'image/png' } }] } },
        ],
      }),
    });
    // Точно тук е изкушението да се напише ".jpg", защото е поискано. Файл с
    // грешно разширение се отваря на половината места и грешката излиза дни
    // по-късно, далеч от причината.
    const saved = await client.generateToFiles({ prompt: 'кола', format: 'jpg' }, directory);
    assert.ok(saved[0]!.file.endsWith('.png'));
    assert.equal(saved[0]!.mimeType, 'image/png');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('всяко извикване прави отделен файл - нищо не се презаписва', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tx-img-'));
  try {
    const client = new GoogleImageClient({
      apiKey: 'test',
      fetchImpl: fakeFetch({
        candidates: [
          { content: { parts: [{ inlineData: { data: ONE_PIXEL_PNG, mimeType: 'image/png' } }] } },
        ],
      }),
    });
    const first = await client.generateToFiles({ prompt: 'едно' }, directory);
    const second = await client.generateToFiles({ prompt: 'две' }, directory);
    assert.notEqual(first[0]!.file, second[0]!.file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('разширението и типът се превеждат в двете посоки', () => {
  assert.equal(extensionFor('image/png'), 'png');
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(extensionFor('image/webp'), 'webp');
  // Непознат тип НЕ се прави на png - иначе файлът лъже за съдържанието си.
  assert.equal(extensionFor('application/json'), 'bin');

  assert.equal(mimeForExtension('png'), 'image/png');
  assert.equal(mimeForExtension('jpg'), 'image/jpeg');
  assert.equal(mimeForExtension('jpeg'), 'image/jpeg');
  assert.equal(mimeForExtension('exe'), 'application/octet-stream');
});
