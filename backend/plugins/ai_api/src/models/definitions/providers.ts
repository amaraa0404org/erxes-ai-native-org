/**
 * Mongoose schema for the `ai_providers` collection (brief §4 row 1).
 *
 * CONTEXT D-06 — encryption-at-resolver-boundary: this schema declares
 * `encryptedApiKey` and NEVER an `apiKey` field. Test 3 in
 * `__tests__/models.test.ts` greps this file for the literal
 * field-declaration `apiKey:` and fails CI if it appears. (P13 mitigation.)
 *
 * Fields ordered to match brief §4 contracts.
 */
import { mongooseStringRandomId } from 'erxes-api-shared/utils';
import { Schema } from 'mongoose';

import { IProviderDocument } from '../@types';

const providerConfigSchema = new Schema(
  {
    deploymentName: { type: String, default: null }, // Azure
    apiVersion: { type: String, default: null }, // Azure
  },
  { _id: false },
);

export const providerSchema = new Schema<IProviderDocument>(
  {
    _id: mongooseStringRandomId,
    kind: {
      type: String,
      enum: ['openai', 'anthropic', 'google', 'azure', 'ollama', 'custom'],
      required: true,
      index: true,
    },
    label: { type: String, required: true },
    baseUrl: { type: String, default: null },
    encryptedApiKey: { type: String, required: true }, // P13: never plaintext
    defaultModel: { type: String, default: null },
    enabled: { type: Boolean, default: true, index: true },
    config: { type: providerConfigSchema, default: null }, // Azure-only fields
    createdBy: { type: String, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
