import { startPlugin } from 'erxes-api-shared/utils';
import resolvers from './apollo/resolvers';
import { typeDefs } from './apollo/typeDefs';
import { generateModels } from './connectionResolvers';
import { router } from './routes';
import { appRouter } from './trpc/init-trpc';

/**
 * ERXES_SECRET fail-fast validation (CONTEXT D-09 / D-10 / D-11).
 *
 * Runs at ai_api startup BEFORE startPlugin({...}) is invoked. If the secret
 * is missing or shorter than 32 hex bytes, the process prints the exact error
 * message to stderr and exits with code 1.
 *
 * This validation is intentionally LOCAL to ai_api/main.ts and is NOT in the
 * shared erxes-api-shared startup (D-10) — deployments that exclude `ai`
 * from ENABLED_PLUGINS must boot without ever touching ERXES_SECRET. The
 * createAIClient() shim does NOT re-validate (D-11) because by the time a
 * consumer reaches it, either (a) `ai` is enabled and we already validated,
 * or (b) `ai` is disabled and the shim throws AINotEnabledError first.
 *
 * Tolerance for Phase 1.2 rotation policy A (PITFALLS §P14): if the secret
 * is a comma-separated list like `v1:<hex>,v2:<hex>`, this check uses the
 * FIRST entry's hex content (after stripping any `vN:` prefix) so the
 * rotation script can ship in Phase 1.2 without code change here.
 *
 * Exported so unit tests can pin the contract without mocking process.exit.
 */
export function validateErxesSecret(
  rawSecret: string | undefined,
):
  | { ok: true }
  | { ok: false; bytes: number; message: string } {
  const secret = (rawSecret ?? '').trim();
  const firstEntry = secret.split(',')[0].trim();
  const versionedMatch = firstEntry.match(/^v\d+:(.+)$/);
  const hex = versionedMatch ? versionedMatch[1] : firstEntry;
  const bytes = Math.floor(hex.length / 2);

  if (bytes < 32) {
    return {
      ok: false,
      bytes,
      message:
        'ERXES_SECRET must be >= 32 hex bytes (got ' +
        bytes +
        '). Generate with `openssl rand -hex 32`.',
    };
  }

  return { ok: true };
}

// Run the check at module load — before startPlugin({...}) below.
const __secretCheck = validateErxesSecret(process.env.ERXES_SECRET);
if (!__secretCheck.ok) {
  // eslint-disable-next-line no-console
  console.error(__secretCheck.message);
  process.exit(1);
}

startPlugin({
  name: 'ai',
  port: 3320,
  graphql: async () => ({
    typeDefs: await typeDefs(),
    resolvers,
  }),
  expressRouter: router,
  hasSubscriptions: true,
  subscriptionPluginPath: require('path').resolve(
    __dirname,
    'apollo',
    process.env.NODE_ENV === 'production'
      ? 'subscription.js'
      : 'subscription.ts',
  ),
  apolloServerContext: async (subdomain, context) => {
    const models = await generateModels(subdomain, context);

    context.models = models;

    return context;
  },
  trpcAppRouter: {
    router: appRouter,
    createContext: async (subdomain, context) => {
      const models = await generateModels(subdomain);

      context.models = models;

      return context;
    },
  },
  onServerInit: async () => {
    // Phase 1.2+ wires real workers (embedding worker, audit-log batcher).
  },
  meta: {},
});
