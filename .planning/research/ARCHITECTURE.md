# Architecture Patterns

**Domain:** AI-native foundation plugin (`ai_api` + `ai_ui` + `erxes-api-shared/src/ai/`) for erxes
**Researched:** 2026-05-21
**Confidence:** HIGH (every recommendation is anchored to a verified file path inside this repo)

> Source of truth for shape: `.planning/briefs/ai_api_plugin_prompt.md` (§3 layout, §5 surface, §6 meta extension, §12 phasing).
> Source of truth for existing patterns: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/INTEGRATIONS.md` plus direct reads of `backend/erxes-api-shared/src/utils/start-plugin.ts`, `backend/erxes-api-shared/src/utils/service-discovery.ts`, `backend/erxes-api-shared/src/utils/trpc/index.ts`, `backend/erxes-api-shared/src/utils/trpc/sendCoreModuleProducer.ts`, `backend/erxes-api-shared/src/utils/graphqlPubSub.ts`, `backend/erxes-api-shared/src/utils/mq-worker.ts`, `backend/plugins/sales_api/src/main.ts`, `backend/plugins/sales_api/src/meta/automations.ts`, `backend/plugins/sales_api/src/meta/segments.ts`, `frontend/plugins/sales_ui/src/config.tsx`, `frontend/plugins/sales_ui/module-federation.config.ts`, `frontend/libs/erxes-ui/src/types/UIConfig.ts`.

## Architectural Principle

The AI Kernel adds **zero new transports, zero new state containers, zero new pub/sub layers**. It is a normal erxes plugin (`startPlugin({ name: 'ai', port: 3320 })`) that exposes (a) a tRPC surface other plugins call, (b) a small shared module (`erxes-api-shared/src/ai/`) that both `ai_api` and consumer plugins import for **types, helpers, and a graceful-degradation shim**, and (c) Module Federation hooks/widgets. Every cross-plugin path uses the **existing** `sendTRPCMessage` mechanism (`backend/erxes-api-shared/src/utils/trpc/index.ts`), Redis service registry (`backend/erxes-api-shared/src/utils/service-discovery.ts`), and `graphqlPubsub` (`backend/erxes-api-shared/src/utils/graphqlPubSub.ts`). The brief's anti-requirements §14 and constraints in `PROJECT.md` make this non-negotiable.

---

## 1. Provider Abstraction Layer (`ILLMProvider`)

### Component Boundary

```
erxes-api-shared/src/ai/
├── types.ts                  # ChatMessage, ToolDef, EmbeddingRequest, Usage, ProviderError + Zod schemas
├── providers/
│   ├── base.ts               # ILLMProvider interface (only this file is imported by ai_api modules)
│   ├── openai.ts             # implements ILLMProvider; tool-call shape: { id, name, args }
│   ├── anthropic.ts          # implements ILLMProvider; maps tool_use blocks → { id, name, args }
│   ├── google.ts             # implements ILLMProvider; maps functionCall → { id, name, args }
│   ├── azure.ts              # extends openai.ts with deployment routing
│   ├── ollama.ts             # implements ILLMProvider; also covers any OpenAI-compatible baseUrl
│   └── index.ts              # resolveProvider(subdomain, modelId?) — reads ai_providers/ai_models, decrypts key, returns ILLMProvider
├── tokens.ts                 # tiktoken counting + static cost table
├── streaming.ts              # AsyncIterable<Chunk> → publish on graphqlPubsub channel `ai:invocation:{sessionId}`
├── redaction.ts              # PII pre-redact / post-rehydrate
├── guardrails.ts             # prompt-injection heuristic + output moderation hook
├── shim.ts                   # graceful degradation: AINotEnabledError when ai_api is off
└── index.ts                  # barrel exports (consumers do `from 'erxes-api-shared/utils/ai'`)
```

### Interface Sketch (lives in `erxes-api-shared/src/ai/providers/base.ts`)

The Vercel AI SDK and LangChain.js both attempt full provider unification including streaming, tool-calling, and structured output. The **lightest** model is: **normalize tool calls into a single shape `{ id, name, args: object }`, return chunks via AsyncIterable, let `ai_api` own the agent loop**. Providers know nothing about budgets, audit, or tools — they only translate.

```typescript
// erxes-api-shared/src/ai/providers/base.ts
import type { z } from 'zod';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCallId?: string;                   // when role === 'tool'
  toolCalls?: NormalizedToolCall[];      // when role === 'assistant'
  name?: string;                         // optional speaker label
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  description: string;
  inputJsonSchema: object;               // JSON Schema (Zod → JSON Schema at registration time)
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  // costUsd computed by ai_api/modules/invocations using ai_models cost table — providers never compute money
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: 'auto' | 'none' | { name: string };
  temperature?: number;
  maxOutputTokens?: number;
  responseJsonSchema?: object;           // for structured output (OpenAI json_schema / Anthropic response_format)
  stream?: boolean;
}

export interface ChatChunk {
  delta?: string;                        // token delta
  toolCallDelta?: { id: string; nameDelta?: string; argsDelta?: string };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: Usage;                         // only on terminal chunk
}

export interface ChatResult {
  content: string;
  toolCalls: NormalizedToolCall[];
  usage: Usage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  model: string;
}

export interface EmbedRequest { model: string; input: string | string[]; }
export interface EmbedResult { embeddings: number[][]; usage: Usage; }

export interface ILLMProvider {
  readonly kind: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'custom';
  chat(req: ChatRequest): Promise<ChatResult>;
  chatStream(req: ChatRequest): AsyncIterable<ChatChunk>;
  embed(req: EmbedRequest): Promise<EmbedResult>;
  listModels(): Promise<Array<{ id: string; capabilities: Array<'chat' | 'embed' | 'vision' | 'tools'>; contextWindow?: number }>>;
}

export interface ProviderConstructorArgs {
  apiKey: string;
  baseUrl?: string;
  subdomain: string;                     // for logging/tracing; never used to scope keys (already decrypted)
}

export class ProviderError extends Error {
  constructor(message: string, public code: 'rate_limit' | 'auth' | 'invalid_request' | 'server_error' | 'timeout', public retryable: boolean) {
    super(message);
    this.name = 'ProviderError';
  }
}
```

### Pattern Parallel

The brief §10 says "no hard dependency on any single vendor SDK in `ai_api` itself." This mirrors the existing payment plugin: `backend/plugins/payment_api/src/apis/` keeps one adapter file per gateway (Stripe, PayPal, QPay, etc.) behind a common interface (see `.planning/codebase/INTEGRATIONS.md`, "Payment Integrations" section). The provider folder follows the same shape one-for-one.

### Build Order

PR 1 ships `base.ts` + `openai.ts` + `anthropic.ts` only (matches brief §12 PR 1). PR 2 adds `google.ts`, `azure.ts`, `ollama.ts` as additive files — no call-site changes anywhere because everything goes through `resolveProvider`.

---

## 2. Tool Registry + Plugin Discovery

### Critical Discovery

`backend/erxes-api-shared/src/utils/service-discovery.ts:126-198` shows `joinErxesGateway` already writes plugin meta into Redis at key `erxesservice:config:{name}` — **including the entire `meta` object** (functions are stripped by `getNonFunctionProps`, but plain data — names, descriptions, schemas, scopes — survives the round trip). This is exactly how `automations.constants` and `notifications` are made discoverable today. **There is no need for a push protocol, periodic re-scan, or new endpoint.** `ai_api` reads Redis.

### Component Boundary

```
ai_api/src/modules/tools/
├── registry.ts               # collectAllPluginTools(subdomain) — reads Redis, upserts ai_tool_registry
├── executor.ts               # executeTool(name, input, ctx) — calls back via sendTRPCMessage
├── scope.ts                  # checkScopeIntersection(agent.scopes, tool.scopes)
└── jsonschema.ts             # zodToJsonSchema once at registration time

erxes-api-shared/src/ai/
├── tools.ts                  # type AiToolMeta { tools: AiToolDef[] } — what plugins put in meta.aiTools
└── mountAiToolsRouter.ts     # helper for consumer plugins: produces a tRPC router that wraps each handler
```

### Data Flow + Sequence

```
┌─────────────────┐                              ┌──────────┐                ┌────────────┐                ┌────────┐
│ sales_api boots │                              │  Redis   │                │  ai_api    │                │ MongoDB │
└────────┬────────┘                              └────┬─────┘                └─────┬──────┘                └────┬────┘
         │ startPlugin({ meta: { aiTools } })        │                            │                            │
         │ ───────────────────────────────────────►  │                            │                            │
         │   joinErxesGateway() writes config:       │                            │                            │
         │   { meta: { ...other, aiTools:            │                            │                            │
         │     { tools: [name, description,          │                            │                            │
         │       inputJsonSchema, scopes] } } }      │                            │                            │
         │   (handler functions stripped by          │                            │                            │
         │   getNonFunctionProps — only static       │                            │                            │
         │   metadata survives)                       │                            │                            │
         │                                            │                            │                            │
         │                                            │  onServerInit:             │                            │
         │                                            │  collectAllPluginTools()   │                            │
         │                                            │ ◄──────────────────────── │                            │
         │                                            │  getPlugins() → [core,    │                            │
         │                                            │   sales, frontline,...]   │                            │
         │                                            │  for each: GET             │                            │
         │                                            │  erxesservice:config:{n}   │                            │
         │                                            │  → meta.aiTools.tools[]    │                            │
         │                                            │ ──────────────────────────►│                            │
         │                                            │                            │ upsert into                │
         │                                            │                            │ ai_tool_registry:          │
         │                                            │                            │ { pluginName, name,        │
         │                                            │                            │   inputJsonSchema,         │
         │                                            │                            │   scopes, lastSeenAt }     │
         │                                            │                            │ ──────────────────────────►│
         │                                            │                            │                            │
         │                                            │ Periodic refresh: setInterval                            │
         │                                            │ every 60s (re-read Redis,  │                            │
         │                                            │ mark stale entries where   │                            │
         │                                            │ lastSeenAt < now-5min)     │                            │
```

**Recommendation:** **Boot-time pull + periodic re-scan (60s).** Reasons:
1. Push from each plugin would require modifying `joinErxesGateway` (touch all plugins).
2. Redis is the single source of truth already used for service discovery.
3. The 60s scan handles late-joining plugins (and the gateway already does the same — it polls active services via the `gateway-service-discovery` BullMQ queue, see `backend/erxes-api-shared/src/utils/service-discovery.ts:170-195`).
4. Subdomain irrelevance: tool **definitions** are global to a deployment (sales_api ships the same tools for every tenant); per-subdomain agent configs determine which agents can call which tools, not the registry itself.

### `mountAiToolsRouter(meta)` Helper

This is the **one line** in brief §6.3. It must (a) produce a tRPC sub-router each plugin merges into its `appRouter`, (b) wrap each handler so it receives `{ subdomain, input, context }` with subdomain extracted from the encoded tRPC context header (already done by `createTRPCContext` in `backend/erxes-api-shared/src/utils/trpc/index.ts:165`).

```typescript
// erxes-api-shared/src/ai/mountAiToolsRouter.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { AiToolMeta } from './tools';

const t = initTRPC.context<any>().create();

export const mountAiToolsRouter = (meta: AiToolMeta) => {
  const procedures: Record<string, any> = {};
  for (const tool of meta.tools) {
    procedures[tool.name.split('.')[1] ?? tool.name] = t.procedure
      .input(tool.inputSchema)              // the Zod schema (handler-side, not the JSON-Schema clone in Redis)
      .mutation(async ({ ctx, input }) => {
        // ctx already has { subdomain, models, userId } — see createTRPCContext
        return tool.handler({ subdomain: ctx.subdomain, input, context: ctx });
      });
  }
  return t.router({ aiTools: t.router(procedures) });
};
```

Consumer plugin's `main.ts` then does:

```typescript
import aiTools from './meta/aiTools';
import { mountAiToolsRouter } from 'erxes-api-shared/utils/ai';
import { t } from './trpc/init-trpc';      // existing initTRPC instance

const appRouter = t.mergeRouters(dealTrpcRouter, posTrpcRouter, mountAiToolsRouter(aiTools));

startPlugin({
  // ...
  meta: { automations, segments, aiTools, /* ... */ },
  trpcAppRouter: { router: appRouter, createContext },
});
```

### Pattern Parallel

Mirrors `meta.automations` (`backend/plugins/sales_api/src/meta/automations.ts`) and `meta.segments` (same dir). Brief §6 says "same pattern as `meta/automations.ts`" — this matches.

### Build Order

PR 2 (matches brief §12). PR 1 has no tools, no agents — only direct `trpc.ai.llm.chat` calls.

---

## 3. Tool Execution Path

### Component Boundary

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ai_api/src/modules/agents/loop.ts (agent invocation engine)                  │
│   while (steps < AI_MAX_TOOL_STEPS) {                                         │
│     1. resolveProvider(subdomain, agent.model)                                │
│     2. provider.chatStream({ messages, tools: agent.allowedToolDefs })        │
│     3. on toolCalls: for each, call modules/tools/executor.executeTool(...)   │
│     4. append tool result message, loop                                       │
│   }                                                                            │
└─────────────────┬─────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ ai_api/src/modules/tools/executor.ts                                          │
│   executeTool({ name, input, callerAgent, ctx }):                             │
│     1. tool = ai_tool_registry.findOne({ name })                              │
│     2. if (!tool) throw new ToolNotFoundError                                  │
│     3. checkScopeIntersection(callerAgent.scopes, tool.scopes)                │
│     4. validate input against tool.inputJsonSchema (ajv)                      │
│     5. budgetPrecheck(subdomain, scope)   // §5                               │
│     6. const result = await sendTRPCMessage({                                  │
│          subdomain: ctx.subdomain,                                             │
│          pluginName: tool.pluginName,                                          │
│          module: 'aiTools',                                                    │
│          action: tool.name.split('.')[1],                                      │
│          method: 'mutation',                                                   │
│          input,                                                                │
│          context: { userId: ctx.userId },                                      │
│        })                                                                      │
│     7. write ai_invocations row { kind: 'tool', tool: name, latencyMs, ... }  │
│     8. publish step via graphqlPubsub → aiAgentStepEmitted                    │
│     9. return result                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Auth / Permission / Subdomain Propagation

This is the most important detail. The existing `sendTRPCMessage` already solves it (`backend/erxes-api-shared/src/utils/trpc/index.ts:99-145`):

| Concern | How it flows |
|---|---|
| `subdomain` | Encoded into `x-trpc-context` header via `encodeTRPCContextHeader`, decoded on the consumer plugin side by `createTRPCContext` (line 165). |
| `userId` | Passed inside the `context` argument of `sendTRPCMessage`, encoded into the same header. The consumer plugin's `mountAiToolsRouter`-wrapped handler reads `ctx.userId`. |
| `agent scopes` (`sales:deals:read`) | Checked **inside `ai_api`** *before* cross-plugin call (executor step 3). The downstream plugin trusts the call because tRPC is internal (not public). |
| Permission check on tool handler | The tool's handler runs inside the consumer plugin and **must** call `await checkPermission('tool:scope')` exactly like normal mutations (see `.planning/codebase/CONVENTIONS.md` Error Handling). Two-layer defense: agent scope at the kernel, permission check at the executor. |
| `processId` | Already plumbed by `generateRequestProcess()` in `createTRPCContext` (line 175) — appears in audit logs for tracing the whole request. |

**Recommendation: do not introduce a new permission system. Reuse `checkPermission`.** Brief §13.4 says "single import, no provider knowledge" — that's already true once the routing helpers exist.

### Pattern Parallel

`sendTRPCMessage` is the canonical cross-plugin call pattern. Existing example: `backend/plugins/sales_api/src/main.ts` uses it transitively via `createCoreModuleProducerHandler` (see `backend/erxes-api-shared/src/utils/trpc/sendCoreModuleProducer.ts`). The executor essentially does the same thing — call another plugin's tRPC router by `pluginName` + `module` + `action`.

### Build Order

PR 2. PR 1 has no executor.

---

## 4. Streaming Pipeline

### Component Boundary

```
provider.chatStream()  →  ai_api/src/modules/invocations/stream.ts  →  graphqlPubsub  →  GraphQL subscription resolver  →  ai_ui useAIChat hook (subscribeToMore)
       │                            │                                       │                          │                              │
       │                            │ buffers tokens                        │ Redis channel:           │ aiInvocationStreamed         │ React component
       │                            │ for token-count                       │ ai:invocation:{sid}      │ + aiAgentStepEmitted         │ renders deltas
       │                            │ tally                                 │                          │                              │
```

### Detailed Path

1. **Provider SSE → AsyncIterable** (already in `ILLMProvider.chatStream`): each provider's adapter wraps its native SSE/JSON stream into `AsyncIterable<ChatChunk>`.
2. **`ai_api/src/modules/invocations/stream.ts`**: a thin pipeline that iterates the chunks:
   - On every `delta`: publish via `graphqlPubsub.publish('ai:invocation:' + sessionId, { aiInvocationStreamed: { sessionId, delta, model } })`.
   - **Token buffering for cost accounting**: maintain an accumulator `{ outputBuffer: string, outputTokenCount: 0 }` in the stream-loop closure. On terminal chunk (`usage` populated), reconcile with the provider-reported usage; if absent, use `tiktoken` count from `outputBuffer` as fallback. **Single write to `ai_invocations` happens on terminal chunk** — never per-token (writing per token would create 1000s of Mongo writes per invocation).
3. **GraphQL subscription resolver** (in `ai_api/src/apollo/resolvers/subscriptions.ts`):
   ```typescript
   aiInvocationStreamed: {
     subscribe: (_, { sessionId }) => graphqlPubsub.asyncIterator(`ai:invocation:${sessionId}`),
   }
   ```
4. **Gateway aggregates subscriptions**: erxes already supports this via `subscriptionPluginPath` in `startPlugin` (`backend/erxes-api-shared/src/utils/start-plugin.ts:172-198`). `ai_api` sets `hasSubscriptions: true` exactly like `sales_api` does.
5. **Frontend consumer**: `useAIChat` uses Apollo `useSubscription` (mirroring `subscribeToMore` patterns in `frontend/plugins/sales_ui/src/modules/`).

### Subscription Drop Mid-Stream

What happens: client reconnects, missed events are gone (PubSub is at-most-once over Redis). **Recommendation:**

- Every chunk includes `chunkIndex` so client can detect gaps.
- Provide a fallback **GraphQL query** `aiInvocation(sessionId, since: chunkIndex)` that returns the **persisted full text** from `ai_invocations.outputText` (added field) once the invocation finishes. Client re-fetches once on reconnect if `isStreaming === true` for that session and reconnect was detected.
- For mid-stream cancellation: emit a final `finishReason: 'cancelled'` chunk; do NOT delete partial output from audit log (admins want to see what the user saw before cancel).

### Pattern Parallel

Brief §10 mandates "Use the existing `graphql-redis-subscriptions` pubsub." This matches `backend/erxes-api-shared/src/utils/graphqlPubSub.ts` exactly. Existing subscription example: `salesDealListChanged` (referenced in `.planning/codebase/CONVENTIONS.md` Naming Patterns).

### Build Order

PR 2 (agent invocation engine + Copilot). PR 1's `trpc.ai.llm.chat` can return a non-streaming `ChatResult` for the audit-log demo. **Important:** add the `aiInvocationStreamed` resolver in PR 1 even if no UI consumes it yet — that way PR 2 only adds the UI, not new GraphQL schema (smaller PR 2 surface). The brief's PR 1 acceptance test only requires the audit log row, not streaming.

---

## 5. Audit + Budget Atomicity

### Race Description

Two concurrent calls to `trpc.ai.llm.chat` both:
1. Read `ai_budgets.findOne({ subdomain, scope })` → `currentMonthSpend: $49.50`, cap $50.
2. Each computes "estimated cost: $0.40", determines under cap.
3. Each makes the provider call.
4. Each writes a `$inc: { currentMonthSpend: 0.40 }` → final state $50.30 — **over cap**.

### Recommendation: MongoDB `findOneAndUpdate` with `$expr` Conditional `$inc`

```typescript
// ai_api/src/modules/budgets/atomic.ts
async function reserveBudget(subdomain: string, scope: BudgetScope, scopeId: string, estimatedUsd: number) {
  const result = await models.AiBudgets.findOneAndUpdate(
    {
      scope,
      scopeId,
      // atomic guard: only update if remaining > estimated
      $expr: { $gte: [{ $subtract: ['$monthlyUsdCap', '$currentMonthSpend'] }, estimatedUsd] },
    },
    {
      $inc: { currentMonthSpend: estimatedUsd },
      $set: { lastReservationAt: new Date() },
    },
    { new: true, returnDocument: 'after' },
  );

  if (!result) {
    throw new BudgetExceededError(`Budget cap reached for ${scope}:${scopeId}`);
  }
  return { reservationId: new ObjectId(), reservedUsd: estimatedUsd };
}

async function reconcileBudget(reservationId, scope, scopeId, actualUsd, reservedUsd) {
  const delta = actualUsd - reservedUsd;
  if (delta !== 0) {
    await models.AiBudgets.updateOne(
      { scope, scopeId },
      { $inc: { currentMonthSpend: delta } },
    );
  }
}

async function releaseBudget(scope, scopeId, reservedUsd) {
  // on provider failure: refund the reservation
  await models.AiBudgets.updateOne(
    { scope, scopeId },
    { $inc: { currentMonthSpend: -reservedUsd } },
  );
}
```

**Why this approach over Redis Lua:**
1. erxes does not currently use Redis for spend accounting — adding a Lua script means two sources of truth (Redis + MongoDB) and a reconciliation worker.
2. MongoDB 4.2+ supports `$expr` in update filter — atomic at the document level (`findOneAndUpdate` is atomic per doc by MongoDB guarantees).
3. The brief §13.6 demands "Setting workspace budget to $0 causes the next chat call to fail with `BudgetExceededError`" — `findOneAndUpdate` returning `null` is the exact failure signal.
4. Audit & budget read the same MongoDB transaction; no dual-write split-brain.

**Estimated cost calculation:** use `Math.min(messages.length * 200, model.contextWindow)` * `inputCostPer1M / 1M` + `(model.maxOutputTokens || 1024) * outputCostPer1M / 1M`. Generous-but-bounded estimate; reconcile against actual usage post-call.

### Atomicity for Audit Row

Audit is **append-only** — no race concerns. One `insertOne` per invocation, written *after* terminal chunk (not per token). The `requestHash` field (SHA-256 of `{ subdomain, agentId, userId, normalizedMessages }`) lets retries dedupe.

### Pattern Parallel

No existing erxes pattern for atomic spend accounting (this is novel). Closest pattern is bank-balance updates in `backend/plugins/sales_api/src/main.ts` lines ~80-105 (`paymentsData.bank.amount` updates using `$set` after fetch) — but that doesn't use atomic guards. The `$expr`-in-filter approach is standard MongoDB and well-tested.

### Build Order

PR 1 (enforcement only, no UI — per brief §12 PR 1). PR 1's acceptance test §13.6 explicitly demands working budget enforcement.

---

## 6. Vector Store Abstraction

### Component Boundary

```
ai_api/src/modules/vectors/
├── adapter.ts                # IVectorAdapter interface
├── mongoAtlas.ts             # MongoDB Atlas Vector Search adapter
├── qdrant.ts                 # Qdrant adapter
├── chunking.ts               # token-aware chunker (sliding window with overlap), policy stored in ai_vector_namespaces
├── namespacing.ts            # toNs(subdomain, ns, sourceCollection) → "{subdomain}:{ns}:{sourceCollection}"
└── index.ts                  # resolveVectorAdapter(subdomain, namespace) — reads ai_vector_namespaces.backend
```

### Interface Sketch

```typescript
export interface IVectorAdapter {
  readonly backend: 'mongodb-atlas' | 'qdrant';
  upsert(ns: string, items: Array<{ id: string; vector: number[]; text: string; metadata: object }>): Promise<void>;
  search(ns: string, vector: number[], topK: number, filter?: object): Promise<Array<{ id: string; text: string; score: number; metadata: object }>>;
  delete(ns: string, ids: string[]): Promise<void>;
  ensureNamespace(ns: string, dimensions: number): Promise<void>;     // creates index/collection if missing
}
```

### Namespacing

`{subdomain}:{namespace}:{sourceCollection}` — e.g. `acme:frontline:conversations`. The triple key prevents:
- Cross-subdomain leaks (subdomain prefix is hard tenant isolation per `PROJECT.md` constraints).
- Namespace collisions (different agents querying the same `frontline:conversations` without bleed).
- Source-collection ambiguity (the same namespace can index from multiple Mongo collections).

For MongoDB Atlas: `ai_vectors` collection with a single `vector` index, where queries always filter on `namespace` field equal to that compound string. For Qdrant: one collection per `{subdomain}:{namespace}` (Qdrant payload filtering on `sourceCollection`).

### Chunking Policy Storage

Per `ai_vector_namespaces` row: `{ chunkingPolicy: { strategy: 'token-window', maxTokens: 512, overlap: 50, splitOn: ['paragraph', 'sentence'] } }`. The chunker reads this at embed time. Agents are namespace-scoped, so different agents can have different chunking strategies for the same source content (rare but allowed — would need a second namespace).

### Embedding Worker Location

**Recommendation: BullMQ queue **inside `ai_api`** — NOT shared across plugins.** Reasons:

1. Embedding is an `ai_api`-internal concern (calling the provider for `model: text-embedding-3-small`); shared workers would require cross-plugin handoff.
2. `backend/erxes-api-shared/src/utils/mq-worker.ts` already provides `createMQWorkerWithListeners(service, queueName, processor, redis, onReady)` — queue name `ai-embed`. Tenant isolation handled via `data.subdomain` in the job payload.
3. Concurrency control via single `AI_EMBED_CONCURRENCY` env var (brief §11) is straightforward when the worker is in one process.
4. Producers (other plugins calling `trpc.ai.rag.upsert`) just push to the queue via the tRPC mutation — they don't need worker knowledge.

```
sales_api → trpc.ai.rag.upsert → ai_api adds to BullMQ queue `ai-embed` → ai_api/workers/embed.worker.ts processes → vectors stored in MongoDB Atlas / Qdrant
```

Idempotency key per brief §10: `{namespace, sourceCollection, sourceId}` — worker first deletes existing chunks for that key, then inserts new ones.

### Pattern Parallel

The BullMQ worker pattern is established (`.planning/codebase/INTEGRATIONS.md` "BullMQ" section, `backend/erxes-api-shared/src/utils/mq-worker.ts`). The automations service (`backend/services/automations/`) is the closest in spirit — long-running worker reading from a queue. Embedding workers live **inside `ai_api`** (not as a separate service) to avoid the deploy/scale duplication PR 2 doesn't need.

### Build Order

PR 2 (matches brief §12).

---

## 7. Agent Invocation Engine

### State Machine

```
                          ┌────────────────────────────────────────┐
                          │  invoke(agentId, input, sessionId)      │
                          └────────────────────┬────────────────────┘
                                               │
                                               ▼
                                ┌────────────────────────────┐
                                │ load agent, session,        │
                                │ build messages[]            │
                                │ (system + history + new)    │
                                └────────────────┬────────────┘
                                                 │
              ┌──────────────────────────────────▼──────────────────────────────────┐
              │                       LOOP: steps = 0                                │
              │  while (steps < AI_MAX_TOOL_STEPS) {                                 │
              │    1. budgetPrecheck(estimated)                                      │
              │    2. result = await provider.chat({ messages, tools })              │
              │    3. emit aiAgentStepEmitted({ step: 'chat', usage, content })      │
              │    4. write ai_invocations { kind: 'chat', ... }                     │
              │    5. budgetReconcile(actual)                                        │
              │    6. if (result.finishReason !== 'tool_calls') → break              │
              │    7. for each toolCall:                                              │
              │       - executor.executeTool({ name, input, callerAgent })           │
              │       - emit aiAgentStepEmitted({ step: 'tool', name, input, output})│
              │       - write ai_invocations { kind: 'tool', ... }                   │
              │       - append { role: 'tool', toolCallId, content } to messages     │
              │    8. steps++                                                         │
              │  }                                                                    │
              └──────────────────────────────────┬──────────────────────────────────┘
                                                 │
                                                 ▼
                          ┌────────────────────────────────────────┐
                          │ persist ai_agent_sessions.messages,    │
                          │ emit final aiAgentStepEmitted          │
                          │ ({ step: 'final', output })            │
                          └────────────────────────────────────────┘
```

### Per-Step Audit + Subscription

One `ai_invocations` row per **step** (chat call OR tool call). `sessionId` ties them together. Each row emits a `graphqlPubsub.publish('ai:invocation:' + sessionId, ...)` event for `aiAgentStepEmitted`.

For the Copilot widget's "expandable tool-call cards" (brief §9.4), the UI subscribes to `aiAgentStepEmitted(sessionId)` and renders each event as a step. The `aiInvocationStreamed` subscription is separately used for **inside-a-chat-step** token streaming. Two subscriptions, distinct channels:

- `ai:invocation:{sessionId}` — token deltas during chat steps
- `ai:agent:{sessionId}` — step-level events (chat-complete, tool-call, tool-result, final)

### Pattern Parallel

The closest existing pattern is the automation execution engine — a step-by-step state machine documented in `.planning/codebase/INTEGRATIONS.md` "AI / LLM Integrations" (which already describes per-step automation execution). The brief explicitly cross-references this — automations are the prior art.

### Build Order

PR 2. The Workspace Analyst (brief §8) is the canonical first agent and exercises the full loop end-to-end.

---

## 8. Module Federation Exposes for `ai_ui`

### Pattern from `frontend/plugins/sales_ui/module-federation.config.ts`

The verified existing pattern uses a `coreLibraries` Set — these are shared as **singletons**:

```typescript
const coreLibraries = new Set([
  'react', 'react-dom', 'react-router', 'react-router-dom',
  'erxes-ui', '@apollo/client', 'jotai', 'ui-modules', 'react-i18next',
]);
```

### Recommendation for `ai_ui`

**Use the same `coreLibraries` set verbatim.** No additions. Reasoning:

| Concern | Resolution |
|---|---|
| Apollo Client | Already in shared singletons. `useAIChat` etc. can use `useQuery`/`useSubscription` from `@apollo/client` and share the host's cache. **Do not** create a second `ApolloClient` instance. |
| Jotai atoms (scoped to `ai_ui`) | Per brief §14 "Do not introduce a new global state container." Jotai is already a shared singleton — atoms defined inside `ai_ui/src/states/` (e.g. `copilotOpenState`, `currentSessionIdState`) live in the *same Jotai Provider* as the host because Jotai is shared. **No need to wrap consumers in a Provider** — atoms work cross-MF when Jotai is a singleton. |
| Sharing AI-specific atoms with consumers | Re-export atoms via `module-federation.config.ts`: `'./atoms': './src/states/index.ts'`. Consumer plugins import `useAtomValue(currentSessionIdAtom)` from `ai_ui/atoms`. **Caveat:** atoms must be JSON-serializable references (Jotai atoms are objects — they cross MF boundaries fine because the Jotai *runtime* is the singleton). |
| New libraries (e.g., `@blocknote/core`) | Only add to `coreLibraries` if **another plugin already shares them**. Otherwise return `false` (bundle into `ai_ui`'s own chunk). |

### Final `module-federation.config.ts`

```typescript
import { ModuleFederationConfig } from '@nx/rspack/module-federation';

const coreLibraries = new Set([
  'react', 'react-dom', 'react-router', 'react-router-dom',
  'erxes-ui', '@apollo/client', 'jotai', 'ui-modules', 'react-i18next',
]);

const config: ModuleFederationConfig = {
  name: 'ai_ui',
  exposes: {
    './config': './src/config.tsx',                              // mandatory contract
    './ai': './src/modules/Main.tsx',                            // /ai/* routes
    './aiSettings': './src/modules/settings/AiSettingsIndexPage.tsx',  // settings injection (see §9)
    './Copilot': './src/modules/copilot/CopilotPanel.tsx',       // floating widget
    './hooks': './src/hooks/index.ts',                           // useAIChat, useAIDraft, ...
    './widgets': './src/widgets/index.ts',                       // AISuggestButton, AIChatPanel, ...
    './atoms': './src/states/index.ts',                          // optional: cross-plugin agent state
  },
  shared: (libraryName, defaultConfig) => coreLibraries.has(libraryName) ? defaultConfig : false,
};

export default config;
```

### Pattern Parallel

`frontend/plugins/sales_ui/module-federation.config.ts` (verbatim — only the project name, exposes list, and one library shared the same way).

### Build Order

PR 1: `./config`, `./aiSettings`. PR 2: `./Copilot`, `./atoms`. PR 3: `./hooks`, `./widgets`.

---

## 9. Settings Page Injection

### Canonical Pattern Discovered

`frontend/libs/erxes-ui/src/types/UIConfig.ts` has **two types**:

```typescript
export type IUIConfig = {
  name: string;
  path: string;
  settingsNavigation?: () => React.ReactNode;     // ← THIS is how plugins inject settings
  navigationGroup?: { ... };
  modules?: { ... }[];                            // ← these modules do NOT carry hasSettings
  widgets?: { ... };
};

export type ICoreModule = {                       // ← used only by CORE_UI core modules, not plugins
  name: string;
  hasSettings?: boolean;
  // ...
};
```

`frontend/plugins/sales_ui/src/config.tsx` confirms: `IUIConfig.modules[]` has no `hasSettings` field. Sales injects settings by:
1. Setting `settingsNavigation: () => <SalesSettingsNavigation />` on the `IUIConfig` root.
2. Exposing `'./dealsSettings': './src/pages/SalesSettingsIndexPage.tsx'` and `'./salesSettings': './src/pages/SalesSettingsIndexPage.tsx'` in module federation.
3. The core-ui's `SettingsSidebar` reads `plugin.settingsNavigation` (`frontend/core-ui/src/modules/settings/components/SettingsSidebar.tsx:49`) and `loadRemote('{pluginName}/{settingsModuleName}')` for each settings sub-route.

### Recommendation

Resolves brief §15.3 / `PROJECT.md` open question 3: **use `IUIConfig.settingsNavigation` callback + expose `'./aiSettings'`. Do NOT use `IUIConfig.modules[]` with a `hasSettings` flag — that field doesn't exist on plugin module entries; it only exists on `ICoreModule` which is for core-ui's own internal modules.**

```typescript
// ai_ui/src/config.tsx
export const CONFIG: IUIConfig = {
  name: 'ai',
  path: 'ai',
  icon: IconRobot,
  settingsNavigation: () => (
    <Suspense fallback={<div />}>
      <AiSettingsNavigation />     // shows: Providers, Models, Agents, Prompts, Budgets, Audit
    </Suspense>
  ),
  navigationGroup: {                // optional: top-level "AI" entry in main nav (Copilot launcher lives here)
    name: 'ai',
    icon: IconRobot,
    content: () => <Suspense fallback={<div />}><AiMainNavigation /></Suspense>,
  },
  modules: [
    { name: 'ai', icon: IconRobot, path: 'ai' },
  ],
  hasFloatingWidget: true,         // for the global Copilot sidecar
};
```

### Pattern Parallel

`frontend/plugins/sales_ui/src/config.tsx` (verbatim shape).

### Build Order

PR 1 (settings pages: Providers, Models, Audit, Budgets). PR 2 adds Agents + Prompts pages (brief §12).

---

## 10. Graceful Degradation (`ENABLED_PLUGINS` excludes `ai`)

### The Problem

If `ENABLED_PLUGINS=sales,frontline` (no `ai`), then when `sales_api` runs `import { trpc } from 'erxes-api-shared/utils/ai'; await trpc.ai.llm.draft({ ... })`, the call resolves to a `sendTRPCMessage({ pluginName: 'ai', ... })` — and **already** `sendTRPCMessage` checks `isEnabled(pluginName)` and returns `defaultValue` if not (`backend/erxes-api-shared/src/utils/trpc/index.ts:111-113`). So a default-`undefined` is returned, which silently breaks consumer logic.

### Recommendation: Typed Shim in `erxes-api-shared/src/ai/shim.ts`

```typescript
// erxes-api-shared/src/ai/shim.ts
import { isEnabled, sendTRPCMessage } from '../utils';

export class AINotEnabledError extends Error {
  constructor() {
    super('AI plugin is not enabled. Add "ai" to ENABLED_PLUGINS to use AI features.');
    this.name = 'AINotEnabledError';
  }
}

export const createAIClient = (subdomain: string, context?: { userId?: string }) => ({
  llm: {
    async chat(input: ChatInput): Promise<ChatResult> {
      if (!(await isEnabled('ai'))) throw new AINotEnabledError();
      return sendTRPCMessage({ subdomain, pluginName: 'ai', module: 'llm', action: 'chat', input, context, method: 'mutation' });
    },
    async embed(input: EmbedInput): Promise<EmbedResult> {
      if (!(await isEnabled('ai'))) throw new AINotEnabledError();
      return sendTRPCMessage({ subdomain, pluginName: 'ai', module: 'llm', action: 'embed', input, context });
    },
    async draft(input: DraftInput): Promise<DraftResult> {
      if (!(await isEnabled('ai'))) throw new AINotEnabledError();
      return sendTRPCMessage({ subdomain, pluginName: 'ai', module: 'llm', action: 'draft', input, context, method: 'mutation' });
    },
    // classify, extract, summarize, decide ...
  },
  rag: { search: ..., upsert: ..., delete: ... },
  agent: { invoke: ..., listSessions: ... },
  prompt: { render: ... },
});
```

### Error Shape

Frontend translation: `aiSubdomainGuard()` middleware in `ai_ui/hooks/useAIChat` catches `AINotEnabledError.message` from GraphQL errors and shows `toast({ variant: 'destructive', description: 'AI features are disabled. Contact your admin.' })`.

GraphQL error shape (from `aiAgentsInvoke` mutation when subdomain has no providers): `{ errors: [{ message: 'AI plugin is not enabled', extensions: { code: 'AI_NOT_ENABLED' } }] }`.

### Why Override `sendTRPCMessage`'s Default-Return Behavior

The default behavior is `return defaultValue` — silent. For AI calls, **throw is correct** because:
1. Caller code expects a result (a string, an embedding); `undefined` causes downstream bugs.
2. Brief §13.7 requires "fail gracefully with a clear 'AI plugin not enabled' error."
3. The shim's `isEnabled('ai')` precheck makes the error message accurate (not a generic timeout from sendTRPCMessage's default-value fallback).

### Pattern Parallel

No prior art for a typed-throwing shim in erxes. Closest pattern: `sendTRPCMessage` itself (`backend/erxes-api-shared/src/utils/trpc/index.ts`) — but it returns defaults, not throws. The shim is a thin throw-wrapper around it.

### Build Order

PR 1. The shim must ship in PR 1 so PR 2's `mountAiToolsRouter` can rely on the same disablement check.

---

## Component Boundary Summary

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                  Browser (core-ui)                                  │
│                                                                                     │
│  ai_ui (Module Federation remote, port 3020)                                       │
│  ├── ./config — IUIConfig with settingsNavigation + navigationGroup + floatingWidget│
│  ├── ./aiSettings — settings pages (Providers/Models/Agents/Prompts/Budgets/Audit) │
│  ├── ./Copilot — floating sidecar (Workspace Analyst by default)                   │
│  ├── ./hooks — useAIChat, useAIDraft, useAISuggest, useAIClassify, useRagSearch    │
│  ├── ./widgets — <AIChatPanel>, <AIDraftEditor>, <AISuggestButton>, <AIRagSearchBox>│
│  └── ./atoms — Jotai atoms (currentSessionIdAtom, copilotOpenAtom)                 │
│         │                                                                           │
│         │ GraphQL (queries, mutations, subscriptions over gateway:4000)            │
│         ▼                                                                           │
└────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │
┌────────────────────────────────────────────────────────────────────────────────────┐
│                          API Gateway (port 4000) — UNCHANGED                        │
└────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                              ai_api (port 3320)                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │ src/main.ts — startPlugin({ name: 'ai', port: 3320, meta: { automations,     │  │
│  │   segments, notifications, aiTools } })                                       │  │
│  │                                                                                │  │
│  │ src/apollo/  — GraphQL (typeDefs, resolvers, subscriptions per brief §5.2)   │  │
│  │ src/trpc/    — tRPC routers: llm, rag, agent, prompt, tools (brief §5.1)     │  │
│  │ src/modules/                                                                   │  │
│  │   ├── providers/     — CRUD + encryption + ILLMProvider resolution           │  │
│  │   ├── agents/        — CRUD + invocation engine (§7)                          │  │
│  │   ├── tools/         — registry + executor + scope check (§2, §3)            │  │
│  │   ├── prompts/       — versioned templates                                    │  │
│  │   ├── vectors/       — IVectorAdapter + MongoAtlas + Qdrant (§6)             │  │
│  │   ├── embeddings/    — BullMQ worker (queue: 'ai-embed')                     │  │
│  │   ├── rag/           — retrieve + rerank pipeline                             │  │
│  │   ├── invocations/   — chat execution + streaming bridge (§4)                │  │
│  │   ├── audit/         — ai_invocations writer                                  │  │
│  │   ├── budgets/       — atomic reserve/reconcile (§5)                          │  │
│  │   └── builtins/      — Workspace Analyst seeder                               │  │
│  │ src/meta/aiTools.ts  — declares the meta key (empty tools[] — ai_api ships    │  │
│  │                        no own tools; the key is documented for OTHER plugins) │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                       │                                              │
│                                       │ sendTRPCMessage to other plugins             │
│                                       │ (sales_api/aiTools, frontline_api/aiTools)   │
│                                       │                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │
┌────────────────────────────────────────────────────────────────────────────────────┐
│  erxes-api-shared/src/ai/                                                          │
│  ├── providers/base.ts + openai.ts + anthropic.ts + google.ts + azure.ts + ollama.ts│
│  ├── types.ts             — ChatMessage, ToolDef, AiToolDef, Usage, ...            │
│  ├── tokens.ts            — tiktoken + cost table                                   │
│  ├── streaming.ts         — graphqlPubsub bridge                                    │
│  ├── redaction.ts         — PII pre/post-process                                    │
│  ├── guardrails.ts        — prompt-injection + output moderation                    │
│  ├── encryption.ts        — encryptSecret/decryptSecret (AES-256-GCM, key from      │
│  │                            ERXES_SECRET + subdomain)                              │
│  ├── mountAiToolsRouter.ts — one-line helper for other plugins (§2)                 │
│  └── shim.ts              — createAIClient + AINotEnabledError (§10)               │
└────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ imported by both ai_api AND sales_api / frontline_api / ...
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Other plugins (sales_api, frontline_api, operation_api, content_api, ...)         │
│                                                                                     │
│  Plugin's ONE new file: src/meta/aiTools.ts                                        │
│    export default { tools: [ {name, description, inputSchema, scopes, handler} ] } │
│                                                                                     │
│  Plugin's ONE new line in src/main.ts:                                              │
│    meta: { automations, segments, aiTools }                                         │
│    trpcAppRouter: { router: t.mergeRouters(appRouter, mountAiToolsRouter(aiTools))}│
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Direction Summary (One Line Per Concern)

| Concern | Direction |
|---|---|
| 1. Provider | `ai_api/modules/*` → `erxes-api-shared/ai/providers/resolveProvider(subdomain, modelId)` → `ILLMProvider` instance → vendor HTTP |
| 2. Tool registry | `other plugin → Redis erxesservice:config:{name}.meta.aiTools` ← `ai_api` reads on boot + every 60s |
| 3. Tool execution | `ai_api/agents/loop → ai_api/tools/executor → sendTRPCMessage → consumer plugin's mountAiToolsRouter → handler → returns to executor → returns to agent loop` |
| 4. Streaming | `provider.chatStream → ai_api/invocations/stream → graphqlPubsub.publish('ai:invocation:{sid}') → GraphQL subscription resolver → ai_ui useAIChat` |
| 5. Audit + budget | `ai_api/invocations writes ai_invocations + ai_api/budgets/atomic.reserveBudget findOneAndUpdate with $expr` |
| 6. Vector store | `trpc.ai.rag.upsert → BullMQ queue 'ai-embed' → ai_api/embeddings/worker → resolveVectorAdapter → IVectorAdapter.upsert → MongoDB Atlas / Qdrant` |
| 7. Agent loop | `trpc.ai.agent.invoke → ai_api/agents/loop → chat → tool calls → chat → ... → final result + audit per step + pubsub per step` |
| 8. MF exposes | `core-ui boots → fetches plugin list → loadRemote('ai_ui/config') → loadRemote('ai_ui/Copilot') etc. on demand` |
| 9. Settings | `core-ui SettingsSidebar reads pluginsConfigState → renders plugin.settingsNavigation() → on route click loadRemote('ai_ui/aiSettings')` |
| 10. Disabled-AI | `consumer plugin → createAIClient(subdomain).llm.chat → isEnabled('ai') === false → throw AINotEnabledError → caller toast` |

## Recommended Build Order (Maps to Brief §12)

### PR 1 — Foundation (matches brief §12 PR 1)
1. `erxes-api-shared/src/ai/{types, providers/base, providers/openai, providers/anthropic, tokens, encryption, shim}` — no streaming bridge yet, no tools helper yet.
2. `ai_api` plugin skeleton via `startPlugin` (copy-and-rename `sales_api/main.ts`).
3. `ai_api/modules/{providers, audit, budgets, invocations}` — CRUD, atomic budget, audit writes.
4. `ai_api/trpc/routers/llm.ts` — chat + embed (non-streaming OK for PR 1).
5. `ai_api/apollo/` — GraphQL for Providers, Models, Audit, Budgets pages.
6. `ai_ui` plugin skeleton + Providers/Models/Audit/Budgets pages.
7. PR 1 demo: configure OpenAI → call chat → see audit row.

### PR 2 — Agents, Tools, RAG (matches brief §12 PR 2)
1. `erxes-api-shared/src/ai/{mountAiToolsRouter, streaming, tools}` — tool helper + streaming bridge.
2. `ai_api/modules/tools/{registry, executor, scope}` — tool registry + executor.
3. `ai_api/modules/agents/{loop, sessions}` — invocation engine + memory.
4. `ai_api/modules/vectors/{adapter, mongoAtlas, qdrant, namespacing, chunking}` + `ai_api/modules/embeddings/worker.ts`.
5. `ai_api/modules/rag/` + `ai_api/modules/builtins/workspaceAnalyst.ts`.
6. `ai_api/apollo/resolvers/subscriptions.ts` — `aiInvocationStreamed`, `aiAgentStepEmitted`.
7. `ai_ui/modules/copilot/CopilotPanel.tsx` + `ai_ui/modules/settings/{AgentsPage}`.
8. `backend/plugins/sales_api/src/meta/aiTools.ts` (reference implementation: `sales.get_deal`, `sales.search_deals`, `sales.update_deal`) + add to its `startPlugin` call.
9. PR 2 demo: ask Workspace Analyst "How many deals are in Qualified?" → streamed answer with citations.

### PR 3 — Automation, Prompts, MF Hooks (matches brief §12 PR 3)
1. `ai_api/meta/automations.ts` — 5 actions, 2 triggers.
2. `ai_api/modules/prompts/` + `trpc.ai.prompt.{render, list}`.
3. `ai_ui/{hooks, widgets}` — `useAIChat`, `<AIDraftEditor>`, etc.
4. `frontend/plugins/frontline_ui` — worked example: `<AISuggestButton>` in reply composer.
5. Documentation in `CLAUDE.md` + `AGENTS.md`.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Provider rate limits | Single ai_api instance fine | Add backoff per `provider.kind` (brief §10) | Per-tenant provider keys (already in design); rate-limit by `subdomain` in Redis |
| Audit log volume | ~10K rows/day, single Mongo collection | ~1M rows/day, ensure `{subdomain, createdAt: -1}` index | Move to time-series collection or Elasticsearch; partition by month |
| Embedding worker | Concurrency 4 enough | Bump `AI_EMBED_CONCURRENCY=16`, ensure Redis Cluster | Dedicated worker service, multiple ai_api replicas |
| Vector store | MongoDB Atlas single index | Per-namespace indexes; consider Qdrant for performance | Qdrant Cloud, sharded by subdomain |
| Streaming subscriptions | Default GraphQL subscriptions OK | Already using Redis-backed pubsub (horizontal scale by design) | Scale ai_api gateway-subscription-aggregation in gateway layer (existing infra) |

## Pattern Parallels (Citations)

Every recommendation traces back to an existing file in this repo:

| Recommendation | Existing pattern (file path) |
|---|---|
| `startPlugin({ name: 'ai', port: 3320, meta: {...} })` | `backend/plugins/sales_api/src/main.ts:21-32` |
| `mountAiToolsRouter` via `t.mergeRouters` | `backend/plugins/sales_api/src/trpc/init-trpc.ts` (mergeRouters pattern, see `.planning/codebase/CONVENTIONS.md` tRPC Patterns) |
| `meta.aiTools` stored in Redis | `backend/erxes-api-shared/src/utils/service-discovery.ts:142-149` (joinErxesGateway meta merge) |
| Cross-plugin tool invocation via `sendTRPCMessage` | `backend/erxes-api-shared/src/utils/trpc/index.ts:99-150` |
| Subdomain + userId propagation | `backend/erxes-api-shared/src/utils/trpc/index.ts:67-94` (encodeTRPCContextHeader) |
| GraphQL subscription via graphqlPubsub | `backend/erxes-api-shared/src/utils/graphqlPubSub.ts` |
| BullMQ embedding worker | `backend/erxes-api-shared/src/utils/mq-worker.ts:16-50` (createMQWorkerWithListeners) |
| Atomic budget update | MongoDB `findOneAndUpdate` with `$expr` (novel for erxes; standard MongoDB) |
| Vector namespacing `{subdomain}:{ns}:...` | `backend/erxes-api-shared/src/utils/elasticsearch/utils.ts` (subdomain prefixing for Elasticsearch — same idea) |
| `IUIConfig.settingsNavigation` callback | `frontend/plugins/sales_ui/src/config.tsx:30-34` |
| MF `coreLibraries` Set in `module-federation.config.ts` | `frontend/plugins/sales_ui/module-federation.config.ts:3-13` |
| `isEnabled('ai')` graceful disable | `backend/erxes-api-shared/src/utils/service-discovery.ts:204-209` |
| Provider adapter pattern (one file per vendor) | `backend/plugins/payment_api/src/apis/` (Stripe, PayPal, QPay each in own folder) |
| `createCoreModuleProducerHandler` for meta producer | `backend/plugins/sales_api/src/meta/automations.ts:11-43` |

## Anti-Patterns to Avoid (Brief §14 alignment)

| Anti-pattern | Why bad | Instead |
|---|---|---|
| Importing `from 'sales_api'` directly to call its tool handler | Breaks microservice isolation (`.planning/codebase/ARCHITECTURE.md` Anti-Patterns) | Use `sendTRPCMessage({ pluginName: 'sales', module: 'aiTools', action: 'get_deal' })` |
| Hard-coding `import OpenAI from 'openai'` in `ai_api/modules/` | Couples kernel to one vendor (brief §14) | All vendor SDKs behind `ILLMProvider` in `erxes-api-shared/src/ai/providers/` |
| Per-token audit writes | 1000s of writes per invocation | One audit row per chat step (terminal chunk); deltas live only in pubsub |
| New WebSocket transport for streaming | Brief §14 prohibits | `graphqlPubsub` channel `ai:invocation:{sessionId}` |
| Storing API keys in MongoDB plaintext | Brief §14 prohibits | `encryptSecret(plaintext, subdomain)` from `erxes-api-shared/src/ai/encryption.ts` |
| Reading `ai_tool_registry` for handler execution | Handlers don't live in Redis (stripped by `getNonFunctionProps`) | Handlers always invoked via `sendTRPCMessage` to the originating plugin |
| Stored handlers in Redis | Functions are stripped on join (`backend/erxes-api-shared/src/utils/service-discovery.ts:222-232`) | Only static metadata (name, description, inputJsonSchema, scopes) in Redis; handler invocation is always cross-plugin |
| Workspace Analyst with write tools | Brief §14 forbids day-one | Filter `*:read` scopes only when seeding builtin agent |

## Sources

- `.planning/briefs/ai_api_plugin_prompt.md` (brief, sections 3, 5, 6, 7, 8, 10, 12, 13, 14)
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/INTEGRATIONS.md`
- `backend/erxes-api-shared/src/utils/start-plugin.ts` (verified `startPlugin` signature, meta handling)
- `backend/erxes-api-shared/src/utils/service-discovery.ts` (verified `joinErxesGateway` writes meta to Redis, `getNonFunctionProps` strips functions)
- `backend/erxes-api-shared/src/utils/trpc/index.ts` (verified `sendTRPCMessage`, header-based context propagation)
- `backend/erxes-api-shared/src/utils/trpc/sendCoreModuleProducer.ts` (cross-module producer pattern)
- `backend/erxes-api-shared/src/utils/graphqlPubSub.ts` (verified pubsub primitive)
- `backend/erxes-api-shared/src/utils/mq-worker.ts` (verified BullMQ helpers)
- `backend/plugins/sales_api/src/main.ts` (canonical plugin entry)
- `backend/plugins/sales_api/src/meta/automations.ts` and `segments.ts` (canonical meta producer)
- `frontend/plugins/sales_ui/src/config.tsx` (canonical `IUIConfig` shape)
- `frontend/plugins/sales_ui/module-federation.config.ts` (canonical exposes + shared set)
- `frontend/libs/erxes-ui/src/types/UIConfig.ts` (verified `IUIConfig.settingsNavigation`, `IUIConfig.modules` has no `hasSettings`, `ICoreModule` is a separate type)
- Vercel AI SDK and LangChain.js provider-abstraction docs (compared for shape; chose normalized `{ id, name, args }` tool-call shape — lightest)
