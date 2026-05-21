# Feature Research — erxes AI Kernel (`ai_api` + `ai_ui`)

**Domain:** AI-native foundation for a multi-tenant SaaS Experience Operating System
**Researched:** 2026-05-21
**Confidence:** HIGH (brief is the source of truth; ecosystem patterns validated via Context7 against LangChain, OpenAI, Anthropic, Vercel AI SDK, Promptfoo, BullMQ docs)

> Companion to STACK.md, ARCHITECTURE.md, PITFALLS.md, SUMMARY.md. This file enumerates **what** ships; the others say **how**.

---

## Feature Landscape

### Table Stakes (Users Expect These — Ship or They Leave)

Workspace admins and plugin developers in 2026 will not adopt an AI platform foundation that is missing any of these. They are non-negotiable.

| # | Feature | Why Expected | Brief § | Complexity | PR | Notes |
|---|---------|-------------|---------|------------|----|-------|
| T1 | Multi-provider abstraction (OpenAI, Anthropic, Google, Azure, Ollama, OpenAI-compatible) behind `ILLMProvider` | Provider-neutrality is the entry ticket; admins won't bet on a single vendor | §3, §5.1, §10, §14 | MED | 1 | Brief explicitly forbids vendor SDK in `ai_api` itself; SDKs live in `erxes-api-shared/src/ai/providers/` |
| T2 | Per-subdomain provider config + AES-256-GCM key encryption | Tenant isolation + secret hygiene is regulatory baseline | §1, §4 (`ai_providers`), §10 | MED | 1 | Key derived from `ERXES_SECRET + subdomain`; never logged; `hasApiKey: Boolean!` on GraphQL, never the key |
| T3 | Model registry with cost metadata (`inputCostPer1M`, `outputCostPer1M`, `capabilities`, `contextWindow`) | Cost calc + capability gating are impossible without it | §4 (`ai_models`), §10 | LOW | 1 | Static seed table in `erxes-api-shared/src/ai/tokens.ts`, admins override per-model |
| T4 | tRPC `ai.llm.chat` + `ai.llm.embed` with streaming | The primary integration surface for every other plugin | §5.1 | MED | 1 | Streams via existing `graphql-redis-subscriptions` PubSub — **no new WebSocket** (anti-feature) |
| T5 | Audit log of every invocation (tokens, latency, cost USD, user, agent, request hash) | Compliance, billing, debugging — all impossible without it | §1.6, §4 (`ai_invocations`), §10 | MED | 1 | Row written even for failed/throttled calls; request hash enables retry-deduping |
| T6 | Per-workspace/team/user/agent monthly USD budget with pre-check + alert thresholds | Admins will not connect a paid API key without a hard cap | §1.6, §4 (`ai_budgets`), §10, §13.6 | MED | 1 | `BudgetExceededError` thrown pre-call; UI shows current spend with progress bar |
| T7 | Tool registry collected from every plugin's `meta/aiTools.ts` via existing service-discovery channel | The one-file-per-plugin promise; the architectural keystone | §6 | HIGH | 2 | Mirrors `meta/automations.ts` discovery exactly — same channel `automations`/`segments` use |
| T8 | Agent CRUD + invocation engine with tool-call loop + scope-intersection enforcement + `AI_MAX_TOOL_STEPS` cap | Without agents, this is just an LLM proxy; agents are the product | §4 (`ai_agents`), §5.1, §10 | HIGH | 2 | Loop pattern proven by Vercel AI SDK `stopWhen: isStepCount(N)` and LangChain ReAct |
| T9 | Streaming subscriptions (`aiInvocationStreamed`, `aiAgentStepEmitted`) | 2026 users expect token-by-token UX; non-negotiable for chat | §5.2, §10 | MED | 2 | Reuse `graphql-redis-subscriptions` PubSub; channel keyed by `sessionId` |
| T10 | Vector store + embedding worker + RAG search/upsert/delete | RAG is the second-most-common AI workflow after chat | §4 (`ai_vectors`, `ai_vector_namespaces`), §5.1 | HIGH | 2 | MongoDB Atlas Vector Search primary, Qdrant optional; BullMQ worker with `AI_EMBED_CONCURRENCY` |
| T11 | Built-in Workspace Analyst agent seeded on first boot | The demo that proves the foundation works — Core Value | §1.7, §8, §13.3 | MED | 2 | Read-only on day one (anti-feature: writes); uses every `*:read` tool registered |
| T12 | Global Copilot floating widget (right sidecar, collapsible) | The end-user visible surface; without it the foundation is invisible | §9.2 | MED | 2 | Defaults to Workspace Analyst; streams tokens; tool calls render as expandable cards |
| T13 | Five `ai:*` automation actions (`classify`, `extract`, `summarize`, `draft`, `decide`) + two triggers | Plugs AI into the workflow builder admins already know | §7 | MED | 3 | Registered via `meta/automations.ts` — zero changes to automation engine |
| T14 | Module Federation hooks/widgets (`useAIChat`, `useAIDraft`, `useAISuggest`, `useAIClassify`, `useRagSearch`, `<AIChatPanel>`, `<AIDraftEditor>`, `<AISuggestButton>`, `<AIRagSearchBox>`) | <10-lines-of-code promise for plugin devs; the frontend half of the architectural keystone | §9.3 | MED | 3 | Exposed via `ai_ui/hooks` and `ai_ui/widgets` |
| T15 | Settings UI: Providers, Models, Budgets, Audit (filterable + CSV export), Agents, Prompts pages | Admins won't configure via SQL or curl in 2026 | §9.1 | MED | 1/2/3 | Providers/Models/Budgets/Audit in PR1; Agents in PR2; Prompts in PR3 |
| T16 | "Test connection" button per provider | First touchpoint of trust — does my key work? | §9.1, §5.2 (`aiProvidersTest`) | LOW | 1 | Ping provider, list models, return latency |
| T17 | `BudgetExceededError` user-friendly UX with link to budget settings | When something is blocked, tell the user how to fix it | §9.4, §13.6 | LOW | 1 | Catch in core-ui and link to `/settings/ai/budgets` |
| T18 | "Generated by AI" affordance + model name on hover for every AI output | Provenance/UX norm in 2026; partially regulatory (EU AI Act tier-2 transparency) | §9.4 | LOW | 3 | Applied via the MF hooks/widgets — single source of truth |
| T19 | Graceful disablement (`ENABLED_PLUGINS` excluding `ai` doesn't break other plugins) | The optionality contract of erxes's plugin system | §10, §13.7 | LOW | 1 | Shim in `erxes-api-shared/src/ai/` returns clear "AI plugin not enabled" error |
| T20 | Prompt registry with versioning + rollback | Prompt drift detection — admins need a way back when a model upgrade breaks things | §4 (`ai_prompts`), §5.1 (`prompt.render`), §9.1 | MED | 3 | `aiPromptsRollback(key, toVersion)` mutation |

**Total table stakes: 20.** Brief covers all 20. None are "beyond the brief".

---

### Differentiators (What Makes This AI-Native, Not AI-Bolted-On)

These are the choices that make erxes feel architecturally AI-native — the moats that competing CRM/Ops platforms with bolted-on Copilots cannot match without rebuilding their foundation.

| # | Feature | Value Proposition | Brief § | Complexity | PR | Notes |
|---|---------|-------------------|---------|------------|----|-------|
| D1 | **One-file plugin extension** (`meta/aiTools.ts` + one line in `startPlugin({meta})`) | Plugin devs add AI in <30min, zero new mental model — same shape as `automations.ts`/`segments.ts` they already use | §6, §6.1, §6.3 | (foundation already in T7) | 2 | The architectural promise of the entire milestone |
| D2 | **MF-shared React hooks** in <10 LOC | Frontend devs get AI UI by `import { useAIDraft } from 'ai_ui/hooks'` — no copy-paste boilerplate per plugin | §9.3, §1.3 | (foundation already in T14) | 3 | Standardizes UX too — every plugin's AI feels the same |
| D3 | **Built-in Workspace Analyst** that answers natural-language graph questions out of the box | Day-one demo with no setup — proves the foundation works, becomes a sales artifact | §8, §13.3 | (foundation already in T11) | 2 | Seeded automatically; uses every `*:read` scope tool; explicitly read-only |
| D4 | **AI steps inside the existing automation builder** | No new UI to learn; automation users gain AI without leaving the workflow editor | §7 | (foundation already in T13) | 3 | Variable interpolation from `execution.target`; output mapping back to workflow target |
| D5 | **Tool-call scope intersection enforcement** at runtime | An agent can only call tools whose required scopes ∩ agent's granted scopes is non-empty — solves the "Claude wrote to my prod DB" class of incidents | §6.3, §10 | (slice of T8) | 2 | Verified before every tool dispatch; reject + audit on mismatch |
| D6 | **Per-tenant key derivation** (`ERXES_SECRET + subdomain` → AES-256-GCM) | Stronger than industry-standard "single workspace key" — a key leak limits blast radius to one tenant | §4, §10 | (slice of T2) | 1 | Decryption only inside provider adapters |
| D7 | **Provider neutrality with single-file adapter additions** | A new provider (DeepSeek, Mistral, Cohere) ships in one PR to `erxes-api-shared/src/ai/providers/` with zero call-site changes | §3, §5.1, §10 | (foundation already in T1) | 1 | The `ILLMProvider` interface is the seam |
| D8 | **Optional PII redaction per agent** with pre-LLM redact + post-LLM rehydrate | EU AI Act + GDPR safety net without forcing all agents to lose context | §10 | MED | 2 | `agent.redactPii: true`; names/emails/phones/addresses → placeholders |
| D9 | **Prompt-injection heuristic + pluggable output-moderation hook** | Default-on safety; pluggable for workspaces that bring their own moderation provider | §10, §3 (`guardrails.ts`) | MED | 2 | Heuristic: "ignore previous", role-flip patterns, base64-encoded prompts |
| D10 | **Cost-attribution-ready audit log** with agent / user / session / model breakdowns + CSV export | Finance teams can chargeback by team/user/agent without a separate analytics product | §4 (`ai_invocations`), §5.2 (`aiCostSummary`) | MED | 1 | `groupBy: 'agent'|'user'|'model'|'day'`; powers the dashboard in D14 below |
| D11 | **Idempotent RAG upsert** keyed on `(namespace, sourceCollection, sourceId)` | Re-running a plugin sync doesn't double-index; deletions cascade cleanly | §10 | LOW | 2 | Hash check before embedding; skip + audit if unchanged |
| D12 | **Backpressure with exponential backoff on provider rate-limits** | Production resilience without manual incident response | §10 | LOW | 1 | 3 retries with jitter, then clear error with retry-after surfaced to caller |
| D13 | **Tool execution row in audit log (`kind: 'tool'`)** with input/output | Reviewability — admins can see every agent action with full context | §6.3, §4 | LOW | 2 | Renders inline as expandable cards in the Copilot widget |
| D14 | **Time-series + breakdown cost dashboard** (by agent/model/user/day) | Beyond raw audit log — proactive cost management | NOT in brief — recommended addition | MED | 1 | See §"Beyond the Brief" R4 below |

**14 differentiators**, of which **13 are in the brief** and **1 is a "beyond the brief" addition** (D14, the cost dashboard upgrade).

---

### Anti-Features (Do NOT Build — Brief is Explicit)

The brief §14 is unusually disciplined about what to refuse. These are anti-features because they look attractive but would either undermine the architecture or invite worse problems than they solve.

| # | Anti-Feature | Why It Looks Good | Why It's Actually Bad | Alternative | Brief § |
|---|--------------|-------------------|------------------------|-------------|---------|
| A1 | **MCP server in v1** | MCP is the 2025-2026 hot standard for AI tool interop | Audit log + tool registry must stabilize first; an unstable MCP surface is worse than none. Compounds blast radius of bugs. | Ship MCP as PR4 after foundation hardens (phase 2) | §14, §1 ("Out of Scope") |
| A2 | **Write-scoped tools on Workspace Analyst v1** | "Make it do things, not just answer" feels more impressive | One hallucinated mutation deletes a $1M deal. Day-one trust is lost. | Read-only Analyst day one; admins manually wire write tools to bespoke agents after they trust the platform | §14, §8 |
| A3 | **Plaintext API key storage** anywhere (DB, logs, errors, GraphQL responses) | "Just for dev" / "I'll encrypt later" | Catastrophic when (not if) a workspace DB leaks; non-negotiable for SaaS | AES-256-GCM at rest from PR1; GraphQL exposes only `hasApiKey: Boolean!` | §14 |
| A4 | **Frontend-direct LLM calls** ("just put the OpenAI key in env, what could go wrong") | Saves a network hop; some SDK tutorials show this | Key reaches the browser → 100% chance of exfiltration; can't enforce budgets/audit | All provider calls through `ai_api` backend; frontend uses tRPC/MF hooks only | §14 |
| A5 | **Bundled vendor SDK as hard dep of `ai_api`** | Easier first commit | Locks the kernel to one vendor; future providers need surgery | All vendor SDKs in `erxes-api-shared/src/ai/providers/*.ts` behind `ILLMProvider` | §14 |
| A6 | **New WebSocket transport for streaming** | "Streaming wants a dedicated channel" | Forks the realtime infra; the existing `graphql-redis-subscriptions` PubSub already handles it | Reuse `aiInvocationStreamed` over existing subscriptions | §14 |
| A7 | **New global state container for `ai_ui`** | Redux/Zustand/Valtio feels "more correct for AI state" | Forks the frontend state story; every other plugin already learned Jotai | Jotai atoms scoped to `ai_ui` + Apollo Client for server state | §14 |
| A8 | **New GraphQL pagination/error/ID conventions** | "AI is special, it needs different patterns" | Forks the frontend integration story; every other plugin has to special-case `ai_*` queries | Match `sales_api` exactly — `aiInvocationsPage`, `String!` IDs, error.message | §14 |
| A9 | **Cross-plugin imports** (e.g. `import { loadDealClass } from 'sales_api'`) | Easier than the registry round-trip | Breaks microservice isolation, creates build-time coupling, makes `sales_api` un-deployable without `ai_api` | All cross-plugin reads go through `ai_tool_registry` → tRPC | §14, §10 |
| A10 | **Prompt eval / regression harness as full PR1 feature** | Mature AI shops have it day one | High-effort, low day-one ROI for v1 audience (workspace admins) — they have zero prompts to regress yet | Stub `ai_evaluations` collection in PR2; full eval UI/CLI in phase 2 (see R7 below) | §14 ("Out of Scope") |

**10 anti-features**, all in the brief. The brief's discipline here is a major asset — these are exactly the traps a typical AI platform falls into.

---

## Beyond the Brief — Recommended Additions

The brief is comprehensive but stops short on **eight production-grade concerns** that 2026 buyers will probe in due diligence. Each below has an explicit v1 / v2 / skip verdict with rationale.

### R1. Conversation Memory Strategy — Pick TWO of {buffer, summarize, vector-recall} for v1

**Brief reference:** §4 — `ai_agents` has a `memoryStrategy` field; brief does **not** enumerate the options.

**The three industry-standard patterns** (verified via Context7 against LangChain `short-term-memory` and Vercel AI SDK `03-agents/06-memory.mdx`):

| Strategy | How It Works | When to Use | Cost | Complexity |
|----------|--------------|-------------|------|------------|
| **Rolling buffer** | Keep last N messages; drop oldest. `messages.slice(-N)`. | Short sessions, cheap models | Low (only recent tokens billed) | LOW |
| **Summarization** | When approaching context limit, ask a cheap model to summarize older messages into a single system prefix; keep last 2-4 verbatim. | Long-running chats, premium models | Medium (summary call) | MED |
| **Vector-recall** | Embed every turn into a session-scoped namespace; on each new turn, RAG-retrieve top-K relevant past turns. | Multi-hour / cross-session memory | High (embed every turn + retrieve) | HIGH |

**Verdict:**
- **v1 (PR2): rolling buffer + summarization.** These cover 95% of agent sessions and the summarization pattern is a battle-tested LangChain default (`createSummarizationMiddleware`).
- **v2: vector-recall.** Defer because it requires per-session vector namespaces and embedding cost amplification — needs the foundation in T10 to harden first.
- **Schema:** `memoryStrategy: 'buffer' | 'summarize' | 'vector'` with `bufferSize?: number` and `summarizeThreshold?: number`. Default to `summarize` because it's the safest fallback (no context loss for cheap models, no surprise overflows for premium models).

**Confidence:** HIGH (LangChain has these exact three; Vercel AI SDK has provider-defined memory tools for option 1).

---

### R2. Multi-Step Agent Reasoning Pattern — Pick the OpenAI/Anthropic Tool-Use Loop (Not ReAct)

**Brief reference:** §6.3, §8, §10 — references "agent loop" + `AI_MAX_TOOL_STEPS` but doesn't pick a pattern.

**The four industry-standard patterns:**

| Pattern | Mechanism | When to Use | Drawback |
|---------|-----------|-------------|----------|
| **OpenAI/Anthropic tool-use loop** | Native `tool_calls` + `tool_use` blocks → execute → feed `tool_result` → loop until no tool calls or step cap | 2025-2026 default; all premium providers support natively | Doesn't expose chain-of-thought to user |
| **ReAct** (Reason+Act) | Prompt format with "Thought: ... Action: ... Observation: ..." text blocks | Works on any LLM (including ones without tool APIs) | Brittle — depends on the model never breaking format; pre-tool-API era |
| **Plan-then-execute** | First call: generate a plan; subsequent calls: execute each step | Long multi-tool sequences with clear structure | Two LLM round-trips minimum; plan can drift from reality |
| **CodeAct / Code as actions** | Model writes Python/JS that calls tools, executes in sandbox | Complex data manipulation tasks | Requires sandboxing; security blast radius is huge |

**Verdict:**
- **v1 (PR2): OpenAI/Anthropic native tool-use loop only.** This is the LangGraph and Vercel AI SDK default (`Tool Loop Agent` in Vercel AI SDK `packages/ai/src/agent/tool-loop-agent.ts`). The brief's `AI_MAX_TOOL_STEPS` cap fits this pattern exactly. Implementation is ~50 lines per provider adapter.
- **v2: plan-then-execute** for complex workflows where the user explicitly opts in (e.g. an Analyst agent variant labeled "Deep Research mode"). Defer because day-one Analyst doesn't need it.
- **Skip permanently: ReAct text format**, **CodeAct**. ReAct is pre-API-era and brittle; CodeAct's security implications (untrusted code execution) exceed what an Experience OS should ship.

**Confidence:** HIGH (verified against LangChain `agents` docs and Vercel AI SDK `tool-loop-agent.ts` source).

---

### R3. Output Schema Enforcement — Use Provider-Native `response_format` with Zod-Driven Retry-on-Parse-Fail

**Brief reference:** §5.1 mentions `responseSchema?: ZodSchema` on `chat()` but doesn't specify enforcement.

**The 2026 state of the art (verified via Context7 against `openai-node` helpers + `anthropic-sdk-typescript` helpers):**

| Provider | Native Method | Strictness |
|----------|---------------|------------|
| OpenAI | `response_format: zodResponseFormat(Schema)` via `client.chat.completions.parse({...})` — strict JSON schema mode | **Guaranteed valid JSON** (provider-enforced) |
| Anthropic | `output_config: { format: zodOutputFormat(Schema) }` via `client.messages.parse({...})` | **Guaranteed valid JSON** since Claude Sonnet 4.5 |
| Google Gemini | `response_mime_type: 'application/json'` + `response_schema` | Guaranteed valid JSON |
| Azure OpenAI | Same as OpenAI when on `gpt-4o-2024-08-06+` | Guaranteed valid JSON |
| Ollama / OpenAI-compatible | `format: 'json'` (Ollama) or `response_format: {type: 'json_object'}` (loose) | **Best-effort** — parse-fail retry needed |

**Verdict:**
- **v1 (PR1): adopt provider-native structured output in every `ILLMProvider` adapter** for OpenAI/Anthropic/Google/Azure; fall back to Zod-parse-and-retry for Ollama/OpenAI-compatible.
- The `extract()` / `classify()` / `decide()` tRPC convenience wrappers in §5.1 **must** use this — they're meaningless without schema enforcement.
- **Retry budget:** max 2 retries on parse-fail (the third fail throws; consume budget for all attempts so abusive prompts can't infinite-loop).
- **Anti-recommendation:** do **not** try to roll your own "tool use as forced JSON" hack — provider-native is faster, cheaper, more reliable, and supported by both flagship vendors.

**Confidence:** HIGH (OpenAI `zodResponseFormat` and Anthropic `zodOutputFormat` are official SDK helpers as of Sonnet 4.5).

---

### R4. Cost Dashboard — Time-Series + Breakdown by Agent/Model/User in PR 1

**Brief reference:** §5.2 has `aiCostSummary(range: DateRange, groupBy: String): [AiCostBucket!]!` but UI spec in §9.1 only lists "Audit log page (filterable + CSV export)". The cost dashboard is implicit, not explicit.

**What 2026 buyers expect to see in a cost dashboard:**
- **Time-series chart** of spend (daily/weekly/monthly) with budget cap overlay
- **Top-5 agents by spend** this month
- **Top-5 users by spend** this month
- **Spend by model** (pie or bar) — surfaces "we should switch from gpt-4o to gpt-4o-mini for classification"
- **Forecast** — at current run-rate, you'll hit budget on day X
- **Per-call cost histogram** — surfaces outliers (the one 100k-token call)

**Verdict:**
- **v1 (PR1): ship a single Budgets page that includes the time-series + top-5-agents + top-5-models breakdown.** Recharts (already in `erxes-ui`) handles all of this. ~1 day of frontend work.
- **v2: forecast + per-call histogram.** Defer because they need >1 month of data to be useful.
- **Why not skip:** without this, admins use the raw audit log + Excel — they will, and they'll resent it. The infrastructure (`aiCostSummary` resolver) is already in §5.2; only the UI is missing.

**Confidence:** HIGH (table-stakes pattern in every billing SaaS — Stripe, AWS Cost Explorer, Vercel usage page).

---

### R5. Prompt Template Variable Resolution — Use a Tiny Mustache-Compatible Subset

**Brief reference:** §7 says "prompt template (with variable insertion from the automation context)" but does not specify the syntax.

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **Native template literals** (`${execution.target.name}`) | Zero deps; familiar to devs | Requires eval-equivalent → security risk; not safe for user-authored templates |
| **Handlebars** | Battle-tested; helpers; conditionals | 600KB+ dep; overkill for variable substitution |
| **Mustache** | Logic-less; tiny (~5KB); safe by default | No conditionals — but that's actually desirable for prompts |
| **Custom regex `{{var.path}}` resolver** | Tiny (~30 LOC); no eval; predictable | Need to re-implement nested path resolution |

**Verdict:**
- **v1 (PR3): custom Mustache-compatible regex resolver in `erxes-api-shared/src/ai/templates.ts`** (~30 LOC). Supports `{{path.to.var}}` against the execution context only. No helpers, no conditionals, no partials.
- **Rationale:** prompts authored by workspace admins must be safe by construction. Handlebars helpers can call functions = security risk. Mustache logic-less is the right default.
- **v2:** if admins ask for conditionals/loops, escalate to Mustache.js (the actual library) — but only when there's a real use case.

**Confidence:** MEDIUM (no single industry default; this is an opinion based on safety-first design).

---

### R6. Per-Tool Rate Limiting + Circuit Breaker — Ship Rate Limiting in PR2, Circuit Breaker in v2

**Brief reference:** NOT in brief — recommended addition.

**The risk:** an agent calls `sales.search_deals(query: "")` with no filter in a loop → 10,000 DB hits → MongoDB pegs. The brief's `AI_MAX_TOOL_STEPS=8` cap is too coarse — a single agent run can issue 8 expensive calls.

**Two-level protection (industry pattern, verified via Opossum docs):**

| Layer | Mechanism | Library | When to Add |
|-------|-----------|---------|-------------|
| **Per-tool rate limit** | Token bucket per `(subdomain, agentId, toolName)` keyed in Redis | BullMQ's built-in rate limiter (already in stack) | **v1 (PR2)** |
| **Circuit breaker** | After N consecutive failures or P95-latency spikes, fast-fail with fallback | Opossum (~1 day to integrate) | **v2** — wait for production data to set thresholds |

**Verdict:**
- **v1 (PR2): per-tool rate limit** with default 60 calls/min per `(subdomain, agentId, toolName)`. Overridable on the tool definition (`rateLimit: { rpm: 30 }`). Audit-log a `rate_limited` status on rejection.
- **v2: circuit breaker via Opossum** wrapping tool dispatch. Triggers: 5 consecutive timeouts OR P95 > 30s for 1 minute → open circuit for 30s. Fallback: return `tool_unavailable` to the agent so it can adapt.
- **Why not skip:** without rate limits, the first agent that runs in a loop will be a P0 incident. Without circuit breakers, a downstream plugin outage will hang every agent run via `AI_MAX_TOOL_STEPS` timeouts.

**Confidence:** HIGH (BullMQ has native rate limiting; Opossum is the de facto Node circuit-breaker).

---

### R7. Eval / Regression Harness — Ship the Stub in v1, Real UI in v2

**Brief reference:** §4 marks `ai_evaluations` as Phase 2; §14 explicitly defers full prompt eval.

**The risk:** model providers ship breaking changes (e.g. "gpt-4o-2026-06-01" — Claude Opus 5 — Gemini 3). Without a regression harness, you discover regressions in production by customer complaint.

**What a v1 stub looks like (~1 day of work):**
- `ai_evaluations` collection with `{ promptKey, promptVersion, model, input, expectedOutput, actualOutput, passed, score, runAt }`
- A single button in the Prompts settings page: "Run regression" — replays a stored input set against the current prompt+model, records pass/fail.
- No CI integration, no UI for authoring eval sets — those are v2.

**Verdict:**
- **v1 (PR3): ship the stub** — the collection + manual replay button. Reason: every prompt edit in PR3 should record at least one "this is the expected output for this input" pair, so by the time v2 ships there's eval data to use.
- **v2: Promptfoo integration** (verified via Context7 — Promptfoo has GitHub Action + CLI + matrix testing). Promptfoo is the industry default and would integrate via `.github/workflows/ci-ai-prompts.yml`.
- **Skip permanently:** building a homegrown full eval framework. Promptfoo is open-source and ahead of anything we'd build.

**Confidence:** HIGH (Promptfoo is the established 2026 default; verified against `/websites/promptfoo_dev`).

---

### R8. Conversation Export + GDPR-Compliant Delete — Ship in PR2

**Brief reference:** NOT in brief — recommended addition. Brief §4 has `ai_agent_sessions` and `ai_invocations` but no export/delete affordance.

**The risk:** GDPR Article 17 (right to erasure) requires that workspace admins can delete a specific user's AI conversations on request. Without an explicit endpoint, this is "go run a Mongo query" — won't pass a SOC 2 audit.

**Minimum viable:**
- **Export**: `trpc.ai.export.userData({ userId })` → JSON blob of all sessions + invocations + audit rows for that user, signed and time-stamped. CSV/JSON download from the Audit page.
- **Delete**: `trpc.ai.delete.userData({ userId, retainAuditRows: true })` → deletes sessions + sets `userId: 'redacted-{hash}'` on audit rows (audit rows kept for finance/security but PII stripped).
- **Vector cleanup:** also delete any `ai_vectors` rows where `metadata.userId === userId`.

**Verdict:**
- **v1 (PR2)** with the agent + session work — natural place to add it because that's where the schemas land.
- **Why not defer to v2:** the moment one EU customer signs, this is a compliance blocker. Better to land it with the schemas than retrofit.

**Confidence:** HIGH (GDPR Article 17 is settled law; pattern is standard across SaaS).

---

### Beyond-the-Brief Summary

| # | Recommendation | v1/v2/Skip | PR | Effort | Rationale |
|---|----------------|-----------|----|--------|-----------|
| R1 | Memory: buffer + summarize | v1 | 2 | 1 day | Covers 95% of sessions; vector-recall is v2 |
| R2 | Reasoning: native tool-use loop only | v1 | 2 | (part of T8) | The 2026 default; ReAct/CodeAct are not erxes problems |
| R3 | Structured output via provider-native | v1 | 1 | 0.5 day per adapter | Already supported by every premium provider |
| R4 | Cost dashboard upgrade (time-series + top-5) | v1 | 1 | 1 day | Recharts already in stack |
| R5 | Mustache-subset prompt template engine | v1 | 3 | 0.5 day | Safety > flexibility for admin-authored prompts |
| R6 | Per-tool rate limit | v1 | 2 | 1 day | Without it, first looping agent is a P0 |
| R6 | Circuit breaker (Opossum) | v2 | — | 1 day | Wait for production thresholds |
| R7 | Eval stub (collection + replay button) | v1 | 3 | 1 day | Captures eval pairs early so v2 has data |
| R7 | Promptfoo integration | v2 | — | 2 days | Don't build our own; integrate the leader |
| R8 | Conversation export + GDPR delete | v1 | 2 | 1 day | Compliance blocker for EU customers |

**v1 additions total: ~7 days of additional work across 3 PRs** — material but not prohibitive given the value.

---

## Feature Dependencies

```
[T1 Provider abstraction]
      └─requires──> [T2 Encryption + provider config]
                          └─requires──> [T3 Model registry]
                                              └─requires──> [T4 tRPC llm.chat/embed]
                                                                   └─requires──> [T5 Audit log]
                                                                                       └─requires──> [T6 Budget enforcement]

[T7 Tool registry]
      └─requires──> [T4 tRPC llm.chat]
      └─requires──> existing service-discovery (already in erxes)

[T8 Agent engine]
      └─requires──> [T7 Tool registry]
      └─requires──> [R1 Memory strategy]
      └─requires──> [R2 Reasoning pattern]
      └─requires──> [R3 Structured output] (for extract/classify/decide)

[T9 Streaming subscriptions]
      └─requires──> existing graphql-redis-subscriptions

[T10 Vector store + RAG]
      └─requires──> [T4 tRPC llm.embed]
      └─requires──> [T5 Audit log]
      └─requires──> existing BullMQ

[T11 Workspace Analyst]
      └─requires──> [T7 Tool registry]
      └─requires──> [T8 Agent engine]
      └─requires──> [T10 RAG] (so it can answer about indexed docs)
      └─requires──> at least one *_api plugin shipping aiTools.ts (sales)

[T12 Copilot widget]
      └─requires──> [T9 Streaming subscriptions]
      └─requires──> [T11 Workspace Analyst]
      └─requires──> [T14 MF hooks] (it uses useAIChat itself)

[T13 Automation actions]
      └─requires──> [T4 tRPC llm.chat] + convenience wrappers
      └─requires──> [R3 Structured output] (for classify/extract/decide)
      └─requires──> [R5 Prompt template resolver]

[T14 MF hooks/widgets]
      └─requires──> [T4 tRPC llm.chat]
      └─requires──> [T9 Streaming subscriptions]

[T20 Prompt registry]
      └─enhances──> [T13 Automation actions]
      └─enhances──> [R7 Eval stub]

[R4 Cost dashboard] ──enhances──> [T6 Budgets]
[R6 Rate limit] ──enhances──> [T7/T8 Tool dispatch]
[R8 GDPR export/delete] ──enhances──> [T5 Audit] + [T8 Sessions]
```

### Critical Dependency Notes

- **T7 (Tool registry) is on the critical path for everything in PR2.** Until it works, no agents, no Analyst, no automation step (T13 has its own pseudo-tools but the demo flow needs T7).
- **R3 (structured output) is silently on the critical path for T13's classify/extract/decide** — without it those actions are unreliable.
- **T9 (streaming) must land before T12 (Copilot) ships** — Copilot without streaming feels broken in 2026.
- **T11 (Workspace Analyst) is the acceptance test for the entire architecture.** If T7 is poorly designed, T11 surfaces it.

---

## MVP Definition

### Launch With (PR 1 — Foundation, ~2 weeks of work)

The minimum that proves the foundation pattern works without agents or RAG:

- [x] T1 Multi-provider abstraction (OpenAI + Anthropic minimum; Google/Azure/Ollama/custom in same PR per brief §12 PR1)
- [x] T2 Provider config + AES-256-GCM encryption per subdomain
- [x] T3 Model registry with cost metadata
- [x] T4 tRPC `llm.chat` + `llm.embed` (streaming chat)
- [x] T5 Audit log with full attribution
- [x] T6 Budget pre-check + thresholds
- [x] T15 Settings UI for Providers / Models / Budgets / Audit
- [x] T16 Test-connection button
- [x] T17 BudgetExceededError UX
- [x] T19 Graceful disablement
- [x] **R3 Provider-native structured output** (in every adapter)
- [x] **R4 Cost dashboard upgrade**
- [x] D6 Per-tenant key derivation (slice of T2)
- [x] D7 Provider neutrality (slice of T1)
- [x] D12 Backpressure with retry

**PR 1 acceptance:** add OpenAI key → call chat from a test script → see invocation in audit log → set budget=$0 → next chat fails with `BudgetExceededError`. (Brief §13.3 partial — no Analyst yet.)

### Add After Validation (PR 2 — Agents, Tools, RAG, ~3 weeks)

PR 1 validated; now add the agentic layer:

- [x] T7 Tool registry + meta extension
- [x] T8 Agent CRUD + invocation engine
- [x] T9 Streaming subscriptions
- [x] T10 Vector store + RAG
- [x] T11 Workspace Analyst (seeded)
- [x] T12 Global Copilot widget
- [x] T15 Agents settings page (additional)
- [x] **R1 Memory: buffer + summarize**
- [x] **R2 Native tool-use loop**
- [x] D1 One-file plugin extension (delivered via T7)
- [x] D3 Built-in Workspace Analyst (delivered via T11)
- [x] D5 Scope intersection enforcement (slice of T8)
- [x] D8 Optional PII redaction per agent
- [x] D9 Prompt-injection heuristic + moderation hook
- [x] D11 Idempotent RAG upsert
- [x] D13 Tool execution audit rows
- [x] **R6 Per-tool rate limit**
- [x] **R8 Conversation export + GDPR delete**
- [x] Reference impl: `backend/plugins/sales_api/src/meta/aiTools.ts` with 3 tools

**PR 2 acceptance:** brief §13.3 full demo — admin asks Analyst "how many deals in Qualified" → streamed answer with citation → audit log shows tool call + chat call.

### Add After Validation (PR 3 — Automation, Prompts, Hooks, ~2 weeks)

PR 2 validated; now make AI usable inside the rest of erxes:

- [x] T13 Five `ai:*` automation actions + two triggers
- [x] T14 MF hooks/widgets
- [x] T15 Prompts settings page (additional)
- [x] T18 "Generated by AI" affordance
- [x] T20 Prompt registry with versioning + rollback
- [x] D2 MF-shared React hooks (delivered via T14)
- [x] D4 AI in automation builder (delivered via T13)
- [x] **R5 Mustache-subset template resolver**
- [x] **R7 Eval stub (collection + manual replay)**
- [x] Reference impl: Frontline inbox uses `<AISuggestButton>`

**PR 3 acceptance:** brief §13.5 — `Form Submitted → AI: Classify → If Tier A → Assign AE` workflow runs successfully end-to-end.

### Future Consideration (v2 — phase 2 of milestone or beyond)

- [ ] R1 Vector-recall memory — requires production data on session lengths
- [ ] R2 Plan-then-execute reasoning — requires user demand for "deep research" mode
- [ ] R6 Circuit breaker (Opossum) — requires production latency data to set thresholds
- [ ] R7 Promptfoo CI integration — requires eval data accumulated in v1 stub
- [ ] MCP server — brief A1; ship when audit log + tool registry stabilize
- [ ] D14 Forecast + per-call histogram in cost dashboard — requires >1 month of data
- [ ] Write-scoped Analyst variants — requires trust + permission UI work
- [ ] Multi-modal (image, audio, video) tools — not in brief
- [ ] Fine-tuning support — not in brief; likely never (provider-managed)
- [ ] Bring-your-own embedding model in Ollama — partial via custom provider

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | PR |
|---------|-----------|---------------------|----------|----|
| T1 Multi-provider | HIGH | MED | P1 | 1 |
| T2 Encryption | HIGH | MED | P1 | 1 |
| T4 tRPC chat/embed | HIGH | MED | P1 | 1 |
| T5 Audit log | HIGH | MED | P1 | 1 |
| T6 Budgets | HIGH | MED | P1 | 1 |
| T7 Tool registry | HIGH | HIGH | P1 | 2 |
| T8 Agent engine | HIGH | HIGH | P1 | 2 |
| T9 Streaming | HIGH | MED | P1 | 2 |
| T10 RAG | HIGH | HIGH | P1 | 2 |
| T11 Workspace Analyst | HIGH | MED | P1 | 2 |
| T12 Copilot widget | HIGH | MED | P1 | 2 |
| T13 Automation actions | HIGH | MED | P1 | 3 |
| T14 MF hooks | HIGH | MED | P1 | 3 |
| T20 Prompt registry | MED | MED | P2 | 3 |
| R3 Structured output | HIGH | LOW | P1 | 1 |
| R4 Cost dashboard | MED | LOW | P1 | 1 |
| R6 Per-tool rate limit | HIGH | LOW | P1 | 2 |
| R8 GDPR export/delete | HIGH | LOW | P1 | 2 |
| R1 Memory (buffer+summarize) | HIGH | LOW | P1 | 2 |
| R5 Prompt template resolver | MED | LOW | P1 | 3 |
| R7 Eval stub | MED | LOW | P2 | 3 |
| D8 PII redaction | MED | MED | P2 | 2 |
| D9 Guardrails | MED | MED | P2 | 2 |
| D14 Forecast (cost) | LOW | MED | P3 | v2 |
| Circuit breaker (R6) | MED | MED | P3 | v2 |
| Vector memory (R1) | MED | HIGH | P3 | v2 |
| MCP server (A1) | MED | HIGH | P3 | v2+ |
| Promptfoo CI (R7) | MED | LOW | P3 | v2 |

---

## Competitor Feature Analysis (AI-Native Platform Foundations in 2026)

| Feature | Salesforce Einstein 1 / Agentforce | HubSpot Breeze | Microsoft Copilot Studio | Vercel AI SDK (DIY) | erxes AI Kernel (this brief) |
|---------|-----------------------------------|----------------|--------------------------|---------------------|-------------------------------|
| Multi-provider abstraction | Closed (their LLMs only) | Closed (OpenAI partner) | Closed (Azure OpenAI) | Open (every major) | **Open via `ILLMProvider`** |
| Self-hosted | No | No | No (cloud-only) | Yes (BYO infra) | **Yes** — AGPLv3 |
| Per-tenant secret encryption | Built-in | Built-in | Built-in | DIY | **AES-256-GCM per subdomain** |
| Plugin extension model | Apex code (proprietary) | Custom code blocks | Power Platform connectors | No plugin model | **One-file `meta/aiTools.ts`** |
| Frontend AI hooks | No (UI is closed) | No (UI is closed) | No (UI is closed) | Yes (`useChat`, `useCompletion`) | **MF-shared hooks across plugins** |
| Tool/skill registry | Yes (Agent Actions) | Limited | Yes (Topics + Actions) | No (manual) | **Auto-discovered from plugins** |
| RAG built-in | Yes (Data Cloud) | Yes (KB only) | Yes (SharePoint + Graph) | DIY | **Yes (Atlas Vector + Qdrant)** |
| Budget controls per workspace | Yes (org limits) | No (account-level) | Yes (capacity units) | No | **Per workspace/team/user/agent USD** |
| Audit log with cost attribution | Partial | No | Yes | DIY | **Full (every call, every tool)** |
| Open-source | No | No | No | SDK only | **Yes (the whole platform)** |

**Positioning:** erxes AI Kernel is the **only open-source AGPLv3 self-hosted platform** with provider neutrality, per-tenant encryption, one-file plugin extension, and MF-shared hooks — the four moats that none of the closed-source incumbents can match without rebuilding their foundation.

---

## Sources

**Brief (source of truth):**
- `.planning/briefs/ai_api_plugin_prompt.md` §§1–15

**Codebase patterns mirrored:**
- `backend/plugins/sales_api/src/meta/{automations,segments,notifications,permissions,afterProcess}.ts` — confirmed meta extension pattern
- `backend/erxes-api-shared/src/utils/{service-discovery,start-plugin,redis,trpc,apollo,mq-worker}.ts` — confirmed reuse targets

**Library docs (Context7 — HIGH confidence):**
- `/websites/langchain` `short-term-memory` — verified buffer / summarize / vector-recall pattern set
- `/websites/langchain` `agents` — verified ReAct vs tool-use loop tradeoff
- `/openai/openai-node` `helpers.md` — verified `zodResponseFormat` + `client.chat.completions.parse()` for structured output
- `/anthropics/anthropic-sdk-typescript` `helpers.md` — verified `zodOutputFormat` + `client.messages.parse({output_config})` for Claude Sonnet 4.5+
- `/vercel/ai` `tool-loop-agent.ts`, `06-memory.mdx` — verified native tool-use loop is the 2026 default; memory approaches confirmed
- `/websites/promptfoo_dev` — verified Promptfoo is the established eval/regression default with GitHub Action + CI/CD integrations
- `/nodeshift/opossum` — verified Opossum is the Node circuit-breaker default
- `/taskforcesh/bullmq` — verified BullMQ has native rate limiter (no new dep needed for R6)

**Architecture references:**
- `.planning/codebase/ARCHITECTURE.md` — confirmed gateway / federation / MF / service-discovery patterns
- `.planning/PROJECT.md` — confirmed Core Value (Workspace Analyst demo) + Validated/Active/Out-of-scope buckets

---

*Feature research for: erxes AI Kernel (`ai_api` + `ai_ui` + `erxes-api-shared/src/ai/`)*
*Researched: 2026-05-21*
*Confidence: HIGH on table stakes/anti-features (brief is explicit); HIGH on differentiators (verified against industry patterns); MEDIUM-HIGH on beyond-the-brief recommendations (opinionated synthesis backed by Context7 sources).*
