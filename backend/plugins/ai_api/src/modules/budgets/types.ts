/**
 * Zod input schemas + canonical TypeScript aliases for the budgets module.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 *
 * `BudgetScope` is duplicated from `models/@types.ts` so the module can
 * import everything it needs from `./types` without circular references
 * back through `connectionResolvers.ts`. The two definitions are kept in
 * lock-step intentionally.
 */
import { z } from 'zod';

export type BudgetScope = 'workspace' | 'team' | 'user' | 'agent';

export const BudgetScopeSchema = z.enum([
  'workspace',
  'team',
  'user',
  'agent',
]);

/**
 * `aiBudgetsSet` mutation input schema. Used by Plan 08's GraphQL/tRPC
 * surface to validate admin-supplied cap definitions before they reach
 * `models.AiBudgets.setBudget`.
 *
 * - `monthlyUsdCap`: 0 is the XCUT-08 path ($0 cap → next chargeable call
 *   throws `BudgetExceededError` immediately). Negative values are rejected.
 * - `alertThresholds`: optional fractions in [0, 1] — admin-configured
 *   crossings that emit `ai:budget:threshold:*` pubsub events.
 */
export const aiBudgetsSetInputSchema = z
  .object({
    scope: BudgetScopeSchema,
    scopeId: z.string().min(1),
    monthlyUsdCap: z.number().min(0),
    alertThresholds: z.array(z.number().min(0).max(1)).optional(),
  })
  .strict();

export type AiBudgetsSetInput = z.infer<typeof aiBudgetsSetInputSchema>;
