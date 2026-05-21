import { initTRPC } from '@trpc/server';
import { ITRPCContext } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';

export type AiTRPCContext = ITRPCContext<{ models: IModels }>;

const t = initTRPC.context<AiTRPCContext>().create();

// Phase 1.1: empty appRouter with one `_ping` procedure for smoke testing.
// Phase 1.2 adds the real `llm.chat` / `llm.embed` routers.
// Phase 2.1 adds the `tools` router (tool registry).
// Phase 3.1 adds `prompts` / `automations`.
export const appRouter = t.router({
  _ping: t.procedure.query(() => 'pong'),
});

export type AiAppRouter = typeof appRouter;
