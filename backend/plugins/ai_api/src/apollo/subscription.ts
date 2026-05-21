// Phase 1.1: no subscriptions wired. Phase 1.3 ships
// `aiInvocationStreamed` for token-stream pubsub, and Phase 2.2 adds
// `aiAgentStepEmitted` for the agent loop step events.
//
// The `name` + `typeDefs` + `generateResolvers` shape mirrors
// other plugins (see backend/plugins/sales_api/src/apollo/subscription.ts)
// so the gateway's subscription bundler picks it up unchanged once
// Phase 1.3 populates the fields.

export default {
  name: 'ai',
  typeDefs: ``,
  generateResolvers: (_graphqlPubsub: any) => {
    return {};
  },
};
