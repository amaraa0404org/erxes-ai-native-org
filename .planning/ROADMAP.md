# Roadmap: erxes AI Kernel (AI_KERNEL)

## Overview

This roadmap delivers the AI Kernel milestone — a new pair of plugins (`backend/plugins/ai_api` + `frontend/plugins/ai_ui`) plus a shared `erxes-api-shared/src/ai/` module that turns any erxes deployment into an AI-native platform. The work spans all three PRs from the brief (PR1 Foundation, PR2 Agents/Tools/RAG, PR3 Automation/Prompts/Hooks) and lands in 9 phases that mirror `sales_api`/`sales_ui` patterns exactly. The journey ends at the Core Value acceptance demo — workspace admin configures OpenAI, asks the built-in Workspace Analyst a natural-language question, sees a streamed citable answer, and finds one matching row in the audit log — which closes Phase 2.3 and proves every foundation piece holds together.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work (one per brief PR)
- Decimal phases (1.1, 1.2, ...): Sub-phases inside each PR

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1.1: Shared Module + Plugin Scaffolds** - `erxes-api-shared/src/ai/` foundation, `ai_api`/`ai_ui` skeletons, Dockerfile bump, env vars, disable shim (completed 2026-05-21)
- [ ] **Phase 1.2: Provider Config + Encryption + Budget Enforcement** - AES-256-GCM key encryption, atomic monthly USD budget, provider/model CRUD + Test Connection
- [ ] **Phase 1.3: LLM API Surface + Audit Log + Observability** - `trpc.ai.llm.chat`/`embed` with structured output, `ai_invocations` append-only audit, `/metrics` endpoint
- [ ] **Phase 1.4: AI Settings UI (Providers, Models, Budgets, Audit)** - Settings sub-navigation injection, cost dashboard, audit log CSV export — closes PR1
- [ ] **Phase 2.1: Tool Registry + Plugin Extension Surface** - `mountAiToolsRouter` helper, `ai_tool_registry` discovery from Redis, scope intersection enforcement, `sales_api` reference tools
- [ ] **Phase 2.2: Agent Loop + Streaming + RAG** - Agent CRUD + invocation engine with native tool-use loop, BullMQ embedding worker, Qdrant + Atlas vector adapters
- [ ] **Phase 2.3: Agents UI + Copilot Widget + Acceptance Demo** - Agents settings page, global Copilot sidecar, Workspace Analyst seed — closes PR2 with the Core Value demo
- [ ] **Phase 3.1: Automation Steps + Prompt Registry** - Five `ai:*` actions + two triggers (after §15.5 timeout verification), versioned prompts with rollback, typed LLM convenience wrappers
- [ ] **Phase 3.2: MF Hooks + Widgets + Reference Integration + Docs** - `useAIChat`/`useAIDraft`/widgets exposed via Module Federation, Frontline `<AISuggestButton>` worked example, CLAUDE.md/AGENTS.md updates — closes PR3

## Phase Details

### Phase 1.1: Shared Module + Plugin Scaffolds
**Goal**: Stand up the cross-cutting foundation every later phase depends on — `erxes-api-shared/src/ai/` shared module, `ai_api`/`ai_ui` plugin skeletons mirroring `backend/plugins/sales_api/src/main.ts` and `frontend/plugins/sales_ui/module-federation.config.ts`, Docker base bump to `node:18.20-alpine`, and the typed graceful-disable shim so other plugins can compile against `trpc.ai.*` even when `ai` is excluded from `ENABLED_PLUGINS`.
**Depends on**: Nothing (first phase)
**Requirements**: XCUT-01, XCUT-02, XCUT-04, XCUT-10, UI-10, HOOK-02
**Cross-cutting must-ship list (from SUMMARY.md):**
  - `erxes-api-shared/src/ai/shim.ts` — `createAIClient()` + `AINotEnabledError`
  - `erxes-api-shared/src/ai/encryption.ts` — `encryptSecret`/`decryptSecret` with `scryptSync(ERXES_SECRET, subdomain, 32)`
  - `erxes-api-shared/src/ai/types.ts` — `ChatMessage`, `ToolDef`, `AiToolDef`, `Usage`, all Zod schemas
  - `erxes-api-shared/src/ai/providers/base.ts` — `ILLMProvider` interface
  - `erxes-api-shared/src/ai/tokens.ts` — static cost table + per-provider drift multipliers (Anthropic 1.15x, Google 1.10x) + eager `tiktoken` init
  - `erxes-api-shared/src/ai/redaction.ts` — `redactKey()` regex + `redact-pii-light@1.0.0` wrapper
  - `ai_api/Dockerfile` uses `node:18.20-alpine` (required by `@qdrant/js-client-rest@1.18.0`)
  - `ERXES_SECRET >= 32 bytes` validation at startup — fail fast with clear message
**Success Criteria** (what must be TRUE):
  1. `pnpm install && pnpm nx build erxes-api-shared && pnpm nx build ai_api && pnpm nx build ai_ui` succeeds from a clean clone with `ENABLED_PLUGINS` unset
  2. With `ENABLED_PLUGINS=sales` (no `ai`), `sales_api` boots and any `await createAIClient(subdomain).llm.chat(...)` call throws `AINotEnabledError` with a clear actionable message (not silent `undefined`, not a generic timeout)
  3. `ai_ui` `module-federation.config.ts` declares `react`, `react-dom`, `@apollo/client`, `jotai`, `erxes-ui` as `singleton: true` with `requiredVersion` matched to root `package.json` (verbatim `coreLibraries` set from `frontend/plugins/sales_ui/module-federation.config.ts:3-13`)
  4. `useAIAvailable()` hook returns `false` when `ai_ui` remote fails to load, and every documented `ai_ui` remote import in consumer code is wrapped in an `ErrorBoundary` so MF hard-fail cannot crash the host
  5. Every collection name, Redis cache key, BullMQ queue name, vector namespace, and PubSub channel pattern declared in this phase already includes a `subdomain` segment by construction (lint check passes — no shared global)
  6. `docker-compose.yml` gains an optional `qdrant` service; `.env.sample` lists `AI_API_PORT=3320`, `AI_UI_PORT=3020`, `ERXES_SECRET`, `AI_DEFAULT_VECTOR_BACKEND`, `QDRANT_URL`, `AI_EMBED_CONCURRENCY`, `AI_DEFAULT_CHAT_MODEL`, `AI_DEFAULT_EMBED_MODEL`, `AI_BUDGET_DEFAULT_USD`, `AI_MAX_TOOL_STEPS`, `AI_GUARDRAILS_STRICT`
**Plans:** 3/3 plans complete

Plans:
- [x] 01.1-01-PLAN.md — erxes-api-shared/src/ai/ shared module (shim, encryption, redaction, tokens, providers/base, types) + preconstruct entrypoint + unit tests
- [x] 01.1-02-PLAN.md — backend/plugins/ai_api/ skeleton + ERXES_SECRET fail-fast validation + .env.sample + docker-compose.yml qdrant profile
- [x] 01.1-03-PLAN.md — frontend/plugins/ai_ui/ skeleton + 6-entry MF expose surface (singleton config) + useAIAvailable hook + AiRemoteBoundary in erxes-ui/ai

**UI hint**: yes

### Phase 1.2: Provider Config + Encryption + Budget Enforcement
**Goal**: Workspace admins can connect any of 6 provider kinds (OpenAI/Anthropic/Google/Azure/Ollama/OpenAI-compatible) with per-subdomain AES-256-GCM-encrypted API keys, and every chargeable call goes through atomic budget reserve/reconcile that holds under 100 concurrent invocations against a tight cap. Two pending decisions are locked in this phase: **budget strategy** (Redis token bucket per PITFALLS.md §P2 Option A — recommended — vs MongoDB `findOneAndUpdate` with `$expr` per ARCHITECTURE.md §5) and **`ERXES_SECRET` rotation policy** (Policy A versioned + rotation script vs Policy B re-entry with UI warning, per PITFALLS.md §P14).
**Depends on**: Phase 1.1
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06, MODL-01, BUDG-01, BUDG-02, BUDG-03, BUDG-04, XCUT-08
**Decisions locked in this phase:**
  - Budget enforcement strategy: Redis token bucket (recommended) vs MongoDB `$expr` conditional `$inc`
  - `ERXES_SECRET` rotation policy: Policy A (versioned + script) vs Policy B (re-entry + UI warning)
**Success Criteria** (what must be TRUE):
  1. Workspace admin adds a provider config (any of 6 kinds) with an API key + optional default model; key is stored only as `encryptedApiKey` (AES-256-GCM, key derived from `scryptSync(ERXES_SECRET, subdomain, 32)`); no GraphQL field returns the plaintext key; no Mongoose schema has an `apiKey` field; CI grep gate passes
  2. Admin can edit a provider config without re-entering the API key (rotate-only mode) and ciphertext is preserved when only label changes (no unnecessary re-encryption with new IV)
  3. Admin presses "Test connection" and sees provider latency + reachable model list within 10s for all 6 provider kinds (Azure picks up `deploymentName`; Ollama uses OpenAI-compatible `baseURL`)
  4. When `ERXES_SECRET` rotates per the locked policy, the admin sees an actionable error and has a documented recovery path (re-entry UI prompt OR `pnpm tsx scripts/ai/rotate-secret.ts`); decryption never throws a cryptic `CipherError`
  5. **Budget race acceptance gate (P2):** `Promise.all([invoke()] × 100)` against a $5 cap results in spend ≤ $5 (Option A) or ≤ $5.50 (Option C); the integration test passes in CI
  6. Setting any workspace budget to $0 causes the next chat call to fail with `BudgetExceededError` and a UI-friendly message linking to `/settings/ai/budgets` — verified by integration test (XCUT-08)
  7. `models` list endpoint surfaces capabilities (chat/embed/vision/tools) and context window per configured provider (MODL-01) — provider adapters never return `apiKey` in `listModels()` output
**Plans:** 9 plans

Plans:
- [ ] 01.2-01-PLAN.md — Encryption multi-version (Policy A) + errors.ts + provider SDK pins (openai, @anthropic-ai/sdk, @google/genai)
- [ ] 01.2-02-PLAN.md — Mongoose schemas + model classes (AiProviders, AiModels, AiBudgets, AiProviderTestAudit) + IModels wiring
- [ ] 01.2-03-PLAN.md — OpenAI + Anthropic + Azure adapters (listModels + testConnection) + PROVIDER_REGISTRY entries
- [ ] 01.2-04-PLAN.md — Google (@google/genai) + Ollama (raw fetch) + Custom (OpenAI-compat) adapters + registry completion
- [ ] 01.2-05-PLAN.md — Providers module: CRUD + Test Connection (encryption-at-resolver-boundary + rate-limit + audit)
- [ ] 01.2-06-PLAN.md — Models module: listModelsForProvider (persisted+live merge) + syncModelsForProvider
- [ ] 01.2-07-PLAN.md — Budgets module: Redis token bucket (D-02 Option A) + estimate + check + reconcile + release + threshold pubsub
- [ ] 01.2-08-PLAN.md — Apollo schema + resolvers + tRPC routers wiring (retires _aiPing/_aiNoop placeholders)
- [ ] 01.2-09-PLAN.md — ERXES_SECRET rotation script + BUDG-04 100-concurrent integration test + P13 CI grep gate + ci-plugin-ai workflow

### Phase 1.3: LLM API Surface + Audit Log + Observability
**Goal**: Ship the primary integration surface (`trpc.ai.llm.chat` and `trpc.ai.llm.embed`) every other plugin will call, with provider-native structured output support, sanitized error chains that never leak API keys, exponential backoff on rate limits, an append-only `ai_invocations` audit log written asynchronously through a BullMQ batching worker, and a Prometheus `/metrics` endpoint. Billing tokens come exclusively from `response.usage` (PITFALLS.md §P7 — never tiktoken estimates) and per-provider drift multipliers are documented.
**Depends on**: Phase 1.2
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-05, LLM-06, AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-05, AUDIT-06, BUDG-05, MODL-03
**Success Criteria** (what must be TRUE):
  1. `trpc.ai.llm.chat({ messages, tools?, toolChoice?, responseSchema?, temperature?, stream? })` returns `{ content, toolCalls, usage, model, finishReason }` for non-streaming calls; provider-native structured output works on OpenAI (`zodResponseFormat`) and Anthropic (forced JSON) and returns typed data parsed against caller's Zod schema
  2. `trpc.ai.llm.embed({ input })` returns `{ embeddings, usage }`; works against OpenAI and Anthropic adapters
  3. **P1 acceptance gate (CRITICAL):** No `sk-*`, `sk-ant-*`, `gsk_*`, `AIza*`, or 32-hex Azure-style key substring appears in any thrown error's `.toString()` across all 6 provider adapters; provider SDK exception chains are caught and re-thrown as sanitized `ProviderError`; gateway `formatError` hook redacts; CI snapshot test asserts this
  4. Rate-limit responses trigger exponential backoff up to 3 retries (with jitter, `retry-after` parsed without leaking the surrounding header object), then throw a clear `ProviderRateLimitError`
  5. **P7+P8 acceptance gate:** `ai_invocations.inputTokens === response.usage.input_tokens` (never overwritten by tiktoken estimate); drift-multiplier table covers Anthropic 1.15x and Google 1.10x; tool-overhead tokens included in pre-check estimate
  6. **P9 acceptance gate:** `ai_invocations` has compound index `{ subdomain: 1, createdAt: -1 }`, a 90-day TTL, and writes go through a single batching worker; `ai_invocation_summaries` aggregate collection is populated; audit query p95 < 500ms at 1M synthetic rows; `requestHash` always includes `subdomain` so hashes never collide across tenants
  7. Workspace admin can search/filter the audit log via `trpc.ai.audit.list` by agent, user, model, date range, status; CSV export endpoint returns properly-formatted RFC 4180 content
  8. `/metrics` endpoint on `ai_api` port 3320 exposes Prometheus-style counters (`ai_invocation_total`, `ai_tokens_total`, `ai_errors_total`) labelled by provider/model/subdomain; `prom-client@15.1.3` mounted as Express middleware co-exists with Apollo Server 4
  9. Admin can configure alert thresholds (e.g. 80%) per budget scope; crossing a threshold emits an `ai:budgetExceeded` trigger payload to the existing automation engine (trigger wiring lands in Phase 3.1)
  10. Admin can override per-model cost metadata (`inputCostPer1M`/`outputCostPer1M`) in the `ai_models` collection; overrides take effect on the next invocation without restart
**Plans**: TBD

### Phase 1.4: AI Settings UI (Providers, Models, Budgets, Audit)
**Goal**: Wire the four PR1 settings pages into `IUIConfig.settingsNavigation` (resolves brief §15.3 — NOT `IUIConfig.modules[].hasSettings` because that field doesn't exist on plugin module entries per `frontend/libs/erxes-ui/src/types/UIConfig.ts`), ship the R4 time-series cost dashboard (Recharts already in stack), and deliver the PR1-closing acceptance demo: configure OpenAI → call chat → see audit row → set budget to $0 → next call throws `BudgetExceededError`.
**Depends on**: Phase 1.3
**Requirements**: UI-01, UI-02, UI-03, UI-06, UI-07, MODL-02, BUDG-06, AUDIT-04
**Success Criteria** (what must be TRUE):
  1. AI Settings sub-navigation appears under existing core settings via `IUIConfig.settingsNavigation` callback exactly mirroring `frontend/plugins/sales_ui/src/config.tsx:30-34`; `ai_ui` exposes `./aiSettings` via Module Federation
  2. `/settings/ai/providers` page lists configured providers, allows add/edit/test/remove; API key field is write-only (input shows `••••` when present; no GraphQL response carries the value)
  3. `/settings/ai/models` page surfaces available models per configured provider with capability flags and context window; admin can mark a default chat model and default embedding model per workspace (MODL-02)
  4. `/settings/ai/budgets` page lets admins set monthly USD caps per workspace/team/user/agent scope, configure alert thresholds, and shows current month spend per scope with a progress bar (BUDG-06); includes R4 time-series cost dashboard (last 7/30/90 days) with top-5 agents and top-5 models by spend (AUDIT-04)
  5. `/settings/ai/audit` page provides searchable/filterable invocation log (by agent, user, model, date range, status) with CSV export; default view is "top agents by cost / top users / errors-over-time" trends (filter-drilldown UX, not a giant raw table)
  6. **PR1 acceptance gate:** Starting from a clean DB with `ENABLED_PLUGINS=ai`, admin completes the flow: add OpenAI provider → Test Connection returns OK with model list → invoke `trpc.ai.llm.chat` from a smoke test → one `ai_invocations` row visible in the Audit page within 2 seconds → set workspace budget to $0 → next chat call surfaces `BudgetExceededError` in the UI with a link to `/settings/ai/budgets`
**Plans**: TBD
**UI hint**: yes

### Phase 2.1: Tool Registry + Plugin Extension Surface
**Goal**: Deliver the architectural keystone — any plugin gains AI tools by adding ONE file (`src/meta/aiTools.ts`) and ONE line in `startPlugin({ meta: { aiTools } })` + merging `mountAiToolsRouter(aiTools)` into its existing tRPC router. Tools are discovered from Redis service-discovery at boot + every 60s, stored in `ai_tool_registry` with `lastSeenAt` heartbeats, and executed via `sendTRPCMessage` (never direct cross-plugin imports). Scope intersection is checked before every dispatch; the in-house guardrail module ships and runs on user-supplied content. The reference implementation ships in `backend/plugins/sales_api/src/meta/aiTools.ts` with `sales.get_deal`, `sales.search_deals`, `sales.update_deal`.
**Depends on**: Phase 1.4
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06, TOOL-07, TOOL-08, XCUT-03, XCUT-07
**Success Criteria** (what must be TRUE):
  1. A plugin developer can add AI tools by editing exactly ONE new file (`src/meta/aiTools.ts` exporting `{ tools: [...] }`) and ONE line in `startPlugin({ meta: { aiTools } })` plus merging `mountAiToolsRouter(aiTools)` into the existing `appRouter` — verified by `sales_api` adding 3 tools in this exact pattern
  2. `ai_api` discovers tools at boot by reading Redis `erxesservice:config:{name}.meta.aiTools` for every registered plugin (using existing `backend/erxes-api-shared/src/utils/service-discovery.ts:142-149` machinery — no new endpoint, no protocol change), and re-scans every 60s; stale entries (no heartbeat for 5min) are filtered out at query time
  3. Each tool's `inputSchema` (Zod) is converted to JSON Schema via `zod-to-json-schema@3.23.5` at registration time and stored on `ai_tool_registry.inputJsonSchema` ready to send to the LLM
  4. Tool execution flows through `sendTRPCMessage({ pluginName, module: 'aiTools', action })` (`backend/erxes-api-shared/src/utils/trpc/index.ts:99-145`); a CI grep gate confirms zero `import { x } from 'sales_api'` patterns inside `backend/plugins/ai_api/`
  5. **P4 acceptance gate (CRITICAL):** Scope check runs BEFORE every `sendTRPCMessage` dispatch; an agent with `scopes: ['sales:deals:read']` attempting to invoke a tool whose handler internally tries to call a `*:write` tool throws `ScopeViolationError`; transitive escalation is blocked; tools must declare `sideEffects: 'read' | 'write' | 'external'` and the registry refuses to register tools whose scopes contradict declared side effects
  6. Each tool execution writes one `ai_invocations` row with `kind: 'tool'` (TOOL-07), including `requiredScopes`, `agentScopes`, `granted` chain for audit
  7. **XCUT-03 acceptance gate:** Prompt-injection heuristic (`erxes-api-shared/src/ai/guardrails.ts`, ~80 LOC of regex + scoring per STACK.md §G) runs on every user-supplied content; detection events are logged to `ai_invocations.guardrailFlags[]`
  8. From inside `sales_api`, `await createAIClient(subdomain).llm.draft({ context, instruction })` works with a single import (`from 'erxes-api-shared/utils/ai'`) and zero provider knowledge in the calling code (XCUT-07)
  9. `backend/plugins/sales_api/src/meta/aiTools.ts` ships with `sales.get_deal`, `sales.search_deals`, `sales.update_deal` and each handler calls `await checkPermission('sales:deals:read'|'write')` exactly like regular Mongoose mutations (defense in depth)
**Plans**: TBD

### Phase 2.2: Agent Loop + Streaming + RAG
**Goal**: Ship the invocation engine that powers every conversational AI surface — `trpc.ai.agent.invoke` with the native tool-use loop (R2), rolling-buffer + summarization memory strategy (R1), `<tool_result untrusted="true">` boundary wrapping (P5 mitigation), PII redaction with placeholder rehydration, and the BullMQ embedding worker with per-tool rate limiting (R6). Vector adapters ship for Qdrant (default) and MongoDB Atlas Vector Search (opt-in), both behind a single `IVectorAdapter` interface, with namespace format `{subdomain}:{namespace}:{sourceCollection}` enforcing hard tenant isolation.
**Depends on**: Phase 2.1
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-07, RAG-01, RAG-02, RAG-03, RAG-04, RAG-05, RAG-06
**Success Criteria** (what must be TRUE):
  1. Workspace admin can CRUD agents (`name`, `description`, `systemPrompt`, `model`, `tools[]`, `scopes[]`, `temperature`, `maxSteps`, `memoryStrategy`, `redactPii`) via `trpc.ai.agent.*` (UI ships in Phase 2.3)
  2. `trpc.ai.agent.invoke({ agentId, input, sessionId?, userId, stream? })` runs the tool-call loop with a hard cap of `AI_MAX_TOOL_STEPS` (default 8) per-agent overrideable; per-step audit row + pubsub event per step
  3. Conversation memory uses rolling-buffer + summarization strategy (R1) stored on `ai_agent_sessions.messages` with `tokenUsage` tracked; old turns summarized by a smaller model when token budget is exceeded
  4. **P5 acceptance gate (CRITICAL):** Tool-result content is wrapped in `<tool_result tool="..." untrusted="true">...</tool_result>` boundaries before being fed back to the LLM; system prompt includes the boundary directive; guardrails run on tool outputs in addition to user inputs; test asserts that a tool returning "Ignore previous instructions" string causes guardrail detection logged and the agent does not act on it (AGNT-04)
  5. Agent steps emit `aiAgentStepEmitted({ sessionId })` subscription events; chat-step token deltas emit `aiInvocationStreamed({ sessionId })` on the existing `graphql-redis-subscriptions` PubSub; channels are subdomain-keyed (`ai:invocation:{subdomain}:{sessionId}`) per ARCHITECTURE.md §4
  6. When `agent.redactPii: true`, names/emails/phones/addresses (US/EU regex via `redact-pii-light@1.0.0`) are replaced with placeholders pre-LLM; rehydration map is per-invocation; round-trip test confirms placeholders are correctly substituted back into the LLM output
  7. `trpc.ai.rag.search({ query, namespaces, topK?, filter? })` returns ranked hits with `sourceCollection`, `sourceId`, `text`, `score`, `metadata`; `trpc.ai.rag.upsert` is idempotent on `(namespace, sourceCollection, sourceId)` and queues embedding via BullMQ; `trpc.ai.rag.delete` removes vectors
  8. Default vector backend is Qdrant (`@qdrant/js-client-rest@1.18.0`, per-tenant collections); MongoDB Atlas Vector Search adapter ships and is selected via `AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`; Atlas index definition includes `filter: { path: 'namespace' }` and every `$vectorSearch` includes the namespace filter
  9. **P6 acceptance gate (CRITICAL):** Vector namespace format is `{subdomain}:{namespace}:{sourceCollection}`; integration test upserts vectors for subdomain A and searches as subdomain B → 0 results, no errors (smoke test passes both adapters)
  10. **P15 acceptance gate:** Embedding worker reads the source row at job-start (not from payload) and uses atomic upsert with `sourceVersion: { $lte: deal.updatedAt }` guard; enqueuing 10 upserts for the same `(namespace, sourceId)` with different texts results in exactly one vector matching the latest `sourceVersion`
  11. **P10 acceptance gate:** Embedding worker uses BullMQ with concurrency `AI_EMBED_CONCURRENCY` (default 4) and per-provider-per-subdomain Redis token-bucket rate limiting (R6); 429 responses trigger exponential backoff with jitter and respect `retry-after`; simulated 429 burst does not pile up retries unbounded
**Plans**: TBD

### Phase 2.3: Agents UI + Copilot Widget + Acceptance Demo
**Goal**: Deliver the user-visible surface and the milestone's Core Value acceptance demo. The Agents settings page ships agent CRUD with a tool picker (multi-select from registered tools) and a system-prompt editor with variable hints. The global Copilot floating sidecar (right side, collapsible) defaults to the Workspace Analyst, streams tokens via the existing GraphQL subscriptions transport with sequence numbers + 10-min Redis replay buffer (P3 mitigation), renders tool-call cards as expandable cards (collapsed by default), and shows model name on hover. GDPR-compliant conversation export/delete endpoints ship. **This phase closes when the brief §13.3 acceptance demo passes: configure OpenAI → Workspace Analyst → "How many deals are in the Qualified stage?" → streamed cited answer + audit row.**
**Depends on**: Phase 2.2
**Requirements**: UI-04, UI-08, AGNT-06, AGNT-08, RAG-07, XCUT-06
**Core Value acceptance demo flag:** XCUT-06 closes this phase. The end-to-end demo per brief §13.3 — `ENABLED_PLUGINS=ai,sales,frontline` + empty MongoDB → admin configures OpenAI → Test Connection OK → invoke Workspace Analyst → ask "How many deals are in the Qualified stage?" → see a streamed answer citing deal IDs → see one row in the audit log — is the non-negotiable gate that closes Phase 2.3 and proves every PR1 + PR2 piece holds together.
**Success Criteria** (what must be TRUE):
  1. `/settings/ai/agents` page provides agent CRUD with a tool picker (multi-select from the live `ai_tool_registry`, filtered by visible scopes), a system-prompt editor with `{{variable}}` hints UI, and inline validation that flags scope/sideEffects mismatches
  2. Global Copilot floating sidecar (right side, collapsible) mounts when `hasFloatingWidget: true` on `IUIConfig`; defaults to the Workspace Analyst session; streams tokens; renders tool-call cards (name + 1-line input summary visible immediately, full payload expandable); model name shown on hover
  3. **P3 acceptance gate:** Streamed chunks carry monotonic `seq` numbers; a 10-minute Redis list buffer enables replay via `aiStreamReplay(invocationId, sinceSeq)` query; client `clientInvocationId` dedup prevents double-billing on Enter-mashing; subscription test simulates WS disconnect at chunk 5 → reconnect → chunks 6..N delivered in order with no duplicates
  4. **P12 acceptance gate (built-in Workspace Analyst):** Seeded lazily on first invocation per subdomain (no boot-time race against late-joining plugins); uses every `*:read` scoped tool in `ai_tool_registry` filtered at query time; default chat model; never given a write tool (regression test asserts toolset contains no `:write` scopes); boot `ai + sales + frontline` → Analyst toolset ≥ 3 (sales.get_deal, sales.search_deals registered)
  5. `trpc.ai.rag.exportUserData(userId)` and `trpc.ai.rag.deleteUserData(userId)` GDPR endpoints return / remove all conversation messages and vectors associated with that user across namespaces (RAG-07)
  6. **XCUT-06 / Core Value acceptance demo (CLOSES PHASE 2.3):** Starting from `ENABLED_PLUGINS=ai,sales,frontline` and an empty MongoDB, the operator: (a) opens AI Settings, adds an OpenAI provider, presses Test Connection → green checkmark + model list, (b) opens the Copilot sidecar, (c) asks "How many deals are in the Qualified stage?", (d) sees streamed tokens with at least one expandable tool-call card citing one or more deal IDs, (e) opens the Audit page and sees one matching row with non-zero `inputTokens` / `outputTokens` / `costUsd` and the request hash
**Plans**: TBD
**UI hint**: yes

### Phase 3.1: Automation Steps + Prompt Registry
**Goal**: Plug AI into the existing automation builder via `meta/automations.ts` — five `ai:*` actions (`classify`, `extract`, `summarize`, `draft`, `decide`) and two triggers (`ai:agentCompleted`, `ai:budgetExceeded`) — plus the prompt registry with versioning, rollback, and the R7 eval stub. Typed convenience wrappers (`trpc.ai.llm.classify` / `extract` / `summarize` / `draft` / `decide`) layer on top of the base `chat` API. **Prerequisite: brief §15.5 automation-engine timeout verification — measure the current engine's per-step timeout before committing to inline-vs-job-queue execution mode; this gates the design of long-running summarize/RAG steps.**
**Depends on**: Phase 2.3
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, PRMT-01, PRMT-02, PRMT-03, PRMT-04, LLM-04, UI-05
**Prerequisite (gate):** §15.5 automation-engine timeout must be measured and documented BEFORE this phase begins; the result determines whether `ai:summarize` and other potentially long-running steps run inline or delegate to a BullMQ job-queue mode. Without this measurement, AUTO-04 cannot be designed correctly.
**Success Criteria** (what must be TRUE):
  1. Five automation actions register via `ai_api/src/meta/automations.ts`: `ai:classify`, `ai:extract`, `ai:summarize`, `ai:draft`, `ai:decide` — visible in the existing automation builder UI without engine modifications
  2. Two automation triggers register: `ai:agentCompleted` (fires on agent invocation finish with usage/cost/status payload) and `ai:budgetExceeded` (fires when a configured alert threshold from BUDG-05 is crossed)
  3. Each AI action's step config UI in the automation builder supports model override, Mustache-subset prompt template (no `eval`, ~30 LOC resolver per R5) with variable insertion from `execution.target`, and output mapping back to the workflow target
  4. **AUTO-04 acceptance gate (after §15.5 verification):** AI automation actions complete inside the automation engine's measured timeout; if a step is known long-running it delegates to a BullMQ job-queue mode and resumes the workflow via `ai:agentCompleted` trigger callback; `ai:summarize` with a 5k-word input completes end-to-end inside an automation without timeout error
  5. **AUTO-05 acceptance gate:** End-to-end automation `Form Submitted → AI:Classify → If Tier A → Assign AE` runs successfully in the automation builder with realistic test data
  6. Workspace admin can author / edit / list prompt templates with stable `key` (PRMT-01); each save creates a new version row with author + timestamp; `trpc.ai.prompt.render({ key, variables, version? })` resolves variables via Mustache-subset (PRMT-02)
  7. Admin can rollback to a prior prompt version (PRMT-03); in-flight invocations using the previous version complete with their original version (not affected by rollback mid-flight)
  8. `/settings/ai/prompts` page shows the template library, version history per template, diff between versions, and a rollback button (UI-05)
  9. `trpc.ai.llm.classify / extract / summarize / draft / decide` typed convenience wrappers work on top of `chat`, return strongly-typed results, and call providers with Zod-derived JSON schemas (LLM-04)
  10. A minimal `ai_evaluations` collection + manual "replay against eval set" button is available in the Prompts page (eval stub per R7; full UI deferred to v2 per PRMT-04)
**Plans**: TBD
**UI hint**: yes

### Phase 3.2: MF Hooks + Widgets + Reference Integration + Docs
**Goal**: Ship the frontend half of the architectural keystone — Module Federation exposes `useAIChat`, `useAIDraft`, `useAISuggest`, `useAIClassify`, `useRagSearch` hooks plus `<AIChatPanel>`, `<AIDraftEditor>`, `<AISuggestButton>`, `<AIRagSearchBox>` widgets — all styled with `erxes-ui` + Tailwind (no new color tokens). The Frontline inbox reply composer integrates `<AISuggestButton>` as the worked reference example. Every AI-generated piece of content shows the "✨ Generated by AI" affordance with model name on hover. CLAUDE.md and AGENTS.md gain the "How to add AI to your plugin" quickstart and document every new env var. PR3 acceptance closes the milestone.
**Depends on**: Phase 3.1
**Requirements**: HOOK-01, HOOK-03, HOOK-04, HOOK-05, UI-09, XCUT-05, XCUT-09
**Success Criteria** (what must be TRUE):
  1. `ai_ui` `module-federation.config.ts` final state exposes `./config`, `./aiSettings`, `./Copilot`, `./atoms`, `./hooks`, `./widgets` (HOOK-01); MF singleton config verified via cross-plugin smoke test showing a single React instance and single Jotai store across `sales_ui` + `ai_ui` + host
  2. Hooks ship and work cross-plugin: `useAIChat({ agentId, sessionId? })`, `useAIDraft({ context, instruction })`, `useAISuggest({ context, voice? })`, `useAIClassify({ categories })`, `useRagSearch({ namespaces })`; cross-plugin smoke test consumes `useAIDraft` from `sales_ui` against `ai_ui`'s Apollo Client (HOOK-03)
  3. Widgets ship and work cross-plugin: `<AIChatPanel>`, `<AIDraftEditor>`, `<AISuggestButton>`, `<AIRagSearchBox>` — all styled with `erxes-ui` primitives + Tailwind v4 (no new color tokens introduced) (HOOK-04)
  4. **HOOK-05 acceptance gate:** Frontline inbox reply composer integrates `<AISuggestButton>` — one-click "Insert" updates the Blocknote editor in-place; `accept / reject / edit` rates tracked via `ai_invocations.feedback`
  5. Every AI-generated piece of content shows a "✨ Generated by AI" affordance always visible (small sparkle icon) + model name in tooltip + full provenance (model, agent, time) on detail expand (UI-09)
  6. **XCUT-05 acceptance gate:** `pnpm nx test ai_api` passes with >70% line coverage on `src/modules/`; tests cover provider adapters, agent loop, tool registry scope enforcement, budget enforcement, RAG retrieve+rank, encryption round-trip
  7. **XCUT-09 acceptance gate:** `CLAUDE.md` and `AGENTS.md` updated with (a) `meta/aiTools.ts` extension point, (b) all new env vars (`AI_API_PORT`, `AI_UI_PORT`, `ERXES_SECRET`, `AI_DEFAULT_VECTOR_BACKEND`, `QDRANT_URL`, `AI_EMBED_CONCURRENCY`, `AI_DEFAULT_CHAT_MODEL`, `AI_DEFAULT_EMBED_MODEL`, `AI_BUDGET_DEFAULT_USD`, `AI_MAX_TOOL_STEPS`, `AI_GUARDRAILS_STRICT`), (c) one-paragraph "How to add AI to your plugin" quickstart, and (d) `ERXES_SECRET` rotation policy (chosen in Phase 1.2) documented in the Operations section
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1.1. Shared Module + Plugin Scaffolds | 3/3 | Complete   | 2026-05-21 |
| 1.2. Provider Config + Encryption + Budget Enforcement | 0/9 | Not started | - |
| 1.3. LLM API Surface + Audit Log + Observability | 0/TBD | Not started | - |
| 1.4. AI Settings UI (Providers, Models, Budgets, Audit) | 0/TBD | Not started | - |
| 2.1. Tool Registry + Plugin Extension Surface | 0/TBD | Not started | - |
| 2.2. Agent Loop + Streaming + RAG | 0/TBD | Not started | - |
| 2.3. Agents UI + Copilot Widget + Acceptance Demo | 0/TBD | Not started | - |
| 3.1. Automation Steps + Prompt Registry | 0/TBD | Not started | - |
| 3.2. MF Hooks + Widgets + Reference Integration + Docs | 0/TBD | Not started | - |
