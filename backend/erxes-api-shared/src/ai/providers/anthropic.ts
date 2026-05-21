/**
 * AnthropicProvider — concrete `ILLMProvider` for Anthropic's API. Phase 1.2 Plan 03.
 *
 * SDK version: `@anthropic-ai/sdk@^0.97.1` (per Phase 1.2 Plan 01 SUMMARY).
 * That version exposes `client.models.list()` returning a paginated list of
 * `ModelInfo` records — the adapter uses it as the primary path. If a
 * downstream SDK build is older and lacks `models.list`, the adapter falls
 * back to a STATIC table of canonical Claude models so the UI's Provider
 * test-connection flow still has something useful to render.
 *
 * SECRET DISCIPLINE (PITFALLS §P1):
 *   - `args.apiKey` is passed to `new Anthropic({...})` once in the
 *     constructor and is never assigned to `this`. The SDK retains the
 *     key in its own private state.
 *   - The Anthropic SDK's error objects sometimes carry the API key inside
 *     `e.headers['x-api-key']` (used in the failed request). The adapter's
 *     sanitize helper ONLY reads `e.message` and `e.status`/`e.code` — it
 *     never touches `e.headers`, and every textual field is run through
 *     `redactKey()` (which has a dedicated `sk-ant-` pattern that fires
 *     before the generic `sk-` pattern).
 *
 * Phase 1.3 will fill `chat()` and `embed()`. Note: Anthropic does NOT
 * expose an embeddings endpoint — `embed()` will likely surface that as a
 * `ProviderError` in Phase 1.3 rather than calling the SDK. For Plan 03
 * the stub simply throws `NotYetImplementedError('Phase 1.3')` like the
 * other adapters.
 */
import Anthropic from '@anthropic-ai/sdk';

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
 * Static fallback model set. Used when the SDK doesn't expose `models.list`
 * (older 0.x). Source: Anthropic public model docs as of 2026-05-21.
 */
const ANTHROPIC_STATIC_MODELS: readonly ModelInfo[] = Object.freeze([
  {
    id: 'claude-3-5-sonnet-latest',
    providerKind: 'anthropic',
    contextWindow: 200000,
    capabilities: ['chat', 'vision', 'tools'],
  },
  {
    id: 'claude-3-5-haiku-latest',
    providerKind: 'anthropic',
    contextWindow: 200000,
    capabilities: ['chat', 'tools'],
  },
  {
    id: 'claude-3-opus-latest',
    providerKind: 'anthropic',
    contextWindow: 200000,
    capabilities: ['chat', 'vision', 'tools'],
  },
]);

export class AnthropicProvider implements ILLMProvider {
  private readonly client: Anthropic;
  private readonly providerKind = 'anthropic' as const;

  constructor(args: ProviderConstructorArgs) {
    this.client = new Anthropic({
      apiKey: args.apiKey,
      baseURL: args.baseUrl,
    });
    // Drop `args` reference; `args.apiKey` lives in the SDK's private state only.
  }

  /**
   * Try the real `client.models.list()` first. If the SDK doesn't expose
   * it (older 0.x), fall back to the static Claude model set.
   */
  async listModels(): Promise<ModelInfo[]> {
    const maybeList = (this.client as any)?.models?.list;
    if (typeof maybeList !== 'function') {
      // SDK doesn't expose models.list at all — use static fallback.
      return ANTHROPIC_STATIC_MODELS.map(cloneModelInfo);
    }

    let page: any;
    try {
      page = await maybeList.call(this.client.models);
    } catch (e) {
      // The most common runtime cause for the fallback (besides "not a
      // function" caught above) is the SDK feature gate throwing a
      // TypeError. Auth failures bubble up as APIError — those should NOT
      // be swallowed; they propagate so testConnection() can surface them.
      if (e instanceof TypeError) {
        return ANTHROPIC_STATIC_MODELS.map(cloneModelInfo);
      }
      throw e;
    }

    const data = extractListData(page);
    if (!Array.isArray(data) || data.length === 0) {
      return ANTHROPIC_STATIC_MODELS.map(cloneModelInfo);
    }

    return data
      .filter((m: any) => typeof m?.id === 'string')
      .map(deriveModelInfo);
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
   * Sanitize an SDK error into a ProviderError. NEVER reads `e.headers`
   * (which the Anthropic SDK populates with `x-api-key`). Only `message`,
   * `status`/`code` are extracted, and every textual field is run through
   * `redactKey()`.
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
        : 'Anthropic request failed';
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

export const createAnthropicProvider = (
  args: ProviderConstructorArgs,
): ILLMProvider => new AnthropicProvider(args);

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */

const cloneModelInfo = (m: ModelInfo): ModelInfo => ({
  id: m.id,
  providerKind: m.providerKind,
  contextWindow: m.contextWindow,
  capabilities: [...m.capabilities],
});

const extractListData = (page: any): any[] => {
  if (Array.isArray(page?.data)) return page.data;
  if (Array.isArray(page)) return page;
  return [];
};

/**
 * Derive a ModelInfo from a raw Anthropic ModelInfo response. The SDK
 * exposes `max_input_tokens` and a `capabilities` object with feature
 * sub-flags. The adapter normalises this into our compact `ModelCapability`
 * set:
 *
 *   - `chat`   — always present for Claude models
 *   - `tools`  — always present (Anthropic supports tool-use across the line)
 *   - `vision` — only when `capabilities.image_input?.supported === true`
 *   - `embed`  — never (Anthropic has no embeddings endpoint)
 */
const deriveModelInfo = (raw: any): ModelInfo => {
  const id = String(raw.id);
  const contextWindow =
    typeof raw.max_input_tokens === 'number' && raw.max_input_tokens > 0
      ? raw.max_input_tokens
      : 200000;

  const capabilities: ModelCapability[] = ['chat', 'tools'];
  const imageSupported = raw?.capabilities?.image_input?.supported;
  if (imageSupported === true) {
    capabilities.push('vision');
  }

  return {
    id,
    providerKind: 'anthropic',
    contextWindow,
    capabilities,
  };
};

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
