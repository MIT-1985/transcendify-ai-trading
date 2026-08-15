import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJsonResponse } from '../src/ai/llm.ts';
import { GoogleImageClient, ImageGenerationError } from '../src/ai/images.ts';

/**
 * Разчитането на отговора и на двата формата изображения - без мрежа.
 *
 * Тези две места чупят мълчаливо: разчитане, което хвърля, спира функция, чийто
 * отговор реално е верен; а формат на изображение, който не се познава,
 * изглежда като "моделът не върна нищо".
 */

// ---- отговорът на модела ----------------------------------------------------

test('чист JSON се разчита', () => {
  assert.deepEqual(parseJsonResponse('{"action":"BUY","confidence":0.7}'), {
    action: 'BUY',
    confidence: 0.7,
  });
});

test('JSON, ограден в markdown блок, също се разчита', () => {
  // Моделите правят това дори при подадена схема.
  const text = '```json\n{"K_TP": 1.2, "K_SL": 0.8}\n```';
  assert.deepEqual(parseJsonResponse(text), { K_TP: 1.2, K_SL: 0.8 });
});

test('блок без "json" етикет също', () => {
  assert.deepEqual(parseJsonResponse('```\n{"a":1}\n```'), { a: 1 });
});

test('обяснение около обекта не пречи', () => {
  const text = 'Ето анализа:\n{"action":"WAIT"}\nНадявам се да помогне.';
  assert.deepEqual(parseJsonResponse(text), { action: 'WAIT' });
});

test('текст без обект казва какво е дошло, вместо да мълчи', () => {
  assert.throws(() => parseJsonResponse('Съжалявам, не мога.'), /не е JSON/);
});

// ---- изображенията ----------------------------------------------------------

test('форматът на generateContent се разчита', () => {
  const payload = {
    candidates: [
      { content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'image/png' } }] } },
    ],
  };
  assert.deepEqual(GoogleImageClient.extractImages(payload), [
    { base64: 'AAAA', mimeType: 'image/png' },
  ]);
});

test('форматът на Imagen (predictions) също', () => {
  // Другото семейство модели на Google връща точно това - и заради смяна на
  // име на модел кодът мълчаливо попада на него.
  const payload = { predictions: [{ bytesBase64Encoded: 'BBBB', mimeType: 'image/jpeg' }] };
  assert.deepEqual(GoogleImageClient.extractImages(payload), [
    { base64: 'BBBB', mimeType: 'image/jpeg' },
  ]);
});

test('липсва тип - приема се png, вместо да пада', () => {
  const payload = { candidates: [{ content: { parts: [{ inlineData: { data: 'CCCC' } }] } }] };
  assert.equal(GoogleImageClient.extractImages(payload)[0]!.mimeType, 'image/png');
});

test('текстови части се пропускат, не се броят за изображение', () => {
  const payload = {
    candidates: [
      {
        content: {
          parts: [{ text: 'Ето картинката' }, { inlineData: { data: 'DDDD', mimeType: 'image/png' } }],
        },
      },
    ],
  };
  assert.equal(GoogleImageClient.extractImages(payload).length, 1);
});

test('отговор без изображение обяснява най-вероятната причина', () => {
  assert.throws(
    () => GoogleImageClient.extractImages({ candidates: [{ content: { parts: [{ text: 'не' }] } }] }),
    (error: Error) => error instanceof ImageGenerationError && /отказана/.test(error.message)
  );
});

test('без ключ клиентът се обявява за неналичен, а не се прави, че работи', () => {
  const client = new GoogleImageClient({ apiKey: undefined });
  // Средата може да има ключ - тогава проверката е обратната.
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    assert.equal(client.available, true);
  } else {
    assert.equal(client.available, false);
  }
});
