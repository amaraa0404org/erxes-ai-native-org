/**
 * Public surface of `erxes-api-shared/ai`. Named re-exports only (per
 * CONVENTIONS.md import-organization rules); the `types` barrel is the
 * single exception because every consumer of the AI module will pull at
 * least one type from it.
 */

export { createAIClient, AINotEnabledError } from './shim';
export type { AIClient } from './shim';

export { encryptSecret, decryptSecret } from './encryption';
export type { EncryptedEnvelope } from './encryption';
export { ENCRYPTION_ENVELOPE_VERSION } from './encryption';

export * from './errors';

export {
  redactKey,
  redactPii,
  rehydratePii,
  REDACTED_PLACEHOLDER,
} from './redaction';
export type { RedactPiiResult } from './redaction';

export { COST_TABLE, DRIFT_MULTIPLIER, getTiktokenModule } from './tokens';
export type { CostTableEntry, CostTableKey } from './tokens';

export type { ILLMProvider } from './providers/base';
export { PROVIDER_REGISTRY } from './providers/index';

export * from './types';
