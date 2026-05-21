/**
 * `AiProviderTestAudit` model class — wraps `providerTestAuditSchema`.
 *
 * CONTEXT D-07. Append-only audit collection for "Test connection"
 * attempts. Phase 1.2 ships the model + two statics:
 *   - `recordAttempt(doc)` — INSERT (used by every test-connection call)
 *   - `countRecent(subdomain, userId, sinceMs)` — used by the
 *     10-calls/hour rate-limiter (Plan 05).
 *
 * 30-day TTL on createdAt keeps the index bounded.
 */
import { Model } from 'mongoose';

import { IModels } from '~/connectionResolvers';
import { IProviderTestAudit, IProviderTestAuditDocument } from './@types';
import { providerTestAuditSchema } from './definitions/provider-test-audit';

export interface IProviderTestAuditModel
  extends Model<IProviderTestAuditDocument> {
  recordAttempt(doc: IProviderTestAudit): Promise<IProviderTestAuditDocument>;
  countRecent(
    subdomain: string,
    userId: string,
    sinceMs: number,
  ): Promise<number>;
}

export const loadProviderTestAuditClass = (
  models: IModels,
  _subdomain: string,
) => {
  class ProviderTestAudit {
    /** Append-only insert. */
    public static async recordAttempt(doc: IProviderTestAudit) {
      return models.AiProviderTestAudit.create(doc);
    }

    /** Count attempts by this user in the last `sinceMs` ms; used by rate-limit. */
    public static async countRecent(
      subdomain: string,
      userId: string,
      sinceMs: number,
    ) {
      return models.AiProviderTestAudit.countDocuments({
        subdomain,
        userId,
        createdAt: { $gte: new Date(Date.now() - sinceMs) },
      });
    }
  }

  providerTestAuditSchema.loadClass(ProviderTestAudit);
  return providerTestAuditSchema;
};
