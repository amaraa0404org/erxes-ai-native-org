/**
 * Budgets GraphQL/tRPC mutation resolvers.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 * Plan 08 wires these into the Apollo subgraph + tRPC router.
 *
 * Implements BUDG-01:
 *   - `aiBudgetsSet`: idempotent upsert of `(scope, scopeId, monthlyKey)`
 *     row. Compound unique index on the model side guarantees re-setting
 *     the same month overwrites cap + thresholds.
 *   - `aiBudgetsRemove`: delete by `_id`.
 *
 * `aiBudgetsSet` returns the upserted row augmented with `currentMonthSpend`
 * read live from Redis — the MongoDB column is the cap definition; the
 * Redis bucket is the live spend counter (D-02). UI shows the live value.
 */
import { Resolver } from 'erxes-api-shared/core-types';

import { IContext } from '~/connectionResolvers';

import { getCurrentSpendCents, monthlyKey } from './service';
import { aiBudgetsSetInputSchema } from './types';

export const budgetMutations: Record<string, Resolver> = {
  /** BUDG-01 — upsert a per-scope per-month cap definition. */
  async aiBudgetsSet(_root, args, ctx: IContext) {
    await ctx.checkPermission('aiBudgetsSet');
    const parsed = aiBudgetsSetInputSchema.parse(args);

    const monthKey = monthlyKey();
    const row = await ctx.models.AiBudgets.setBudget({
      scope: parsed.scope,
      scopeId: parsed.scopeId,
      monthlyKey: monthKey,
      monthlyUsdCap: parsed.monthlyUsdCap,
      alertThresholds: parsed.alertThresholds,
      createdBy: ctx.user?._id,
    });

    const liveSpend = await getCurrentSpendCents({
      subdomain: ctx.subdomain,
      scope: parsed.scope,
      scopeId: parsed.scopeId,
    });

    const base =
      typeof (row as { toObject?: () => unknown }).toObject === 'function'
        ? (row as { toObject: () => Record<string, unknown> }).toObject()
        : (row as unknown as Record<string, unknown>);

    return { ...base, currentMonthSpend: liveSpend };
  },

  async aiBudgetsRemove(_root, { _id }: { _id: string }, ctx: IContext) {
    await ctx.checkPermission('aiBudgetsRemove');
    await ctx.models.AiBudgets.removeBudget(_id);
    return { ok: 1 };
  },
};
