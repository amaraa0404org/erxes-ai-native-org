/**
 * `AiModels` model class — wraps `modelSchema` with static CRUD helpers
 * plus the `listForProvider` query used by MODL-01.
 *
 * Brief §4 (`ai_models` row). Admin cost overrides per MODL-03 happen
 * via `updateModel`; defaults of 0 mean "use the static COST_TABLE".
 */
import { Model } from 'mongoose';

import { IModels } from '~/connectionResolvers';
import { IModel as IAiModel, IModelDocument } from './@types';
import { modelSchema } from './definitions/models';

export interface IModelModel extends Model<IModelDocument> {
  getModel(_id: string): Promise<IModelDocument>;
  createModel(doc: IAiModel): Promise<IModelDocument>;
  updateModel(_id: string, doc: Partial<IAiModel>): Promise<IModelDocument>;
  removeModel(_id: string): Promise<{ ok: number }>;
  listForProvider(providerId: string): Promise<IModelDocument[]>;
}

export const loadModelClass = (models: IModels, _subdomain: string) => {
  class AIModel {
    public static async getModel(_id: string) {
      const m = await models.AiModels.findOne({ _id });
      if (!m) {
        throw new Error(`AiModel '${_id}' not found`);
      }
      return m;
    }

    public static async createModel(doc: IAiModel) {
      return models.AiModels.create(doc);
    }

    public static async updateModel(_id: string, doc: Partial<IAiModel>) {
      await models.AiModels.updateOne({ _id }, { $set: doc });
      return models.AiModels.getModel(_id);
    }

    public static async removeModel(_id: string) {
      const r = await models.AiModels.deleteOne({ _id });
      return { ok: r.deletedCount ?? 0 };
    }

    /** MODL-01: list enabled models for a provider, sorted by modelId. */
    public static async listForProvider(providerId: string) {
      return models.AiModels.find({ providerId, enabled: true }).sort({
        modelId: 1,
      });
    }
  }

  modelSchema.loadClass(AIModel);
  return modelSchema;
};
