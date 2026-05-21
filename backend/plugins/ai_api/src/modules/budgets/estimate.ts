/**
 * Pre-call cost estimator.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 *
 * Mitigates PITFALLS §P7 (tokenizer drift) and §P8 (tool-definition
 * overhead).
 *
 * Input is a triple `(inputTokens, toolDefsOverheadTokens, expectedOutputTokens)`.
 * Cost = ((in+overhead)/1M × inputUSD + expectedOut/1M × outputUSD) × drift × 100¢,
 * with `Math.ceil` for the final integer-cents result so the bucket pre-check
 * never under-reserves. Unknown models fall back to a conservative default
 * (5 USD / 15 USD per 1M for in/out) — over-estimation here is fine because
 * `reconcileBudget` converges the bucket to actual spend after the call.
 *
 * `expectedOutputTokens` defaults to 1024. Phase 1.3 sets this per-call from
 * `maxOutputTokens` on the chat request when known.
 */
import { COST_TABLE, DRIFT_MULTIPLIER } from 'erxes-api-shared/ai';
import type { CostTableKey } from 'erxes-api-shared/ai';
import type { ProviderKind } from 'erxes-api-shared/ai';

export interface EstimateInput {
  providerKind: ProviderKind;
  model: string;
  inputTokens: number;
  /** P8 — sum of token counts across registered tool JSON Schemas. */
  toolDefsOverheadTokens?: number;
  /** Defaults to 1024. Phase 1.3 sets this from the chat request. */
  expectedOutputTokens?: number;
}

/** Fallback per-1M USD pricing for unknown models. */
const DEFAULT_INPUT_USD_PER_1M = 5.0;
const DEFAULT_OUTPUT_USD_PER_1M = 15.0;
/** Conservative drift for an unrecognised provider kind (defensive). */
const FALLBACK_DRIFT = 1.2;

export const estimateCostCents = (input: EstimateInput): number => {
  const {
    providerKind,
    model,
    inputTokens,
    toolDefsOverheadTokens = 0,
    expectedOutputTokens = 1024,
  } = input;

  const drift = DRIFT_MULTIPLIER[providerKind] ?? FALLBACK_DRIFT;

  const key = `${providerKind}:${model}` as CostTableKey;
  const entry = COST_TABLE[key];

  const inUsdPer1M = entry?.inputCostPer1M ?? DEFAULT_INPUT_USD_PER_1M;
  const outUsdPer1M = entry?.outputCostPer1M ?? DEFAULT_OUTPUT_USD_PER_1M;

  // USD/1M → cents/token = (usdPer1M / 1_000_000) * 100 = usdPer1M / 10_000.
  // Multiply through by drift, sum, ceil to integer cents.
  const inCents =
    ((inputTokens + toolDefsOverheadTokens) / 1_000_000) * 100 * inUsdPer1M * drift;
  const outCents = (expectedOutputTokens / 1_000_000) * 100 * outUsdPer1M * drift;

  return Math.ceil(inCents + outCents);
};
