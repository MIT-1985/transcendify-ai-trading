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

export interface GenerateImageArgs {
  prompt: string;
  /** Модел на Google. Сменя се често - затова е настройка, не константа. */
  model?: string;
  /** Колко изображения. Не всички модели го спазват. */
  count?: number;
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
    const url = `${this.baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await this.doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: args.prompt }] }],
      }),
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
}
