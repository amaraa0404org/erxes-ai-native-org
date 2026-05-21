/**
 * Per-subdomain Mongoose model registry for the `ai_api` plugin.
 *
 * Brief §4 collection contracts:
 *   - `ai_providers`              → `models.AiProviders`
 *   - `ai_models`                 → `models.AiModels`
 *   - `ai_budgets`                → `models.AiBudgets`
 *   - `ai_provider_test_audit`    → `models.AiProviderTestAudit`
 *
 * Wave 3+ modules access models via `ctx.models.AiProviders.*` (etc.) and
 * never call `db.model(...)` directly — this file is the single source of
 * truth for model registration.
 */
import { IMainContext } from 'erxes-api-shared/core-types';
import { ScopedEventHandlers } from 'erxes-api-shared/core-modules';
import { createGenerateModels } from 'erxes-api-shared/utils';
import * as mongoose from 'mongoose';

import {
  IBudgetDocument,
  IModelDocument,
  IProviderDocument,
  IProviderTestAuditDocument,
} from './models/@types';
import { IBudgetModel, loadBudgetClass } from './models/Budgets';
import { IModelModel, loadModelClass } from './models/Models';
import { IProviderModel, loadProviderClass } from './models/Providers';
import {
  IProviderTestAuditModel,
  loadProviderTestAuditClass,
} from './models/ProviderTestAudit';

export interface IModels {
  AiProviders: IProviderModel;
  AiModels: IModelModel;
  AiBudgets: IBudgetModel;
  AiProviderTestAudit: IProviderTestAuditModel;
}

export interface IContext extends IMainContext {
  models: IModels;
  subdomain: string;
}

export const loadClasses = (
  db: mongoose.Connection,
  subdomain: string,
  _eventHandlers: ScopedEventHandlers,
): IModels => {
  // Phase 1.2 does not dispatch audit events from these models — Phase 1.3
  // owns `ai_invocations` writes. The `_eventHandlers` argument is kept on
  // the signature for API stability with `createGenerateModels`.
  const models = {} as IModels;

  models.AiProviders = db.model<IProviderDocument, IProviderModel>(
    'ai_providers',
    loadProviderClass(models, subdomain),
  );

  models.AiModels = db.model<IModelDocument, IModelModel>(
    'ai_models',
    loadModelClass(models, subdomain),
  );

  models.AiBudgets = db.model<IBudgetDocument, IBudgetModel>(
    'ai_budgets',
    loadBudgetClass(models, subdomain),
  );

  models.AiProviderTestAudit = db.model<
    IProviderTestAuditDocument,
    IProviderTestAuditModel
  >(
    'ai_provider_test_audit',
    loadProviderTestAuditClass(models, subdomain),
  );

  return models;
};

export const generateModels = createGenerateModels<IModels>(loadClasses);
