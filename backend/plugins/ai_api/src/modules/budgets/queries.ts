/**
 * Budgets GraphQL/tRPC query resolvers.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 * Plan 08 wires these into the Apollo subgraph + tRPC router.
 *
 * BUDG-06 — UI shows `currentMonthSpend` for each budget row. The MongoDB
 * column on `ai_budgets` is nightly-reconciled by Phase 1.3 from the
 * `ai_invocations` aggregate; in-month the source of truth is the Redis
 * bucket. These resolvers augment each row with the live Redis value so
 * the UI always sees fresh spend data.
 */
import { Resolver } from 'erxes-api-shared/core-types';

import { IContext } from '~/connectionResolvers';

import { getCurrentSpendCents } from './service';
import { BudgetScope } from './types';

interface AugmentedRow {
  [key: string]: unknown;
  currentMonthSpend: number;
}

const augmentWithLiveSpend = async (
  row: { scope: BudgetScope; scopeId: string } & Record<string, unknown> & {
      toObject?: () => Record<string, unknown>;
    },
  subdomain: string,
): Promise<AugmentedRow> => {
  const live = await getCurrentSpendCents({
    subdomain,
    scope: row.scope,
    scopeId: row.scopeId,
  });
  const base =
    typeof row.toObject === 'function' ? row.toObject() : { ...row };
  return { ...base, currentMonthSpend: live } as AugmentedRow;
};

export const budgetQueries: Record<string, Resolver> = {
  /** List all budget rows (optionally filtered by scope) with live spend. */
  async aiBudgets(
    _root,
    { scope }: { scope?: BudgetScope },
    ctx: IContext,
  ) {
    await ctx.checkPermission('aiBudgetsView');
    const rows = await ctx.models.AiBudgets.listBudgets(scope);
    return Promise.all(
      rows.map((r) =>
        augmentWithLiveSpend(
          r as unknown as { scope: BudgetScope; scopeId: string } & Record<
            string,
            unknown
          >,
          ctx.subdomain,
        ),
      ),
    );
  },

  /** Single budget row with live spend. */
  async aiBudget(_root, { _id }: { _id: string }, ctx: IContext) {
    await ctx.checkPermission('aiBudgetsView');
    const row = await ctx.models.AiBudgets.findOne({ _id });
    if (!row) return null;
    return augmentWithLiveSpend(
      row as unknown as { scope: BudgetScope; scopeId: string } & Record<
        string,
        unknown
      >,
      ctx.subdomain,
    );
  },
};
