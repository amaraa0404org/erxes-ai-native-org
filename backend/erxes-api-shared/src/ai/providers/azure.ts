/**
 * AzureProvider — concrete `ILLMProvider` wrapping `openai`'s
 * `AzureOpenAI` client. Phase 1.2 Plan 03.
 *
 * Why Azure mostly mirrors OpenAI but with two divergences:
 *
 *   1. The constructor REQUIRES `config.deploymentName` + `config.apiVersion`
 *      (and customarily a `baseUrl` for the Azure resource endpoint). The
 *      Azure URL shape is `${endpoint}/openai/deployments/${deployment}/...`,
 *      which the SDK builds internally — the adapter only needs to pass
 *      the right values.
 *
 *   2. Azure has no clean `/v1/models` listing endpoint that maps cleanly
 *      onto the OpenAI shape (listing in Azure goes via Azure Resource
 *      Manager APIs and requires extra IAM setup that is out of scope for
 *      Plan 03). The pragmatic choice (per Plan 03 spec, D-05) is to
 *      return a SINGLE ModelInfo for the configured `deploymentName`. The
 *      UI surfaces one selectable model; Phase 1.4 documents the trade-off.
 *
 *   3. `testConnection()` cannot rely on `listModels()` (which always
 *      succeeds in this implementation — see #2). Instead it issues a
 *      1-token chat-completion probe (`max_tokens: 1`, `'ping'` body)
 *      against the deployment. Any response (success OR a quota error)
 *      proves auth + endpoint reachability; only auth failure surfaces
 *      `ok: false`.
 *
 * SDK version: `openai@^6.38.0` — `AzureOpenAI` is exported from the same
 * package as `OpenAI`.
 *
 * SECRET DISCIPLINE: Identical to `openai.ts`. The decrypted `apiKey` is
 * never assigned to `this`; every error path is run through `redactKey()`.
 * The `deploymentName` and `baseUrl` (Azure endpoint) are NON-secret config
 * — safe to log if the surrounding context needs it.
 */
import { AzureOpenAI } from 'openai';

import { NotYetImplementedError } from '../errors';
import { redactKey } from '../redaction';
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
} from '../types';
import { ProviderError } from '../types';
import type {
  ILLMProvider,
  ProviderConstructorArgs,
  ProviderTestConnectionResult,
} from './base';

export class AzureProvider implements ILLMProvider {
  private readonly client: AzureOpenAI;
  private readonly providerKind = 'azure' as const;
  // Non-secret config kept on `this` for use in listModels()/testConnection().
  // The apiKey is NOT stored here (P1).
  private readonly deploymentName: string;
  private readonly apiVersion: string;

  constructor(args: ProviderConstructorArgs) {
    const deploymentName = args.config?.deploymentName;
    const apiVersion = args.config?.apiVersion;

    if (!deploymentName || typeof deploymentName !== 'string') {
      throw new Error(
        'AzureProvider: config.deploymentName is required (non-empty string).',
      );
    }
    if (!apiVersion || typeof apiVersion !== 'string') {
      throw new Error(
        'AzureProvider: config.apiVersion is required (non-empty string).',
      );
    }

    this.deploymentName = deploymentName;
    this.apiVersion = apiVersion;

    this.client = new AzureOpenAI({
      apiKey: args.apiKey,
      endpoint: args.baseUrl,
      apiVersion,
      deployment: deploymentName,
    });
    // Drop the `args` reference; `args.apiKey` lives in the SDK's private state only.
  }

  /**
   * Azure has no general `/models` listing endpoint accessible via the SDK
   * client — return the single configured deployment as the only model.
   * The contextWindow is a conservative default (128k); admins can override
   * per-model via the `ai_models` collection in Phase 1.4.
   */
  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: this.deploymentName,
        providerKind: 'azure',
        contextWindow: 128000,
        capabilities: ['chat', 'tools'],
      },
    ];
  }

  async testConnection(): Promise<ProviderTestConnectionResult> {
    const start = nowMs();
    try {
      // 1-token chat probe — proves auth + deployment URL works without
      // burning much quota.
      await this.client.chat.completions.create({
        model: this.deploymentName,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return {
        ok: true,
        latencyMs: nowMs() - start,
        modelsAvailable: 1,
      };
    } catch (rawError: unknown) {
      const sanitized = this.sanitize(rawError, this.deploymentName);
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
        : 'Azure OpenAI request failed';
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

export const createAzureProvider = (
  args: ProviderConstructorArgs,
): ILLMProvider => new AzureProvider(args);

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
