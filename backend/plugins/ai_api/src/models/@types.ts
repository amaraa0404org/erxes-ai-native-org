/**
 * Phase 1.2 — AI persistence type surface.
 *
 * Pure-TS interfaces for the four AI Mongoose collections (see brief §4):
 *   - ai_providers  (CONTEXT D-06 — encryptedApiKey only, never plaintext `apiKey`)
 *   - ai_models     (CONTEXT D-05 — model registry per provider; admin cost overrides per MODL-03)
 *   - ai_budgets    (CONTEXT D-02 — monthly cap definitions; Redis token bucket is the live spend counter)
 *   - ai_provider_test_audit  (CONTEXT D-07 — rate-limit + audit trail for "Test connection" attempts)
 *
 * Schemas live in `./definitions/*.ts`; model classes (with statics + IXModel
 * interfaces) live in `./Providers.ts`, `./Models.ts`, `./Budgets.ts`,
 * `./ProviderTestAudit.ts`. `connectionResolvers.ts` wires the four together
 * onto a per-subdomain mongoose.Connection.
 */
import { Document } from 'mongoose';

/* ──────────────────────────── ai_providers ──────────────────────────── */

export type ProviderKind =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'custom';

export interface IProviderConfig {
  deploymentName?: string; // Azure-only (CONTEXT specifics line)
  apiVersion?: string; // Azure-only
}

export interface IProvider {
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  encryptedApiKey: string; // P13: ONLY field that ever carries the key envelope
  defaultModel?: string;
  enabled: boolean;
  config?: IProviderConfig | null;
  createdBy?: string;
}

export interface IProviderDocument extends IProvider, Document {
  _id: string;
  createdAt: Date;
}

/* ──────────────────────────── ai_models ──────────────────────────── */

export type ModelCapability = 'chat' | 'embed' | 'vision' | 'tools';

export interface IModel {
  providerId: string;
  modelId: string;
  capabilities: ModelCapability[];
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  enabled: boolean;
}

export interface IModelDocument extends IModel, Document {
  _id: string;
  createdAt: Date;
}

/* ──────────────────────────── ai_budgets ──────────────────────────── */

export type BudgetScope = 'workspace' | 'team' | 'user' | 'agent';

export interface IBudget {
  scope: BudgetScope;
  scopeId: string;
  monthlyKey: string; // yyyyMM
  monthlyUsdCap: number;
  currentMonthSpend?: number; // cents — reconciled nightly by Phase 1.3
  alertThresholds?: number[]; // fractions 0..1 (e.g. [0.5, 0.8, 1.0])
  createdBy?: string;
}

export interface IBudgetDocument extends IBudget, Document {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

/* ─────────────────────── ai_provider_test_audit ─────────────────────── */

export interface IProviderTestAudit {
  subdomain: string;
  userId: string;
  providerId: string;
  attemptedAt: Date;
  succeeded: boolean;
  latencyMs?: number | null;
  errorCode?: string | null;
}

export interface IProviderTestAuditDocument
  extends IProviderTestAudit,
    Document {
  _id: string;
  createdAt: Date;
}
