# External Integrations

**Analysis Date:** 2026-05-21

## APIs & External Services

### GraphQL Federation (Internal)

**Apollo Router (Supergraph Gateway):**
- Purpose: Federates all plugin GraphQL subgraphs into a single unified schema
- Implementation: Apollo Router binary launched as a child process from `backend/gateway/src/apollo-router/index.ts`
- Supergraph composition: `backend/gateway/src/apollo-router/supergraph-compose.ts` polls active plugins and regenerates the supergraph SDL
- Config path: `backend/gateway/src/apollo-router/paths.ts`
- Subgraph SDK: `@apollo/subgraph` ^2.9.3 — each plugin uses `buildSubgraphSchema()` in `backend/erxes-api-shared/src/utils/start-plugin.ts`
- Schema introspection: controlled by `INTROSPECTION` env var

**Plugin Routing (Gateway Express):**
- REST proxy: `/pl:{serviceName}/*` → proxied to plugin's Express server via `http-proxy-middleware`
- tRPC proxy: `/trpc/*` → proxied to individual plugins
- GraphQL: forwarded to Apollo Router then to subgraph services
- Implementation: `backend/gateway/src/proxy/middleware.ts`

### tRPC (Internal Inter-Service)

**Purpose:** Type-safe RPC between plugins and from gateway to plugins
- Client SDK: `@trpc/client` ^11.0.0
- Server SDK: `@trpc/server` ^11.0.0
- Pattern: `sendTRPCMessage()` from `erxes-api-shared/utils` — used across all plugins for cross-plugin calls
- Context: `backend/erxes-api-shared/src/utils/trpc/index.ts`
- Each plugin exposes a tRPC app router registered in `startPlugin()` call

### Service Discovery (Redis-based)

**Purpose:** Plugin registration and gateway routing table
- Plugins register on startup via `joinErxesGateway()` from `erxes-api-shared/utils`
- Gateway discovers plugins via Redis keys; active plugin list stored at `erxes-active-plugins` Redis key
- Plugin config stored at `erxes:service:config:{name}` Redis keys
- Implementation: `backend/erxes-api-shared/src/utils/service-discovery.ts`
- BullMQ queue: `gateway-service-discovery` queue in `backend/gateway/src/main.ts`

## Data Storage

### Databases

**MongoDB:**
- Version: No strict version enforced; client is `mongodb` ^6.18.0 (direct), `mongoose` ^8.10.0 (ODM)
- Default connection: `mongodb://127.0.0.1:27017/erxes?directConnection=true`
- Connection env var: `MONGO_URL`
- Connection utility: `backend/erxes-api-shared/src/utils/mongo/mongo-connection.ts`
- Multi-tenancy: MongoDB collections are prefixed per subdomain; `generateModels(subdomain)` pattern used everywhere
- Model generation: `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`
- Change streams: Disabled in dev via `DISABLE_CHANGE_STREAM=true`

### Caching & Pub/Sub

**Redis (ioredis):**
- Client: `ioredis` ^5.6.1
- Connection: `backend/erxes-api-shared/src/utils/redis.ts`
- Env vars: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Default port: 6379
- Uses: Service discovery, session tokens, config cache, pub/sub for subscriptions
- Token storage: `user_token_{userId}_{token}` keys with 24-hour TTL

**Redis PubSub (GraphQL Subscriptions):**
- Library: `graphql-redis-subscriptions` ^2.7.0
- Implementation: `backend/erxes-api-shared/src/utils/graphqlPubSub.ts`
- Uses two separate ioredis connections (publisher + subscriber)
- Env vars: same as Redis above

**BullMQ (Job Queue):**
- Library: `bullmq` ^5.40.0
- Backed by Redis connection
- Dashboard: `@bull-board/api` + `@bull-board/express` — accessible at `http://localhost:4000/bullmq-board`
- Usage: automation execution, email jobs, file processing, service discovery events
- Worker abstraction: `backend/erxes-api-shared/src/utils/mq-worker.ts` — `createMQWorkerWithListeners()`
- Queue naming convention: `{service}-{queueName}` (e.g., `gateway-service-discovery`)

### Search

**Elasticsearch 7:**
- Client: `@elastic/elasticsearch` 7 (exact major version pinned)
- Connection env var: `ELASTICSEARCH_URL` (default: `http://localhost:9200`)
- Client initialization: `backend/erxes-api-shared/src/utils/elasticsearch/utils.ts`
- SaaS mode: Elasticsearch document IDs are prefixed with `{subdomain}__` to isolate tenants
- Usage: Contact/customer search, segment filtering, full-text search across plugins

### File Storage

**Multi-provider file storage** via `backend/erxes-api-shared/src/utils/file/upload.ts`:

| Provider | SDK | Key Env Vars |
|----------|-----|--------------|
| AWS S3 | `aws-sdk` ^2.x, `@aws-sdk/client-s3` ^3.x | `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_COMPATIBLE_SERVICE_ENDPOINT` |
| Google Cloud Storage | `@google-cloud/storage` ^7.17.3 | `GOOGLE_CLOUD_STORAGE_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_PROJECT_ID` |
| Azure Blob Storage | `@azure/storage-blob` ^12.29.1 | `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` |
| Cloudflare R2 | Uses S3-compatible endpoint | `CLOUDFLARE_BUCKET_NAME`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY_ID`, `CLOUDFLARE_SECRET_ACCESS_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_USE_CDN`, `CLOUDFLARE_ACCOUNT_HASH` |
| Local filesystem | Built-in Node.js `fs` | `FILE_SYSTEM_PUBLIC` |

Provider selected via `UPLOAD_SERVICE_TYPE` environment variable.

Also in `backend/core-api/src/utils/file/upload.ts` — a core-api-specific upload path that reuses the same provider logic.

## Authentication & Identity

### JWT (JSON Web Tokens)
- Library: `jsonwebtoken` ^9.0.2
- Usage: Session tokens issued on login, stored in Redis with 24-hour TTL
- Implementation: `backend/core-api/src/modules/auth/utils.ts` — `saveValidatedToken()`
- Secret: Per-organization secret from `models.Users.getSecret()`

### WorkOS (SaaS SSO & Magic Links)
- SDK: `@workos-inc/node` ^7.65.0
- Usage: SaaS mode only — Google OAuth SSO and Magic Link email authentication
- Implementation: `backend/core-api/src/modules/auth/graphql/resolvers/mutations.ts`
- Env vars: `WORKOS_API_KEY`, `WORKOS_PROJECT_ID`, `CORE_DOMAIN`
- Flows:
  - SSO: `workosClient.sso.getAuthorizationUrl()` → redirect to WorkOS → callback at `/saas-sso-callback`
  - Magic Link: `workosClient.passwordless.createSession()` → email link → callback at `/saas-ml-callback`

### Password Auth
- Library: `bcryptjs` ^3.0.2
- Usage: Standard username/password login for self-hosted deployments

### Firebase (Client Portal Push Notifications)
- SDK: `firebase-admin` ^13.6.0
- Usage: Push notifications to mobile apps via Firebase Cloud Messaging (FCM)
- Implementation: `backend/core-api/src/modules/clientportal/services/notification/firebaseService.ts`
- Config: Per-client-portal Firebase service account JSON stored in database

## Messaging & Communication

### Email

**AWS SES (via Nodemailer):**
- SDK: `aws-sdk` ^2.x (SES API version 2010-12-01)
- Implementation: `backend/core-api/src/utils/email/index.ts` — `createTransporter({ ses: true })`
- Env vars (stored in DB config): `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_REGION`

**SendGrid:**
- SDK: `@sendgrid/mail` ^8.1.5
- Usage: SaaS magic link emails; also available as email backend
- Implementation: `backend/core-api/src/modules/auth/utils.ts` — `sendSaasMagicLinkEmail()`
- Env var: `SENDGRID_API_KEY`

**SMTP (Nodemailer generic):**
- Library: `nodemailer` ^6.9.10
- Config: `MAIL_SERVICE`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS` from DB settings
- Template engine: Handlebars `^4.7.8` for email templates

**IMAP (Inbox integration):**
- Library: `node-imap` ^0.9.6 (in `backend/plugins/frontline_api`)
- Usage: Receive emails into the frontline inbox as conversations
- Implementation: `backend/plugins/frontline_api/src/modules/integrations/imap/listener.ts`
- Distributed locking: `redlock` 5.0.0-beta.2 prevents duplicate processing across instances

### SMS
- Library: `telnyx` ^1.7.2 (in `backend/core-api`)
- Usage: SMS notifications through Telnyx platform
- Reference: `backend/core-api/src/main.ts` (Telnyx webhook handling noted in comments)

### Voice / Call
- Custom CDR (Call Detail Record) integration
- Implementation: `backend/plugins/frontline_api/src/modules/integrations/call/initApp.ts`
- Auth: `X-Integration-ID` header for authenticating CDR webhook callbacks
- Real-time: WebSocket-based call status via `backend/plugins/frontline_api/src/modules/integrations/call/webSocket.ts`

## Social Media Integrations (Frontline Plugin)

All social integrations live in `backend/plugins/frontline_api/src/modules/integrations/`:

**Facebook Messenger:**
- Library: `fbgraph` ^1.4.4
- Webhook handler: `backend/plugins/frontline_api/src/modules/integrations/facebook/controller/controller.ts`
- Routes: `backend/plugins/frontline_api/src/modules/integrations/facebook/routes.ts`
- AWS S3: Used for storing Facebook media attachments

**Instagram:**
- Uses Facebook Graph API (Instagram Business API via `fbgraph`)
- Webhook handler: `backend/plugins/frontline_api/src/modules/integrations/instagram/controller/instagramController.ts`
- Handles: messages, comments, posts
- Routes: `backend/plugins/frontline_api/src/modules/integrations/instagram/routes.ts`

## Payment Integrations (Payment Plugin)

All payment providers in `backend/plugins/payment_api/src/apis/`:

| Provider | Kind | Currency | Notes |
|----------|------|----------|-------|
| Stripe | `stripe` | Multi | SDK: `stripe` ^17.2.1; webhook at payment_intent events |
| PayPal | `paypal` | Multi | REST API via `backend/plugins/payment_api/src/apis/paypal/api.ts` |
| QPay | `qpay` | MNT | Mongolian payment gateway |
| QPay QuickQR | `qpayQuickqr` | MNT | QPay QR code variant |
| Social Pay (Golomt Bank) | `socialpay` | MNT | `instore.golomtbank.com` |
| MonPay | `monpay` | MNT | `wallet.monpay.mn` |
| StorePay | `storepay` | MNT | `service-merchant.storepay.mn` |
| Pocket | `pocket` | MNT | `service.invescore.mn` |
| MinuPay | `minupay` | MNT | `api.minu.mn` |
| WeChat Pay | `wechatpay` | MNT | Via QPay sandbox |
| Golomt E-Commerce | `golomt` | MNT | `ecommerce.golomtbank.com` |
| Khan Bank | `khanbank` | MNT | `backend/plugins/payment_api/src/apis/khanbank/` |
| Toki | `toki` | MNT | `ms-api.toki.mn` |

QR code generation: `qrcode` ^1.5.0 used for payment QR codes.

## AI / LLM Integrations

**AI Agent System** defined in `backend/erxes-api-shared/src/core-modules/automations/definitions/aiAgents.ts`:

| Provider | Interface Type | Notes |
|----------|---------------|-------|
| OpenAI | `IOpenAIAgentConnection` | Direct OpenAI API with configurable model |
| Cloudflare AI Gateway | `ICloudflareAiGatewayAgentConnection` | Routes to any model via Cloudflare; supports `compat` and `openai-provider` modes |
| Kimi (Moonshot AI) | `IKimiAgentConnection` | Kimi standard models |
| Kimi Code | `IKimiCodingAgentConnection` | Kimi coding-specialized models |
| Grok (xAI) | `IGrokAgentConnection` | Grok models |

Agent config includes: RAG/retrieval config, runtime params (temperature, maxTokens, timeoutMs), file knowledge base with indexing status tracking. Connection config always uses `apiKey` + `baseUrl` pattern.

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Datadog, or similar SDK imported)

**Logs:**
- Custom logging service at `backend/services/logs/`
- `logHandler` utility from `erxes-api-shared/utils/logs` — wraps resolver calls
- `AfterProcessConfigs` pattern in `startPlugin()` for post-request logging hooks

**BullMQ Dashboard:**
- UI available at `http://localhost:4000/bullmq-board` (gateway server)
- `@bull-board/api` + `@bull-board/express` v6.7.7

## CI/CD & Deployment

**GitHub Actions (30 workflow files in `.github/workflows/`):**
- Per-service CI workflows: `ci-api-*.yml`, `ci-ui-*.yml`
- Naming pattern: `ci-api-{plugin}.yml` (e.g., `ci-api-sales.yml`, `ci-api-gateway.yml`)
- Triggers: path-based — only builds services whose files changed
- Always rebuilds `erxes-api-shared` before any backend plugin
- Docker: Multi-platform builds (`linux/amd64`, `linux/arm64`) via `docker/build-push-action`

**Container Registry:**
- Docker Hub: `erxes` organization
- Naming: `erxes/erxes-next-{service-name}:latest`
- Tags: `latest` + `YYYYMMDD-{sha}`

**Deployment Targets:**
- Docker Compose (self-hosted / development)
- Kubernetes (production/scaled deployments)
- Standard cloud platforms (AWS, GCP, Azure) — file storage SDKs for all three are included

## Webhooks & Callbacks

**Incoming Webhooks (received by erxes):**
- Facebook Messenger: POST to `/pl:frontline/facebook-webhook`
- Instagram: POST to `/pl:frontline/instagram-webhook`
- Stripe: payment_intent events at payment plugin webhook endpoint
- All other payment providers: callbacks at `backend/plugins/payment_api/src/apis/controller.ts`
- VoIP/CDR: POST with `X-Integration-ID` header to call integration endpoint
- WorkOS SSO callback: GET `/saas-sso-callback` (core-api)
- WorkOS Magic Link callback: GET `/saas-ml-callback` (core-api)

**Outgoing Webhooks (sent by erxes):**
- Automation triggers: emitted to registered plugins via BullMQ and tRPC
- `backend/plugins/frontline_api/src/modules/inbox/webhooks.ts` — inbox event webhooks sent to external URLs configured per integration

## Environment Configuration

**Required env vars (minimal):**
- `MONGO_URL` — MongoDB connection string
- `REDIS_HOST`, `REDIS_PORT` — Redis connection
- `ELASTICSEARCH_URL` — Elasticsearch (optional, defaults to `http://localhost:9200`)
- `ENABLED_PLUGINS` — Comma-separated plugin names to activate
- `DOMAIN` — Public domain for CORS and link generation
- `REACT_APP_API_URL` — Frontend API URL pointing to gateway (port 4000)

**SaaS mode additional vars:**
- `WORKOS_API_KEY`, `WORKOS_PROJECT_ID` — WorkOS SSO
- `SENDGRID_API_KEY` — Transactional email
- `CORE_DOMAIN` — Core API public domain for callbacks
- `VERSION=saas` — Activates SaaS multi-tenant mode

**Secrets location:**
- `.env` file at repository root (not committed; `.env.sample` shows structure)
- Storage provider credentials stored in database (fetched at runtime via `getConfig()`)
- Firebase service account JSON stored in MongoDB per client portal

---

*Integration audit: 2026-05-21*
