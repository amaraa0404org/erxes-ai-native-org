/**
 * `AiBudgets` model class — wraps `budgetSchema` with static CRUD plus
 * the idempotent upsert used by BUDG-01..03 (`setBudget`).
 *
 * Brief §4 (`ai_budgets` row) + CONTEXT D-02. The MongoDB row stores
 * the *cap definition*; live current-month spend is in Redis at
 *   `ai:budget:{subdomain}:{scope}:{scopeId}:{yyyyMM}`.
 *
 * `setBudget` uses `findOneAndUpdate({...key}, {...}, { upsert: true })`
 * which together with the unique compound index makes re-setting the
 * same month idempotent under concurrency.
 */
import { Model } from 'mongoose';

import { IModels } from '~/connectionResolvers';
import { BudgetScope, IBudget, IBudgetDocument } from './@types';
import { budgetSchema } from './definitions/budgets';

export interface SetBudgetInput {
  scope: BudgetScope;
  scopeId: string;
  monthlyKey: string;
  monthlyUsdCap: number;
  alertThresholds?: number[];
  createdBy?: string;
}

export interface IBudgetModel extends Model<IBudgetDocument> {
  getBudget(
    scope: BudgetScope,
    scopeId: string,
    monthlyKey: string,
  ): Promise<IBudgetDocument | null>;
  setBudget(input: SetBudgetInput): Promise<IBudgetDocument>;
  listBudgets(scope?: BudgetScope): Promise<IBudgetDocument[]>;
  removeBudget(_id: string): Promise<{ ok: number }>;
}

export const loadBudgetClass = (models: IModels, _subdomain: string) => {
  class Budget {
    public static async getBudget(
      scope: BudgetScope,
      scopeId: string,
      monthlyKey: string,
    ) {
      return models.AiBudgets.findOne({ scope, scopeId, monthlyKey });
    }

    /** Idempotent upsert. Re-setting the same month overwrites cap + thresholds. */
    public static async setBudget(input: SetBudgetInput) {
      const {
        scope,
        scopeId,
        monthlyKey,
        monthlyUsdCap,
        alertThresholds,
        createdBy,
      } = input;

      const set: Partial<IBudget> = { monthlyUsdCap };
      if (alertThresholds !== undefined) {
        set.alertThresholds = alertThresholds;
      }
      if (createdBy !== undefined) {
        set.createdBy = createdBy;
      }

      const doc = await models.AiBudgets.findOneAndUpdate(
        { scope, scopeId, monthlyKey },
        {
          $set: set,
          $setOnInsert: { currentMonthSpend: 0 },
        },
        { upsert: true, new: true },
      );

      // `new: true` on upsert always returns the row; satisfy strict typing.
      if (!doc) {
        throw new Error(
          `setBudget upsert returned null for ${scope}/${scopeId}/${monthlyKey}`,
        );
      }
      return doc;
    }

    public static async listBudgets(scope?: BudgetScope) {
      const filter = scope ? { scope } : {};
      return models.AiBudgets.find(filter);
    }

    public static async removeBudget(_id: string) {
      const r = await models.AiBudgets.deleteOne({ _id });
      return { ok: r.deletedCount ?? 0 };
    }
  }

  budgetSchema.loadClass(Budget);
  return budgetSchema;
};
