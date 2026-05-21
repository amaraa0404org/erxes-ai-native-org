/**
 * `AiProviders` model class — wraps `providerSchema` with static CRUD
 * helpers used by Wave 3+ resolvers (`aiProvidersAdd/Edit/Remove`).
 *
 * Brief §4 (`ai_providers` row) + CONTEXT D-06 — encryption happens at the
 * resolver boundary (Plan 05). This class is a thin passthrough: by the
 * time `createProvider` is called, `doc.encryptedApiKey` is already a
 * ciphertext envelope produced by `encryptSecret(plaintext, subdomain)`.
 */
import { Model } from 'mongoose';

import { IModels } from '~/connectionResolvers';
import { IProvider, IProviderDocument } from './@types';
import { providerSchema } from './definitions/providers';

export interface IProviderModel extends Model<IProviderDocument> {
  getProvider(_id: string): Promise<IProviderDocument>;
  createProvider(doc: IProvider): Promise<IProviderDocument>;
  updateProvider(
    _id: string,
    doc: Partial<IProvider>,
  ): Promise<IProviderDocument>;
  removeProvider(_id: string): Promise<{ ok: number }>;
}

export const loadProviderClass = (models: IModels, _subdomain: string) => {
  class Provider {
    /** Get a single provider by id; throws if missing. */
    public static async getProvider(_id: string) {
      const provider = await models.AiProviders.findOne({ _id });
      if (!provider) {
        throw new Error(`AiProvider '${_id}' not found`);
      }
      return provider;
    }

    /** Create — assumes `encryptedApiKey` is already a ciphertext envelope. */
    public static async createProvider(doc: IProvider) {
      return models.AiProviders.create(doc);
    }

    /** Partial update — preserves untouched fields including encryptedApiKey. */
    public static async updateProvider(
      _id: string,
      doc: Partial<IProvider>,
    ) {
      await models.AiProviders.updateOne({ _id }, { $set: doc });
      return models.AiProviders.getProvider(_id);
    }

    public static async removeProvider(_id: string) {
      const r = await models.AiProviders.deleteOne({ _id });
      return { ok: r.deletedCount ?? 0 };
    }
  }

  providerSchema.loadClass(Provider);
  return providerSchema;
};
