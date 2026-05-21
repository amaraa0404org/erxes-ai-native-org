# Technology Stack

**Analysis Date:** 2026-05-21

## Languages

**Primary:**
- TypeScript 5.7.3 - All backend services, all frontend applications, shared libraries
- TSX/JSX - React component files throughout `frontend/`

**Secondary:**
- JavaScript - Config files (`scripts/`, `eslint.config.js`, `nx.json`)
- Rhai scripting - Apollo Router custom scripts in `backend/gateway/src/apollo-router/rhai/`

## Runtime

**Environment:**
- Node.js 18.16.9+ (enforced via `@types/node` 18.16.9 in devDependencies)

**Package Manager:**
- pnpm 9.12.3 (enforced via `packageManager` field and `engines` restrictions)
- npm and yarn are blocked: `"npm": "please-use-pnpm"`, `"yarn": "please-use-pnpm"`
- Lockfile: `pnpm-lock.yaml` (present and committed)

## Monorepo Tooling

**Build System:** Nx 20.0.8
- Config: `nx.json`
- Build caching enabled per target (`"cache": true`)
- Dependency graph: `erxes-api-shared` build must run before any plugin builds
- Named inputs: `default`, `production`, `sharedGlobals` (CI workflow acts as invalidator)

**Workspace:**
- `pnpm-workspace.yaml` covers `backend/**` and `frontend/**`
- Root `package.json` at `/package.json` — private monorepo package

**Nx Plugins Active:**
- `@nx/eslint/plugin` — lint target
- `@nx/jest/plugin` — test target
- `@nx/webpack/plugin` — build/serve/preview
- `@nx/storybook/plugin` — storybook targets
- Rspack integration via `@nx/rspack` 20.0.8

## Frameworks

### Backend
- **Express.js** ^4.21.2 — HTTP server for all services (gateway, core-api, plugins)
- **Apollo Server v4** (`@apollo/server` ^4.11.3) — GraphQL server per plugin
- **Apollo Subgraph** (`@apollo/subgraph` ^2.9.3) — Federation subgraph schema building
- **Apollo Router** (binary, managed via `@apollo/rover` ^0.26.3) — Federation supergraph gateway, runs as child process from `backend/gateway/src/apollo-router/index.ts`
- **tRPC v11** (`@trpc/server` ^11.0.0, `@trpc/client` ^11.0.0) — Type-safe inter-service RPC
- **Mongoose** ^8.10.0 (in `erxes-api-shared`) — MongoDB ODM

### Frontend
- **React** 18.3.1 — All frontend plugin UIs and `frontend/core-ui`
- **Rspack** 1.0.5 (`@rspack/core`, `@rspack/cli`, `@rspack/dev-server`) — Rust-based bundler, replaces Webpack for all frontend apps
- **Module Federation** (`@module-federation/enhanced` 0.6.6) — Plugin UIs are remotes; `core-ui` is the host
- **React Router** v7 — Routing in `frontend/core-ui` and plugin UIs
- **Apollo Client** ^3.11.8 — GraphQL client in frontend (^4.0.9 in `apps/client-portal-template`)
- **Jotai** — Atomic global state management
- **React Hook Form** + **Zod** — Form handling and validation across UIs
- **react-i18next** — Internationalization

### Standalone Apps
- **Next.js 16.0.3** — `apps/client-portal-template` (customer portal, port 3800)
- **Next.js 14** (^14.x) — `apps/posclient-front` (POS client, port 7002)
- **React** 19.2.0 — Used in `apps/client-portal-template`

## Key Dependencies

**Critical (shared via `erxes-api-shared`):**
- `erxes-api-shared` workspace:^ — Built with `@preconstruct/cli`, provides: Apollo server setup, MongoDB connection, Redis client, BullMQ workers, Elasticsearch client, tRPC setup, service discovery, GraphQL PubSub, file upload abstractions
- `mongoose` ^8.10.0 — Database ODM (declared in `erxes-api-shared`)
- `ioredis` ^5.6.1 — Redis client with reconnection logic (`backend/erxes-api-shared/src/utils/redis.ts`)
- `bullmq` ^5.40.0 — Job queue backed by Redis (used in gateway and all plugins)
- `graphql` ^16.9.0 — GraphQL core runtime
- `graphql-redis-subscriptions` ^2.7.0 — Real-time subscriptions via Redis PubSub (`backend/erxes-api-shared/src/utils/graphqlPubSub.ts`)
- `zod` 3.23.8 — Schema validation (pinned exact version in erxes-api-shared, ^3.23.8 in root)

**UI Libraries:**
- `@tabler/icons-react` ^3.34.0 — Icon set used throughout plugin UIs
- `@radix-ui/*` primitives — Accessible component base (used in posclient-front and erxes-ui)
- `tailwindcss` ^4.1.17 + `@tailwindcss/postcss` — Styling system
- `@blocknote/core` + `@blocknote/react` + `@blocknote/shadcn` ^0.35.0 — Rich text editor in core-api and frontend
- `@tanstack/react-table` ^8.20.5 — Data tables
- `@tanstack/react-virtual` ^3.13.8 — Virtualized lists
- `@xyflow/react` ^12.5.6 — Flow/node diagram editor (used in automation UI)
- `recharts` — Charting library (referenced in CLAUDE.md)
- `@dnd-kit/core`, `@dnd-kit/sortable` — Drag and drop
- `cmdk` ^1.0.4 — Command palette UI

**Backend Utilities:**
- `jsonwebtoken` ^9.0.2 — JWT auth token creation/validation
- `bcryptjs` ^3.0.2 — Password hashing
- `nodemailer` ^6.9.10 — Email transport abstraction
- `dataloader` ^2.2.3 — Batching for resolvers
- `express-rate-limit` ^8.0.1 — API rate limiting
- `@escape.tech/graphql-armor-*` — GraphQL security (max-aliases, character-limit, max-depth)
- `@envelop/core` ^5.2.3 — GraphQL plugin system used in gateway limiter
- `helmet` ^8.1.0 — HTTP security headers (used in `backend/services/automations/`)
- `nanoid` ^3.3.6 — Short unique ID generation
- `handlebars` ^4.7.8 — Template engine for email rendering
- `csv-parse` ^6.2.1 — CSV import
- `exceljs` ^4.4.0 — Excel export/import

**Build Tools:**
- `preconstruct` (`@preconstruct/cli` ^2.8.12) — Builds `erxes-api-shared` into CJS and ESM outputs
- `tsc-alias` ^1.8.8 — Resolves TypeScript path aliases after compilation in backend services
- `tsx` ^4.19.3 — TypeScript execution for dev mode (`tsx watch src/main.ts`)
- `ts-jest` ^29.1.0 — Jest TypeScript transform
- `esbuild` ^0.19.2 — Used by `@nx/esbuild` targets

**Dev/Test:**
- `jest` ^29.7.0 — Test runner
- `@testing-library/react` 15.0.6 — Frontend component testing
- `storybook` 8.6.12 — Component documentation
- `eslint` ^9.8.0 — Linting
- `prettier` ^2.8.8 — Code formatting
- `release-it` ^17.0.0 + `@release-it/conventional-changelog` — Release automation
- `dotenv-cli` ^8.0.0 — Loads `.env` for `pnpm dev:apis` and `pnpm dev:uis`
- `enquirer` ^2.4.1 — Interactive CLI prompts (used in `scripts/create-plugin.js`)

## Configuration

**Environment:**
- `.env` file at repository root (`.env.sample` shows minimal keys: `REACT_APP_API_URL`, `NODE_ENV`, `MONGO_URL`, `ENABLED_PLUGINS`, `DISABLE_CHANGE_STREAM`)
- Critical vars: `MONGO_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `ELASTICSEARCH_URL`, `ENABLED_PLUGINS`, `DOMAIN`, `ALLOWED_ORIGINS`
- Plugin activation: `ENABLED_PLUGINS=operation,sales,frontline,...` — comma-separated list controls which backend and frontend plugins start

**Build:**
- `tsconfig.base.json` — Root TypeScript config; sets `strictNullChecks: true`, `allowJs: true`, `checkJs: false`, target `es2015`, path aliases for `erxes-ui`, `ui-modules`, `erxes-api-shared`
- Each backend service has its own `tsconfig.json`, `tsconfig.build.json`, `tsconfig.spec.json`
- Backend build: `tsc --project tsconfig.build.json && tsc-alias -p tsconfig.build.json`
- Frontend build: Rspack via `@nx/rspack:rspack` executor
- `erxes-api-shared` build: `preconstruct build` → produces `dist/erxes-api-shared.cjs.js` + `.esm.js`

**Linting/Formatting:**
- `eslint.config.js` — ESLint v9 flat config at root
- `.prettierrc` — `{ "singleQuote": true, "trailingComma": "all", "endOfLine": "auto" }`
- ESLint plugins: `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `typescript-eslint`

## Platform Requirements

**Development:**
- pnpm ≥ 8 (required by engine field)
- Node.js 18.16.9+
- MongoDB 27017 (local or remote)
- Redis (default port 6379)
- Elasticsearch 7 (optional, for search features)

**Production:**
- Docker containers per service — each backend plugin has a `Dockerfile`
- Docker Hub registry: `erxes/erxes-next-{service-name}:latest`
- Multi-platform builds: `linux/amd64` and `linux/arm64`
- Apollo Router binary (downloaded by `@apollo/rover`) runs as a child process inside the gateway container

## Port Allocation

| Service | Port |
|---------|------|
| Gateway | 4000 |
| Core API | 3300 |
| Core UI (host) | 3001 |
| Sales API | 3305 |
| Plugin APIs | 3305+ |
| Plugin UIs | 3005+ |
| POS Client Front | 7002 |
| Client Portal Template | 3800 |
| BullMQ Board | 4000/bullmq-board |

---

*Stack analysis: 2026-05-21*
