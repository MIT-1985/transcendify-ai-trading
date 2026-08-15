import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Генериране на изображения през Google Generative AI.
 *
 * Заменя `integrations.Core.GenerateImage`, който досега връщаше "не е
 * налично". Google е избран, защото ключът вече съществува в проекта и защото
 * адресът е същият, който Arhont използва за текстовия Gemini - тоест един
 * ключ, един доставчик, едно нещо за поддържане.
 *
 * Върнатото е base64 плюс тип, а не файл на диска: викащият решава дали да го
 * запише, да го върне по HTTP или да го покаже. Функция, която сама пише
 * файлове, е по-трудна за тестване и по-лесна за изненади с права.
 */

export type ImageFormat = 'png' | 'jpg';

export interface GenerateImageArgs {
  prompt: string;
  /** Модел на Google. Сменя се често - затова е настройка, не константа. */
  model?: string;
  /** Колко изображения. Не всички модели го спазват. */
  count?: number;
  /**
   * Желан формат.
   *
   * ЧЕСТНО ОГРАНИЧЕНИЕ: това е ЖЕЛАНИЕ, не гаранция. Моделите от рода на
   * Imagen приемат формата в самата заявка и го спазват; тези през
   * `generateContent` връщат каквото решат (на практика PNG). Затова записът
   * на файла винаги следва ИСТИНСКИЯ тип от отговора - файл с разширение
   * `.jpg`, който съдържа PNG, е по-лош от честното разширение, защото се
   * чупи чак при отваряне.
   */
  format?: ImageFormat;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

export interface ImageProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}

export class ImageGenerationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

export class GoogleImageClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly doFetch: typeof fetch;

  constructor(options: ImageProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    this.baseUrl =
      options.baseUrl ?? process.env.GOOGLE_AI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel =
      options.defaultModel ?? process.env.GOOGLE_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
    this.doFetch = options.fetchImpl ?? fetch;
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(args: GenerateImageArgs): Promise<GeneratedImage[]> {
    if (!this.apiKey) {
      throw new ImageGenerationError('липсва GOOGLE_API_KEY (или GEMINI_API_KEY)');
    }
    if (!args.prompt?.trim()) {
      throw new ImageGenerationError('празна подсказка - няма какво да се нарисува');
    }

    const model = args.model ?? this.defaultModel;

    // Двете семейства на Google искат РАЗЛИЧНИ пътища и различни тела. Imagen
    // приема и желания формат - затова само при него "jpg" наистина значи jpg.
    const isImagen = model.toLowerCase().includes('imagen');
    const method = isImagen ? 'predict' : 'generateContent';
    const url = `${this.baseUrl.replace(/\/$/, '')}/models/${model}:${method}?key=${this.apiKey}`;

    const body = isImagen
      ? {
          instances: [{ prompt: args.prompt }],
          parameters: {
            sampleCount: args.count ?? 1,
            outputOptions: {
              mimeType: args.format === 'jpg' ? 'image/jpeg' : 'image/png',
            },
          },
        }
      : { contents: [{ parts: [{ text: args.prompt }] }] };

    const response = await this.doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ImageGenerationError(
        `Google върна ${response.status}: ${(await response.text()).slice(0, 300)}`,
        response.status
      );
    }

    return GoogleImageClient.extractImages(await response.json());
  }

  /**
   * Изважда изображенията от отговора.
   *
   * Поддържат се ДВЕ форми нарочно: `generateContent` връща части с
   * `inlineData`, а моделите от рода на Imagen връщат `predictions` с
   * `bytesBase64Encoded`. Имената на моделите при Google се менят често и
   * едното семейство мълчаливо се заменя с другото; код, който познава само
   * една форма, се чупи при смяна на модела, а грешката изглежда като "няма
   * изображение", не като "друг формат".
   */
  static extractImages(payload: unknown): GeneratedImage[] {
    const out: GeneratedImage[] = [];
    const root = payload as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
      predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
    };

    for (const candidate of root.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data) {
          out.push({ base64: data, mimeType: part.inlineData?.mimeType ?? 'image/png' });
        }
      }
    }

    for (const prediction of root.predictions ?? []) {
      if (prediction.bytesBase64Encoded) {
        out.push({
          base64: prediction.bytesBase64Encoded,
          mimeType: prediction.mimeType ?? 'image/png',
        });
      }
    }

    if (out.length === 0) {
      // Отговор без изображение почти винаги значи отказ по съображения за
      // съдържание. Общо "неуспех" тук би пратило човек да търси грешка в кода.
      throw new ImageGenerationError(
        'отговорът не съдържа изображение - обикновено значи, че подсказката е отказана'
      );
    }
    return out;
  }

  /**
   * Генерира И ЗАПИСВА снимките като истински файлове.
   *
   * Досега клиентът връщаше само base64 и никъде не се превръщаше в снимка -
   * тоест "генерирането работи" беше вярно на теория и безполезно на практика.
   *
   * Разширението следва ИСТИНСКИЯ тип от отговора, не пожеланието: `.jpg`
   * файл със съдържание PNG се отваря само на половината програми и грешката
   * идва дни по-късно, далеч от мястото, което я е причинило.
   */
  async generateToFiles(
    args: GenerateImageArgs,
    directory: string
  ): Promise<SavedImage[]> {
    const images = await this.generate(args);
    await mkdir(directory, { recursive: true });

    const saved: SavedImage[] = [];
    for (const image of images) {
      const extension = extensionFor(image.mimeType);
      const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${extension}`;
      const fullPath = join(directory, name);
      await writeFile(fullPath, Buffer.from(image.base64, 'base64'));
      saved.push({
        file: name,
        path: fullPath,
        mimeType: image.mimeType,
        bytes: Buffer.byteLength(image.base64, 'base64'),
      });
    }
    return saved;
  }
}

export interface SavedImage {
  /** Само името - за сглобяване на адрес, без да се разкрива пътят на диска. */
  file: string;
  path: string;
  mimeType: string;
  bytes: number;
}

/** Разширението по истинския тип. Непознат тип се записва като .bin, не като .png. */
export function extensionFor(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

/** Типът по разширение - за отдаването на файла по HTTP. */
export function mimeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
