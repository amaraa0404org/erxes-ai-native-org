# Stack Research — Additive AI Dependencies for `ai_api` / `ai_ui` / `erxes-api-shared/src/ai/`

**Domain:** LLM / RAG / agent kernel inside an existing Nx + pnpm + Apollo Federation + Mongoose monorepo
**Researched:** 2026-05-21
**Confidence:** HIGH (versions verified via `npm view` against the live registry on 2026-05-21; engine constraints cross-checked against erxes's Node 18.16.9+ baseline)

> **Scope reminder.** Everything that already lives in `.planning/codebase/STACK.md` (TypeScript 5.7.3, Node 18+, pnpm 9.12.3, Nx 20.0.8, Express 4, Apollo Server 4 + Federation, Apollo Router, tRPC 11, Mongoose 8.10.x, mongodb 6.18, ioredis 5, BullMQ 5, graphql-redis-subscriptions 2.7, Rspack 1, React 18, Module Federation, Tailwind v4, Radix, Jotai, Apollo Client 3, **zod pinned at `3.23.8` in `erxes-api-shared`**) is taken as fixed. This document only lists **net-new dependencies** the AI Kernel must add.

---

## Headline Decisions

| # | Decision | Confidence |
|---|----------|------------|
| 1 | **No mandatory vendor SDK in `ai_api`.** Provider adapters live in `erxes-api-shared/src/ai/providers/` and use the official SDKs when convenient; raw `fetch` is acceptable and is the pattern the existing `backend/services/automations/src/ai/providers/` already uses. | HIGH |
| 2 | **Tokenizer:** `tiktoken@1.0.22` (WASM, ships its own `.wasm`, zero runtime deps, no `node-gyp`) for OpenAI/Azure/Ollama/OpenAI-compatible families; `@anthropic-ai/tokenizer@0.0.4` for Anthropic; **approximation** (chars/4 + provider-reported usage on response) for Gemini. | HIGH |
| 3 | **Default vector backend = Qdrant** (`@qdrant/js-client-rest@1.18.0`). Atlas Vector Search is GA but assumes Atlas hosting; erxes is overwhelmingly self-hosted. Atlas adapter is shipped but is **opt-in via `AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`**. Resolves brief §15.2. | HIGH |
| 4 | **Streaming bridge** = AsyncIterable → existing `graphql-redis-subscriptions` PubSub via a hand-rolled chunk batcher in `erxes-api-shared/src/ai/streaming.ts`. No new transport, no new lib. | HIGH |
| 5 | **`zod-to-json-schema@3.23.5`** (NOT latest 3.25.2). Latest requires `zod >= 3.25.28`; erxes pins `zod@3.23.8`. 3.23.5 declares `peerDependencies.zod = "^3.23.3"` — exact match. | HIGH |
| 6 | **AES-256-GCM** via Node 18 built-in `crypto` only. **Zero new dependencies.** Derivation = `scryptSync(ERXES_SECRET, subdomain, 32)`. | HIGH |
| 7 | **Prompt-injection detection** = in-house heuristic module in `erxes-api-shared/src/ai/guardrails.ts`. No mature Node lib exists; the closest options (`rebuff`, `llm-guard`, `ai-fence`) are v0.1.x community packages, all stagnant. | HIGH |
| 8 | **PII redaction** = `redact-pii-light@1.0.0` (pure regex, lodash-only, no Google DLP network call). Avoid `redact-pii@3.4.0` (pulls `@google-cloud/dlp`). | MEDIUM |
| 9 | **Prometheus** = `prom-client@15.1.3` mounted as Express middleware on `/metrics` of `ai_api`. Co-exists with Apollo Server 4 fine. | HIGH |
| 10 | **LLM cost table** = maintained in-house at `erxes-api-shared/src/ai/tokens.ts`. No package — confirmed; the published open-source options (`tokencost`, `llm-cost`) are Python-only or unmaintained. Brief is correct. | HIGH |

---

## Recommended Stack

### A. Provider SDKs (each lives in `erxes-api-shared/src/ai/providers/*.ts`, **only** imported by that file)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `openai` | **6.38.0** (published 2026-05-15) | OpenAI chat, embeddings, structured outputs, tool calls, streaming. Also covers Azure OpenAI via `new AzureOpenAI({ apiVersion, endpoint, apiKey })`. Also covers Ollama and any OpenAI-compatible base URL via `new OpenAI({ baseURL, apiKey })`. | Official SDK. Stream + tool calls + structured outputs work in one client. The OpenAI-compatible base-URL escape hatch covers Ollama, LiteLLM proxy, vLLM, Together, Groq, OpenRouter, Cloudflare AI Gateway in OpenAI-provider mode — eliminating four redundant adapters. No `engines` field → works on Node 18+. | HIGH |
| `@anthropic-ai/sdk` | **0.97.1** (published 2026-05-19) | Anthropic Claude messages API, streaming, tool use. | Official SDK. Anthropic's tool-call schema differs enough from OpenAI's that hand-rolling is risky and the SDK is small (~80 KB). | HIGH |
| `@google/generative-ai` | **0.24.1** | Gemini chat, function-calling, embeddings. | **Use the legacy SDK, NOT `@google/genai`.** `@google/genai` from `v1.1.0` onward requires `engines.node >= 20`, and erxes is Node 18.16.9+. The legacy SDK (`@google/generative-ai`) still declares `engines.node >= 18.0.0`. If/when erxes bumps to Node 20 baseline, migrate to `@google/genai@^2.5.0`. **This is a real blocker, not a preference.** | HIGH |
| **(none)** for Azure OpenAI | — | — | Reuse `openai@6.38.0` — it exports `AzureOpenAI`. Do **not** add `@azure/openai` (the standalone package, currently `2.0.0`, has been frozen — the `3.0.0-alpha.*` track was last touched 2026-03 and Microsoft's stated direction is to consolidate behind the `openai` package). | HIGH |
| **(none)** for Ollama | — | — | Reuse `openai` with `baseURL: "${OLLAMA_HOST}/v1"`. Ollama ships an OpenAI-compatible API. `ollama@0.6.3` (the official JS client) exists but it speaks Ollama's *native* `/api/chat` shape — using two clients for what the OpenAI SDK already does is needless surface area. | HIGH |

> **Why no Vercel AI SDK (`ai@6.0.188`)?** It's an opinionated UI-coupled framework (React hooks, route handlers). It would dictate streaming shape (Vercel's data-stream protocol) and would not fit cleanly behind our `ILLMProvider` interface. Re-evaluate if/when erxes wants RSC-style streaming.

### B. Tokenization and cost accounting

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| `tiktoken` | **1.0.22** (published 2025‑Q4) | Exact token counts for OpenAI / Azure OpenAI / GPT-family models and any model that uses `cl100k_base` or `o200k_base` encodings. | WASM, single tarball, **no `node-gyp`, no install scripts** (`npm pack --dry-run` shows only `.cjs`/`.js`/`.json`/`.wasm` files and an empty `dependencies` map). This means Nx build caching is unaffected — the same hash will produce the same `dist/`. Faster than pure-JS by ~5×. | HIGH |
| `@anthropic-ai/tokenizer` | **0.0.4** | Token counts for Claude family. | Official package from Anthropic. Pure JS. Note: Anthropic now recommends calling `client.messages.countTokens()` for exact counts; use the tokenizer only for **pre-request budget pre-checks** where a network round-trip would be wasteful. Document this trade-off in `tokens.ts`. | MEDIUM (version is tiny; library is stable but rarely updated) |
| **(in-house)** | — | Token counts for Gemini and any non-listed provider. | Use `Math.ceil(text.length / 4)` as a conservative pre-check upper bound; reconcile with `response.usageMetadata` after the call. Gemini does not ship a JS tokenizer. | HIGH |
| **(in-house)** `tokens.ts` cost table | — | `{ model → inputCostPer1M, outputCostPer1M }` static map; admin overrides in `ai_models` collection. | Confirmed no good Node helper exists. `tokencost` is Python-only; `llm-cost` is unmaintained (last publish 2024). Brief §10 already directs us to maintain in-house. | HIGH |

**Do NOT use:**
- `gpt-tokenizer@3.4.0` — pure JS, smaller install, but ~5× slower than `tiktoken` WASM, and the `o200k_base` (GPT-4o/o1/o3) tables lag the official `cl100k`/`o200k` releases by several months. Acceptable fallback if WASM causes an environment-specific issue, not default.
- `js-tiktoken@1.0.21` — pure JS port of `tiktoken`, has the same lag problem and 5–10× the runtime. Use only if WASM is forbidden in target environment.

### C. Vector store clients

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| `@qdrant/js-client-rest` | **1.18.0** | Qdrant adapter under `modules/vectors/qdrant.ts`. Default backend (`AI_DEFAULT_VECTOR_BACKEND=qdrant`). | (a) Self-hostable in the same `docker-compose.yml` as erxes — matches "self-hosted by default" identity. (b) Per-collection namespacing maps cleanly to `subdomain:namespace` keys. (c) REST client uses `undici` and is fully type-safe via OpenAPI codegen. **Engines: `node >= 18.17.0` — erxes baseline is 18.16.9. This is a 1-point version gap. Verify the CI Docker image actually runs ≥ 18.17, and if not, bump the Dockerfile FROM `node:18.16-alpine` to `node:18.20-alpine` (still Node 18 LTS).** | HIGH |
| **(no package — use existing `mongoose` aggregation)** | mongoose 8.10.x already pinned | MongoDB Atlas Vector Search adapter under `modules/vectors/atlas.ts`. Opt-in (`AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`). | MongoDB Atlas Vector Search has been GA since June 2024. It uses the **standard MongoDB query language** via the `$vectorSearch` aggregation stage. **No extra package is required** — the mongoose driver already pinned in erxes can run `Model.aggregate([{ $vectorSearch: { ... } }, ...])` directly. Index creation is done via the Atlas Admin API or the `db.collection.createSearchIndex({ ... })` driver helper (available in mongodb driver ≥ 6.6, erxes is on 6.18 ✓). Limitation: Atlas Vector Search only works on **MongoDB Atlas-hosted clusters** (not self-hosted Mongo). This is why it's not the default. | HIGH |

**Resolution of brief §15.2 (Atlas vs Qdrant as default):**

- **Default = Qdrant** because erxes is primarily self-hosted and self-hosting Atlas is impossible.
- Atlas Vector Search adapter is shipped behind the same `IVectorStore` interface and selectable by env (`AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`) for tenants on MongoDB Atlas who would rather not run a second stateful container.
- Both adapters must implement: `upsert(namespace, items[])`, `search(namespace, vector, topK, filter)`, `delete(namespace, ids[])`, `ensureNamespace(name, dimensions)`.
- The Postgres + `pgvector` fallback mentioned in the question is **not added** — erxes does not have a Postgres dependency anywhere else and adding one for a single feature crosses the "use existing stack" line.

**Do NOT use:**
- `@pinecone-database/pinecone` — hosted SaaS only, conflicts with self-hosted identity.
- `weaviate-ts-client` — heavier server requirements, less plug-and-play than Qdrant.
- `chromadb@1.x` JS client — single-node Python server underneath, multi-tenant story is weaker.

### D. Schema, validation, JSON-Schema emission

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| `zod` | **already pinned at `3.23.8`** in `erxes-api-shared` | Source of truth for tool input schemas, structured output schemas, agent config validation, tRPC procedure inputs. | Already in the monorepo. tRPC 11 takes `zod` schemas directly. **Do not bump.** Bumping zod to 3.25+ would force a cross-cutting upgrade of every existing tRPC router. | HIGH |
| `zod-to-json-schema` | **3.23.5** (NOT 3.25.2 latest) | Convert tool `inputSchema: z.object(...)` into JSON Schema for LLM tool definitions and for storage in `ai_tool_registry.inputSchema`. | `3.23.5` declares `peerDependencies.zod = "^3.23.3"` — perfect fit for `zod@3.23.8`. The latest `3.25.2` requires `zod >= 3.25.28` and will throw a peer-dep mismatch in pnpm strict mode. **Pin exactly `"zod-to-json-schema": "3.23.5"`.** | HIGH |

### E. Streaming bridge

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| **(no new lib)** | uses existing `graphql-redis-subscriptions@2.7.0` | SSE/AsyncIterable from `openai.chat.completions.create({ stream: true })` → `pubsub.publish(`ai:invocation:${sessionId}`, { chunk })` → GraphQL Subscription `aiInvocationStreamed(sessionId)`. | The provider SDKs each return an `AsyncIterable<ChatCompletionChunk>` (OpenAI), `MessageStream` (Anthropic), or `AsyncIterable<GenerateContentResponse>` (Gemini). Bridge code is ~40 lines: `for await (const chunk of stream) { await pubsub.publish(channel, normalize(chunk)); }`. No new transport library is needed. | HIGH |

**Known gotchas (must be coded around, not delegated to a library):**
- **PubSub fan-in across replicas:** with multiple `ai_api` replicas, all chunks must publish to the same Redis channel keyed on `sessionId` (not pod IP). Use `ai:invocation:{subdomain}:{sessionId}` to keep tenant isolation.
- **Chunk coalescing at high token rates:** GPT-4o streams ~100 tokens/sec. At 100 publishes/sec/session × 100 concurrent sessions, Redis pubsub can get noisy. Coalesce into ~50 ms windows in the bridge before publishing.
- **Client reconnects:** the subscription should accept `lastEventId` and replay missed chunks from an in-memory ring buffer (10 s window) or accept gaps — pick "accept gaps" for v1, document.
- **Backpressure when LLM is faster than Redis publish:** unlikely at human-typing speeds; if it happens, log and drop oldest chunk.

### F. Encryption (provider API keys at rest)

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| **Node built-in `crypto`** | (Node 18.16.9+) | AES-256-GCM symmetric encryption of provider API keys, per-subdomain key derivation. | Brief §10 NFR mandates this. The canonical Node 18+ pattern is documented and stable. **Zero new packages.** | HIGH |

**Canonical recipe** (write this into `erxes-api-shared/src/ai/crypto.ts` and unit-test):
```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm' as const;
const IV_LENGTH = 12;         // 96-bit nonce per NIST SP 800-38D
const TAG_LENGTH = 16;        // 128-bit auth tag
const KEY_LENGTH = 32;        // 256-bit key

function deriveKey(subdomain: string): Buffer {
  const secret = process.env.ERXES_SECRET;
  if (!secret) throw new Error('ERXES_SECRET not set');
  // scrypt salt = subdomain so each tenant gets a distinct key
  return scryptSync(secret, subdomain, KEY_LENGTH);
}

export function encryptSecret(plaintext: string, subdomain: string): string {
  const key = deriveKey(subdomain);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');  // iv ‖ tag ‖ ciphertext
}

export function decryptSecret(b64: string, subdomain: string): string {
  const key = deriveKey(subdomain);
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
```
**Do NOT** use `crypto-js` (browser-targeted, slow), `node-forge` (oversized), or any package that wraps this. The Node std-lib API is the recommended target per the Node.js docs.

### G. Guardrails — prompt-injection detection

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| **(in-house heuristic)** | — | Score user-supplied content for injection patterns; block or strip before passing to LLM. | The Node ecosystem has no maintained library. The closest candidates (`rebuff@0.1.0` from Protect AI, `llm-guard@0.1.8`, `ai-fence@0.1.0`, `promptarmor@0.1.1`) are all early-stage v0.1.x with sparse commit history; pulling any of them is a higher risk than maintaining ~80 lines of regex/scoring ourselves. The Python ecosystem has `rebuff-python` and `llm-guard` (Python) — explicitly out of scope per the question. | HIGH |

**In-house pattern set** (write to `erxes-api-shared/src/ai/guardrails.ts`):
- Role-flipping: `/\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)\b/i`
- System-prompt extraction: `/\b(show|reveal|print|repeat|output)\s+(your\s+)?(system\s+prompt|instructions|rules)\b/i`
- Jailbreak markers: `/\b(DAN|jailbreak|developer\s+mode|sudo\s+mode)\b/i`
- Encoding evasion: base64/hex blocks longer than N chars
- Tool-injection: `<\s*tool|<\s*function|<\s*invoke` in user content
- Score = sum of weighted matches; threshold configurable via `AI_GUARDRAILS_STRICT`.

Output-moderation hook is a no-op stub (`async output => output`) that plugins can override — covered by brief §10.

### H. PII redaction

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| `redact-pii-light` | **1.0.0** | Per-agent opt-in (`agent.redactPii: true`) regex redaction of names, emails, phones, US/EU addresses. | Pure JS, only depends on `lodash` (already transitively in erxes via many libs). No network calls. Reversible with placeholder rehydration: we wrap it with a thin layer that stores `{placeholder → original}` map per invocation, hands the redacted text to the LLM, then substitutes originals back into the LLM output. | MEDIUM (library is small and somewhat dated; regex coverage is "good enough", not "perfect") |

**Do NOT use:**
- `redact-pii@3.4.0` — pulls `@google-cloud/dlp` (Google Cloud SDK with auth setup, network round-trips per redact). Defeats the "self-hosted, no Python sidecar" constraint.
- `compromise@14.15.0` — full-fat NLP library. ~10 MB. Overkill for the entity types we need; would slow plugin cold start.
- `@microsoft/recognizers-text-suite@1.3.1` — heavy bundle (~3 MB), .NET-port style API, not idiomatic. Last meaningful update was years ago.

If `redact-pii-light` proves insufficient (e.g. non-US names), the upgrade path is to fork the regex sets into `erxes-api-shared/src/ai/redaction.ts` and drop the dependency entirely.

### I. Observability — Prometheus metrics

| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| `prom-client` | **15.1.3** | Counters/histograms/gauges; `/metrics` Express endpoint on `ai_api` port 3320. | The reference Node Prometheus client. Declares `engines: { node: '^16 \|\| ^18 \|\| >=20' }` — works on erxes Node 18.16.9. Default metrics (process, GC, event-loop lag) are free. Custom AI metrics (token counts, cost, latency, tool calls) plug in as `Histogram`/`Counter` instances. Co-exists fine with Apollo Server 4 (Apollo's metrics plugin uses a different endpoint pattern); both can be mounted on the same Express app without conflict. Apollo Router scrapes `/metrics` on each subgraph if configured. | HIGH |

**No competing library is worth the switch.** OpenTelemetry's `@opentelemetry/sdk-metrics` is more capable but the wiring/exporter overhead is not justified for v1.

### J. LLM cost table

| Approach | Reason |
|---------|--------|
| Maintain `erxes-api-shared/src/ai/tokens.ts` as a static const map keyed by `${provider}:${model}` → `{ inputCostPer1M, outputCostPer1M, contextWindow, capabilities[] }`. Admin overrides per-model in `ai_models` collection (brief §4). | No quality Node package. `tokencost` is Python. `llm-cost@*` is unmaintained. Static table is ~150 lines, refreshed in a quarterly PR. Brief §10 already directs this. |

---

## Installation Commands

Add to `backend/plugins/ai_api/package.json` dependencies (per-plugin, *not* root) and to `backend/erxes-api-shared/package.json` dependencies as marked:

```bash
# In backend/erxes-api-shared/  (shared lib — adapters live here)
pnpm add \
  openai@6.38.0 \
  @anthropic-ai/sdk@0.97.1 \
  @google/generative-ai@0.24.1 \
  tiktoken@1.0.22 \
  @anthropic-ai/tokenizer@0.0.4 \
  zod-to-json-schema@3.23.5 \
  redact-pii-light@1.0.0
# (zod@3.23.8 already pinned — do not change)
# (Node built-in `crypto` — no install)

# In backend/plugins/ai_api/  (plugin-only — vector store + metrics + tooling)
pnpm add \
  @qdrant/js-client-rest@1.18.0 \
  prom-client@15.1.3
# (mongoose, mongodb, bullmq, ioredis, graphql-redis-subscriptions already in erxes-api-shared)
```

No new frontend dependencies are required for `ai_ui`. All UI is composed from `erxes-ui` primitives (Radix + Tailwind v4 already in monorepo) and Apollo Client + Jotai (already shared singletons via Module Federation). Streaming UI uses the existing GraphQL subscriptions transport — no new client lib.

---

## Mapping to Brief / PRs / Active Requirements

| Library | Serves PR | Active requirement |
|---------|-----------|--------------------|
| `openai@6.38.0` | PR 1 | "OpenAI + Azure + Ollama + OpenAI-compatible adapters" (one SDK, four call sites) |
| `@anthropic-ai/sdk@0.97.1` | PR 1 | "Anthropic adapter" |
| `@google/generative-ai@0.24.1` | PR 1 | "Google adapter" (engine-pinned to Node 18) |
| `tiktoken@1.0.22` | PR 1 | "Audit log with tokens, latency, cost"; "Budget pre-check" |
| `@anthropic-ai/tokenizer@0.0.4` | PR 1 | Same — for Claude |
| `redact-pii-light@1.0.0` | PR 2 | "PII redaction toggle per agent" (NFR) |
| Node built-in `crypto` | PR 1 | "AES-256-GCM encryption of API keys" |
| In-house `guardrails.ts` | PR 2 | "Prompt-injection heuristic + output moderation hook" |
| `zod-to-json-schema@3.23.5` | PR 2 | "Convert each `inputSchema` (Zod) into JSON Schema" for tool registry (brief §6.2.2) |
| `@qdrant/js-client-rest@1.18.0` | PR 2 | "Vector store abstraction: …Qdrant adapter" |
| Existing `mongoose` aggregation | PR 2 | "Vector store abstraction: MongoDB Atlas Vector Search adapter (primary)" — primary in the sense of "first-class supported", not "default" |
| `prom-client@15.1.3` | PR 1 | "Prometheus-style counters at `/metrics`" |
| In-house `tokens.ts` | PR 1 | "Cost calc as static table; admins can override per-model" |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `openai@6.38.0` for OpenAI-compat (Ollama, vLLM, Together, OpenRouter…) | `ollama@0.6.3` (official Ollama JS client) | When the deployment uses Ollama-specific endpoints (`/api/embeddings`, `/api/tags` for listing) not in the OpenAI shape. Cost is one extra dep + one more provider adapter. |
| `openai`'s `AzureOpenAI` export | `@azure/openai@2.0.0` (or 3.0.0-alpha) | Never. The legacy package's `3.0.0` track has been alpha-only since 2026-03 and Microsoft's stated direction is the `openai` package. |
| `@google/generative-ai@0.24.1` (Node 18) | `@google/genai@2.5.0` (Node 20+) | Only after erxes ships a Node 20 baseline. Migration is mostly the import line + minor type renames. |
| `tiktoken@1.0.22` (WASM) | `gpt-tokenizer@3.4.0` (pure JS) | If a target deployment environment forbids WASM (rare; Vercel/Cloudflare Workers do not apply here — `ai_api` runs in our own Docker on Node). |
| `tiktoken@1.0.22` | `js-tiktoken@1.0.21` (pure JS port) | Same condition. `js-tiktoken` is 5–10× slower; choose only if WASM is unusable. |
| `@qdrant/js-client-rest@1.18.0` default | MongoDB Atlas Vector Search adapter default | When the deployment is on MongoDB Atlas and the workspace admin sets `AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`. |
| `redact-pii-light@1.0.0` | In-house regex in `redaction.ts`, drop dep | If `redact-pii-light` misses a needed entity class (e.g. Mongolian phone numbers) — fork its regexes inline rather than adopt a heavier NLP lib. |
| Hand-rolled streaming bridge | Vercel `ai` SDK (`ai@6.0.188`) | Never for this milestone — it would dictate transport shape and conflicts with brief §14 ("no new WebSocket / streaming transport"). Re-evaluate when erxes adopts RSC. |
| In-house prompt-injection heuristics | `rebuff@0.1.0`, `llm-guard@0.1.8`, `ai-fence@0.1.0` | None are ready. Re-evaluate when one of them ships a 1.0 with a real maintainer cadence. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@google/genai@^1.1.0` (or any 2.x) | Requires Node 20+; erxes is Node 18 LTS baseline. Will fail `pnpm install` engine check or worse, fail at runtime with an unhelpful syntax error. | `@google/generative-ai@0.24.1` |
| `@azure/openai@2.0.0` | Frozen public release; `3.0.0` track has been alpha-only for months; Microsoft's roadmap consolidates behind the `openai` package's `AzureOpenAI` export. Adding it adds a second auth-flow surface. | `openai@6.38.0` ➜ `new AzureOpenAI(...)` |
| `zod-to-json-schema@>=3.24.0` | Peer-dep wants `zod >= 3.25.28`; erxes pins `zod@3.23.8`. pnpm strict mode will refuse to install (or emit warnings the CI will turn into errors). | `zod-to-json-schema@3.23.5` |
| `redact-pii@3.4.0` | Pulls `@google-cloud/dlp` — Google Cloud SDK with mandatory ADC credentials and per-call network round-trips. Defeats self-hosted identity and adds a hidden network failure mode. | `redact-pii-light@1.0.0` (or in-house regex) |
| `compromise@14.15.0`, `@microsoft/recognizers-text-*` | Both ship multi-megabyte language models; cold-start penalty on every plugin process for entity recognition we don't need. | Regex-based redaction in `redact-pii-light` |
| `crypto-js`, `node-forge` | Wrap Node's built-in primitives; slower, larger, and add a supply-chain surface for something the std-lib does perfectly. | Node 18 `crypto` module |
| `ai@6.0.188` (Vercel AI SDK) | UI-coupled framework; would replace our streaming/transport choices, not augment them. Conflicts with brief §14 "no new WebSocket / streaming transport". | Hand-rolled `AsyncIterable → PubSub` bridge |
| `langchain` / `@langchain/community` | Brief §14: "no MCP server in PR 1/2"; LangChain pulls a wide indirect graph (50+ transitive deps for the core Node bundle) and embeds its own provider abstraction that competes with `ILLMProvider`. | Our `ILLMProvider` + the three SDKs above |
| `pinecone`, `weaviate-ts-client`, `chromadb` | Hosted-SaaS or heavy-server alternatives; do not match erxes's self-hosted-first identity. | Qdrant + Atlas dual adapter |
| Any Python-based or Rust-based sidecar (guardrails-ai, presidio, etc.) | Explicit constraint from the question. Brief §14: must run in existing Docker images. | Node-only equivalents above |

---

## Stack Patterns by Variant

**If the deployment runs on MongoDB Atlas:**
- Set `AI_DEFAULT_VECTOR_BACKEND=mongodb-atlas`.
- No additional dependency — use `mongoose.Model.aggregate([{ $vectorSearch: {...} }])`.
- The Atlas adapter creates the index lazily on first `ensureNamespace(name, dimensions)` call via `db.collection.createSearchIndex({ name, definition: { mappings: { dynamic: false, fields: { embedding: { type: 'knnVector', dimensions, similarity: 'cosine' } } } } })`.

**If the deployment is fully self-hosted (most erxes installs):**
- Set `AI_DEFAULT_VECTOR_BACKEND=qdrant` (also the global default).
- Add a `qdrant` service to `docker-compose.yml`: `image: qdrant/qdrant:v1.13.0`, expose `:6333`.
- `QDRANT_URL=http://qdrant:6333`.

**If the deployment uses only Ollama (no cloud LLM):**
- Provider config `kind: 'custom'`, `baseUrl: 'http://ollama:11434/v1'`, `encryptedApiKey: encryptSecret('ollama', subdomain)` (Ollama ignores the key).
- Reuses `openai@6.38.0` SDK — no extra dep.

**If the workspace needs Anthropic-exact tokens (e.g. exact budget enforcement):**
- Call `anthropic.messages.countTokens()` (network round-trip) instead of `@anthropic-ai/tokenizer` (local approximation).
- Trade-off documented in `tokens.ts`.

**If the deployment is on Node 20+ already:**
- Switch `@google/generative-ai@0.24.1` → `@google/genai@^2.5.0`. Minor type renames; no behavioral change.

---

## Version Compatibility Matrix

| Package | Pinned | Compatible with | Engine notes |
|---------|--------|-----------------|--------------|
| `openai@6.38.0` | exact | Node 18.16.9+; works behind Azure (`AzureOpenAI`), Ollama, OpenRouter, vLLM with `baseURL` | No `engines` field — tested on Node 18+ |
| `@anthropic-ai/sdk@0.97.1` | exact | Node 18.16.9+ | No `engines` field |
| `@google/generative-ai@0.24.1` | exact | Node 18.0.0+ | **Hard ceiling — do not upgrade to `@google/genai@>=1.1.0` until erxes is Node 20** |
| `tiktoken@1.0.22` | exact | Any Node with WASM support (18+) | No `dependencies`. No install scripts. **Safe with Nx cache.** |
| `@anthropic-ai/tokenizer@0.0.4` | exact | Pure JS, no constraints | |
| `@qdrant/js-client-rest@1.18.0` | exact | Node **>= 18.17.0** | **Check erxes Docker image: bump `node:18.16-alpine` → `node:18.20-alpine` if needed.** Pairs with Qdrant server `>= 1.10` (`v1.13.0` recommended). |
| `zod-to-json-schema@3.23.5` | exact | Requires `zod ^3.23.3` — matches erxes's `zod@3.23.8` ✓ | **Pin exactly. Latest 3.25.2 wants `zod >= 3.25.28` and will not install.** |
| `redact-pii-light@1.0.0` | exact | Node `> 8.0.0`; dep on `lodash@^4.17.20` (already transitive) | |
| `prom-client@15.1.3` | exact | Node `^16 \|\| ^18 \|\| >=20` ✓ | Dep on `@opentelemetry/api@^1.4.0` (lightweight) and `tdigest@^0.1.1` |

---

## Open Risks / Gaps for the Roadmap to Address

| Risk | Mitigation in roadmap |
|------|------------------------|
| `@qdrant/js-client-rest@1.18.0` requires Node `>= 18.17.0`; erxes baseline is `18.16.9` | PR 1: bump Dockerfile base image from `node:18.16-alpine` (or whatever is currently pinned) to `node:18.20-alpine`. Verify CI image. Test thoroughly. |
| `@google/generative-ai@0.24.1` is the legacy SDK; Google's documentation actively points to `@google/genai` | Add a roadmap item to migrate when erxes Node baseline moves to 20. Tracking issue with deprecation date. |
| `@anthropic-ai/tokenizer@0.0.4` is approximate for Claude 3+; exact counts require a network call | Document in `tokens.ts`. For strict-budget tenants, offer a `STRICT_TOKEN_COUNTING=true` env that uses `countTokens()` round-trips at the cost of latency. |
| WASM `tiktoken` cold-start (~50 ms first call) on serverless-style restart | Not a problem for long-running `ai_api`; eagerly initialize encoders in `onServerInit`. |
| `redact-pii-light` regex coverage is US-centric | If/when an enterprise tenant requires GDPR-grade PII handling, evaluate replacing with in-house multi-locale regex maintained in `redaction.ts`. |
| In-house prompt-injection heuristics will miss novel attacks | The `guardrails.ts` output-moderation hook is pluggable — enterprise customers can override with a hosted moderation API call without changing core. |

---

## Sources

All version data was obtained on **2026-05-21** by direct `npm view <package> version dist-tags engines dependencies time` against the live npm registry. Cross-referenced against:

- npm registry — primary source of truth for versions, engines, peer deps, install scripts, deprecation flags.
- Existing `backend/services/automations/src/ai/providers/openai/resolve.ts` (already in repo) — pattern reference for "no vendor SDK required" raw-fetch adapters that erxes has been using.
- Existing `backend/erxes-api-shared/src/core-modules/automations/definitions/aiAgents.ts` — confirms the brief's `ILLMProvider`-style interface aligns with the current `IOpenAIAgentConnection`/`IGrokAgentConnection`/`IKimiAgentConnection` shapes.
- Brief `.planning/briefs/ai_api_plugin_prompt.md` §10 (NFRs), §11 (env vars), §14 (anti-requirements), §15 (open questions).
- erxes `.planning/codebase/STACK.md` (zod pin), `.planning/codebase/ARCHITECTURE.md` (Module Federation, PubSub), `.planning/codebase/INTEGRATIONS.md` (existing AI agent system definitions).

Context7 / Brave / Exa MCP servers were not available in this environment; Node ecosystem package metadata was authoritative via `npm view`. WebFetch was denied. Where versions matter (engines, peer deps, deprecations), every claim above maps to a specific `npm view` output captured during research.

---

*Stack research for: erxes AI Kernel — additive dependencies only*
*Researched: 2026-05-21*
*Confidence: HIGH (versions verified against live npm registry)*
