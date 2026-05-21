/**
 * Provider interface contract. Phase 1.1 shipped ONLY the interface; Phase
 * 1.2 (this file's edit) adds the `ProviderConstructorArgs` shape that
 * concrete adapters (`openai.ts`, `anthropic.ts`, `azure.ts`, ...) accept.
 *
 * The `ILLMProvider` interface itself is intentionally untouched — Phase 1.3
 * will drop in real `chat()` / `embed()` implementations without changing
 * the signature. `testConnection()` lives on the concrete adapter class
 * (not on the interface) so callers use a duck-type check
 * (`'testConnection' in provider`) when invoking it.
 */
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
} from '../types';

export interface ILLMProvider {
  /**
   * Stream-capable chat completion. Phase 1.2 wires OpenAI/Anthropic/
   * Google adapters; streaming surface lands alongside.
   */
  chat(req: ChatRequest): Promise<ChatResponse>;

  /**
   * Embedding generation. Single string or batch.
   */
  embed(req: EmbedRequest): Promise<EmbedResponse>;

  /**
   * List the models this provider/adapter supports for the current
   * subdomain's encrypted credential. Used by the Settings UI's Provider
   * test-connection flow (Phase 1.4).
   */
  listModels(): Promise<ModelInfo[]>;
}

/**
 * Result returned by every concrete adapter's `testConnection()` method.
 * Lives on the class, not on `ILLMProvider`, so the interface stays stable
 * for Phase 1.3 (which only adds real chat/embed bodies).
 *
 * `errorCode` is always sanitized (no API key substring) — adapters route
 * raw SDK errors through `redactKey()` before populating this field.
 */
export interface ProviderTestConnectionResult {
  ok: boolean;
  latencyMs: number;
  modelsAvailable: number;
  errorCode?: string;
}

/**
 * Common argument shape every adapter constructor accepts. The decrypted
 * `apiKey` enters the adapter ONLY through this object and must be passed
 * straight to the vendor SDK; it is never assigned to `this` (PITFALLS §P1).
 *
 * - `baseUrl`   — used by Ollama / custom OpenAI-compatible endpoints, and
 *                  by Azure (Azure's `endpoint` maps onto `baseUrl`).
 * - `subdomain` — diagnostics only (audit log, error context); never logged
 *                  alongside the key.
 * - `config.deploymentName` + `config.apiVersion` — Azure-required; ignored
 *                  by other adapters.
 */
export interface ProviderConstructorArgs {
  apiKey: string;
  baseUrl?: string;
  subdomain: string;
  config?: {
    deploymentName?: string;
    apiVersion?: string;
  };
}
