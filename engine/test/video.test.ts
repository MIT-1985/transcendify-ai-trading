import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleVideoClient, VideoGenerationError } from '../src/ai/video.ts';

/**
 * Дългата операция - без чакане на истински минути.
 *
 * Тук се проверява точно това, което не може да се провери на око: че се чака
 * докато е готово, че грешка в самата операция се различава от мрежов проблем
 * и че форматът на отговора се разчита и в няколкото му варианта.
 */

const MP4_BYTES = Buffer.from('AAAAIGZ0eXBpc29t', 'base64'); // начало на истински mp4

function scriptedFetch(steps: unknown[]): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  const impl = (async (url: string | URL) => {
    calls.push(String(url));
    const step = steps[Math.min(index++, steps.length - 1)];
    if (step instanceof Buffer) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => step.buffer.slice(step.byteOffset, step.byteOffset + step.length),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => step,
      text: async () => JSON.stringify(step),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test('чака се, докато операцията стане готова', async () => {
  const { impl, calls } = scriptedFetch([
    { name: 'operations/abc' },
    { done: false },
    { done: false },
    {
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: 'https://example/v.mp4' } }],
        },
      },
    },
    MP4_BYTES,
  ]);

  const directory = await mkdtemp(join(tmpdir(), 'tx-vid-'));
  try {
    const client = new GoogleVideoClient({
      apiKey: 'test',
      fetchImpl: impl,
      pollIntervalMs: 1,
      sleepImpl: async () => undefined,
    });

    const saved = await client.generateToFile({ prompt: 'град' }, directory);
    assert.equal(saved.length, 1);
    assert.ok(saved[0]!.file.endsWith('.mp4'));

    const bytes = await readFile(saved[0]!.path);
    assert.deepEqual([...bytes.subarray(4, 8)], [...Buffer.from('ftyp')]);

    // Две проверки "не е готово" + една готова = три обръщения след пускането.
    assert.equal(calls.filter((c) => c.includes('operations/abc')).length, 3);
    // Адресът за сваляне носи ключа - без него идва 403.
    assert.ok(calls.at(-1)!.includes('key=test'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('грешка В операцията се различава от мрежов проблем', async () => {
  const { impl } = scriptedFetch([
    { name: 'operations/x' },
    { done: true, error: { message: 'подсказката е отказана' } },
  ]);
  const client = new GoogleVideoClient({
    apiKey: 'test',
    fetchImpl: impl,
    pollIntervalMs: 1,
    sleepImpl: async () => undefined,
  });
  await assert.rejects(
    client.generateToFile({ prompt: 'нещо' }, tmpdir()),
    (error: Error) => error instanceof VideoGenerationError && /подсказката е отказана/.test(error.message)
  );
});

test('изчакването се предава, вместо да виси вечно', async () => {
  const { impl } = scriptedFetch([{ name: 'operations/y' }, { done: false }]);
  const client = new GoogleVideoClient({
    apiKey: 'test',
    fetchImpl: impl,
    pollIntervalMs: 1,
    timeoutMs: 5,
    sleepImpl: async () => undefined,
  });
  await assert.rejects(
    client.generateToFile({ prompt: 'нещо' }, tmpdir()),
    /не се появи за/
  );
});

test('разчитат се и другите имена на полета', () => {
  // Google е менил формата между версиите на Veo; едно име не стига.
  assert.deepEqual(
    GoogleVideoClient.extractVideos({ generatedVideos: [{ video: { uri: 'a' } }] }),
    [{ uri: 'a', base64: undefined }]
  );
  assert.deepEqual(
    GoogleVideoClient.extractVideos({ videos: [{ bytesBase64Encoded: 'QQ==' }] }),
    [{ uri: undefined, base64: 'QQ==' }]
  );
});

test('отговор без видео обяснява най-вероятната причина', () => {
  assert.throws(
    () => GoogleVideoClient.extractVideos({ generateVideoResponse: {} }),
    /отказана/
  );
});

test('видео направо от base64 не се сваля повторно', async () => {
  const { impl, calls } = scriptedFetch([
    { name: 'operations/z' },
    { done: true, response: { generatedSamples: [{ video: { bytesBase64Encoded: MP4_BYTES.toString('base64') } }] } },
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'tx-vid-'));
  try {
    const client = new GoogleVideoClient({
      apiKey: 'test',
      fetchImpl: impl,
      pollIntervalMs: 1,
      sleepImpl: async () => undefined,
    });
    const saved = await client.generateToFile({ prompt: 'x' }, directory);
    assert.equal(saved.length, 1);
    // Пускане + една проверка. Трето обръщение би значело излишно сваляне.
    assert.equal(calls.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
