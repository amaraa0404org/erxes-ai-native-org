# Codebase Structure

**Analysis Date:** 2026-05-21

## Directory Layout

```
erxes-ai-native-org/               # Nx pnpm monorepo root
├── backend/                       # All backend services
│   ├── gateway/                   # API Gateway (Port 4000) — single entry point
│   │   └── src/
│   │       ├── main.ts            # Gateway server entry point
│   │       ├── apollo-router/     # Apollo Router supergraph composition
│   │       ├── proxy/             # Plugin HTTP proxy logic & targets
│   │       ├── middlewares/       # CORS, user auth, GraphQL limiters
│   │       ├── mq/                # BullMQ workers (gateway service discovery)
│   │       ├── subscription/      # WebSocket subscription aggregation
│   │       └── connectionResolver.ts  # Gateway DB models (Apps)
│   ├── core-api/                  # Core business logic service (Port 3300)
│   │   └── src/
│   │       ├── main.ts            # Core API server entry
│   │       ├── apollo/            # GraphQL schema + resolvers + subscription
│   │       ├── modules/           # Feature modules (one folder per domain)
│   │       │   ├── auth/          # Authentication, OAuth, JWT
│   │       │   ├── contacts/      # Customers, companies, conformities
│   │       │   ├── products/      # Product catalog, categories, configs
│   │       │   ├── automations/   # Automation definitions and execution
│   │       │   ├── segments/      # Dynamic segmentation engine
│   │       │   ├── documents/     # Document templates
│   │       │   ├── organization/  # Users, structure, brands, settings
│   │       │   ├── permissions/   # Role-based access control
│   │       │   ├── clientportal/  # Customer portal management
│   │       │   ├── broadcast/     # Mass messaging system
│   │       │   ├── bundle/        # Product bundles/conditions
│   │       │   ├── forms/         # Form builder
│   │       │   ├── internalNote/  # Internal notes
│   │       │   ├── logs/          # Activity log storage
│   │       │   ├── notifications/ # Notification management
│   │       │   ├── properties/    # Custom field properties
│   │       │   ├── relations/     # Cross-content-type relations
│   │       │   ├── tags/          # Tagging system
│   │       │   ├── template/      # Email/notification templates
│   │       │   └── apps/          # Third-party app integrations
│   │       ├── meta/              # Automation, import/export meta configs
│   │       ├── init-trpc.ts       # Root tRPC router assembly
│   │       ├── connectionResolvers.ts  # All core DB models
│   │       └── routes.ts          # Express route definitions
│   ├── erxes-api-shared/          # Shared library — built first, referenced by all
│   │   └── src/
│   │       ├── utils/             # Infrastructure utilities
│   │       │   ├── start-plugin.ts        # Plugin bootstrap function
│   │       │   ├── service-discovery.ts   # joinErxesGateway, getPlugin, Redis registry
│   │       │   ├── redis.ts               # Redis singleton client
│   │       │   ├── mongo/                 # Mongoose connection, createGenerateModels
│   │       │   ├── apollo/                # generateApolloContext, wrapResolvers
│   │       │   ├── trpc/                  # createTRPCContext
│   │       │   ├── headers/               # extractUserFromHeader, extractCPUserFromHeader
│   │       │   ├── logs/                  # logHandler, startAfterProcess
│   │       │   ├── saas/                  # SaaS organization helpers
│   │       │   └── elasticsearch/         # Elasticsearch client utilities
│   │       ├── core-types/        # Shared TypeScript interfaces (IMainContext, IUser, etc.)
│   │       ├── core-modules/      # Shared business logic modules
│   │       │   ├── automations/   # startAutomations, automation types
│   │       │   ├── segments/      # initSegmentProducers
│   │       │   ├── permissions/   # checkPermissionGroup
│   │       │   ├── import-export/ # startImportExportWorker, producer types
│   │       │   ├── notifications/ # Notification infrastructure
│   │       │   ├── logs/          # Log event infrastructure
│   │       │   ├── users/         # User helpers
│   │       │   ├── forms/         # Form processing
│   │       │   ├── templates/     # Template rendering
│   │       │   └── common/        # Event handlers, scoped event system
│   │       └── common-modules/    # Payment worker
│   ├── plugins/                   # Plugin microservices (one per domain)
│   │   ├── sales_api/             # Sales: deals, pipelines, POS (Port 3305)
│   │   ├── frontline_api/         # Customer service, tickets (Port 3304)
│   │   ├── content_api/           # CMS, content types (Port 3303)
│   │   ├── operation_api/         # Operations management (Port 3307)
│   │   ├── accounting_api/        # Accounting / finance (Port 3308)
│   │   ├── loyalty_api/           # Loyalty programs (Port 3309)
│   │   ├── payment_api/           # Payment integrations (Port 3310)
│   │   ├── mongolian_api/         # Mongolian-specific logic (Port 3313)
│   │   ├── insurance_api/         # Insurance module (Port 33010)
│   │   ├── posclient_api/         # POS client API (Port 3312)
│   │   └── tourism_api/           # Tourism module (Port 3311)
│   └── services/                  # Long-running background services
│       ├── automations/           # Automation execution engine
│       └── logs/                  # Log aggregation service
├── frontend/                      # All frontend applications
│   ├── core-ui/                   # Module Federation host (Port 3001)
│   │   └── src/
│   │       ├── main.ts            # Entry point (imports bootstrap)
│   │       ├── bootstrap.tsx      # Federation init, React root render
│   │       ├── modules/           # Core feature modules
│   │       │   ├── app/           # App shell, routing hooks, layout
│   │       │   ├── auth/          # Login, OAuth, user provider
│   │       │   ├── contacts/      # Contacts UI
│   │       │   ├── automations/   # Automation builder UI
│   │       │   ├── segments/      # Segment builder UI
│   │       │   ├── navigation/    # Navigation shell
│   │       │   ├── plugins/       # Plugin config loader + render components
│   │       │   ├── organization/  # Org settings, owner creation
│   │       │   ├── settings/      # Settings pages
│   │       │   ├── products/      # Products UI
│   │       │   ├── broadcast/     # Broadcast UI
│   │       │   ├── documents/     # Documents UI
│   │       │   └── ...            # Other core modules
│   │       ├── pages/             # Top-level page components (auth, onboarding, etc.)
│   │       ├── providers/         # React context providers (i18n, Apollo)
│   │       └── assets/            # Static assets, i18n locale files
│   ├── libs/                      # Shared frontend libraries
│   │   ├── erxes-ui/              # Core component library + utilities
│   │   │   └── src/
│   │   │       ├── components/    # Reusable UI components
│   │   │       ├── hooks/         # Shared React hooks
│   │   │       ├── utils/         # Utility functions
│   │   │       ├── constants/     # App-wide constants
│   │   │       ├── types/         # Shared TypeScript types (IUIConfig)
│   │   │       ├── state/         # Base state utilities
│   │   │       ├── lib/           # Library helpers
│   │   │       └── modules/       # Shared feature modules (Apollo client, etc.)
│   │   └── ui-modules/            # Shared Jotai atoms + domain modules
│   │       └── src/
│   │           ├── states/        # Jotai atoms (currentUserState, pluginsConfigState, etc.)
│   │           ├── modules/       # Shared domain modules (contacts, products, segments, etc.)
│   │           └── hooks/         # Shared hooks
│   └── plugins/                   # Frontend plugin remotes (Module Federation)
│       ├── sales_ui/              # Sales: deals, POS (Port 3005)
│       ├── frontline_ui/          # Customer service UI (Port 3004)
│       ├── content_ui/            # CMS UI (Port 3003)
│       ├── operation_ui/          # Operations UI (Port 3006)
│       ├── accounting_ui/         # Accounting UI (Port 3008)
│       ├── loyalty_ui/            # Loyalty UI (Port 3009)
│       ├── payment_ui/            # Payment UI (Port 3010)
│       ├── mongolian_ui/          # Mongolian UI (Port 3007)
│       ├── insurance_ui/          # Insurance UI (Port 3002)
│       └── tourism_ui/            # Tourism UI (Port 3011)
├── apps/                          # Standalone customer-facing apps
│   ├── client-portal-template/    # Next.js 16 customer portal
│   ├── posclient-front/           # Next.js 14 POS display client (PWA)
│   └── frontline-widgets/         # Embeddable chat/form widgets (React bundle)
├── scripts/                       # Developer scripts
│   ├── create-plugin.js           # Interactive plugin generator (backend + frontend)
│   ├── create-backend-plugin.js   # Backend-only plugin generator
│   ├── start-api-dev.js           # Start all API services from ENABLED_PLUGINS
│   └── start-ui-dev.js            # Start all UI plugins from ENABLED_PLUGINS
├── .github/
│   ├── workflows/                 # 30 CI/CD workflow files (per-service path-triggered)
│   └── agents/                    # GitHub Copilot agent config
├── .planning/                     # GSD planning artifacts (not committed to main)
│   └── codebase/                  # Codebase analysis documents
├── .gsd/                          # GSD briefs
├── node_modules/                  # Root workspace dependencies
├── nx.json                        # Nx configuration (caching, plugins, target defaults)
├── pnpm-workspace.yaml            # pnpm workspace: backend/**, frontend/**
├── package.json                   # Root scripts, all dependencies (single lockfile)
├── tsconfig.base.json             # Workspace-wide TS config + path aliases
├── tsconfig.json                  # Root TS project references
├── jest.config.ts                 # Root Jest config
├── jest.preset.js                 # Shared Jest preset
├── eslint.config.js               # ESLint flat config
├── .prettierrc                    # Prettier config
├── core-libraries.ts              # Canonical list of Module Federation shared libs
├── CLAUDE.md                      # AI assistant guide
└── AGENTS.md                      # Agent guide
```

## Directory Purposes

**`backend/gateway/`:**
- Purpose: The single entry point for all external traffic. Aggregates GraphQL subgraphs via Apollo Router, proxies plugin REST endpoints, aggregates WebSocket subscriptions
- Contains: Express app, Apollo Router YAML/Rhai configs, proxy middleware, BullMQ board adapter, user extraction middleware
- Key files: `src/main.ts`, `src/proxy/targets.ts`, `src/proxy/middleware.ts`, `src/apollo-router/index.ts`

**`backend/core-api/`:**
- Purpose: Core domain logic service — the always-on "platform" service that all others depend on for contacts, auth, products, segments, automations, and org management
- Contains: Apollo subgraph, tRPC router, Express routes, one `modules/{domain}/` folder per feature, each with `db/definitions/`, `db/models/`, `graphql/`, `trpc/`, `services/`, `routes/` as needed
- Key files: `src/main.ts`, `src/connectionResolvers.ts`, `src/init-trpc.ts`, `src/routes.ts`

**`backend/erxes-api-shared/`:**
- Purpose: The only cross-service shared library; contains all infrastructure code shared across backend services. Must be built before any consumer
- Contains: Plugin bootstrap (`start-plugin.ts`), service discovery (`service-discovery.ts`), Redis client, Mongoose connection and model factory, Apollo context generation, tRPC context, header extraction, log handler, core business modules (automations, segments, permissions, import-export)
- Key files: `src/utils/start-plugin.ts`, `src/utils/service-discovery.ts`, `src/utils/mongo/generate-models.ts`, `src/utils/apollo/utils.ts`, `src/core-types/common.ts`

**`backend/plugins/{name}_api/`:**
- Purpose: One microservice per product domain. Each is a complete, independently deployable service
- Standard structure:
  ```
  src/
  ├── main.ts              # Calls startPlugin()
  ├── connectionResolvers.ts   # Creates generateModels for this plugin
  ├── apollo/
  │   ├── typeDefs.ts      # GraphQL schema (assembles sub-schemas)
  │   ├── resolvers/       # Query, Mutation, Subscription resolvers
  │   └── subscription.ts  # GraphQL subscription definitions
  ├── trpc/
  │   ├── init-trpc.ts     # tRPC router assembly
  │   └── trpc-clients.ts  # tRPC clients for other services
  ├── modules/
  │   └── {feature}/
  │       ├── @types/      # TypeScript interfaces for this module
  │       ├── db/
  │       │   ├── definitions/  # Mongoose schema definitions
  │       │   └── models/       # Mongoose model classes (loadXxxClass pattern)
  │       └── graphql/
  │           └── resolvers/    # Resolver functions for this feature
  ├── meta/
  │   ├── automations.ts   # Automation triggers/actions config
  │   ├── segments.ts      # Segment content type config
  │   ├── notifications.ts # Notification module config
  │   ├── permissions.ts   # Permission definitions
  │   └── afterProcess.ts  # Post-process event handlers
  └── routes.ts            # Express REST routes
  ```
- Key files (per plugin): `src/main.ts`, `src/connectionResolvers.ts`

**`backend/services/`:**
- Purpose: Background worker services — not API services, do not serve HTTP to clients
- Contains: `automations/` — BullMQ workers that process automation jobs, AI agent execution; `logs/` — centralized log storage workers
- Key files: `backend/services/automations/src/main.ts`

**`frontend/core-ui/`:**
- Purpose: The Module Federation host application and app shell. Owns auth flow, core navigation, and all non-plugin feature routes
- Contains: Bootstrap/federation init, main router, core modules (contacts, automations, segments, documents, broadcast, settings, navigation, products, etc.)
- Key files: `src/main.ts`, `src/bootstrap.tsx`, `src/modules/app/components/App.tsx`, `src/modules/app/hooks/useCreateAppRouter.tsx`, `src/modules/app/hooks/usePluginsRouter.tsx`, `src/modules/plugins/providers/PluginConfigsProvidersEffect.tsx`, `src/modules/plugins/components/RenderPluginsComponent.tsx`

**`frontend/libs/erxes-ui/`:**
- Purpose: The base component library and utility layer, shared as a Module Federation singleton
- Contains: Radix UI-based components, hooks, utility functions, shared constants (API URLs, etc.), TypeScript types including `IUIConfig`
- Key files: `src/index.ts` (barrel export)

**`frontend/libs/ui-modules/`:**
- Purpose: Shared domain modules and Jotai state atoms, shared as a Module Federation singleton
- Contains: Jotai atoms (`currentUserState`, `pluginsConfigState`, `loadingPluginsConfigState`, `currentUserPermissionsState`), reusable domain modules (contacts, products, segments, automations, team-members, etc.)
- Key files: `src/states/pluginsConfigState.ts`, `src/states/currentUserState.ts`, `src/index.ts`

**`frontend/plugins/{name}_ui/`:**
- Purpose: A Module Federation remote for one product domain. Independently served; loaded at runtime by core-ui
- Standard structure:
  ```
  src/
  ├── main.ts              # Dev entry point (loads bootstrap)
  ├── bootstrap.tsx        # Standalone React root for dev mode
  ├── config.tsx           # Exports CONFIG: IUIConfig — the plugin contract
  ├── modules/             # Feature React components organized by sub-feature
  │   ├── Main.tsx         # Route entry component (exposed as './pluginName')
  │   ├── MainNavigation.tsx
  │   └── {feature}/       # Sub-feature components, hooks, graphql/, types
  ├── pages/               # Settings page components
  └── widgets/             # Relation widgets, automation widgets
  module-federation.config.ts   # Lists name, exposes, and shared libs
  rspack.config.ts              # Rspack build with withModuleFederation()
  project.json                  # Nx targets including port assignment
  ```
- Key files: `src/config.tsx`, `module-federation.config.ts`

**`apps/`:**
- Purpose: Standalone customer-facing applications that are NOT part of the admin micro-frontend system
- Contains: `client-portal-template/` (Next.js 16, customer self-service), `posclient-front/` (Next.js 14, POS display, PWA), `frontline-widgets/` (embeddable messenger/form widget bundle)

**`scripts/`:**
- Purpose: Developer tooling for starting multi-service dev environments and generating plugin boilerplate
- Key files: `create-plugin.js` (interactive scaffold for new plugins), `start-api-dev.js` (reads `ENABLED_PLUGINS` and starts all API services), `start-ui-dev.js`

## Key File Locations

**Entry Points:**
- `backend/gateway/src/main.ts`: API Gateway — all external HTTP/GraphQL/WS traffic
- `backend/core-api/src/main.ts`: Core API service
- `backend/plugins/{name}_api/src/main.ts`: Each plugin API service
- `frontend/core-ui/src/bootstrap.tsx`: Frontend host bootstrap + Module Federation init
- `frontend/plugins/{name}_ui/src/config.tsx`: Plugin's contract with the host

**Configuration:**
- `nx.json`: Nx build orchestration, caching, plugin config
- `pnpm-workspace.yaml`: pnpm monorepo workspace globs (`backend/**`, `frontend/**`)
- `tsconfig.base.json`: Workspace-wide TypeScript config + path aliases (`erxes-ui`, `ui-modules`, `erxes-api-shared`, `erxes-api-shared/*`)
- `.env` / `.env.sample`: Environment variables (never read the `.env` contents)
- `core-libraries.ts`: Canonical list of Module Federation shared singleton libraries
- `frontend/core-ui/module-federation.config.ts`: Host's `ENABLED_PLUGINS`-driven remote list
- `frontend/plugins/{name}_ui/module-federation.config.ts`: Plugin's `exposes` and `shared` config

**Core Logic:**
- `backend/erxes-api-shared/src/utils/start-plugin.ts`: Plugin bootstrap — touch this to affect ALL plugins
- `backend/erxes-api-shared/src/utils/service-discovery.ts`: Redis service registry
- `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`: Tenant-scoped model factory
- `backend/erxes-api-shared/src/utils/apollo/utils.ts`: GraphQL context generation
- `backend/erxes-api-shared/src/core-types/common.ts`: `IMainContext` and core shared types
- `frontend/core-ui/src/modules/app/hooks/usePluginsRouter.tsx`: Plugin route registration from `pluginsConfigState`
- `frontend/core-ui/src/modules/plugins/components/RenderPluginsComponent.tsx`: Runtime `loadRemote()` wrapper

**Testing:**
- `jest.config.ts`: Root Jest configuration
- `jest.preset.js`: Shared Jest preset used by all packages
- `backend/plugins/{name}_api/jest.config.ts`: Per-plugin Jest config (extends preset)
- Test files colocated in `src/modules/{feature}/__tests__/` within each service

## Naming Conventions

**Files:**
- Backend service entry points: `main.ts` (consistent across all services)
- Backend modules: camelCase (`connectionResolvers.ts`, `graphqlPubSub.ts`)
- Frontend React components: PascalCase (`UserList.tsx`, `RenderPluginsComponent.tsx`)
- Frontend hooks: camelCase prefixed with `use` (`useCreateAppRouter.tsx`, `usePluginsRouter.tsx`)
- Frontend pages: PascalCase with `Page` suffix (`LoginPage.tsx`, `SalesIndexPage.tsx`)
- Frontend config files: kebab-case (`module-federation.config.ts`, `rspack.config.ts`)
- Nx project config: `project.json` in each package root

**Directories:**
- Backend plugins: `{name}_api/` (snake_case + `_api` suffix)
- Frontend plugins: `{name}_ui/` (snake_case + `_ui` suffix)
- Backend module sub-dirs: `db/definitions/`, `db/models/`, `graphql/resolvers/`, `graphql/schema/`
- Frontend module sub-dirs: `components/`, `hooks/`, `graphql/`, `states/`, `types/`

**GraphQL:**
- Types: PascalCase (`type Deal`, `type DealStage`)
- Queries: camelCase descriptive (`deals`, `dealDetail`, `dealsTotalCount`)
- Mutations: camelCase verb+noun (`dealsAdd`, `dealsEdit`, `dealsRemove`)
- Subscriptions: noun+past-tense (`dealChanged`, `conversationMessageInserted`)

**Nx Projects:**
- Backend plugins: `sales_api`, `frontline_api` (matching directory name)
- Frontend plugins: `sales_ui`, `frontline_ui` (matching directory name)
- Shared libs: `erxes-api-shared`, `erxes-ui`, `ui-modules`

## Where to Add New Code

**New Plugin (backend + frontend):**
- Run `node scripts/create-plugin.js` to scaffold both
- Backend: `backend/plugins/{name}_api/src/main.ts` — call `startPlugin({ name, port, ... })`
- Frontend: `frontend/plugins/{name}_ui/src/config.tsx` — export `CONFIG: IUIConfig`
- Activate: Add `{name}` to `ENABLED_PLUGINS` in `.env`

**New Feature in Existing Backend Plugin (e.g. sales_api):**
1. GraphQL schema: `backend/plugins/sales_api/src/apollo/` (add typeDefs + resolver)
2. Business logic: `backend/plugins/sales_api/src/modules/{feature}/`
3. DB model: `backend/plugins/sales_api/src/modules/{feature}/db/models/{Model}.ts`
4. Register model: `backend/plugins/sales_api/src/connectionResolvers.ts`
5. tRPC endpoint (optional): `backend/plugins/sales_api/src/trpc/init-trpc.ts`
6. Meta (if automation/segment): `backend/plugins/sales_api/src/meta/`

**New Feature in Existing Frontend Plugin (e.g. sales_ui):**
1. Component: `frontend/plugins/sales_ui/src/modules/{feature}/`
2. Page (settings): `frontend/plugins/sales_ui/src/pages/`
3. Expose via Module Federation: add to `exposes` in `frontend/plugins/sales_ui/module-federation.config.ts`
4. Register route in plugin's `Main.tsx`: `frontend/plugins/sales_ui/src/modules/Main.tsx`

**New Core API Feature:**
1. Schema: `backend/core-api/src/apollo/` (add to typeDefs + resolvers)
2. Module: `backend/core-api/src/modules/{feature}/`
3. DB model: `backend/core-api/src/modules/{feature}/db/models/`
4. Register: `backend/core-api/src/connectionResolvers.ts`

**New Shared Backend Utility:**
- Pure utility: `backend/erxes-api-shared/src/utils/`
- Business module reused by multiple plugins: `backend/erxes-api-shared/src/core-modules/`
- Rebuild: `pnpm nx build erxes-api-shared` before consuming service(s) can pick it up

**New Shared Frontend Component:**
- UI primitive reused across plugins: `frontend/libs/erxes-ui/src/components/`
- Shared Jotai state atom: `frontend/libs/ui-modules/src/states/`
- Shared domain module: `frontend/libs/ui-modules/src/modules/{domain}/`
- No rebuild needed — imported directly from source

**New Core UI Module (non-plugin feature):**
- Module: `frontend/core-ui/src/modules/{feature}/`
- Route: Register in `frontend/core-ui/src/modules/app/hooks/useCreateAppRouter.tsx`
- Page component: `frontend/core-ui/src/pages/{feature}/`

**Tests:**
- Backend: colocate in `src/modules/{feature}/__tests__/` next to the code being tested
- Frontend: colocate in `src/modules/{feature}/__tests__/` or `src/modules/{feature}/__tests__/`
- Run: `pnpm nx test {project-name}`

## Special Directories

**`.nx/`:**
- Purpose: Nx daemon state and computation cache
- Generated: Yes
- Committed: No

**`node_modules/` (root):**
- Purpose: Hoisted pnpm workspace dependencies shared across all packages
- Generated: Yes (via `pnpm install`)
- Committed: No

**`backend/erxes-api-shared/dist/`:**
- Purpose: Compiled output of the shared library; referenced by backend services in production
- Generated: Yes (`pnpm nx build erxes-api-shared`)
- Committed: No

**`backend/plugins/{name}_api/dist/`:**
- Purpose: Compiled plugin service output for production deployment
- Generated: Yes (`pnpm nx build {name}_api`)
- Committed: No

**`.planning/`:**
- Purpose: GSD planning documents (codebase analysis, phases, briefs)
- Generated: By GSD commands
- Committed: Depending on team convention (`.gsd/` exists — likely local only)

**`.github/workflows/`:**
- Purpose: 30 CI/CD pipelines, one per service (path-triggered to build and push Docker images)
- Generated: No — maintained manually
- Committed: Yes

**`scripts/`:**
- Purpose: Developer tooling scripts; not part of any deployable artifact
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-05-21*
