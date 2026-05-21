/**
 * Mongoose schema for the `ai_provider_test_audit` collection
 * (CONTEXT D-07 + brief §4 specifics line).
 *
 * Every "Test connection" attempt persists `{subdomain, userId, providerId,
 * attemptedAt, succeeded, latencyMs, errorCode}` for 30 days. No API key
 * fragments are stored — only outcome metadata. The TTL index on
 * `createdAt` bounds the index footprint.
 *
 * Used by Phase 1.2's rate-limiter (10 calls/hour/admin) and audit query.
 */
import { mongooseStringRandomId } from 'erxes-api-shared/utils';
import { Schema } from 'mongoose';

import { IProviderTestAuditDocument } from '../@types';

export const providerTestAuditSchema = new Schema<IProviderTestAuditDocument>(
  {
    _id: mongooseStringRandomId,
    subdomain: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    providerId: { type: String, required: true },
    attemptedAt: { type: Date, default: Date.now },
    succeeded: { type: Boolean, required: true },
    latencyMs: { type: Number, default: null },
    errorCode: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// 30-day TTL on createdAt — CONTEXT D-07
providerTestAuditSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 86400 },
);
