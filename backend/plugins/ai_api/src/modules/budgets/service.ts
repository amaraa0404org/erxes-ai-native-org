/**
 * Budgets module — Redis-side helpers.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 *
 * Owns:
 *   - `monthlyKey(date?)`           : UTC-safe `yyyyMM` bucket key
 *   - `secondsToEndOfMonth(date?)`  : TTL for the bucket key (auto-expire on
 *                                     month rollover)
 *   - `bucketKey(args)`             : full Redis key for the spend bucket
 *   - `thresholdFiredKey(args)`     : Redis SET key suppressing duplicate
 *                                     threshold emissions per month
 *   - `thresholdChannel(args)`      : pubsub channel for crossings
 *   - `getCurrentSpendCents(args)`  : read live Redis spend (cents)
 *   - `reconcileBudget(args)`       : apply (actual - estimated) delta after
 *                                     the LLM call returns
 *   - `emitThresholdCrossed(args)`  : fire-and-forget pubsub on first crossing
 *
 * Pattern source: PITFALLS §P2 (Option A — Redis token bucket); CONTEXT D-02
 * (key format + reconcile semantics); D-02c (alert threshold pubsub).
 *
 * Every key is per-`subdomain` for hard tenant isolation (project constraint).
 * Date math uses UTC so timezone skew cannot flip the bucket key around
 * midnight.
 */
import { redis } from 'erxes-api-shared/utils';

import { BudgetScope } from './types';

export type { BudgetScope } from './types';

/** `yyyyMM`, e.g. `'202605'` for May 2026. UTC-anchored. */
export const monthlyKey = (date: Date = new Date()): string => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}${mm}`;
};

/**
 * Seconds until 00:00 UTC on the first of the NEXT month. Used as the
 * Redis bucket TTL — when the month rolls over, every per-month key
 * expires automatically (D-02 pattern).
 */
export const secondsToEndOfMonth = (date: Date = new Date()): number => {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  return Math.ceil((next.getTime() - date.getTime()) / 1000);
};

export interface ScopeKeyArgs {
  subdomain: string;
  scope: BudgetScope;
  scopeId: string;
  monthKey?: string;
}

/**
 * Per-month per-scope spend bucket key. Format (D-02):
 *   `ai:budget:{subdomain}:{scope}:{scopeId}:{yyyyMM}`
 */
export const bucketKey = (args: ScopeKeyArgs): string =>
  `ai:budget:${args.subdomain}:${args.scope}:${args.scopeId}:${
    args.monthKey ?? monthlyKey()
  }`;

/**
 * Redis SET key whose members are the threshold fractions already
 * announced this month. Atomic `SADD` against this set is what
 * suppresses duplicate threshold emissions across concurrent calls.
 */
export const thresholdFiredKey = (args: ScopeKeyArgs): string =>
  `ai:budget:threshold:fired:${args.subdomain}:${args.scope}:${
    args.scopeId
  }:${args.monthKey ?? monthlyKey()}`;

/** Pubsub channel for threshold-crossing events (D-02c). */
export const thresholdChannel = (
  args: Omit<ScopeKeyArgs, 'monthKey'>,
): string =>
  `ai:budget:threshold:${args.subdomain}:${args.scope}:${args.scopeId}`;

/** Current live spend in cents. Missing key reads as 0. */
export const getCurrentSpendCents = async (
  args: Omit<ScopeKeyArgs, 'monthKey'>,
): Promise<number> => {
  const v = await redis.get(bucketKey(args));
  return Number(v) || 0;
};

export interface ReconcileBudgetArgs {
  subdomain: string;
  scope: BudgetScope;
  scopeId: string;
  estimatedCents: number;
  actualCents: number;
}

/**
 * After the LLM call returns, converge the bucket to reality:
 *
 *   delta = actualCents - estimatedCents
 *   if delta != 0 → redis.incrby(key, delta)   // can be negative
 *   redis.expire(key, secondsToEndOfMonth())   // refresh TTL
 *
 * BUDG-03. Called by Phase 1.3 from the LLM call site post-response.
 */
export const reconcileBudget = async (
  args: ReconcileBudgetArgs,
): Promise<void> => {
  const k = bucketKey({
    subdomain: args.subdomain,
    scope: args.scope,
    scopeId: args.scopeId,
  });
  const delta = args.actualCents - args.estimatedCents;
  if (delta !== 0) {
    await redis.incrby(k, delta);
  }
  await redis.expire(k, secondsToEndOfMonth());
};

export interface EmitThresholdCrossedArgs {
  subdomain: string;
  scope: BudgetScope;
  scopeId: string;
  currentSpend: number; // cents — value AFTER reservation
  previousSpend: number; // cents — value BEFORE reservation
  cap: number; // cents
  alertThresholds: number[]; // fractions in [0, 1]
}

/**
 * Fire-and-forget pubsub on first crossing of each configured threshold.
 *
 * `crossed` is true iff this reservation pushed the spend across the
 * threshold boundary (previousSpend/cap < T ≤ currentSpend/cap).
 *
 * To guarantee at-most-once-per-month per threshold under concurrency,
 * `SADD` is the gate: the return value is `1` for newly-added members,
 * `0` for already-present. Only the agent whose SADD returns 1 publishes
 * the pubsub event.
 *
 * Best-effort — callers should NOT await this in any latency-sensitive
 * critical path; see check.ts where it's invoked with `void ... .catch()`.
 */
export const emitThresholdCrossed = async (
  args: EmitThresholdCrossedArgs,
): Promise<void> => {
  const {
    subdomain,
    scope,
    scopeId,
    currentSpend,
    previousSpend,
    cap,
    alertThresholds,
  } = args;

  // Guard: $0 cap is XCUT-08 (the pre-check will already have thrown
  // BudgetExceededError) — there is no threshold to cross.
  if (cap <= 0) return;
  if (!alertThresholds || alertThresholds.length === 0) return;

  const firedSetKey = thresholdFiredKey({ subdomain, scope, scopeId });
  const channel = thresholdChannel({ subdomain, scope, scopeId });
  const mk = monthlyKey();
  const emittedAt = new Date().toISOString();

  for (const t of alertThresholds) {
    const beforeFraction = previousSpend / cap;
    const afterFraction = currentSpend / cap;
    const crossed = beforeFraction < t && afterFraction >= t;
    if (!crossed) continue;

    // SADD returns 1 if the member was newly added, 0 if it already
    // existed in the set. The atomicity of SADD is what makes this
    // safe under concurrent crossings.
    const added = await redis.sadd(firedSetKey, String(t));
    if (added === 1) {
      const payload = JSON.stringify({
        threshold: t,
        currentSpend,
        cap,
        monthlyKey: mk,
        emittedAt,
      });
      await redis.publish(channel, payload);
    }
  }

  // Refresh TTL so the suppression set rolls over with the month.
  await redis.expire(firedSetKey, secondsToEndOfMonth());
};
