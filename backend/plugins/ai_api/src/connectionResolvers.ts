import { IMainContext } from 'erxes-api-shared/core-types';
import { ScopedEventHandlers } from 'erxes-api-shared/core-modules';
import { createGenerateModels } from 'erxes-api-shared/utils';
import * as mongoose from 'mongoose';

// Phase 1.1 ships an EMPTY model surface — Phase 1.2 populates this with
// AiProviders, AiModels, AiBudgets when the Provider/Budget Mongoose models land.
// Empty interface kept as a named type so consumers (apolloServerContext,
// trpcAppRouter.createContext) can type `context.models` against it without
// breakage when Phase 1.2 adds the real classes.
export interface IModels {} // eslint-disable-line @typescript-eslint/no-empty-interface

export interface IContext extends IMainContext {
  models: IModels;
  subdomain: string;
}

export const loadClasses = (
  _db: mongoose.Connection,
  _subdomain: string,
  _eventHandlers: ScopedEventHandlers,
): IModels => {
  // Phase 1.1: no Mongoose models registered yet. Phase 1.2 attaches
  // AiProviders / AiModels / AiBudgets via db.model<...>(...) calls here.
  return {} as IModels;
};

export const generateModels = createGenerateModels<IModels>(loadClasses);
