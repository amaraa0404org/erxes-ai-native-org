/**
 * Mongoose schema for the `ai_models` collection (brief §4 row 2).
 *
 * CONTEXT D-05 — provider adapters feed `listModels()` data into this
 * collection; admins may override `inputCostPer1M` / `outputCostPer1M`
 * per MODL-03. Default of 0 means "use the static COST_TABLE from
 * erxes-api-shared/src/ai/tokens.ts".
 *
 * Compound unique index `{providerId, modelId}` enforces a single
 * registry row per (provider, model-id) pair.
 */
import { mongooseStringRandomId } from 'erxes-api-shared/utils';
import { Schema } from 'mongoose';

import { IModelDocument } from '../@types';

export const modelSchema = new Schema<IModelDocument>(
  {
    _id: mongooseStringRandomId,
    providerId: { type: String, required: true, index: true },
    modelId: { type: String, required: true },
    capabilities: {
      type: [String],
      enum: ['chat', 'embed', 'vision', 'tools'],
      default: [],
    },
    contextWindow: { type: Number, required: true, default: 4096 },
    inputCostPer1M: { type: Number, default: 0 },
    outputCostPer1M: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

modelSchema.index({ providerId: 1, modelId: 1 }, { unique: true });
