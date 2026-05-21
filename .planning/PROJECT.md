# erxes AI Kernel (AI_KERNEL)

## What This Is

A new pair of plugins (`backend/plugins/ai_api` + `frontend/plugins/ai_ui`) plus a shared `erxes-api-shared/src/ai/` module that turns any erxes deployment into an AI-native platform. Every other plugin (sales, frontline, operation, content, accounting, …) becomes able to consume LLMs, embeddings, RAG, tools, and agents through a single tRPC surface and Module Federation hook set — without touching a vendor SDK. Primary audience: workspace admins who configure providers/budgets, plugin developers who integrate via tRPC + MF hooks, and end users (sales reps, support agents) who interact with the global Copilot, AI suggestions in editors, and AI automation steps.

## Core Value

A workspace admin can connect an LLM provider, ask the built-in **Workspace Analyst** a natural-language question (e.g. *"How many deals are in the Qualified stage?"*), and get a streamed, citable answer powered by tools that other plugins register — all enforced by per-subdomain budgets and recorded in an audit log. If everything else fails, this end-to-end demo must work.

## Requirements

### Validated

<!-- Inferred from existing erxes platform; these are capabilities the AI Kernel relies on, not delivers. -->

- ✓ Plugin architecture: `startPlugin(...)` from `erxes-api-shared` with GraphQL/tRPC/Express routers — existing
- ✓ GraphQL Federation via Apollo Router with subgraph per plugin — existing
- ✓ Service discovery + dynamic gateway registration via Redis (`joinErxesGateway`) — existing
- ✓ Multi-tenancy via `subdomain` extracted from hostname on every request — existing
- ✓ `meta` extension points for `automations`, `segments`, `notifications` — existing pattern to mirror
- ✓ Frontend plugins as Module Federation remotes via `@module-federation/enhanced` + Rspack — existing
- ✓ `erxes-ui` shared design system (Radix + Tailwind v4 + Tabler icons) — existing
- ✓ Real-time via `graphql-redis-subscriptions` PubSub — existing
- ✓ Job queues via BullMQ on Redis — existing
- ✓ Automation engine with pluggable `actions`/`triggers` via `meta/automations.ts` — existing

### Active

#### Foundation (PR 1)
- [ ] Provider abstraction (`ILLMProvider`) in `erxes-api-shared/src/ai/` with OpenAI + Anthropic + Google + Azure + Ollama + OpenAI-compatible adapters
- [ ] Per-subdomain provider config storage with AES-256-GCM encryption of API keys (key derived from `ERXES_SECRET + subdomain`)
- [ ] Model registry with cost metadata (`inputCostPer1M` / `outputCostPer1M`, capabilities, context window)
- [ ] tRPC: `trpc.ai.llm.chat`, `trpc.ai.llm.embed` with streaming support
- [ ] Audit log: every invocation recorded with tokens, latency, cost, user, agent, request hash
- [ ] Budget system: per workspace/team/user/agent monthly USD caps; pre-check throws `BudgetExceededError`; alert thresholds
- [ ] AI Settings UI: Providers page (add/edit/test with `Test connection`), Models page, Budgets page, Audit log page (filterable + CSV export)
- [ ] `.env.sample` extended with `AI_API_PORT=3320`, `AI_UI_PORT=3020`, `ERXES_SECRET`, `AI_*` defaults
- [ ] `ENABLED_PLUGINS=ai,…` documented; graceful "AI plugin not enabled" shim in shared lib for other plugins to call when `ai_api` is off

#### Agents, Tools, RAG (PR 2)
- [ ] Tool registry: `ai_tool_registry` collection populated by collecting `meta.aiTools` from every registered plugin at boot
- [ ] `mountAiToolsRouter(meta)` helper in `erxes-api-shared/src/ai/` so other plugins expose tools in one line
- [ ] Agent CRUD: `ai_agents` (name, system prompt, model, tools[], scopes[], temperature, maxSteps, memoryStrategy)
- [ ] Agent invocation engine with tool-call loop, scope-intersection enforcement, `AI_MAX_TOOL_STEPS` safety cap
- [ ] Agent sessions with conversation memory (`ai_agent_sessions`)
- [ ] Streaming subscriptions: `aiInvocationStreamed`, `aiAgentStepEmitted` over existing GraphQL subscriptions
- [ ] Vector store abstraction: MongoDB Atlas Vector Search adapter (primary) + Qdrant adapter (optional)
- [ ] Embedding worker (BullMQ, concurrency `AI_EMBED_CONCURRENCY`, default 4); idempotent on `(namespace, sourceCollection, sourceId)`
- [ ] RAG: `trpc.ai.rag.search`, `trpc.ai.rag.upsert`, `trpc.ai.rag.delete`
- [ ] Built-in **Workspace Analyst** agent seeded on first boot per subdomain, read-only, uses every `*:read` scoped tool
- [ ] Global Copilot floating widget (right sidecar, collapsible) defaulting to Workspace Analyst, streaming tokens, expandable tool-call cards
- [ ] Agents settings page (CRUD with tool picker + system-prompt editor with variable hints)
- [ ] Reference implementation: `backend/plugins/sales_api/src/meta/aiTools.ts` with `sales.get_deal`, `sales.search_deals`, `sales.update_deal`

#### Automation, Prompts, Hooks (PR 3)
- [ ] Five automation actions: `ai:classify`, `ai:extract`, `ai:summarize`, `ai:draft`, `ai:decide` registered via `meta/automations.ts`
- [ ] Two automation triggers: `ai:agentCompleted`, `ai:budgetExceeded`
- [ ] Automation step UI: model override, prompt template (variable insertion), output mapping back to workflow target
- [ ] Prompt registry: `ai_prompts` with versioning + rollback (`trpc.ai.prompt.render`)
- [ ] tRPC: `trpc.ai.llm.{classify, extract, summarize, draft, decide}` (typed convenience wrappers)
- [ ] Prompts settings page: library, version history, rollback button
- [ ] Module Federation exposes (`ai_ui/hooks`, `ai_ui/widgets`): `useAIChat`, `useAIDraft`, `useAISuggest`, `useAIClassify`, `useRagSearch`, `<AIChatPanel>`, `<AIDraftEditor>`, `<AISuggestButton>`, `<AIRagSearchBox>`
- [ ] Worked example: Frontline inbox reply composer integrated with `<AISuggestButton>`
- [ ] Every AI-generated piece of content shows "✨ Generated by AI" + model name on hover

#### Non-functional (cross-cutting)
- [ ] Subdomain isolation in every collection, cache key, BullMQ queue name, vector namespace
- [ ] PII redaction toggle per agent (`agent.redactPii: true`): names/emails/phones/addresses redacted pre-LLM, rehydrated post-LLM
- [ ] Guardrails: prompt-injection heuristic on user-supplied content + pluggable output-moderation hook (no-op default)
- [ ] Backpressure: exponential backoff on provider rate-limits (3 retries), then clear error
- [ ] Observability: Prometheus-style counters at `/metrics`
- [ ] Jest tests for provider adapters, agent loop, tool registry scope enforcement, budget enforcement, RAG retrieve+rank; >70% coverage on `modules/`
- [ ] CLAUDE.md / AGENTS.md updated with: `meta/aiTools.ts` extension point, new env vars, "How to add AI to your plugin" quickstart

### Out of Scope

- **Bundled MCP server** — Deferred. The audit log and tool registry must settle before adding an external MCP surface; revisit after the foundation stabilizes.
- **Frontend-direct provider calls** — Excluded permanently. All provider calls go through the backend so API keys never reach the browser.
- **Vendor SDK dependency inside `ai_api`** — Excluded permanently. All vendor SDKs live behind the `ILLMProvider` interface in `erxes-api-shared/src/ai/providers/`.
- **Write-scoped tools on Workspace Analyst v1** — Excluded for this milestone. Day-one Analyst is read-only by design.
- **Writes to other plugins via cross-plugin imports** — Excluded. Tools are discovered through `ai_tool_registry` only; no direct `from 'sales_api'` imports.
- **Plaintext API key storage** — Excluded permanently. Never in MongoDB, logs, error messages, or GraphQL responses.
- **New WebSocket transport for streaming** — Excluded. Reuse the existing `graphql-redis-subscriptions` PubSub.
- **New GraphQL pagination / error / ID conventions** — Excluded. Match `sales_api` exactly.
- **New global frontend state container** — Excluded. Jotai atoms (scoped to `ai_ui`) + Apollo Client only.
- **Prompt eval / `ai_evaluations` collection** — Deferred to Phase 2 per brief §4.
- **MongoDB Atlas Vector Search vs Qdrant as default** — Pending (resolved during plan-phase 1 via brief §15.2).

## Context

**Codebase state (mapped 2026-05-21):**
- Nx 20.0.8 + pnpm 9.12.3 monorepo. Node 18.16.9+. TypeScript 5.7.3.
- Backend: Express 4 + Apollo Server 4 + Apollo Federation + tRPC 11 + Mongoose 8 + ioredis 5 + BullMQ 5. All plugins use `startPlugin({...})` from `erxes-api-shared` and self-register via Redis.
- Frontend: React 18 + Rspack 1 + `@module-federation/enhanced` 0.6.6 + Tailwind v4 + Radix + Tabler icons + Apollo Client 3 + Jotai. Plugin UIs are MF remotes; `core-ui` is the host.
- Existing plugins on canonical ports: sales (3305), content (3303), frontline (3304), operation (3307), accounting (3308), loyalty (3309), payment (3310), tourism (3311), posclient (3312), mongolian (3313), insurance (33010). UI ports 3005+.
- The brief reserves: `ai_api` backend → port **3320**, `ai_ui` frontend → port **3020**.
- Existing meta extension pattern: `automations`, `segments`, `notifications`, `import-export`. We extend with `aiTools`.

**Reference plugins to mirror exactly:** `backend/plugins/sales_api/` (entry point, connectionResolvers, apollo, trpc, meta), `frontend/plugins/sales_ui/` (config.tsx, module-federation.config.ts).

**Source-of-truth brief:** `.planning/briefs/ai_api_plugin_prompt.md` (612 lines). All §1 contract, §3 layout, §4 schemas, §5 API surface, §6 meta extension, §7 automation, §8 Workspace Analyst, §9 UI, §10 NFRs, §11 env vars, §12 phasing, §13 acceptance, §14 anti-requirements, §15 open questions.

**Open questions deferred to `/gsd:discuss-phase 1`:**
1. Existing generic encryption helper in erxes? If not, add to `erxes-api-shared/src/ai/`.
2. MongoDB Atlas Vector Search availability across target deployments vs Qdrant as default.
3. Settings module pattern: dedicated injection vs `IUIConfig.modules` + `hasSettings: true` like `sales_ui`.
4. Canonical cross-plugin tRPC call pattern (how `sales_api` → `core-api` works today).
5. Automation engine support for actions >30s (otherwise RAG-based steps need job-queue mode).

## Constraints

- **Tech stack**: Must use existing erxes stack — no new bundlers, no new state libraries, no parallel UI library, no new pub/sub transport. — Consistency with monorepo conventions.
- **Multi-tenancy**: Every collection, cache key, BullMQ queue name, vector namespace must include `subdomain`. Never read across subdomains. — Hard tenant isolation guarantee in erxes.
- **Secret encryption**: AES-256-GCM, key derived from `ERXES_SECRET + subdomain`. Decryption only inside provider adapters. — Per-tenant key separation.
- **Provider neutrality**: No hard dependency on any single vendor SDK in `ai_api` itself. All vendor SDKs live behind `ILLMProvider` in `erxes-api-shared/src/ai/providers/`. — Future-proofing + swappability.
- **Plugin extension purity**: Other plugins gain AI by adding **one file** (`meta/aiTools.ts`) and **one line** in `startPlugin({meta: { aiTools, ... }})`. No direct cross-plugin imports. — The architectural promise of the milestone.
- **Graceful disablement**: With `ENABLED_PLUGINS` excluding `ai`, other plugins keep working. `trpc.ai.*` calls fail with a clear "AI plugin not enabled" error. — Plugin must be optional.
- **Coverage**: Jest tests aim >70% on `modules/`. — Acceptance §13.2.
- **Build**: `pnpm install && pnpm nx build ai_api && pnpm nx build ai_ui` from clean clone must succeed. — Acceptance §13.1.
- **Demo target**: End-to-end Workspace Analyst flow from clean DB must work with `ENABLED_PLUGINS=ai,sales,frontline`. — Acceptance §13.3.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat brief at `.planning/briefs/ai_api_plugin_prompt.md` as source of truth | User confirmed; brief is comprehensive and stable | — Pending |
| Ship all 3 PRs in one milestone | User wants full vision in one roadmap; lets phases be sequenced with acceptance gates per PR | — Pending |
| Defer the 5 open questions (§15) to `/gsd:discuss-phase 1` | They are local to phase 1 implementation, not project-shaping | — Pending |
| Core Value = end-to-end Workspace Analyst demo | Brief §13.3 / §8 — this is the visible proof the foundation works | — Pending |
| Audience = both admins/developers and end users equally | UI bar must hold for both; roadmap can't compromise either | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-21 after initialization*
