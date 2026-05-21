<!-- refreshed: 2026-05-21 -->
# Architecture

**Analysis Date:** 2026-05-21

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       Browser / Client                               │
│  core-ui (Host, Port 3001) + Plugin UIs (Module Federation Remotes) │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ HTTP/WebSocket
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   API Gateway (Port 4000)                            │
│  `backend/gateway/src/main.ts`                                       │
│  • Apollo Router (GraphQL Federation supergraph)                     │
│  • HTTP proxy /pl:{serviceName}/* → plugin REST endpoints            │
│  • WebSocket subscriptions aggregation                               │
│  • BullMQ board at /bullmq-board                                     │
│  • Rate limiting, CORS, user middleware                              │
└──────┬──────────────────┬────────────────────┬────────────────────┬─┘
       │                  │                    │                    │
       ▼                  ▼                    ▼                    ▼
┌────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐
│ Core API   │  │ Plugin APIs      │  │ Plugin APIs  │  │ Background  │
│ Port 3300  │  │ sales (3305)     │  │ frontline    │  │ Services    │
│`core-api/  │  │ content (3303)   │  │ (3304)       │  │`services/   │
│ src/main.ts│  │ operation (3307) │  │ accounting   │  │ automations/│
│            │  │ payment (3310)   │  │ (3308)       │  │ logs/`      │
└────────────┘  │ loyalty (3309)   │  │ tourism(3311)│  └─────────────┘
                │ mongolian (3313) │  │ posclient    │
                │ insurance (33010)│  │ (3312)       │
                └──────────────────┘  └──────────────┘
       │                  │                    │
       └──────────────────┴────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                  ▼
         ┌─────────┐      ┌─────────┐      ┌──────────────┐
         │ MongoDB │      │  Redis  │      │Elasticsearch │
         │         │      │ +BullMQ │      │     (7)      │
         └─────────┘      └─────────┘      └──────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| API Gateway | GraphQL federation supergraph, plugin HTTP proxy, WebSocket aggregation, rate limiting, BullMQ dashboard | `backend/gateway/src/main.ts` |
| Core API | Auth, contacts, products, automations, segments, documents, permissions, org management | `backend/core-api/src/main.ts` |
| erxes-api-shared | Shared utilities: `startPlugin`, `generateModels`, `joinErxesGateway`, Apollo context, Redis, MQ, tRPC context | `backend/erxes-api-shared/src/` |
| sales_api | Deals/pipelines, POS, ecommerce plugin logic | `backend/plugins/sales_api/src/main.ts` |
| frontline_api | Customer service, tickets, conversations | `backend/plugins/frontline_api/src/main.ts` |
| accounting_api | Financial transactions, accounting records (EE) | `backend/plugins/accounting_api/src/main.ts` |
| content_api | CMS, content management (EE) | `backend/plugins/content_api/src/main.ts` |
| automations service | Background automation execution engine | `backend/services/automations/src/main.ts` |
| logs service | Centralized log storage and retrieval | `backend/services/logs/src/` |
| core-ui | Module Federation host, app shell, routing, auth, contacts, automations UI | `frontend/core-ui/src/bootstrap.tsx` |
| erxes-ui lib | Shared React components, hooks, utilities, types | `frontend/libs/erxes-ui/src/index.ts` |
| ui-modules lib | Shared Jotai atoms (currentUserState, pluginsConfigState), reusable UI modules | `frontend/libs/ui-modules/src/` |
| Plugin UIs (e.g. sales_ui) | Module Federation remotes exposing feature routes, widgets, settings | `frontend/plugins/sales_ui/src/config.tsx` |

## Pattern Overview

**Overall:** Microservices backend (GraphQL Federation) + Micro-frontend (Module Federation) + Plugin system

**Key Characteristics:**
- Every plugin (backend + frontend) is independently deployable and discoverable at runtime
- Backend plugins self-register via Redis using `joinErxesGateway`; the gateway builds the Apollo supergraph dynamically
- Frontend plugins are Module Federation remotes; the host fetches the remote list from the API at boot and initializes federation at runtime
- Multi-tenancy via `subdomain` extracted from `hostname` on every request — all DB model access is tenant-scoped
- `erxes-api-shared` is the sole cross-cutting library for all backend services; it must be built first (`pnpm nx build erxes-api-shared`)

## Layers

**API Gateway Layer:**
- Purpose: Single entry point for all client traffic; routes GraphQL to the federated supergraph, REST to plugin proxies, WebSocket to subscription aggregator
- Location: `backend/gateway/src/`
- Contains: Express app, Apollo Router integration, proxy middleware, BullMQ board, user middleware, subscription server
- Depends on: `erxes-api-shared/utils` (Redis, service discovery, `getSubdomain`, `getPlugins`)
- Used by: All browser clients, frontline widgets, POS client, client portal

**Core API Layer:**
- Purpose: Core business logic — contacts, products, auth, automations engine, segments, documents, org management
- Location: `backend/core-api/src/`
- Contains: Apollo subgraph, tRPC router, Express routes, module-per-feature structure under `modules/`, meta configs
- Depends on: `erxes-api-shared`, MongoDB
- Used by: Gateway (via federation), other plugins (via tRPC inter-service calls)

**Plugin API Layer:**
- Purpose: Domain-specific microservices, each a self-contained Apollo subgraph + tRPC + Express service
- Location: `backend/plugins/{name}_api/src/`
- Contains: `main.ts` (calls `startPlugin()`), `connectionResolvers.ts`, `apollo/`, `trpc/`, `modules/`, `meta/`, `routes.ts`
- Depends on: `erxes-api-shared`, MongoDB (tenant-scoped)
- Used by: Gateway (via GraphQL federation and `/pl:{name}` REST proxy)

**Shared Backend Library:**
- Purpose: Reusable infrastructure for ALL backend services — plugin lifecycle, service discovery, DB connection, Apollo context, tRPC context, Redis, BullMQ, file handling, auth helpers
- Location: `backend/erxes-api-shared/src/`
- Contains: `utils/` (start-plugin, service-discovery, redis, mongo, apollo, trpc, headers, logs), `core-types/`, `core-modules/` (automations, segments, permissions, import-export, payments, notifications, logs)
- Depends on: MongoDB, Redis, external services
- Used by: Every backend service

**Background Services Layer:**
- Purpose: Long-running workers for automation execution and log aggregation
- Location: `backend/services/automations/src/`, `backend/services/logs/src/`
- Contains: BullMQ workers, AI agent integration, tRPC clients for inter-service calls
- Depends on: Redis (BullMQ), MongoDB, `erxes-api-shared`
- Used by: Core API and plugins (publish jobs to queues)

**Frontend Host Layer (core-ui):**
- Purpose: Module Federation host app — authentication, core routes (contacts, automations, segments, settings), navigation shell, plugin route mounting
- Location: `frontend/core-ui/src/`
- Contains: `bootstrap.tsx` (federation init), `modules/app/` (routing, layout), `modules/auth/`, `modules/contacts/`, `modules/automations/`, `modules/plugins/` (plugin config loader)
- Depends on: `erxes-ui`, `ui-modules`, Apollo Client, Jotai, React Router v7
- Used by: Browsers; loads plugin remotes at runtime

**Frontend Plugin Layer (plugin UIs):**
- Purpose: Module Federation remotes — each plugin exposes `./config`, named feature modules, widget components, settings pages
- Location: `frontend/plugins/{name}_ui/src/`
- Contains: `config.tsx` (IUIConfig export), `modules/` (feature components, routes), `pages/` (settings pages), `widgets/` (relation/automation widgets), `module-federation.config.ts`
- Depends on: `erxes-ui`, `ui-modules`, Apollo Client (shared singleton), Jotai (shared store), React Router
- Used by: core-ui loads via `loadRemote()` at runtime

**Frontend Shared Libraries:**
- Purpose: Shared React components, state atoms, and reusable UI modules across all frontend apps
- Location: `frontend/libs/erxes-ui/src/`, `frontend/libs/ui-modules/src/`
- Contains: `erxes-ui` — components, hooks, constants, utils, types; `ui-modules` — Jotai atoms (`currentUserState`, `pluginsConfigState`, `loadingPluginsConfigState`), shared modules (contacts, products, segments, automations, etc.)
- Depends on: React, Apollo Client, Jotai, Radix UI, TailwindCSS
- Used by: core-ui and all plugin UIs (shared singleton via Module Federation `shared` config)

**Standalone Apps:**
- Purpose: Customer-facing applications separate from the main admin UI
- Location: `apps/client-portal-template/`, `apps/posclient-front/`, `apps/frontline-widgets/`
- Contains: Next.js apps (client portal, POS), standalone React widget bundle (chat/forms)
- Depends on: Gateway API via GraphQL, standalone Apollo clients

## Data Flow

### Primary GraphQL Request Path

1. Browser sends GraphQL query to `http://localhost:4000/graphql`
2. Gateway Express app (`backend/gateway/src/main.ts`) applies CORS, rate limiting, user middleware (`~/middlewares/userMiddleware`)
3. Apollo Router supergraph routes query to the correct plugin subgraph(s)
4. Plugin subgraph receives request at `/graphql` on its own port
5. `generateApolloContext()` (`backend/erxes-api-shared/src/utils/apollo/utils.ts`) extracts `user`, `cpUser`, `subdomain`, creates context
6. Plugin calls `generateModels(subdomain)` (`connectionResolvers.ts`) to get tenant-scoped Mongoose models
7. Resolver executes business logic against MongoDB, returns data
8. Apollo Router stitches federated response, returns to client

### Plugin REST Proxy Path

1. Browser/client sends request to `http://localhost:4000/pl:{serviceName}/path`
2. Gateway middleware (`backend/gateway/src/main.ts` line 172) reads `serviceName` from URL
3. Calls `getPlugin(serviceName)` (reads address from Redis key `erxes-service-{name}`)
4. Proxies request via `http-proxy-middleware` to plugin's address, rewrites path prefix

### tRPC Inter-service Path

1. Service imports tRPC client pointing to another service
2. Calls procedure: `trpc.{router}.{procedure}.query(input)`
3. Request goes to target service `/trpc` endpoint
4. `createTRPCContext` (`backend/erxes-api-shared/src/utils/trpc/`) extracts subdomain, builds context with models

### Module Federation Plugin Load Path

1. `frontend/core-ui/src/bootstrap.tsx` boots: fetches `{API_URL}/get-frontend-plugins` → list of remote configs
2. Calls `init({ name: 'core', remotes: data })` from `@module-federation/enhanced/runtime`
3. `PluginConfigsProvidersEffect` (`frontend/core-ui/src/modules/plugins/providers/PluginConfigsProvidersEffect.tsx`) iterates remotes, calls `loadRemote('{name}/config')` for each
4. Each plugin exposes `./config` → returns `IUIConfig` object; stored in Jotai `pluginsConfigState` atom
5. `getPluginsRoutes()` (`frontend/core-ui/src/modules/app/hooks/usePluginsRouter.tsx`) reads `pluginsConfigState`, renders `<Route path="/{plugin.path}/*">` for each plugin
6. On navigation, `RenderPluginsComponent` (`frontend/core-ui/src/modules/plugins/`) calls `loadRemote('{pluginName}/{moduleName}')` to lazy-load the feature component

### Backend Plugin Registration Path

1. Plugin starts, calls `startPlugin(config)` (`backend/erxes-api-shared/src/utils/start-plugin.ts`)
2. `startPlugin` starts Apollo subgraph, tRPC, Express, waits for server to be ready
3. Calls `joinErxesGateway({ name, port, hasSubscriptions, meta })` (`backend/erxes-api-shared/src/utils/service-discovery.ts`)
4. Sets Redis keys: `erxes-service-{name}` = address, `erxesservice:config:{name}` = JSON config with meta
5. In production, queues a BullMQ job to trigger Apollo Router supergraph recomposition in the gateway

**State Management:**
- Backend: Stateless per-request; Redis for ephemeral shared state (service registry, token cache, pub/sub); MongoDB for persistent data; BullMQ for job queues
- Frontend: Jotai atoms for global state (user, permissions, plugin configs); Apollo Client cache for server data; `useState`/`useReducer` for local component state

## Key Abstractions

**`startPlugin(config: ConfigTypes)`:**
- Purpose: Single function to bootstrap any backend plugin microservice — creates Express app, Apollo subgraph (using `buildSubgraphSchema`), tRPC mount, registers meta (automations, segments, notifications, payments, beforeResolvers), calls `joinErxesGateway`
- Examples: `backend/plugins/sales_api/src/main.ts`, `backend/plugins/frontline_api/src/main.ts`
- Pattern: Call once at process entry point; pass `name`, `port`, `graphql()`, `apolloServerContext`, `trpcAppRouter`, `meta`, `importExport`
- Location: `backend/erxes-api-shared/src/utils/start-plugin.ts`

**`createGenerateModels(loadClasses)` / `generateModels(subdomain)`:**
- Purpose: Factory that returns a `generateModels(subdomain)` function. In OS mode, returns models from the single global Mongoose connection. In SaaS mode, returns models from a per-subdomain Mongoose connection to tenant-specific DB
- Examples: `backend/plugins/sales_api/src/connectionResolvers.ts`, `backend/core-api/src/connectionResolvers.ts`
- Pattern: Call `createGenerateModels(loadClasses)` once at module load; the returned async function is called per-request with `subdomain`
- Location: `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`

**`joinErxesGateway({ name, port, meta })` / `getPlugin(name)`:**
- Purpose: Redis-based service discovery. `joinErxesGateway` writes the plugin's address and config to Redis. `getPlugin` reads from Redis (with in-memory cache) to resolve a plugin's address for proxying or inter-service calls
- Examples: Called in `startPlugin` for all plugins
- Pattern: Plugin registers itself after server is ready; gateway reads registry on boot and on supergraph updates
- Location: `backend/erxes-api-shared/src/utils/service-discovery.ts`

**`IUIConfig` / Plugin Config (`config.tsx`):**
- Purpose: Standard contract for a frontend plugin to declare its navigation group, routes, exposed modules, and widget types to the host
- Examples: `frontend/plugins/sales_ui/src/config.tsx`, `frontend/plugins/frontline_ui/src/config.tsx`
- Pattern: Export `const CONFIG: IUIConfig` from `./config`; expose it in `module-federation.config.ts` as `'./config': './src/config.tsx'`
- Location: `frontend/libs/erxes-ui/src/` (IUIConfig type)

**Multi-tenancy via `subdomain`:**
- Purpose: Every HTTP request carries a subdomain (extracted from `nginx-hostname` header or `req.hostname`). This is passed to `generateModels(subdomain)` which either scopes the DB connection (SaaS) or passes it to model classes for collection-level isolation
- Pattern: `getSubdomain(req)` in middleware/context → pass `subdomain` through entire call stack → `generateModels(subdomain)` at resolver level
- Location: `backend/erxes-api-shared/src/utils/utils.ts` (`getSubdomain`), `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`

**`IMainContext`:**
- Purpose: Standard GraphQL resolver context interface — carries `user`, `cpUser`, `clientPortal`, `subdomain`, `models`, `loaders`, `req`, `res`, event handlers
- Examples: All resolvers destructure `{ models, subdomain, user }` from context
- Location: `backend/erxes-api-shared/src/core-types/common.ts`

**Module Federation Plugin Loading (`loadRemote`):**
- Purpose: At runtime, the host loads each plugin's JS bundle from the remote dev server (dev) or CDN (prod) using `@module-federation/enhanced/runtime`'s `loadRemote('{pluginName}/{moduleName}')`
- Pattern: `RenderPluginsComponent` wraps `loadRemote` in a `useEffect`, renders the returned `default` export inside a `Suspense`
- Location: `frontend/core-ui/src/modules/plugins/components/RenderPluginsComponent.tsx`

## Entry Points

**API Gateway:**
- Location: `backend/gateway/src/main.ts`
- Triggers: `pnpm nx serve gateway` or `node dist/src/main.js` on port 4000
- Responsibilities: CORS, rate limiting, user auth middleware, GraphQL federation proxy, plugin REST proxy, WebSocket subscriptions, BullMQ board, graceful shutdown

**Core API:**
- Location: `backend/core-api/src/main.ts`
- Triggers: `pnpm nx serve core-api` or `node dist/main.js` on port 3300
- Responsibilities: Mounts Apollo subgraph, tRPC, Express routes, registers with gateway via `joinErxesGateway`, starts automation/segment/import-export/broadcast workers

**Plugin API (pattern, e.g. sales):**
- Location: `backend/plugins/sales_api/src/main.ts`
- Triggers: `pnpm nx serve sales_api` on port 3305
- Responsibilities: Calls `startPlugin({ name: 'sales', port: 3305, ... })` which handles all infrastructure setup and gateway registration

**Frontend Host (core-ui):**
- Location: `frontend/core-ui/src/main.ts` → `frontend/core-ui/src/bootstrap.tsx`
- Triggers: `pnpm nx serve core-ui` on port 3001
- Responsibilities: Fetches remote plugin list from API, initializes Module Federation runtime, renders React app with router

**Frontend Plugin (pattern, e.g. sales_ui):**
- Location: `frontend/plugins/sales_ui/src/main.ts` → `frontend/plugins/sales_ui/src/bootstrap.tsx`
- Triggers: `pnpm nx serve sales_ui` on port 3005
- Responsibilities: Standalone dev entry point; in prod, serves as Module Federation remote at `{CDN}/{pluginName}/remoteEntry.js`

**Automations Background Service:**
- Location: `backend/services/automations/src/main.ts`
- Triggers: Independent process; listens on BullMQ queues, executes automation workflows
- Responsibilities: Processes automation jobs, AI agent execution, inter-service tRPC calls

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop per service; BullMQ workers run in the same process or as separate Worker threads for CPU-bound tasks
- **Global state:** `erxes-api-shared` Redis client is a module-level singleton (`backend/erxes-api-shared/src/utils/redis.ts`); service discovery in-memory cache (`serviceInfoCache`, `pluginAddressCache`) in `backend/erxes-api-shared/src/utils/service-discovery.ts` is process-global
- **Build dependency:** `erxes-api-shared` MUST be built before any backend service that imports from it in production; CI workflows always run `pnpm nx build erxes-api-shared` first
- **Shared frontend libs:** `erxes-ui`, `ui-modules`, `react`, `react-dom`, `@apollo/client`, `jotai`, `react-i18next`, `react-router` are declared as `shared` singleton libraries in every plugin's `module-federation.config.ts` — adding a new plugin MUST include these in the shared set
- **No direct DB cross-service:** Plugins must NOT import models from other plugins. Cross-service data access uses GraphQL federation field resolvers (`@key`, `@provides`) or tRPC client calls
- **Subdomain required in SaaS mode:** `generateModels(subdomain)` will throw if subdomain is empty in SaaS mode (`VERSION=saas`)

## Anti-Patterns

### Importing across plugin boundaries directly

**What happens:** A plugin imports a model class or service function directly from another plugin's source (e.g., `import { loadDealClass } from '../../sales_api/src/...'`)
**Why it's wrong:** Breaks microservice isolation; the importing service cannot be deployed independently; circular build dependencies arise
**Do this instead:** Use GraphQL federation `@key`/`@requires` directives for data joining, or tRPC client calls (`backend/plugins/sales_api/src/trpc/trpc-clients.ts` pattern) for imperative cross-service calls

### Calling generateModels without subdomain in SaaS mode

**What happens:** Resolver calls `generateModels('')` or omits the subdomain argument
**Why it's wrong:** In `VERSION=saas`, `createGenerateModels` throws immediately; in OS mode it silently uses the single shared connection, masking multi-tenant bugs
**Do this instead:** Always extract `subdomain` from context (`const { subdomain, models } = context;`) and pass it explicitly; never hardcode an empty string

### Exposing a new module in a plugin UI without updating module-federation.config.ts

**What happens:** A component is added to `frontend/plugins/{name}_ui/src/` but not listed in `exposes` in `module-federation.config.ts`
**Why it's wrong:** The host cannot `loadRemote('{pluginName}/{moduleName}')` to a module that isn't exposed; runtime error at navigation
**Do this instead:** Add the new entry to `exposes` in `frontend/plugins/{name}_ui/module-federation.config.ts` and restart the dev server

## Error Handling

**Strategy:** Throw descriptive `Error` instances in resolvers and services; Apollo Server catches and returns GraphQL errors to clients. HTTP endpoints use Express error middleware or direct `res.status(N).send()` responses.

**Patterns:**
- Resolvers throw `new Error('descriptive message')` — Apollo maps to `errors[]` in GraphQL response
- `startPlugin` does not catch; unhandled rejection crashes the process (intentional — let the process manager restart it)
- Gateway gracefully handles plugin unavailability: if `getPlugin(name)` returns no address, responds `404 Service not found`
- Frontend: `RenderPluginsComponent` catches `loadRemote` failures and renders `RenderPluginsComponentErrorState`

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` directly in services; structured log forwarding via BullMQ to the `logs` background service (`backend/services/logs/`)
**Validation:** GraphQL schema type system as primary validation; Zod in tRPC procedures (`backend/erxes-api-shared/src/utils/trpc/`); manual checks in service/model layer
**Authentication:** `userMiddleware` in the gateway extracts JWT from cookie/header, injects decoded user into downstream headers; plugins read `extractUserFromHeader(req.headers)` in Apollo context generation (`backend/erxes-api-shared/src/utils/headers/`)

---

*Architecture analysis: 2026-05-21*
