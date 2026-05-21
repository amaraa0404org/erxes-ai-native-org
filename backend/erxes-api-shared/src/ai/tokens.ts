/**
 * Static token cost + drift tables.
 *
 * `COST_TABLE` is keyed by `${providerKind}:${modelId}` and carries
 * `inputCostPer1M`, `outputCostPer1M`, `contextWindow`, and a list of
 * `capabilities`. Phase 1.1 seeds the table for the canonical model set;
 * Phase 1.3's `ai_models` collection lets admins override per-model.
 *
 * `DRIFT_MULTIPLIER` is the upper-bound budget pre-check fudge factor per
 * `ProviderKind` for providers whose tokenizers we approximate (PITFALLS
 * §P7). The actual billing source-of-truth is always the provider's
 * `response.usage`; the multiplier is only used for `< budget` pre-checks
 * before the network call.
 *
 * `tiktoken` is loaded lazily and only outside the test environment so
 * unit tests do not pay the ~50ms WASM cold-start cost. The lazy import
 * is exposed via `getTiktokenEncoder()` for Phase 1.2+ adapters.
 */
import type { ProviderKind, ModelCapability } from './types';

export interface CostTableEntry {
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  capabilities: ModelCapability[];
}

export type CostTableKey = `${ProviderKind}:${string}`;

/**
 * Seed cost table. Values mirror the public provider pricing pages as of
 * 2026-05-21. Admins may override per-model via the `ai_models` collection
 * (Phase 1.3); this static table is the fallback.
 */
export const COST_TABLE: Record<CostTableKey, CostTableEntry> = {
  'openai:gpt-4o': {
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    contextWindow: 128_000,
    capabilities: ['chat', 'vision', 'tools'],
  },
  'openai:gpt-4o-mini': {
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    contextWindow: 128_000,
    capabilities: ['chat', 'vision', 'tools'],
  },
  'openai:text-embedding-3-small': {
    inputCostPer1M: 0.02,
    outputCostPer1M: 0,
    contextWindow: 8_191,
    capabilities: ['embed'],
  },
  'anthropic:claude-3-5-sonnet-latest': {
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200_000,
    capabilities: ['chat', 'vision', 'tools'],
  },
  'google:gemini-1.5-pro': {
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    contextWindow: 2_000_000,
    capabilities: ['chat', 'vision', 'tools'],
  },
};

/**
 * Per-provider upper-bound multiplier for budget pre-checks where the
 * tokenizer is an approximation. Source of truth: PITFALLS §P7.
 *
 * - openai / azure: tiktoken is exact → 1.00
 * - anthropic: `@anthropic-ai/tokenizer` is an approximation → 1.15
 * - google: no JS tokenizer ships → chars/4 fallback → 1.10
 * - ollama: hits OpenAI-compat path via tiktoken but model varies → 1.10
 * - custom: unknown tokenizer family → conservative 1.20
 */
export const DRIFT_MULTIPLIER: Record<ProviderKind, number> = {
  openai: 1.0,
  azure: 1.0,
  anthropic: 1.15,
  google: 1.1,
  ollama: 1.1,
  custom: 1.2,
};

/* ------------------------------------------------------------------ */
/* Lazy tiktoken encoder accessor                                      */
/* ------------------------------------------------------------------ */

let _tiktokenModule: unknown = null;
let _tiktokenLoadAttempted = false;

/**
 * Return the lazily-loaded `tiktoken` module. Skipped under
 * `NODE_ENV=test` so jest does not pay the WASM cold-start cost. Returns
 * `null` if the package is not available or import failed.
 *
 * Phase 1.2+ adapters call this from `chat()` / `embed()` to pre-count
 * tokens for budget pre-checks. Actual billing always uses
 * `response.usage`.
 */
export const getTiktokenModule = (): unknown => {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  if (_tiktokenLoadAttempted) {
    return _tiktokenModule;
  }
  _tiktokenLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _tiktokenModule = require('tiktoken');
  } catch (_e) {
    _tiktokenModule = null;
  }
  return _tiktokenModule;
};
