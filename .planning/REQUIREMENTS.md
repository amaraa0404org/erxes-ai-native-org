# Requirements: erxes AI Kernel

**Defined:** 2026-05-21
**Core Value:** A workspace admin can configure an LLM provider and ask the built-in Workspace Analyst a natural-language question, getting a streamed, citable answer enforced by per-subdomain budgets and recorded in an audit log.

## v1 Requirements

Requirements for this milestone (covers brief PR 1 + PR 2 + PR 3). Each maps to a roadmap phase.

### Providers (PROV)

- [ ] **PROV-01**: Workspace admin can add a provider config (OpenAI / Anthropic / Google Gemini / Azure OpenAI / Ollama / generic OpenAI-compatible base URL) with an API key and optional default model
- [ ] **PROV-02**: API keys are stored encrypted at rest with AES-256-GCM using a per-subdomain key derived from `ERXES_SECRET + subdomain`; GraphQL never returns the key
- [ ] **PROV-03**: Workspace admin can edit a provider config without re-entering the API key (rotate-only mode)
- [ ] **PROV-04**: Workspace admin can remove a provider config
- [ ] **PROV-05**: Workspace admin can press "Test connection" and see provider latency + reachable model list within 10s
- [ ] **PROV-06**: When the master `ERXES_SECRET` rotates, the admin sees an actionable error and has a documented recovery path (re-enter or run rotation script — policy locked in Phase 1.2)

### Models (MODL)

- [ ] **MODL-01**: System surfaces available models per configured provider (chat, embed, vision, tool capability flags + context window)
- [ ] **MODL-02**: Workspace admin can mark a default chat model and a default embedding model per workspace
- [ ] **MODL-03**: Per-model cost metadata (`inputCostPer1M`, `outputCostPer1M`) is editable by admins to override the static baseline

### LLM API surface (LLM)

- [ ] **LLM-01**: `trpc.ai.llm.chat({ messages, tools?, toolChoice?, responseSchema?, temperature?, stream? })` returns `{ content, toolCalls, usage, model, finishReason }` or an async iterable of chunks
- [ ] **LLM-02**: `trpc.ai.llm.embed({ input })` returns `{ embeddings, usage }`
- [ ] **LLM-03**: Provider-native structured output is supported (`zodResponseFormat` / Anthropic forced JSON) — caller passes a Zod schema, gets typed data back
- [ ] **LLM-04**: `trpc.ai.llm.classify / extract / summarize / draft / decide` typed convenience wrappers work on top of `chat`
- [ ] **LLM-05**: Provider exceptions never leak decrypted API keys — every adapter catches and re-throws a sanitized `ProviderError`
- [ ] **LLM-06**: Rate-limit responses trigger exponential backoff up to 3 retries, then a clear `ProviderRateLimitError`

### Audit & Observability (AUDIT)

- [ ] **AUDIT-01**: Every chat / embed / tool call writes one `ai_invocations` row (subdomain, agent, user, model, provider, kind, input/output tokens, cost, latency, status, errorMessage, requestHash, toolCalls, createdAt)
- [ ] **AUDIT-02**: Billed tokens come from provider `response.usage`, not local tiktoken (which is used only for pre-call estimation, with documented per-provider drift multipliers)
- [ ] **AUDIT-03**: Workspace admin can search/filter the audit log by agent, user, model, date range, status; export to CSV
- [ ] **AUDIT-04**: Cost dashboard shows time-series (last 7/30/90 days) plus top-5 agents and top-5 models by spend
- [ ] **AUDIT-05**: `ai_invocations` has compound index `{ subdomain:1, createdAt:-1 }` and a 90-day TTL; an `ai_invocation_summaries` aggregate collection backs the dashboard
- [ ] **AUDIT-06**: `/metrics` endpoint exposes Prometheus-style counters (invocation_total, tokens_total, errors_total) labelled by provider/model/subdomain

### Budgets (BUDG)

- [ ] **BUDG-01**: Workspace admin can set monthly USD caps scoped to workspace / team / user / agent
- [ ] **BUDG-02**: Every chargeable call runs a pre-check that atomically reserves estimated cost — exceeding the cap throws `BudgetExceededError` before the provider is called
- [ ] **BUDG-03**: After the provider returns, the actual usage reconciles the reservation (release on failure, top-up on under-estimate)
- [ ] **BUDG-04**: Budget enforcement is race-free under 100 concurrent invocations against a tight cap (verified by integration test)
- [ ] **BUDG-05**: Admin can configure alert thresholds (e.g. 80%) that emit `ai:budgetExceeded` triggers
- [ ] **BUDG-06**: UI shows current month spend per scope with a progress bar

### Tool Registry & Plugin Extension (TOOL)

- [ ] **TOOL-01**: A plugin gains AI tools by adding ONE file (`src/meta/aiTools.ts` exporting `{ tools: [...] }`) and ONE line in its `startPlugin` `meta` and `trpcAppRouter` — `erxes-api-shared` provides `mountAiToolsRouter(meta)` helper
- [ ] **TOOL-02**: `ai_api` discovers tools at boot from existing Redis service-discovery (`erxesservice:config:{name}.meta.aiTools`) and re-scans every 60s; live-queries the registry on every agent invocation
- [ ] **TOOL-03**: Tool definitions store JSON Schema (converted from Zod via `zod-to-json-schema@3.23.5`) ready to send to the LLM
- [ ] **TOOL-04**: Tool execution goes via `sendTRPCMessage` to the originating plugin's mounted router — no cross-plugin direct imports
- [ ] **TOOL-05**: Scope check runs BEFORE every `sendTRPCMessage`: the invoking agent's scopes must intersect the tool's required scopes; mismatch throws `ScopeViolationError`
- [ ] **TOOL-06**: Each tool declaration has a `sideEffects: 'read' | 'write'` field used by the Workspace Analyst to filter to read-only tools
- [ ] **TOOL-07**: Every tool execution writes an `ai_invocations` row with `kind: 'tool'`
- [ ] **TOOL-08**: `sales_api` ships a reference `meta/aiTools.ts` with `sales.get_deal`, `sales.search_deals`, `sales.update_deal`

### Agents (AGNT)

- [ ] **AGNT-01**: Workspace admin can CRUD agents (name, description, systemPrompt, model, tools[], scopes[], temperature, maxSteps, memoryStrategy, redactPii)
- [ ] **AGNT-02**: `trpc.ai.agent.invoke({ agentId, input, sessionId?, userId, stream? })` runs the tool-call loop with a hard cap of `AI_MAX_TOOL_STEPS` (default 8) steps
- [ ] **AGNT-03**: Conversation memory uses rolling-buffer + summarization strategy (R1) stored on `ai_agent_sessions.messages` with `tokenUsage` tracked
- [ ] **AGNT-04**: Tool-result content is wrapped in `<tool_result untrusted="true">` boundaries before being fed back to the LLM; guardrails run on tool outputs in addition to user inputs
- [ ] **AGNT-05**: Agent steps emit `aiAgentStepEmitted({ sessionId })` subscription events; token deltas emit `aiInvocationStreamed({ sessionId })`
- [ ] **AGNT-06**: Streamed chunks carry sequence numbers; a 10-minute Redis buffer enables replay after reconnect via `aiStreamReplay` query
- [ ] **AGNT-07**: When `agent.redactPii: true`, names/emails/phones/addresses are replaced with placeholders pre-LLM and rehydrated post-LLM
- [ ] **AGNT-08**: A built-in **Workspace Analyst** is seeded on first boot per subdomain (lazy if no tools registered yet), uses every `*:read` scoped tool, ships read-only, default chat model, never given a write tool

### RAG (RAG)

- [ ] **RAG-01**: `trpc.ai.rag.search({ query, namespaces, topK?, filter? })` returns ranked hits with sourceCollection / sourceId / text / score / metadata
- [ ] **RAG-02**: `trpc.ai.rag.upsert({ namespace, sourceCollection, sourceId, text, metadata? })` is idempotent on `(namespace, sourceCollection, sourceId)` and queues embedding via BullMQ
- [ ] **RAG-03**: `trpc.ai.rag.delete({ namespace, sourceId })` removes vectors
- [ ] **RAG-04**: Default vector backend is Qdrant (`@qdrant/js-client-rest@1.18.0`); MongoDB Atlas Vector Search adapter ships and is opt-in via `AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`
- [ ] **RAG-05**: Vector namespace format is `{subdomain}:{namespace}:{sourceCollection}` — Atlas indexes include `filter: { path: 'namespace' }`; Qdrant uses per-tenant collections — cross-tenant search returns zero results (verified by integration test)
- [ ] **RAG-06**: Embedding worker is BullMQ with concurrency `AI_EMBED_CONCURRENCY` (default 4) and per-tool rate limiting via BullMQ native rate limiter
- [ ] **RAG-07**: GDPR-compliant conversation export and delete endpoints work per user

### Automation Integration (AUTO)

- [ ] **AUTO-01**: Five automation actions register via `meta/automations.ts`: `ai:classify`, `ai:extract`, `ai:summarize`, `ai:draft`, `ai:decide`
- [ ] **AUTO-02**: Two automation triggers register: `ai:agentCompleted`, `ai:budgetExceeded`
- [ ] **AUTO-03**: Each AI action's step config UI supports: model override, prompt template (Mustache-subset variable insertion from automation `execution.target`), output mapping back to the workflow target
- [ ] **AUTO-04**: AI automation actions complete inside the automation engine's timeout; if a step is known long-running it delegates to a BullMQ job-queue mode (decision locked in Phase 3.1 after §15.5 verification)
- [ ] **AUTO-05**: `Form Submitted → AI:Classify → If Tier A → Assign AE` runs end-to-end in the automation builder

### Prompts (PRMT)

- [ ] **PRMT-01**: Workspace admin can author / edit / list prompt templates with stable `key`; versions are stored with author + timestamp
- [ ] **PRMT-02**: `trpc.ai.prompt.render({ key, variables, version? })` resolves variables via Mustache-subset (no `eval`)
- [ ] **PRMT-03**: Admin can rollback to a prior prompt version
- [ ] **PRMT-04**: A minimal `ai_evaluations` collection + manual "replay against eval set" button is available (eval stub; full UI deferred to v2)

### UI (UI)

- [ ] **UI-01**: AI Settings sub-navigation appears under existing core settings via `IUIConfig.settingsNavigation` callback
- [ ] **UI-02**: `/settings/ai/providers` — list + add + edit + test, API key write-only
- [ ] **UI-03**: `/settings/ai/models` — model list per provider, default-model selectors
- [ ] **UI-04**: `/settings/ai/agents` — agent CRUD with tool picker (multi-select from registered tools) + system-prompt editor with variable hints
- [ ] **UI-05**: `/settings/ai/prompts` — template library + version history + rollback
- [ ] **UI-06**: `/settings/ai/budgets` — caps + alert thresholds + spend bars + R4 time-series cost dashboard
- [ ] **UI-07**: `/settings/ai/audit` — searchable / filterable invocation log + CSV export
- [ ] **UI-08**: Global Copilot floating sidecar (collapsible, right side) defaults to Workspace Analyst, streams tokens, renders tool-call cards (collapsed by default), shows model name on hover
- [ ] **UI-09**: Every AI-generated piece of content shows a "✨ Generated by AI" affordance with model name on hover
- [ ] **UI-10**: Every consumer (other plugin UI) sees a clean error if AI is disabled — `useAIAvailable()` hook + `<ErrorBoundary>` at every `ai_ui` remote import; no MF hard-fail on missing remote

### MF Hooks & Reference Integrations (HOOK)

- [ ] **HOOK-01**: `ai_ui` Module Federation exposes `./config`, `./Copilot`, `./atoms`, `./hooks`, `./widgets`
- [ ] **HOOK-02**: `shared` config declares `react`, `react-dom`, `@apollo/client`, `jotai`, `erxes-ui` as `singleton: true` with `requiredVersion` matched to root `package.json`
- [ ] **HOOK-03**: Hooks ship: `useAIChat({ agentId, sessionId? })`, `useAIDraft({ context, instruction })`, `useAISuggest({ context, voice? })`, `useAIClassify({ categories })`, `useRagSearch({ namespaces })`
- [ ] **HOOK-04**: Widgets ship: `<AIChatPanel>`, `<AIDraftEditor>`, `<AISuggestButton>`, `<AIRagSearchBox>` styled with `erxes-ui` + Tailwind (no new color tokens)
- [ ] **HOOK-05**: Frontline inbox reply composer integrates `<AISuggestButton>` as the worked reference example

### Cross-cutting / Quality (XCUT)

- [x] **XCUT-01**: Every collection, cache key, BullMQ queue name, vector namespace, and PubSub channel includes `subdomain`; cross-tenant access is impossible by construction (verified by integration test)
- [x] **XCUT-02**: Disabling the plugin (`ENABLED_PLUGINS` excludes `ai`) does NOT break other plugins; their `trpc.ai.*` calls hit a typed shim that throws `AINotEnabledError` with a clear message
- [ ] **XCUT-03**: A prompt-injection heuristic guard runs on user-supplied content AND on tool outputs (regex + scoring, in-house, ~80 LOC in `guardrails.ts`)
- [ ] **XCUT-04**: `pnpm install && pnpm nx build erxes-api-shared && pnpm nx build ai_api && pnpm nx build ai_ui` succeed from a clean clone
- [ ] **XCUT-05**: `pnpm nx test ai_api` passes with >70% line coverage on `src/modules/`; tests cover provider adapters, agent loop, tool registry scope enforcement, budget enforcement, RAG retrieve+rank, encryption round-trip
- [ ] **XCUT-06**: Acceptance demo passes: with `ENABLED_PLUGINS=ai,sales,frontline` and an empty MongoDB, an admin can configure OpenAI → Test Connection OK → invoke Workspace Analyst → ask "How many deals are in the Qualified stage?" → see a streamed answer citing deal IDs → see one row in the audit log
- [ ] **XCUT-07**: From inside `sales_api`, `await ctx.trpc.ai.llm.draft({ context, instruction })` works with a single import and no provider knowledge
- [ ] **XCUT-08**: Setting a workspace budget to $0 causes the next chat call to fail with `BudgetExceededError` and a UI-friendly message
- [ ] **XCUT-09**: `CLAUDE.md` and `AGENTS.md` updated with: `meta/aiTools.ts` extension point, new env vars (`AI_API_PORT`, `AI_UI_PORT`, `ERXES_SECRET`, `AI_DEFAULT_VECTOR_BACKEND`, `QDRANT_URL`, `AI_EMBED_CONCURRENCY`, `AI_DEFAULT_CHAT_MODEL`, `AI_DEFAULT_EMBED_MODEL`, `AI_BUDGET_DEFAULT_USD`, `AI_MAX_TOOL_STEPS`, `AI_GUARDRAILS_STRICT`), and a one-paragraph "How to add AI to your plugin" quickstart
- [ ] **XCUT-10**: `ai_api/Dockerfile` uses `node:18.20-alpine`; `docker-compose.yml` gains an optional `qdrant` service; `.env.sample` lists every new variable

## v2 Requirements

Deferred — acknowledged but not in this milestone's roadmap.

### Advanced Agents (AGNT-V2)

- **AGNT-V2-01**: Vector-recall memory strategy (needs production session data to tune)
- **AGNT-V2-02**: Plan-then-execute reasoning loop in addition to native tool-use
- **AGNT-V2-03**: Multi-modal tools (image / audio / video)

### Resilience (RESL-V2)

- **RESL-V2-01**: Circuit breaker per provider via Opossum
- **RESL-V2-02**: Promptfoo CI integration for prompt regression tests

### Eval (EVAL-V2)

- **EVAL-V2-01**: Full `ai_evaluations` UI with rubric editor + leaderboard
- **EVAL-V2-02**: Cost forecast + per-call histogram (needs >1 month of data)

### MCP (MCP-V2)

- **MCP-V2-01**: Bundled MCP server exposing the tool registry to external MCP clients

## Out of Scope

Explicitly excluded for v1. Documented to prevent re-introduction during planning.

| Feature | Reason |
|---------|--------|
| Plaintext API key storage anywhere (Mongo, logs, errors, GraphQL responses) | Permanent exclusion — brief §14 anti-requirement |
| Frontend-direct LLM provider calls | Permanent exclusion — keys must never reach browser; brief §14 |
| Hard dependency on any single vendor SDK inside `ai_api`'s own code | Permanent exclusion — all vendor SDKs live behind `ILLMProvider` in `erxes-api-shared/src/ai/providers/` |
| Cross-plugin direct imports (`import { x } from 'sales_api'`) for tool execution | Permanent exclusion — registry-only discovery; brief §14 |
| Write-scoped tools on Workspace Analyst | Excluded for v1 — read-only by design; revisit only after audit log + scope system battle-tested |
| New WebSocket transport for streaming | Permanent exclusion — reuse `graphql-redis-subscriptions`; brief §14 |
| New GraphQL pagination / error / ID conventions | Permanent exclusion — match `sales_api` exactly; brief §14 |
| New global frontend state container | Permanent exclusion — Jotai (scoped to `ai_ui`) + Apollo Client only; brief §14 |
| MCP server in v1 | Deferred to v2 — audit log + tool registry must stabilize first; brief §14 |
| Bumping Node baseline to 20 in this milestone | Out of scope — keeps blast radius small; `@google/generative-ai@0.24.1` (legacy) covers Gemini for now |
| LangChain / Vercel AI SDK / LlamaIndex | Excluded — adds transitive complexity; brief patterns are sufficient |
| Pinecone / Weaviate / Chroma vector stores | Excluded — Qdrant + Atlas adapters cover the deployment matrix |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 1.2 | Pending |
| PROV-02 | Phase 1.2 | Pending |
| PROV-03 | Phase 1.2 | Pending |
| PROV-04 | Phase 1.2 | Pending |
| PROV-05 | Phase 1.2 | Pending |
| PROV-06 | Phase 1.2 | Pending |
| MODL-01 | Phase 1.2 | Pending |
| MODL-02 | Phase 1.4 | Pending |
| MODL-03 | Phase 1.3 | Pending |
| LLM-01 | Phase 1.3 | Pending |
| LLM-02 | Phase 1.3 | Pending |
| LLM-03 | Phase 1.3 | Pending |
| LLM-04 | Phase 3.1 | Pending |
| LLM-05 | Phase 1.3 | Pending |
| LLM-06 | Phase 1.3 | Pending |
| AUDIT-01 | Phase 1.3 | Pending |
| AUDIT-02 | Phase 1.3 | Pending |
| AUDIT-03 | Phase 1.3 | Pending |
| AUDIT-04 | Phase 1.4 | Pending |
| AUDIT-05 | Phase 1.3 | Pending |
| AUDIT-06 | Phase 1.3 | Pending |
| BUDG-01 | Phase 1.2 | Pending |
| BUDG-02 | Phase 1.2 | Pending |
| BUDG-03 | Phase 1.2 | Pending |
| BUDG-04 | Phase 1.2 | Pending |
| BUDG-05 | Phase 1.3 | Pending |
| BUDG-06 | Phase 1.4 | Pending |
| TOOL-01 | Phase 2.1 | Pending |
| TOOL-02 | Phase 2.1 | Pending |
| TOOL-03 | Phase 2.1 | Pending |
| TOOL-04 | Phase 2.1 | Pending |
| TOOL-05 | Phase 2.1 | Pending |
| TOOL-06 | Phase 2.1 | Pending |
| TOOL-07 | Phase 2.1 | Pending |
| TOOL-08 | Phase 2.1 | Pending |
| AGNT-01 | Phase 2.2 | Pending |
| AGNT-02 | Phase 2.2 | Pending |
| AGNT-03 | Phase 2.2 | Pending |
| AGNT-04 | Phase 2.2 | Pending |
| AGNT-05 | Phase 2.2 | Pending |
| AGNT-06 | Phase 2.3 | Pending |
| AGNT-07 | Phase 2.2 | Pending |
| AGNT-08 | Phase 2.3 | Pending |
| RAG-01 | Phase 2.2 | Pending |
| RAG-02 | Phase 2.2 | Pending |
| RAG-03 | Phase 2.2 | Pending |
| RAG-04 | Phase 2.2 | Pending |
| RAG-05 | Phase 2.2 | Pending |
| RAG-06 | Phase 2.2 | Pending |
| RAG-07 | Phase 2.3 | Pending |
| AUTO-01 | Phase 3.1 | Pending |
| AUTO-02 | Phase 3.1 | Pending |
| AUTO-03 | Phase 3.1 | Pending |
| AUTO-04 | Phase 3.1 | Pending |
| AUTO-05 | Phase 3.1 | Pending |
| PRMT-01 | Phase 3.1 | Pending |
| PRMT-02 | Phase 3.1 | Pending |
| PRMT-03 | Phase 3.1 | Pending |
| PRMT-04 | Phase 3.1 | Pending |
| UI-01 | Phase 1.4 | Pending |
| UI-02 | Phase 1.4 | Pending |
| UI-03 | Phase 1.4 | Pending |
| UI-04 | Phase 2.3 | Pending |
| UI-05 | Phase 3.1 | Pending |
| UI-06 | Phase 1.4 | Pending |
| UI-07 | Phase 1.4 | Pending |
| UI-08 | Phase 2.3 | Pending |
| UI-09 | Phase 3.2 | Pending |
| UI-10 | Phase 1.1 | Pending |
| HOOK-01 | Phase 3.2 | Pending |
| HOOK-02 | Phase 1.1 | Pending |
| HOOK-03 | Phase 3.2 | Pending |
| HOOK-04 | Phase 3.2 | Pending |
| HOOK-05 | Phase 3.2 | Pending |
| XCUT-01 | Phase 1.1 | Complete |
| XCUT-02 | Phase 1.1 | Complete |
| XCUT-03 | Phase 2.1 | Pending |
| XCUT-04 | Phase 1.1 | Pending |
| XCUT-05 | Phase 3.2 | Pending |
| XCUT-06 | Phase 2.3 | Pending |
| XCUT-07 | Phase 2.1 | Pending |
| XCUT-08 | Phase 1.2 | Pending |
| XCUT-09 | Phase 3.2 | Pending |
| XCUT-10 | Phase 1.1 | Pending |

**Coverage:**
- v1 requirements: 84 total (PROV 6, MODL 3, LLM 6, AUDIT 6, BUDG 6, TOOL 8, AGNT 8, RAG 7, AUTO 5, PRMT 4, UI 10, HOOK 5, XCUT 10 — note: PROJECT.md's earlier "86" tally was an over-count; actual REQ-ID count is 84)
- Mapped to phases: 84
- Unmapped: 0 ✓

**Phase distribution (max 12 per phase enforced):**
- Phase 1.1: 6 reqs
- Phase 1.2: 12 reqs
- Phase 1.3: 12 reqs
- Phase 1.4: 8 reqs
- Phase 2.1: 10 reqs
- Phase 2.2: 12 reqs
- Phase 2.3: 6 reqs
- Phase 3.1: 11 reqs
- Phase 3.2: 7 reqs

---
*Requirements defined: 2026-05-21*
*Last updated: 2026-05-21 after roadmap creation (traceability populated by roadmapper agent)*
