/**
 * Provider interface contract. Phase 1.1 ships ONLY the interface and the
 * supporting type aliases — concrete adapters (`openai.ts`, `anthropic.ts`,
 * `google.ts`, etc.) land in Phase 1.2 alongside the pinned provider SDKs.
 *
 * No file in `src/ai/` may `import` a real provider SDK in Phase 1.1; this
 * keeps the shared module installable with zero vendor dependencies.
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
