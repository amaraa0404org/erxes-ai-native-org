/**
 * Budgets module — barrel.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 *
 * Plan 08 imports from here to wire the resolvers into the Apollo subgraph
 * + tRPC router. Phase 1.3 imports `checkBudget`, `releaseBudget`, and
 * `reconcileBudget` to gate every chargeable LLM call. The estimator is
 * shared between Plan 09's integration test and Phase 1.3's call site.
 */

export { estimateCostCents } from './estimate';
export type { EstimateInput } from './estimate';

export {
  bucketKey,
  emitThresholdCrossed,
  getCurrentSpendCents,
  monthlyKey,
  reconcileBudget,
  secondsToEndOfMonth,
  thresholdChannel,
  thresholdFiredKey,
} from './service';
export type {
  BudgetScope,
  EmitThresholdCrossedArgs,
  ReconcileBudgetArgs,
  ScopeKeyArgs,
} from './service';

export { checkBudget, releaseBudget } from './check';
export type {
  CheckBudgetArgs,
  CheckBudgetResult,
  ReleaseBudgetArgs,
} from './check';

export { budgetMutations } from './mutations';
export { budgetQueries } from './queries';

export {
  aiBudgetsSetInputSchema,
  BudgetScopeSchema,
} from './types';
export type { AiBudgetsSetInput } from './types';
