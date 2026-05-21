/**
 * Provider registry barrel. Phase 1.1 ships an EMPTY registry — Phase 1.2
 * populates it with concrete adapters keyed by `ProviderKind`.
 *
 * Consumers should look up an adapter as:
 *   const factory = PROVIDER_REGISTRY[kind];
 *   if (!factory) throw new Error(`provider not implemented: ${kind}`);
 *   const adapter = factory();
 */
import type { ProviderKind } from '../types';
import type { ILLMProvider } from './base';

export type { ILLMProvider } from './base';

export const PROVIDER_REGISTRY: Partial<
  Record<ProviderKind, () => ILLMProvider>
> = {};
