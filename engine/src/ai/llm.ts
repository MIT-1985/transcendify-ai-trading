import Anthropic from '@anthropic-ai/sdk';
import type { EngineConfig } from '../config.ts';

/**
 * Общото извикване на модел - това, което старите функции знаят като
 * `integrations.Core.InvokeLLM`.
 *
 * Четири от пренесените функции разчитат на него (adaptiveConstantsEngine,
 * aiTradingAnalysis, claudeSignalEngine, orchestrateAgents) и всичките четири
 * очакват едно и също: подава се подсказка и схема, връща се РАЗЧЕТЕН обект,
 * до чиито полета се стига направо - `res.action`, `res.K_TP`, `res.confidence`.
 *
 * Първата версия на заместителя пренасочваше това към съветника за сделки,
 * тоест на всяко запитване връщаше решение за сделка, независимо какво е
 * питано. Функция, която иска константи, получаваше "hold" и мълчаливо
 * работеше с боклук. Затова тук има истинска реализация.
 *
 * Два доставчика зад един вход: Claude и всичко, което говори протокола на
 * OpenAI. Изборът е по името на модела, каквото старият код вече подава.
 */

export interface InvokeLlmArgs {
  prompt: string;
  /** Име както го подава старият код: `claude_sonnet_4_6`, `gpt-5.5`, и т.н. */
  model?: string;
  /** JSON Schema. Има ли я - отговорът се връща като разчетен обект. */
  response_json_schema?: Record<string, unknown>;
  /** Указания за модела; по избор. */
  system?: string;
}

export interface LlmProviders {
  anthropicApiKey?: string;
  /** Адрес за Claude. Празно = официалният; за препращащ сървър се подава тук. */
  anthropicBaseUrl?: string;
  /** Ключ за сървър по протокола на OpenAI (истинският OpenAI или препращащ). */
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Имената в стария код са на base44 (`claude_sonnet_4_6`). Превеждат се към
 * истински, вместо да се подават както са - иначе всяко извикване пада с
 * "непознат модел", а причината се вижда чак в лога на доставчика.
 */
const MODEL_ALIASES: Record<string, string> = {
  claude_sonnet_4_6: 'claude-sonnet-5',
  claude_sonnet_4: 'claude-sonnet-5',
  claude_opus: 'claude-opus-5',
  claude: 'claude-opus-5',
  gpt_4o: 'gpt-5.5',
  gpt_4: 'gpt-5.5',
};

function resolveModel(model: string | undefined): { name: string; provider: 'anthropic' | 'openai' } {
  const requested = (model ?? '').trim();
  const mapped = MODEL_ALIASES[requested] ?? requested;

  if (!mapped) return { name: 'claude-opus-5', provider: 'anthropic' };
  if (mapped.startsWith('gpt') || mapped.startsWith('o1') || mapped.startsWith('o3')) {
    return { name: mapped, provider: 'openai' };
  }
  return { name: mapped, provider: 'anthropic' };
}

/**
 * Изважда JSON от отговор, който може да е ограден с ```json ... ```.
 *
 * Дори при подадена схема моделите понякога ограждат отговора. Хвърляне тук би
 * счупило функция, чийто отговор реално е верен - затова първо се чисти, после
 * се разчита, и чак ако и това не стане, се казва какво е дошло.
 */
export function parseJsonResponse(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Понякога има обяснение преди/след обекта - взима се най-външният обект.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* пада надолу */
      }
    }
    throw new Error(`отговорът на модела не е JSON: ${cleaned.slice(0, 200)}`);
  }
}

export class LlmGateway {
  private readonly anthropic: Anthropic | null;
  private readonly openAiKey?: string;
  private readonly openAiBaseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(config: EngineConfig, providers: LlmProviders = {}) {
    // Claude може да върви и през препращащ сървър (OpenAPIs или собствен
    // router): SDK-то приема адрес, тоест не се налага втора реализация на
    // протокола. Без това целият Claude път беше зашит за api.anthropic.com.
    const anthropicKey = providers.anthropicApiKey ?? config.anthropic.apiKey;
    const anthropicBaseUrl =
      providers.anthropicBaseUrl ?? process.env.ANTHROPIC_BASE_URL ?? undefined;
    this.anthropic = anthropicKey
      ? new Anthropic({ apiKey: anthropicKey, ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}) })
      : null;
    this.openAiKey = providers.openAiApiKey ?? process.env.OPENAI_API_KEY;
    this.openAiBaseUrl =
      providers.openAiBaseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    this.doFetch = providers.fetchImpl ?? fetch;
  }

  async invoke(args: InvokeLlmArgs): Promise<unknown> {
    const { name, provider } = resolveModel(args.model);
    return provider === 'anthropic'
      ? this.invokeClaude(name, args)
      : this.invokeOpenAi(name, args);
  }

  private async invokeClaude(model: string, args: InvokeLlmArgs): Promise<unknown> {
    if (!this.anthropic) throw new Error('липсва ANTHROPIC_API_KEY');

    const request: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: args.prompt }],
    };
    if (args.system) request.system = args.system;

    // Със схема отговорът е гарантирано валиден JSON и не се налага чистене.
    if (args.response_json_schema) {
      request.output_config = {
        format: { type: 'json_schema', schema: args.response_json_schema },
      };
    }

    const response = await this.anthropic.messages.create(request as never);

    if (response.stop_reason === 'refusal') {
      throw new Error('моделът отказа да отговори на това запитване');
    }

    // Отговорът съдържа и блокове за мислене; взима се само текстът. Четенето
    // на `content[0].text` направо би върнало празно винаги, когато моделът е
    // мислил - тоест почти винаги при adaptive.
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return args.response_json_schema ? parseJsonResponse(text) : text;
  }

  private async invokeOpenAi(model: string, args: InvokeLlmArgs): Promise<unknown> {
    if (!this.openAiKey) throw new Error('липсва OPENAI_API_KEY');

    const messages: Record<string, string>[] = [];
    if (args.system) messages.push({ role: 'system', content: args.system });
    messages.push({ role: 'user', content: args.prompt });

    const body: Record<string, unknown> = { model, messages };
    if (args.response_json_schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'response', schema: args.response_json_schema, strict: false },
      };
    }

    const response = await this.doFetch(`${this.openAiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.openAiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`${model} върна ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? '';

    return args.response_json_schema ? parseJsonResponse(text) : text;
  }
}
