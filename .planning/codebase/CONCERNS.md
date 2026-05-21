# Codebase Concerns

**Analysis Date:** 2026-05-21

---

## Security Considerations

### JWT Secret Falls Back to Hardcoded 'SECRET'

**Risk:** Any installation that omits `JWT_TOKEN_SECRET` from `.env` silently uses the literal string `'SECRET'` (or `'secret'`) as the signing secret. All JWTs become trivially forgeable.

**Files:**
- `backend/gateway/src/middlewares/userMiddleware.ts` (lines 198, 223, 295)
- `backend/gateway/src/main.ts` (line 132, commented block)
- `backend/core-api/src/modules/organization/team-member/db/models/Users.ts` (line 221)
- `backend/core-api/src/modules/clientportal/services/auth/jwtManager.ts` (line 26)
- `backend/plugins/posclient_api/src/userMiddleware.ts` (line 21)
- `backend/plugins/posclient_api/src/modules/posclient/db/models/PosUsers.ts` (line 99)
- `backend/plugins/frontline_api/src/modules/integrations/call/utils.ts` (line 18)

**Current mitigation:** None — the `|| 'SECRET'` fallback is the only guard.

**Recommendations:** Replace every fallback with a startup guard that calls `process.exit(1)` if the variable is absent, matching the pattern already used in `backend/plugins/insurance_api/src/main.ts`.

---

### TLS Certificate Validation Disabled Process-Wide

**Risk:** `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` is set at module load time in two files. This affects the entire Node.js process — every outbound HTTPS call made by that service silently accepts invalid certificates, enabling MITM attacks.

**Files:**
- `backend/plugins/frontline_api/src/modules/integrations/call/webSocket.ts` (line 23)
- `backend/plugins/frontline_api/src/modules/integrations/call/utils.ts` (line 195)

**Current mitigation:** `CALL_WS_INSECURE` env var guards the webSocket path, but `utils.ts` sets the flag unconditionally on certain code paths.

**Recommendations:** Remove the global `NODE_TLS_REJECT_UNAUTHORIZED` override entirely. Pass `{ rejectUnauthorized: false }` as a per-request option only when the operator explicitly enables it via config, scoped to specific `https.Agent` instances as already done in `backend/services/automations/src/executions/actions/webhook/outgoing/utils.ts`.

---

### BullMQ Admin Dashboard Exposed Without Authentication

**Risk:** The BullMQ job board at `/bullmq-board` is rate-limit-skipped (`skip: req.path.startsWith('/bullmq-board')`) and has no authentication middleware. Any unauthenticated user who can reach the gateway port can inspect, retry, or delete background jobs.

**Files:**
- `backend/gateway/src/main.ts` (lines 82, 94, 148)

**Current mitigation:** None.

**Recommendations:** Add Basic Auth or session-check middleware before `app.use('/bullmq-board', serverAdapter.getRouter())`.

---

### GraphQL Armor / Depth Limiting Is Opt-In and Off by Default

**Risk:** GraphQL query depth protection, alias banning, and character limits are gated behind `GRAPHQL_LIMITER` env var (`backend/gateway/src/middlewares/graphql-limiter.ts`, line 50). Production installs without this variable accept unbounded recursive queries and alias-based DoS. The configured max depth of 50 is also very permissive.

**Files:**
- `backend/gateway/src/middlewares/graphql-limiter.ts`
- `backend/gateway/src/main.ts` (line 230)

**Current mitigation:** `@escape.tech/graphql-armor-*` packages are installed and wired, but only activated optionally.

**Recommendations:** Enable `applyGraphqlLimiters` unconditionally in production. Reduce max depth from 50 to 10–15.

---

### Unsanitized HTML in Internal Notes (XSS Risk)

**Risk:** `InternalNoteDisplay` renders raw user-supplied HTML via `dangerouslySetInnerHTML` without any sanitization when `parseBlocks` returns a falsy result. An attacker who can post notes could inject arbitrary scripts into every user's session viewing that note.

**Files:**
- `frontend/libs/ui-modules/src/modules/internal-notes/components/InternalNoteDisplay.tsx` (line 7)

**Current mitigation:** Social integrations (Facebook, Instagram post triggers) and block editor do use `DOMPurify.sanitize()` correctly. The internal notes path does not.

**Recommendations:** Wrap the `dangerouslySetInnerHTML` call with `DOMPurify.sanitize(content)` matching the pattern used in `frontend/plugins/frontline_ui/src/modules/integrations/facebook/components/FacebookPostTrigger.tsx`.

---

### Email Content Rendered Without Sanitization in Automation Builder

**Risk:** `SendEmailActionResult` renders `htmlContent` from a GraphQL response directly via `dangerouslySetInnerHTML`. If email template content is user-controlled, this is an XSS vector inside the admin UI.

**Files:**
- `frontend/core-ui/src/modules/automations/components/builder/nodes/actions/sendEmail/components/SendEmailActionResult.tsx` (line 91)

**Current mitigation:** None.

**Recommendations:** Apply `DOMPurify.sanitize(htmlContent)` before rendering.

---

### ALLOWED_ORIGINS Accepts Arbitrary Regex from Environment

**Risk:** `ALLOWED_ORIGINS` is split on commas and each value is passed directly to `RegExp(c)`. A misconfigured value like `.*` would allow any origin with credentials. There is also no error handling if `RegExp(c)` throws on an invalid pattern.

**Files:**
- `backend/gateway/src/main.ts` (line 56)
- `backend/plugins/posclient_api/src/main.ts` (CORS middlewares block)

**Current mitigation:** None.

**Recommendations:** Validate regex patterns at startup. Consider restricting to exact-match origins unless wildcard is explicitly required.

---

### tRPC Rate Limiting Commented Out

**Risk:** The tRPC route (`/trpc`) has no rate limiting. The `express-rate-limit` middleware and accompanying security middleware are entirely commented out in `trpc-setup.ts`. High-volume tRPC calls cannot be throttled.

**Files:**
- `backend/erxes-api-shared/src/utils/trpc/trpc-setup.ts` (lines 68–76)

**Current mitigation:** None. Gateway-level rate limit of 5000 req / 15 min applies globally but is very generous.

**Recommendations:** Uncomment the tRPC rate limit block and configure per-subdomain limits.

---

## Tech Debt

### 320+ `z.any()` Usages in tRPC Procedures

**Issue:** The ecommerce tRPC router (`ecommerce.ts`) and other tRPC files use `z.any()` as the input schema for nearly every procedure. This bypasses all runtime validation, passes arbitrary MongoDB query objects directly to `model.find(input)`, and creates potential NoSQL injection vectors through the internal service mesh.

**Files:**
- `backend/plugins/sales_api/src/modules/ecommerce/trpc/ecommerce.ts` (30+ procedures)
- `backend/plugins/mongolian_api/src/modules/productPlaces/trpc/productPlaces.ts`
- `backend/plugins/sales_api/src/modules/sales/trpc/deal.ts`
- All plugins: 320 total `z.any()` occurrences across backend

**Impact:** Zero input validation on internal APIs; MongoDB queries are constructed from unvalidated objects.

**Fix approach:** Replace `z.any()` with typed Zod schemas per procedure. For read endpoints, at minimum validate query field names against an allowlist.

---

### Broadcast Module Has Multiple Commented-Out Core Features

**Issue:** Several critical sections of the broadcast/engage system are commented out with `// TODO: uncomment`. This suggests functionality that was temporarily disabled and never re-enabled.

**Files:**
- `backend/core-api/src/modules/broadcast/utils/common.ts` (lines 662, 672, 723)
- `backend/core-api/src/modules/broadcast/utils/telnyx.ts` (lines 16, 158, 176)
- `backend/core-api/src/modules/broadcast/graphql/resolvers/mutations/engage.ts` (line 320)

**Impact:** Broadcast/engage features may silently do nothing or use degraded code paths.

**Fix approach:** Audit each commented block, determine if the blocking condition (service integration, feature flag) has been resolved, and re-enable or permanently remove.

---

### Dead Schema Fields Pending Migration

**Issue:** Multiple Mongoose schema fields are marked `// TODO remove after migration` but remain active, inflating document size and creating confusion about which fields are authoritative.

**Files:**
- `backend/plugins/sales_api/src/modules/sales/db/definitions/deals.ts` (line 97)
- `backend/plugins/sales_api/src/modules/sales/@types/deal.ts` (line 48: `// TODO migrate after remove 2row`)
- `backend/plugins/frontline_api/src/modules/inbox/@types/integrations.ts` (line 195)
- `backend/plugins/frontline_api/src/modules/inbox/db/definitions/integrations.ts` (lines 106, 316)
- `backend/plugins/frontline_api/src/modules/integrations/call/db/utils.ts` (line 13)
- `backend/plugins/accounting_api/src/modules/accounting/graphql/resolvers/queries/configs.ts` (line 49)

**Impact:** Schema ambiguity, extra index space, risk of writing to wrong fields.

**Fix approach:** Write migration scripts under `backend/plugins/*/src/migrations/` to backfill/rename data, then drop the deprecated fields.

---

### Payment Transaction TTL Index Disabled Due to Server Clock Issue

**Issue:** The TTL index on `transactionSchema` (auto-expire pending transactions after 24h) is commented out with `// TODO: readd after server time issue fixed`. Pending payment records now accumulate indefinitely.

**Files:**
- `backend/plugins/payment_api/src/modules/payment/db/definitions/transactions.ts` (lines after line 23)

**Impact:** MongoDB collection grows unboundedly with stale pending transactions; no automated cleanup.

**Fix approach:** Diagnose the server clock issue (likely NTP drift in container environments), fix root cause, and re-enable the index.

---

### Khanbank Payment Integration is an Empty Stub

**Issue:** The `KhanbankApi.createInvoice()` method body is entirely commented out with `// TODO: implement this after plugin communication is implemented`. The method returns nothing, causing silent failures.

**Files:**
- `backend/plugins/payment_api/src/apis/khanbank/api.ts` (lines 68+)
- `frontend/plugins/payment_ui/src/modules/payment/types/PaymentMethods.ts` (line 13)
- `frontend/plugins/payment_ui/src/modules/payment/constants.ts` (line 228)

**Impact:** Khanbank payment option appears in UI but does nothing.

**Fix approach:** Implement inter-plugin tRPC communication pattern (as used in sales_api) to call the khanbank plugin.

---

### IMAP Message Creation Is a Runtime-Throwing Stub

**Issue:** `messageBroker.ts` in the IMAP integration throws `new Error('Message creation not implemented yet')` at runtime when called, not at startup. Users will see errors only when the code path is triggered.

**Files:**
- `backend/plugins/frontline_api/src/modules/integrations/imap/messageBroker.ts` (line 101)

**Impact:** IMAP inbox message creation silently fails.

**Fix approach:** Implement or remove the IMAP message broker handler.

---

### MobinetSms Integration is a No-Op Stub

**Issue:** Both `frontlineCreateIntegration` and message sending for `mobinetSms` are `break` statements with TODO comments — they do nothing and throw no errors.

**Files:**
- `backend/plugins/frontline_api/src/modules/inbox/graphql/resolvers/mutations/integrations.ts` (line 79)
- `backend/plugins/frontline_api/src/modules/inbox/graphql/resolvers/mutations/conversations.ts` (line 47)

**Impact:** Users who configure MobinetSMS integrations receive no messages and no errors.

---

### `noImplicitAny: false` Across All Services

**Issue:** The base TypeScript config (`tsconfig.base.json`) does not set `noImplicitAny`, and plugin-level configs (`backend/core-api/tsconfig.json`) explicitly set `"noImplicitAny": false`. Combined with 197+ `as any` assertions in the backend, type safety is minimal. `useUnknownInCatchVariables` is also `false`, meaning catch variables are typed as `any`.

**Files:**
- `tsconfig.base.json`
- `backend/core-api/tsconfig.json`
- 197 `as any` occurrences across `backend/`

**Impact:** Type errors that TypeScript would catch are invisible; refactoring is unsafe.

**Fix approach:** Enable `noImplicitAny` and `useUnknownInCatchVariables` incrementally per plugin, fixing implicit `any` usages before moving on.

---

### `HACK_SCORING_TYPES` Constant Exposed in Production Code

**Issue:** A constant named `HACK_SCORING_TYPES` (acknowledging it is a hack) is imported directly into the Mongoose pipeline schema definition and used as an enum value.

**Files:**
- `backend/plugins/sales_api/src/modules/sales/constants.ts` (line 13)
- `backend/plugins/sales_api/src/modules/sales/db/definitions/pipelines.ts` (line 40)

**Impact:** Technical debt baked into the database schema; renaming/removing requires a migration.

---

### Segment Form Field Conditions Permanently Commented Out

**Issue:** Segment filtering on form submission fields is disabled with a `// TODO: implement form field condition` block. This limits customer segmentation capabilities.

**Files:**
- `backend/core-api/src/modules/segments/utils/common.ts` (line 182)

---

## Known Bugs

### FIXME: Missing `_id` Prevents Real-time Conversation Updates

**Symptoms:** After reopening a conversation via the receive-message webhook, `pConversationClientMessageInserted` is never called because its first required parameter `_id` is absent. Real-time pubsub events for the reopened conversation are not emitted.

**Files:**
- `backend/plugins/frontline_api/src/modules/inbox/receiveMessage.ts` (line 268)

**Trigger:** Any inbound message that causes a conversation reopen via the call/sync path.

**Workaround:** None — the call is commented out with `// FIXME: It must have _id`.

---

### ERKHET_URL Used Without Null Check or Fallback

**Symptoms:** If `ERKHET_URL` is not set, the fetch URL becomes `undefined/get-api/?...`, causing a runtime crash in the sync inventory resolver.

**Files:**
- `backend/plugins/mongolian_api/src/modules/erkhet/graphql/resolvers/mutations/syncInventory.ts` (lines 53, 163)

**Trigger:** Any inventory sync mutation when `ERKHET_URL` env var is missing.

**Workaround:** Ensure `ERKHET_URL` is always set when mongolian plugin is enabled.

---

## Performance Bottlenecks

### No MongoDB Connection Pool Configuration

**Problem:** `mongooseConnectionOptions` contains only `{ family: 4 }`. Mongoose defaults to a pool size of 5 connections. In SaaS multi-tenant mode each service creates one pool, and `useDb()` creates logical sub-connections with no pool limit configuration. Under concurrent load this exhausts connections quickly.

**Files:**
- `backend/erxes-api-shared/src/utils/mongo/mongo-connection.ts`
- `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`

**Cause:** `mongooseConnectionOptions` was never extended with `maxPoolSize`, `minPoolSize`, or `serverSelectionTimeoutMS`.

**Improvement path:** Add `maxPoolSize: 20` (or tune per service) and `serverSelectionTimeoutMS: 5000` to `mongooseConnectionOptions`. Monitor with MongoDB Atlas / mongod serverStatus metrics.

---

### Large Monolithic Files with Mixed Concerns

**Problem:** Several files exceed 1,000 lines, indicating accumulated logic that will be slow to parse and difficult to optimize.

**Files (largest):**
- `backend/plugins/frontline_api/src/modules/integrations/call/utils.ts` — 1,471 lines
- `backend/plugins/posclient_api/src/modules/posclient/graphql/resolvers/mutations/orders.ts` — 1,417 lines
- `backend/core-api/src/modules/organization/team-member/db/models/Users.ts` — 1,393 lines
- `backend/plugins/frontline_api/src/modules/inbox/graphql/resolvers/mutations/widget.ts` — 1,261 lines
- `backend/plugins/sales_api/src/modules/sales/utils.ts` — 1,242 lines
- `backend/plugins/accounting_api/src/modules/accounting/utils/inventories.ts` — 1,077 lines

**Cause:** Incremental feature additions without extraction to service/utility modules.

**Improvement path:** Extract into domain-specific service modules (e.g., split `call/utils.ts` into auth, request, session, history modules).

---

### GraphQL Queries on Deals/POS Orders Load Entire Collections

**Problem:** Several resolvers call `.find(filter)` without `limit` or `skip` on high-cardinality collections (orders, deals, product reviews). In the ecommerce tRPC router, `z.any()` inputs are passed directly to `model.find(input)` — a caller can omit pagination and retrieve the entire collection.

**Files:**
- `backend/plugins/sales_api/src/modules/ecommerce/trpc/ecommerce.ts` (all `find` procedures)
- `backend/plugins/sales_api/src/modules/ecommerce/graphql/resolvers/queries/productReview.ts` (line 13, 40)
- `backend/plugins/sales_api/src/modules/pos/graphql/resolvers/queries/orders.ts`

**Cause:** Missing mandatory pagination enforcement at the resolver level.

**Improvement path:** Add a `DEFAULT_LIMIT = 100` guard in each `find` procedure and enforce it when no limit is provided.

---

### 266 Unstructured `console.log` Calls in Production Backend

**Problem:** 266 `console.log` statements in backend source code (not tests) produce verbose unstructured output in production, making log aggregation and parsing difficult.

**Files:** Distributed across all backend plugins and `erxes-api-shared`.

**Cause:** No structured logging library enforced; `console.log` used ad hoc.

**Improvement path:** Adopt a structured logger (e.g., `pino`) via `erxes-api-shared/utils` and add an ESLint rule (`no-console`) to prevent new additions.

---

## Fragile Areas

### Module Federation Plugin Loading Has No Retry or Fallback

**Problem:** Remote plugin UI modules are loaded via dynamic `import()` wrapping lazy components. If a remote plugin's server is down or returns a non-200, the `Suspense` boundary will fail. The `AppErrorBoundary` at the app root catches it, but individual plugin failures take down their entire navigation section.

**Files:**
- `frontend/core-ui/src/modules/app/components/App.tsx`
- `frontend/core-ui/module-federation.config.ts`

**Why fragile:** Each plugin remote is loaded at runtime by URL; a single plugin failure bubbles up through the Module Federation runtime if an error boundary isn't set at each remote-import call site.

**Safe modification:** Add `ErrorBoundary` wrappers at each individual plugin-config lazy-import site in addition to the top-level boundary. The automation builder already does this correctly in `RenderPluginsComponentWrapper.tsx`.

**Test coverage:** Zero frontend tests across all 10 plugin UIs.

---

### Service Discovery via Redis Is Single Point of Failure

**Problem:** All plugin registration and gateway routing depends on Redis being available. If Redis goes down mid-request, plugin routes become unreachable and the gateway cannot resolve subgraph schemas for federation.

**Files:**
- `backend/erxes-api-shared/src/utils/service-discovery.ts`
- `backend/erxes-api-shared/src/utils/redis.ts`
- `backend/gateway/src/main.ts`

**Why fragile:** No local fallback cache; the gateway cannot serve GraphQL if Redis is unavailable even if all plugin services are healthy.

**Safe modification:** Implement a local in-process cache of the last-known service registry with a configurable TTL.

---

### MongoDB Disconnection Kills the Process

**Problem:** `mongoose.connection.on('disconnected', () => process.exit(1))` means any transient MongoDB disconnect (network blip, rolling restart) immediately kills the Node process. Kubernetes will restart it, but in-flight requests are lost.

**Files:**
- `backend/erxes-api-shared/src/utils/mongo/mongo-connection.ts` (line 16)

**Why fragile:** No reconnection grace period; a brief MongoDB outage cascades into process restarts for every service.

**Safe modification:** Replace `process.exit(1)` with a reconnection strategy using `mongoose.connection.on('reconnected', ...)` and only exit after exceeding a configurable retry count.

---

### Call Integration WebSocket (frontline_api) Is 1,471 Lines With No Tests

**Problem:** The call/VoIP integration is the largest single file in the codebase, handles WebSocket state, REST calls, JWT generation, and CDR processing — all with zero automated tests.

**Files:**
- `backend/plugins/frontline_api/src/modules/integrations/call/utils.ts`
- `backend/plugins/frontline_api/src/modules/integrations/call/webSocket.ts` (772 lines)
- `backend/plugins/frontline_api/src/modules/integrations/call/graphql/resolvers/queries.ts` (1,363 lines)

**Why fragile:** Any change risks silent regressions in call routing, session management, or JWT token handling.

**Test coverage:** Zero tests in `backend/plugins/frontline_api/`.

---

### All 11 Backend Plugins Have Zero Tests

**Problem:** No `*.test.ts` file exists in any of the 11 backend plugins (`accounting_api`, `content_api`, `frontline_api`, `insurance_api`, `loyalty_api`, `mongolian_api`, `operation_api`, `payment_api`, `posclient_api`, `sales_api`, `tourism_api`). The core-api also has zero backend tests.

**Files:** All of `backend/plugins/*/` and `backend/core-api/`

**Risk:** Business logic changes (pricing, payment processing, accounting transactions) cannot be verified automatically. Regressions ship silently.

**Priority:** High — payment and accounting logic especially.

**Fix approach:** Start with model-level unit tests for business-critical models: `backend/core-api/src/modules/organization/team-member/db/models/Users.ts`, `backend/plugins/sales_api/src/modules/sales/db/models/`, `backend/plugins/payment_api/src/modules/payment/db/`.

---

### All 10 Frontend Plugin UIs Have Zero Tests

**Problem:** No `*.test.tsx` or `*.spec.ts` file exists in any of the 10 frontend plugin UIs. Jest configs exist but are empty.

**Files:** All of `frontend/plugins/*/`

**Risk:** UI regressions go undetected. Module Federation failures (wrong exports, missing shared libraries) are caught only at runtime.

**Priority:** Medium — focus on shared component libraries first: `frontend/libs/erxes-ui/` and `frontend/libs/ui-modules/`.

---

## Scaling Limits

### Gateway Rate Limit Is Extremely Permissive

**Current capacity:** 5,000 requests / 15 minutes per IP at the gateway level (`backend/gateway/src/main.ts`, line 89–93).

**Limit:** The `/bullmq-board` path bypasses rate limiting entirely. The global 5,000/15min cap is too high to stop credential-stuffing or scraping attacks.

**Scaling path:** Add route-specific stricter limits on auth endpoints (`/auth`, mutation resolvers for `login`, `register`) using `core-api`'s existing `callbackLimiter` pattern from `backend/core-api/src/modules/organization/routes.ts`.

---

### SaaS Multi-Tenant `useDb()` Has No Connection Limit

**Current capacity:** Each new tenant subdomain creates a logical Mongoose `useDb` connection (cached via `useCache: true`). With hundreds of tenants, this creates hundreds of database handles sharing one connection pool of 5.

**Limit:** Default pool of 5 connections becomes a bottleneck at ~10+ concurrent tenants.

**Files:**
- `backend/erxes-api-shared/src/utils/mongo/generate-models.ts` (line 83)

**Scaling path:** Increase `maxPoolSize` in `mongooseConnectionOptions` and implement LRU-bounded connection cache.

---

## Dependencies at Risk

### Elasticsearch 7 (End-of-Life)

**Risk:** `@elastic/elasticsearch: 7` targets Elasticsearch 7.x which has reached end of life (October 2023). Security patches are no longer issued upstream.

**Impact:** Search functionality for contacts, deals, and products.

**Migration plan:** Upgrade to Elasticsearch 8 (`@elastic/elasticsearch: ^8`) or migrate to OpenSearch. Breaking changes in the client API need mapping.

---

### `@module-federation/enhanced v0.6.6` With Fast Release Cycle

**Risk:** Module Federation enhanced is under rapid development. Version pinning may lag behind breaking changes or security fixes.

**Impact:** Frontend plugin loading, shared library negotiation.

**Migration plan:** Monitor `@module-federation/enhanced` changelog; upgrade incrementally testing each plugin remote.

---

## Test Coverage Gaps

### Payment Processing Logic Has No Tests

**What's not tested:** Invoice creation, transaction lifecycle, webhook signature verification, refund flows across all payment providers (QPay, Golomt, Socialpay, Toki, Storepay).

**Files:**
- `backend/plugins/payment_api/src/apis/`
- `backend/plugins/payment_api/src/modules/payment/`

**Risk:** Billing bugs ship to production undetected.

**Priority:** High

---

### Accounting Transaction Logic Has No Tests

**What's not tested:** Double-entry bookkeeping correctness, inventory adjustment validation, transaction status transitions (765-line model file).

**Files:**
- `backend/plugins/accounting_api/src/modules/accounting/db/models/Transactions.ts`
- `backend/plugins/accounting_api/src/modules/accounting/utils/inventories.ts`

**Risk:** Financial data corruption from edge-case bugs.

**Priority:** High

---

### Authentication and Authorization Flows Have No Tests

**What's not tested:** JWT token issuance/verification, permission checks via `checkPermission`, OAuth flow, client portal authentication.

**Files:**
- `backend/core-api/src/modules/auth/`
- `backend/core-api/src/modules/clientportal/services/auth/`
- `backend/gateway/src/middlewares/userMiddleware.ts`

**Risk:** Auth regressions allow privilege escalation or unauthorized access.

**Priority:** High

---

### Module Federation Remote Loading Has No Tests

**What's not tested:** Plugin remote URL resolution, error boundary behavior when a remote fails, shared library version negotiation.

**Files:**
- `frontend/core-ui/module-federation.config.ts`
- `frontend/core-ui/src/modules/app/components/App.tsx`

**Risk:** Plugin loading failures are only discovered in production.

**Priority:** Medium

---

*Concerns audit: 2026-05-21*
