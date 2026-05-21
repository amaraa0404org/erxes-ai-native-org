/**
 * Provider registry barrel. Phase 1.1 shipped an empty registry — Phase 1.2
 * Plan 03 (this file's edit) populates it with the OpenAI-family adapters:
 * `openai`, `anthropic`, `azure`. Plan 04 will append `google`, `ollama`,
 * `custom`.
 *
 * IMPORTANT — signature change vs Phase 1.1:
 *   Phase 1.1 typed entries as `() => ILLMProvider` (factories with no args).
 *   Phase 1.2 needs decrypted credentials at construction time, so every
 *   factory now takes `ProviderConstructorArgs`. The Phase 1.1
 *   `surface.test.ts` assertion ("PROVIDER_REGISTRY exposes an empty
 *   Partial<Record<...>>") is updated minimally in Plan 03 to assert the
 *   3 populated entries instead.
 *
 * Consumers (Plan 05 `aiProvidersTest` resolver, Phase 1.3 chat/embed):
 *
 *   const factory = PROVIDER_REGISTRY[kind];
 *   if (!factory) throw new Error(`provider not implemented: ${kind}`);
 *   const adapter = factory({ apiKey, baseUrl, subdomain, config });
 *   // adapter.testConnection() if `'testConnection' in adapter` (duck-type;
 *   // testConnection lives on the concrete class, not on ILLMProvider).
 */
import type { ProviderKind } from '../types';
import { createAnthropicProvider } from './anthropic';
import { createAzureProvider } from './azure';
import type { ILLMProvider, ProviderConstructorArgs } from './base';
import { createOpenAIProvider } from './openai';

export type {
  ILLMProvider,
  ProviderConstructorArgs,
  ProviderTestConnectionResult,
} from './base';

// Plan 03 populates: openai, anthropic, azure.
// Plan 04 will append: google, ollama, custom.
export const PROVIDER_REGISTRY: Partial<
  Record<ProviderKind, (args: ProviderConstructorArgs) => ILLMProvider>
> = {
  openai: createOpenAIProvider, // Plan 03
  anthropic: createAnthropicProvider, // Plan 03
  azure: createAzureProvider, // Plan 03
  // google: <Plan 04>,
  // ollama: <Plan 04>,
  // custom: <Plan 04>,
};
