/**
 * OpenAIProvider — concrete `ILLMProvider` for OpenAI's API.
 *
 * Phase 1.2 (this file) ships:
 *   - `listModels()`  → real, calls `client.models.list()` and maps to ModelInfo[]
 *   - `testConnection()` → real, wraps listModels() in a latency timer
 *   - `chat()`/`embed()` → STUB throwing NotYetImplementedError('Phase 1.3')
 *
 * SDK version: `openai@^6.38.0` (per Phase 1.2 Plan 01 SUMMARY — pinned). The
 * `models.list()` resource exposes the canonical `/v1/models` endpoint.
 *
 * Capability heuristic table (sourced from OpenAI public model docs as of
 * 2026-05-21). The heuristic lives in this module — NOT in `tokens.ts`'s
 * COST_TABLE — because COST_TABLE is a per-(provider, model) cost lookup
 * while this is a per-(model-prefix) ModelInfo shape derivation that runs
 * against arbitrary models returned by the provider (including fine-tuned
 * variants the cost table does not know about).
 *
 * SECRET DISCIPLINE (PITFALLS §P1):
 *   - The decrypted `apiKey` is passed to `new OpenAI({...})` inside the
 *     constructor and is NEVER assigned to `this`. The SDK retains the key
 *     in its own private state; this adapter cannot reflect it back.
 *   - Every catch path runs `redactKey()` over the message and wraps with
 *     `ProviderError` before exposing it as `errorCode` on testConnection.
 *
 * Phase 1.3 will fill `chat()` and `embed()`; the constructor signature and
 * `listModels()`/`testConnection()` semantics will NOT change.
 */
import OpenAI from 'openai';

import { NotYetImplementedError } from '../errors';
import { redactKey } from '../redaction';
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelCapability,
  ModelInfo,
} from '../types';
import { ProviderError } from '../types';
import type {
  ILLMProvider,
  ProviderConstructorArgs,
  ProviderTestConnectionResult,
} from './base';

/**
 * Per-(model-prefix) ModelInfo seed. Source: OpenAI public model docs as of
 * 2026-05-21. Order matters: the first matching prefix wins, so put
 * narrower prefixes (`'gpt-4o'`) before broader ones (`'gpt-4'`).
 */
interface ModelHeuristic {
  prefix: string;
  contextWindow: number;
  capabilities: ModelCapability[];
}

const OPENAI_MODEL_HEURISTICS: readonly ModelHeuristic[] = Object.freeze([
  { prefix: 'gpt-4o', contextWindow: 128000, capabilities: ['chat', 'vision', 'tools'] },
  { prefix: 'gpt-4', contextWindow: 128000, capabilities: ['chat', 'tools'] },
  { prefix: 'gpt-3.5', contextWindow: 16385, capabilities: ['chat', 'tools'] },
  { prefix: 'text-embedding-3', contextWindow: 8191, capabilities: ['embed'] },
  { prefix: 'text-embedding-ada', contextWindow: 8191, capabilities: ['embed'] },
  { prefix: 'o1-', contextWindow: 128000, capabilities: ['chat'] },
  { prefix: 'o3-', contextWindow: 128000, capabilities: ['chat'] },
]);

const DEFAULT_HEURISTIC: Omit<ModelHeuristic, 'prefix'> = {
  contextWindow: 4096,
  capabilities: ['chat'],
};

const deriveModelInfo = (id: string): ModelInfo => {
  const match = OPENAI_MODEL_HEURISTICS.find((h) => id.startsWith(h.prefix));
  const seed = match ?? DEFAULT_HEURISTIC;
  return {
    id,
    providerKind: 'openai',
    contextWindow: seed.contextWindow,
    // Copy the array so caller mutations cannot leak into the frozen seed.
    capabilities: [...seed.capabilities],
  };
};

export class OpenAIProvider implements ILLMProvider {
  // PITFALLS §P1: apiKey not stored on `this`; SDK retains it inside its
  // own private state. Only the client reference is held by the adapter.
  private readonly client: OpenAI;
  private readonly providerKind = 'openai' as const;

  constructor(args: ProviderConstructorArgs) {
    this.client = new OpenAI({
      apiKey: args.apiKey,
      baseURL: args.baseUrl,
    });
    // Intentionally drop `args` reference here. `args.apiKey` lives in the
    // SDK's private state only.
  }

  async listModels(): Promise<ModelInfo[]> {
    const page = await this.client.models.list();
    const data = extractListData(page);
    return data
      .filter((m: any) => typeof m?.id === 'string')
      .map((m: any) => deriveModelInfo(m.id));
  }

  async testConnection(): Promise<ProviderTestConnectionResult> {
    const start = nowMs();
    try {
      const models = await this.listModels();
      return {
        ok: true,
        latencyMs: nowMs() - start,
        modelsAvailable: models.length,
      };
    } catch (rawError: unknown) {
      const sanitized = this.sanitize(rawError, '<none>');
      return {
        ok: false,
        latencyMs: nowMs() - start,
        modelsAvailable: 0,
        errorCode: sanitized.code ?? sanitized.message,
      };
    }
  }

  async chat(_req: ChatRequest): Promise<ChatResponse> {
    throw new NotYetImplementedError({ phase: 'Phase 1.3' });
  }

  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    throw new NotYetImplementedError({ phase: 'Phase 1.3' });
  }

  /**
   * Normalise an SDK error into a sanitized ProviderError. NEVER returns
   * the raw key; every textual field is run through `redactKey()`.
   */
  private sanitize(e: unknown, model: string): ProviderError {
    const status =
      typeof (e as any)?.status === 'number'
        ? (e as any).status
        : undefined;
    const rawCode = (e as any)?.error?.code ?? (e as any)?.code;
    const code =
      typeof rawCode === 'string' ? redactKey(rawCode) : undefined;
    const rawMessage =
      typeof (e as any)?.message === 'string'
        ? (e as any).message
        : 'OpenAI request failed';
    const message = redactKey(rawMessage);
    return new ProviderError({
      providerKind: this.providerKind,
      model,
      statusCode: status,
      code,
      message,
    });
  }
}

export const createOpenAIProvider = (
  args: ProviderConstructorArgs,
): ILLMProvider => new OpenAIProvider(args);

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */

/**
 * Extract the `.data` array from a PagePromise/Page response or a plain
 * `{ data: [...] }` mock. The OpenAI SDK's PagePromise is async-iterable but
 * also exposes `.data` synchronously once awaited (because the awaited
 * result IS the page object). Mocks in tests pass `{ data: [...] }` directly.
 */
const extractListData = (page: any): any[] => {
  if (Array.isArray(page?.data)) return page.data;
  if (Array.isArray(page)) return page;
  return [];
};

/**
 * Use the high-resolution monotonic clock when available. Falls back to
 * `Date.now()` so tests on environments without `performance` still work.
 */
const nowMs = (): number => {
  try {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      return performance.now();
    }
  } catch (_e) {
    // ignore — fall through to Date.now
  }
  return Date.now();
};
