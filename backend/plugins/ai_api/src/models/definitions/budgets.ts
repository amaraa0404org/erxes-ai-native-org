/**
 * Mongoose schema for the `ai_budgets` collection (brief §4 row 3).
 *
 * CONTEXT D-02 — this MongoDB row is the *cap definition*; the live
 * current-month spend counter lives in Redis at
 *   `ai:budget:{subdomain}:{scope}:{scopeId}:{yyyyMM}`.
 * `currentMonthSpend` here is reconciled nightly from `ai_invocations`
 * by Phase 1.3 — Phase 1.2 only seeds the default (0 cents).
 *
 * CONTEXT D-02c — `alertThresholds` stores fractions 0..1 (e.g.
 * `[0.5, 0.8, 1.0]`); BUDG-05's trigger emission to the automation
 * engine is Phase 3.1, this phase just ships storage.
 *
 * Compound unique index `{scope, scopeId, monthlyKey}` makes
 * `setBudget` idempotent under concurrent `findOneAndUpdate(upsert)`.
 */
import { mongooseStringRandomId } from 'erxes-api-shared/utils';
import { Schema } from 'mongoose';

import { IBudgetDocument } from '../@types';

export const budgetSchema = new Schema<IBudgetDocument>(
  {
    _id: mongooseStringRandomId,
    scope: {
      type: String,
      enum: ['workspace', 'team', 'user', 'agent'],
      required: true,
    },
    scopeId: { type: String, required: true, index: true },
    monthlyKey: { type: String, required: true }, // yyyyMM
    monthlyUsdCap: { type: Number, required: true, min: 0 },
    currentMonthSpend: { type: Number, default: 0, min: 0 }, // cents
    alertThresholds: { type: [Number], default: [0.8] },
    createdBy: { type: String },
  },
  { timestamps: true },
);

budgetSchema.index(
  { scope: 1, scopeId: 1, monthlyKey: 1 },
  { unique: true },
);
