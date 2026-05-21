/**
 * Atomic, race-free Redis token-bucket pre-check + rollback / release.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 * Pattern source: CONTEXT D-02 verbatim (PITFALLS §P2 Option A).
 *
 *   const newSpend = await redis.incrby(key, estimatedCents);
 *   if (newSpend > capCents) {
 *     await redis.decrby(key, estimatedCents);       // rollback
 *     throw new BudgetExceededError({ ... });
 *   }
 *
 * `redis.incrby` is per-key atomic; 100 concurrent invocations against the
 * same bucket cannot both pass an over-cap check (BUDG-04 — Plan 09 ships
 * the integration test that exercises this at 100×).
 *
 * XCUT-08 acceptance gate:
 *   If `monthlyUsdCap === 0` (admin explicitly sets a $0 cap), `capCents == 0`.
 *   Any positive `estimatedCents` (the estimator returns ≥ 1¢ for non-empty
 *   input) yields `newSpend == estimatedCents > 0 > 0 = capCents`, so the
 *   first chargeable call throws `BudgetExceededError`. Test 7 in
 *   `budgets-module.test.ts` proves this.
 *
 * `releaseBudget` is called by Phase 1.3 when the provider call throws —
 * the bucket was incremented at pre-check but no spend occurred, so we
 * `decrby` to release the reservation. Documented edge case: if the
 * bucket key's TTL expired between check and release (extremely unlikely
 * — TTL is `secondsToEndOfMonth`, typically days/weeks of headroom),
 * `decrby` on a missing key creates a negative value. This is bounded
 * (the next reconcile or next month's reset clears it) and observable in
 * logs if it occurs. If practice shows this happens, switch to a Lua
 * script that `decrby`s only if the key exists.
 */
import { redis } from 'erxes-api-shared/utils';
import { BudgetExceededError } from 'erxes-api-shared/ai';

import { IModels } from '~/connectionResolvers';

import {
  bucketKey,
  emitThresholdCrossed,
  monthlyKey,
  secondsToEndOfMonth,
} from './service';
import { BudgetScope } from './types';

export interface CheckBudgetArgs {
  subdomain: string;
  scope: BudgetScope;
  scopeId: string;
  estimatedCents: number;
  models: IModels;
}

export interface CheckBudgetResult {
  reservedCents: number;
  currentSpend: number;
  cap: number;
}

/**
 * Atomically reserve `estimatedCents` against the per-scope per-month
 * Redis bucket and throw `BudgetExceededError` if that would push spend
 * past the cap (rolling back the reservation first).
 *
 * Returns the reservation receipt — Phase 1.3 stores `reservedCents` so it
 * can compute `delta = actualCents - reservedCents` and call
 * `reconcileBudget` post-LLM-call.
 */
export const checkBudget = async (
  args: CheckBudgetArgs,
): Promise<CheckBudgetResult> => {
  const { subdomain, scope, scopeId, estimatedCents, models } = args;
  const monthKey = monthlyKey();

  // Resolve cap from MongoDB. Absence = "no cap configured for this scope
  // this month" — treated as unlimited. BUDG-01 says admins SET the cap;
  // $0 is an explicit cap (the XCUT-08 path) and lives in the row, not in
  // the absence of one. The `AI_BUDGET_DEFAULT_USD` env-driven fallback
  // chain lives in Phase 1.3 (scope-resolution: user → team → workspace).
  const budget = await models.AiBudgets.getBudget(scope, scopeId, monthKey);
  if (!budget) {
    return {
      reservedCents: 0,
      currentSpend: 0,
      cap: Number.POSITIVE_INFINITY,
    };
  }

  const capCents = Math.round(budget.monthlyUsdCap * 100);
  const key = bucketKey({ subdomain, scope, scopeId, monthKey });

  // Atomic reservation. Returns the post-increment value.
  const newSpend = await redis.incrby(key, estimatedCents);

  // On first reservation this month, attach TTL so the key auto-expires
  // when the month rolls over (D-02). Detect "first reservation" by the
  // post-increment value matching the increment exactly.
  if (newSpend === estimatedCents) {
    await redis.expire(key, secondsToEndOfMonth());
  }

  if (newSpend > capCents) {
    // Roll back the reservation BEFORE throwing — the over-cap reservation
    // must not persist in the bucket.
    await redis.decrby(key, estimatedCents);
    throw new BudgetExceededError({
      scope,
      scopeId,
      currentSpend: newSpend - estimatedCents, // value BEFORE this reservation
      cap: capCents,
      suggestionUrl: `/settings/ai/budgets?scope=${scope}&scopeId=${encodeURIComponent(
        scopeId,
      )}`,
    });
  }

  // Fire-and-forget threshold emission. Must NOT be awaited — the
  // pre-check is on the critical path of every chargeable call, and
  // pubsub round-trips would add latency to every within-budget call.
  // Any error is logged but never propagated; threshold emissions are
  // best-effort and the budget enforcement itself is unaffected.
  void emitThresholdCrossed({
    subdomain,
    scope,
    scopeId,
    currentSpend: newSpend,
    previousSpend: newSpend - estimatedCents,
    cap: capCents,
    alertThresholds: budget.alertThresholds ?? [0.8],
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(
      `emitThresholdCrossed failed for ${scope}:${scopeId}:`,
      e instanceof Error ? e.message : 'unknown',
    );
  });

  return {
    reservedCents: estimatedCents,
    currentSpend: newSpend,
    cap: capCents,
  };
};

export interface ReleaseBudgetArgs {
  subdomain: string;
  scope: BudgetScope;
  scopeId: string;
  estimatedCents: number;
}

/**
 * Release a previously-checked reservation on provider failure.
 *
 * Called by Phase 1.3 when `provider.chat()` / `embed()` throws after a
 * successful `checkBudget`. Does NOT throw — release path must never
 * mask the original provider error.
 */
export const releaseBudget = async (
  args: ReleaseBudgetArgs,
): Promise<void> => {
  if (args.estimatedCents <= 0) return;
  await redis.decrby(
    bucketKey({
      subdomain: args.subdomain,
      scope: args.scope,
      scopeId: args.scopeId,
    }),
    args.estimatedCents,
  );
};
