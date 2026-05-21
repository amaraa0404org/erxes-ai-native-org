# Research Summary — erxes AI Kernel

**Synthesized:** 2026-05-21 | **Confidence:** HIGH

---

## Executive Summary

The erxes AI Kernel is a net-new pair of plugins (`ai_api` port 3320 + `ai_ui` port 3020) plus a shared module (`erxes-api-shared/src/ai/`) that makes the existing Nx/pnpm monorepo AI-native without introducing any new transports, state containers, or bundlers. The architecture is deliberately additive: it reuses Apollo Federation, tRPC `sendTRPCMessage`, Redis service-discovery, `graphql-redis-subscriptions` PubSub, BullMQ, and Module Federation exactly as `sales_api`/`sales_ui` use them today. Every other plugin gains AI in one file (`meta/aiTools.ts`) plus one line in `startPlugin({meta})`.

The milestone ships all three PRs: Foundation → Agents/Tools/RAG → Automation/Prompts/Hooks. The Core Value acceptance test (brief §13.3) is the non-negotiable milestone gate: workspace admin connects OpenAI, asks the built-in Workspace Analyst "How many deals are in the Qualified stage?", sees a streamed citable answer, and sees one audit row. That test exercises every PR sequentially and is the visible proof the foundation works.

The major risks are security-first: API key leakage through provider SDK exception chains is the single highest-risk item and must be mitigated in PR 1. Budget race conditions, vector cross-tenant leakage, and tool-call scope escalation (confused-deputy) round out the critical pitfalls. All have concrete code-level mitigations and must be baked into phase acceptance gates.

---

## Key Findings

### From STACK.md — Locked Dependency Decisions

**Net-new packages (not in repo today):**

| Location | Package | Version | Rationale |
|----------|---------|---------|-----------|
| `erxes-api-shared` | `openai` | 6.38.0 | Covers OpenAI + Azure + Ollama + OpenAI-compatible — one SDK, four adapters |
| `erxes-api-shared` | `@anthropic-ai/sdk` | 0.97.1 | Anthropic tool-call schema differs; official SDK ~80KB |
| `erxes-api-shared` | `@google/generative-ai` | 0.24.1 | **Legacy SDK required** — `@google/genai` >=1.1.0 requires Node 20+; erxes is Node 18.16.9+ |
| `erxes-api-shared` | `tiktoken` | 1.0.22 | WASM, zero install scripts, no node-gyp — safe with Nx cache |
| `erxes-api-shared` | `@anthropic-ai/tokenizer` | 0.0.4 | Pre-request budget pre-check for Claude only |
| `erxes-api-shared` | `zod-to-json-schema` | **3.23.5 exactly** | Latest 3.25.2 requires zod >=3.25.28; erxes pins zod@3.23.8 — pnpm strict peer dep mismatch |
| `erxes-api-shared` | `redact-pii-light` | 1.0.0 | Pure regex + lodash; avoids `redact-pii@3.4.0` which pulls `@google-cloud/dlp` |
| `ai_api` | `@qdrant/js-client-rest` | 1.18.0 | Default vector backend — self-hosted Qdrant matches erxes self-hosted identity |
| `ai_api` | `prom-client` | 15.1.3 | `/metrics` endpoint; co-exists with Apollo Server 4 |

Zero new frontend dependencies. Encryption uses **Node built-in `crypto` only** — zero new packages.

**Two critical infra notes:**
- Bump `ai_api` Dockerfile base from `node:18.16-alpine` → `node:18.20-alpine` (`@qdrant/js-client-rest@1.18.0` requires Node >= 18.17.0)
- `scryptSync(ERXES_SECRET, subdomain, 32)` derives per-tenant 256-bit key

**Hard avoids:** `@google/genai` (Node 20+), `zod-to-json-schema@>=3.24`, `redact-pii@3.4.0`, `ai` (Vercel SDK), `langchain`, Pinecone/Weaviate/Chroma, `crypto-js`/`node-forge`

### From FEATURES.md — Feature Scope

20 table-stakes features, all in the brief. 10 explicit anti-features in brief §14. The brief's discipline here is high — no table-stakes are missing.

**8 "beyond the brief" recommendations with v1/v2 verdicts:**

| # | Recommendation | Verdict | PR | Effort |
|---|----------------|---------|----|--------|
| R1 | Memory: rolling buffer + summarization | **v1** | 2 | 1 day |
| R2 | Reasoning: native tool-use loop only (not ReAct, not CodeAct) | **v1** | 2 | part of T8 |
| R3 | Provider-native structured output (`zodResponseFormat`/`zodOutputFormat`) | **v1** | 1 | 0.5 day/adapter |
| R4 | Cost dashboard: time-series + top-5 agents/models | **v1** | 1 | 1 day |
| R5 | Mustache-subset prompt template engine (30 LOC, no eval) | **v1** | 3 | 0.5 day |
| R6 | Per-tool rate limit via BullMQ native rate limiter | **v1** | 2 | 1 day |
| R6 | Circuit breaker via Opossum | **v2** | — | 1 day |
| R7 | Eval stub: `ai_evaluations` collection + manual replay button | **v1** | 3 | 1 day |
| R7 | Promptfoo CI integration | **v2** | — | 2 days |
| R8 | Conversation export + GDPR-compliant delete | **v1** | 2 | 1 day |

Total v1 beyond-brief additions: ~7 engineering days across 3 PRs.

### From ARCHITECTURE.md — Locked Architecture Decisions

| Decision | Resolution | Status |
|----------|-----------|--------|
| Settings injection | `IUIConfig.settingsNavigation` callback — NOT `modules[].hasSettings` (field doesn't exist on plugin modules) | Closed — resolves §15.3 |
| Tool registry discovery | Boot-time pull + 60s periodic re-scan from Redis `erxesservice:config:{name}.meta.aiTools` | Closed |
| Budget atomicity | MongoDB `findOneAndUpdate` with `$expr` conditional `$inc` (ARCHITECTURE.md §5) — OR — Redis token bucket (PITFALLS.md §P2 Option A, recommended) | **Pending — choose in Phase 1.2** |
| Streaming | Two channels over existing `graphqlPubsub`: `ai:invocation:{subdomain}:{sessionId}` (token deltas) + `ai:agent:{subdomain}:{sessionId}` (step events) | Closed |
| Graceful disablement | Typed shim `createAIClient()` in `shim.ts` that throws `AINotEnabledError` — not silent `undefined` | Closed |
| Cross-plugin tool calls | `sendTRPCMessage({ pluginName, module: 'aiTools', action })` in `trpc/index.ts:99-145` | Closed — resolves §15.4 |
| Default vector backend | Qdrant; Atlas opt-in via `AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas` | Closed — resolves §15.2 |
| MF shared config | Verbatim `sales_ui` `coreLibraries` set; explicit `singleton: true, requiredVersion` for all shared libs | Closed |

**MF exposes per PR:** PR 1: `./config`, `./aiSettings` — PR 2: `./Copilot`, `./atoms` — PR 3: `./hooks`, `./widgets`

### From PITFALLS.md — Top Pitfalls Per PR

**PR 1 critical acceptance gates:**

| Pitfall | Prevention | Test |
|---------|-----------|------|
| **P1 CRITICAL: API key leakage in SDK exception chains** | Provider adapters catch + re-throw sanitized `ProviderError`. `redactKey()` regex. GraphQL `formatError` hook. Schema has only `encryptedApiKey`. | No `sk-*` in any thrown error `.toString()` across all 6 adapters |
| **P2 HIGH: Budget race** | Redis token bucket (`INCRBY` → check → rollback on overage) | `Promise.all([invoke()] x 100)` at $5 cap → spend ≤ $5 |
| **P7 MEDIUM: Token drift** | `response.usage` is always truth for billing. Drift multipliers: Anthropic 1.15x, Google 1.10x. | `ai_invocations.inputTokens === response.usage.input_tokens` |
| **P9 HIGH: Hot audit collection** | Compound index `{subdomain:1, createdAt:-1}`. 90-day TTL. `ai_invocation_summaries` aggregate. Async write. | Audit page p95 < 500ms at 1M rows |
| **P13 HIGH: First-save key leak** | Encrypt at resolver boundary. Schema: `encryptedApiKey` only. Gateway body redactor. | CI grep: no `apiKey` field in any Mongoose schema |
| **P14 MEDIUM: ERXES_SECRET rotation** | Pick Policy A (versioned + rotation script) or Policy B (re-entry + UI warning) — ship in PR 1 | Decryption failure shows actionable message; admin has recovery path |

**PR 2 critical acceptance gates:**

| Pitfall | Prevention | Test |
|---------|-----------|------|
| **P4 CRITICAL: Tool scope escalation (confused-deputy)** | Scope check before every `sendTRPCMessage`. `sideEffects` field on tool declarations. Workspace Analyst filtered to `*:read` only. | Agent `[":read"]` tries write tool → `ScopeViolationError` |
| **P5 CRITICAL: Prompt injection via tool results** | `<tool_result untrusted="true">` boundary wrapping. Guardrails run on tool output too. System prompt treats tool result content as inert data. | Tool returns injection string → guardrail logs; agent does not act |
| **P6 CRITICAL: Vector cross-tenant leak** | Namespace = `{subdomain}:{ns}:{sourceCollection}`. Atlas index definition includes `filter: {path: 'namespace'}`. Every `$vectorSearch` includes namespace filter. Qdrant: per-tenant collections. | Upsert in subdomain A → search as subdomain B → 0 results |
| **P3 HIGH: Streaming reconnect gaps** | Sequence numbers per chunk. Redis list buffer with 10min TTL. `aiStreamReplay` query. `clientInvocationId` dedup. | Disconnect at chunk 5 → reconnect → chunks 6..N delivered, no duplicates |
| **P12 MEDIUM: Empty Workspace Analyst on first boot** | Tool registry is live query per invocation. Heartbeat push every 60s. Lazy seed per invocation. | Boot ai + sales + frontline → Analyst toolset ≥ 3 |

**PR 3 critical acceptance gates:**

| Pitfall | Prevention | Test |
|---------|-----------|------|
| **P11 HIGH: MF shared-version hard fail** | `singleton: true, requiredVersion` in MF config. `ErrorBoundary` at every `ai_ui` remote import. `useAIAvailable()` hook. | Cross-plugin smoke: single React instance |
| **§15.5: Automation >30s** | Verify engine timeout; if needed add job-queue delegation for RAG-based steps | `ai:summarize` with 5k-word input inside automation completes without timeout |

---

## Implications for Roadmap

### Suggested Phase Structure (9 phases across 3 PRs)

**PR 1 — Foundation (~2 weeks)**

**Phase 1.1 — Shared module + plugin scaffolds**
- `erxes-api-shared/src/ai/{types, providers/base, providers/openai, providers/anthropic, tokens, encryption, shim}`
- `ai_api` + `ai_ui` plugin scaffolds; Dockerfile with `node:18.20-alpine`; MF config `./config` + `./aiSettings`
- Research flag: resolve §15.1 (existing crypto helper?) via `/gsd:discuss-phase 1`

**Phase 1.2 — Provider CRUD + budget enforcement**
- `ai_api/modules/{providers, budgets}` — AES-256-GCM encryption, model registry, atomic budget reserve/reconcile/release
- `ai_api/trpc/routers/llm.ts` — non-streaming chat + embed; R3: provider-native structured output
- **Decision required here:** budget strategy (Redis bucket vs `$expr`) + ERXES_SECRET rotation policy

**Phase 1.3 — Audit log + observability**
- `ai_api/modules/{audit, invocations}` — append-only `ai_invocations` with indexes + TTL + async BullMQ write; `ai_invocation_summaries`; `prom-client` `/metrics`
- P7+P8 prevention: billing from `response.usage` only; drift multipliers in `tokens.ts`

**Phase 1.4 — Settings UI (Providers, Models, Budgets, Audit)**
- `ai_ui/modules/settings/{ProvidersPage, ModelsPage, BudgetsPage, AuditPage}`
- R4: time-series cost dashboard in BudgetsPage (Recharts, already in stack)
- PR 1 acceptance: configure OpenAI → call chat → audit row → $0 budget → `BudgetExceededError`

**PR 2 — Agents, Tools, RAG (~3 weeks)**

**Phase 2.1 — Tool registry + plugin extension**
- `erxes-api-shared/src/ai/{mountAiToolsRouter, streaming, tools}` + `ai_api/modules/tools/{registry, executor, scope}`
- `backend/plugins/sales_api/src/meta/aiTools.ts` reference impl (3 tools)
- P4+P5 prevention: scope check before every dispatch; `<tool_result untrusted>` boundary wrapping

**Phase 2.2 — Agent loop + streaming + RAG**
- `ai_api/modules/{agents, vectors, embeddings, rag, builtins}` — invocation engine + R1 (buffer+summarize) + R2 (native tool-use loop); Qdrant + Atlas adapters; BullMQ embed worker + R6 rate limit; idempotent upsert with `sourceVersion`; Workspace Analyst (lazy seed)
- Two pubsub channels with sequence numbers + Redis replay buffer (P3); R8 GDPR delete endpoints
- P6 prevention: namespace format + Atlas index `filter` field

**Phase 2.3 — Agents UI + Copilot widget**
- `ai_ui/modules/{copilot/CopilotPanel, settings/AgentsPage}`; MF exposes `./Copilot`, `./atoms`
- Explicit MF `shared` config with `singleton: true, requiredVersion` (P11)
- PR 2 acceptance: full §13.3 Analyst demo — streamed answer with deal ID citation + audit row

**PR 3 — Automation, Prompts, Hooks (~2 weeks)**

**Phase 3.1 — Automation steps + prompt registry**
- `ai_api/meta/automations.ts` (5 actions + 2 triggers); R5 Mustache-subset template resolver; prompts module with versioning + rollback; R7 eval stub
- Prerequisite: §15.5 timeout measured; choose inline vs job-queue execution mode

**Phase 3.2 — MF hooks/widgets + reference integrations + docs**
- `ai_ui/{hooks, widgets}` MF exposes; Frontline `<AISuggestButton>` worked example; "Generated by AI" badge; CLAUDE.md + AGENTS.md updated
- PR 3 acceptance: `Form Submitted → AI:Classify → If Tier A → Assign AE` automation end-to-end

### Research Flags

| Phase | Needs Research? | Reason |
|-------|----------------|--------|
| Phase 1.1 | Yes — `/gsd:discuss-phase 1` | §15.1 crypto helper location |
| Phase 1.2 | Yes — decision needed | Budget strategy + ERXES_SECRET rotation — two documented options each |
| Phase 2.1–2.3 | No | Tool registry, agent loop, RAG fully documented in ARCHITECTURE.md |
| Phase 3.1 | Yes — §15.5 verification | Automation engine timeout must be measured before committing to inline execution |

### Phase 1 Cross-Cutting Must-Ship List

These have no standalone user value but block every later phase:

- `erxes-api-shared/src/ai/shim.ts` — `createAIClient()` + `AINotEnabledError`
- `erxes-api-shared/src/ai/encryption.ts` — `encryptSecret`/`decryptSecret` with `scryptSync`
- `erxes-api-shared/src/ai/types.ts` — `ChatMessage`, `ToolDef`, `AiToolDef`, `Usage`, all Zod schemas
- `erxes-api-shared/src/ai/providers/base.ts` — `ILLMProvider` interface
- `erxes-api-shared/src/ai/tokens.ts` — static cost table + drift multipliers + eager `tiktoken` init
- `redact-pii-light@1.0.0` + `redactKey()` regex in `erxes-api-shared/src/ai/redaction.ts`
- `node:18.20-alpine` base image in `ai_api/Dockerfile`
- `ERXES_SECRET` >= 32 bytes validation at startup — fail fast with clear message

---

## Open Questions (Unresolved)

| # | Question | Status | Resolution path |
|---|----------|--------|----------------|
| §15.1 | Existing generic encryption helper in erxes? | **Open** | Codebase grep in `/gsd:discuss-phase 1` |
| §15.2 | Atlas vs Qdrant as default | **Closed** | Default = Qdrant; Atlas opt-in |
| §15.3 | Settings module pattern | **Closed** | `IUIConfig.settingsNavigation` callback |
| §15.4 | Cross-plugin tRPC call pattern | **Closed** | `sendTRPCMessage` in `trpc/index.ts:99-145` |
| §15.5 | Automation engine >30s support | **Open** | Verify runtime timeout before Phase 3.1 |
| Budget strategy | Redis token bucket vs MongoDB `$expr` | **Open** | Commit in Phase 1.2 — PITFALLS.md recommends Redis bucket |
| ERXES_SECRET rotation | Policy A vs Policy B | **Open** | Commit in Phase 1.2 — impacts `encryption.ts` API design |

---

## What the Roadmap Must NOT Include

- Vector-recall memory — v2; requires production data
- Circuit breaker via Opossum — v2; requires production thresholds
- Promptfoo CI integration — v2; needs R7 eval data first
- MCP server — brief §14; land as PR 4+ after foundation stabilizes
- Plan-then-execute reasoning — v2 on user demand
- Write-scoped Workspace Analyst tools — brief §14; read-only day one
- Multi-modal tools — not in brief
- Cost forecast + per-call histogram — v2; needs >1 month of data
- Full `ai_evaluations` UI/CLI — v2; stub ships in PR 3

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Stack decisions | HIGH | npm registry version verification 2026-05-21 |
| Feature scope | HIGH | Brief §§1-15 comprehensive; Context7 validation |
| Architecture decisions | HIGH | All anchored to verified repo file paths |
| Pitfall mitigations | HIGH | Well-attested in 2024-2026 LLM platform post-mortems + CONCERNS.md |
| Beyond-brief R1-R8 | MEDIUM-HIGH | Opinionated synthesis backed by Context7 |
| Budget/rotation decisions | MEDIUM | Two documented options each; explicit commitment needed before Phase 1.2 |

---
*Last updated: 2026-05-21 after research synthesis*
