import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Генериране на видео с Veo през Google Generative AI.
 *
 * Същият ключ като при снимките - един доставчик, едно нещо за поддържане.
 *
 * ЗАЩО НЕ Е PYTHON: примерът в документацията на Google е с `google-genai`
 * за Python. Двигателят е Node; отделен Python процес значи втора среда, втори
 * начин за пускане и втори начин да се счупи. Тук е същият HTTP разговор,
 * написан веднъж.
 *
 * ВАЖНО ЗА ВРЕМЕТО: това не е обикновена заявка. Генерирането трае минути и
 * Google връща "операция", която се проверява многократно. Затова тук има
 * цикъл с изчакване, а не просто await - и затова [generateToFile] не бива да
 * се вика от път, който чака отговор в рамките на секунди.
 */

export interface GenerateVideoArgs {
  prompt: string;
  model?: string;
  /** "16:9" за широко, "9:16" за телефон. */
  aspectRatio?: '16:9' | '9:16';
  /** "dont_allow" или "allow_adult" - Google отказва заявката при непозволено. */
  personGeneration?: 'dont_allow' | 'allow_adult';
  /** Начална картинка (base64), ако видеото тръгва от снимка. */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface VideoProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
  /** През колко време се проверява дали е готово. Кратко за тестове. */
  pollIntervalMs?: number;
  /** Докога се чака, преди да се откаже. */
  timeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface SavedVideo {
  file: string;
  path: string;
  bytes: number;
}

export class VideoGenerationError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'VideoGenerationError';
  }
}

export class GoogleVideoClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly doFetch: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: VideoProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    this.baseUrl =
      options.baseUrl ??
      process.env.GOOGLE_AI_BASE_URL ??
      'https://generativelanguage.googleapis.com/v1beta';
    this.defaultModel = options.defaultModel ?? process.env.GOOGLE_VIDEO_MODEL ?? 'veo-3.1-generate-001';
    this.doFetch = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 20_000;
    // Veo трае 1-3 минути; десет е таван, не очакване.
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.sleep = options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  /** Пуска задачата и връща името на операцията, без да чака. */
  async start(args: GenerateVideoArgs): Promise<string> {
    if (!this.apiKey) throw new VideoGenerationError('липсва GOOGLE_API_KEY (или GEMINI_API_KEY)');
    if (!args.prompt?.trim()) throw new VideoGenerationError('празна подсказка');

    const model = args.model ?? this.defaultModel;
    const instance: Record<string, unknown> = { prompt: args.prompt };
    if (args.imageBase64) {
      instance.image = {
        bytesBase64Encoded: args.imageBase64,
        mimeType: args.imageMimeType ?? 'image/png',
      };
    }

    const response = await this.doFetch(
      `${this.baseUrl.replace(/\/$/, '')}/models/${model}:predictLongRunning?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instances: [instance],
          parameters: {
            aspectRatio: args.aspectRatio ?? '16:9',
            personGeneration: args.personGeneration ?? 'dont_allow',
          },
        }),
      }
    );

    if (!response.ok) {
      throw new VideoGenerationError(
        `Google върна ${response.status}: ${(await response.text()).slice(0, 300)}`,
        response.status
      );
    }

    const payload = (await response.json()) as { name?: string };
    if (!payload.name) {
      throw new VideoGenerationError('отговорът не съдържа име на операция');
    }
    return payload.name;
  }

  /**
   * Чака операцията да приключи.
   *
   * @param onProgress вика се при всяка проверка - за да не изглежда спряло.
   */
  async waitFor(operationName: string, onProgress?: (elapsedMs: number) => void): Promise<unknown> {
    const started = Date.now();

    for (;;) {
      const response = await this.doFetch(
        `${this.baseUrl.replace(/\/$/, '')}/${operationName}?key=${this.apiKey}`
      );
      if (!response.ok) {
        throw new VideoGenerationError(
          `проверката на операцията върна ${response.status}`,
          response.status
        );
      }

      const operation = (await response.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: unknown;
      };

      if (operation.done) {
        // Готова операция с грешка е различно от мрежов проблем - иначе човек
        // търси мрежата, а причината е в самата заявка.
        if (operation.error) {
          throw new VideoGenerationError(
            `генерирането се провали: ${operation.error.message ?? 'без обяснение'}`
          );
        }
        return operation.response;
      }

      const elapsed = Date.now() - started;
      if (elapsed > this.timeoutMs) {
        throw new VideoGenerationError(
          `видеото не се появи за ${Math.round(this.timeoutMs / 1000)} секунди`
        );
      }
      onProgress?.(elapsed);
      await this.sleep(this.pollIntervalMs);
    }
  }

  /**
   * Изважда адресите или съдържанието на видеата.
   *
   * Приемат се няколко имена на полета нарочно - Google е менил формата между
   * версиите на Veo и кодът, който знае само едно име, се чупи при смяна на
   * модела, а грешката изглежда като "няма видео".
   */
  static extractVideos(response: unknown): { uri?: string; base64?: string }[] {
    const root = response as Record<string, unknown>;
    const container =
      (root?.generateVideoResponse as Record<string, unknown>) ?? root ?? {};

    // Set по РЕФЕРЕНЦИЯ, не масив: когато отговорът няма обвивка,
    // `container` е самият `root` и един и същ списък попада в него два пъти.
    // Без това всяко видео се брояваше двойно - и то тихо, защото файловете
    // наистина се записваха, просто по два еднакви.
    const lists = new Set<Record<string, unknown>[]>();
    for (const candidate of [
      container.generatedSamples,
      container.generatedVideos,
      container.videos,
      root?.generatedSamples,
    ]) {
      if (Array.isArray(candidate)) lists.add(candidate as Record<string, unknown>[]);
    }

    const out: { uri?: string; base64?: string }[] = [];
    for (const list of lists) {
      for (const item of list) {
        const video = (item.video as Record<string, unknown>) ?? item;
        const uri = (video.uri ?? video.url) as string | undefined;
        const base64 = (video.bytesBase64Encoded ?? video.videoBytes) as string | undefined;
        if (uri || base64) out.push({ uri, base64 });
      }
    }

    if (out.length === 0) {
      throw new VideoGenerationError(
        'отговорът не съдържа видео - обикновено значи, че подсказката е отказана'
      );
    }
    return out;
  }

  /** Пуска, изчаква, сваля и записва като .mp4. */
  async generateToFile(
    args: GenerateVideoArgs,
    directory: string,
    onProgress?: (elapsedMs: number) => void
  ): Promise<SavedVideo[]> {
    const operationName = await this.start(args);
    const response = await this.waitFor(operationName, onProgress);
    const videos = GoogleVideoClient.extractVideos(response);

    await mkdir(directory, { recursive: true });
    const saved: SavedVideo[] = [];

    for (const video of videos) {
      let bytes: Buffer;
      if (video.base64) {
        bytes = Buffer.from(video.base64, 'base64');
      } else {
        // Адресът за сваляне също иска ключ - без него идва 403, което
        // изглежда като изтекла операция.
        const separator = video.uri!.includes('?') ? '&' : '?';
        const download = await this.doFetch(`${video.uri}${separator}key=${this.apiKey}`);
        if (!download.ok) {
          throw new VideoGenerationError(
            `свалянето върна ${download.status}`,
            download.status
          );
        }
        bytes = Buffer.from(await download.arrayBuffer());
      }

      const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.mp4`;
      const fullPath = join(directory, name);
      await writeFile(fullPath, bytes);
      saved.push({ file: name, path: fullPath, bytes: bytes.length });
    }

    return saved;
  }
}
