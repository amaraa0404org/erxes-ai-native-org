# CLAUDE.md - AI Assistant Guide for erxes

This document provides comprehensive information about the erxes codebase structure, development workflows, and key conventions for AI assistants working on this project.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Repository Structure](#repository-structure)
4. [Development Workflows](#development-workflows)
5. [Plugin System](#plugin-system)
6. [Code Conventions](#code-conventions)
7. [Testing](#testing)
8. [CI/CD](#cicd)
9. [Common Tasks](#common-tasks)
10. [Important Patterns](#important-patterns)

## Project Overview

**erxes** (pronounced 'erk-sis') is a secure, self-hosted, and scalable source-available Experience Operating System (XOS) that enables businesses to manage marketing, sales, operations, and support in one unified platform.

### Key Characteristics
- **Architecture**: Nx-powered pnpm monorepo with microservices architecture
- **License**: AGPLv3 (core) with Enterprise Edition plugins
- **Package Manager**: pnpm (v9.12.3) - **REQUIRED**
- **Build System**: Nx (v20.0.8) with intelligent caching and task orchestration
- **Version**: TypeScript 5.7.3, Node.js 18+

### Core Philosophy
- 100% customizable through plugin architecture
- Self-hosted for data privacy
- Microservices with GraphQL Federation
- Micro-frontends with Module Federation

## Architecture & Technology Stack

### Backend Stack

```
┌─────────────────────────────────────────┐
│         API Gateway (Port 4000)         │
│    Apollo Router + Service Discovery    │
└─────────────────────────────────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Core API │  │ Plugin   │  │ Plugin   │
│ (3300)   │  │ APIs     │  │ APIs     │
└──────────┘  └──────────┘  └──────────┘
      │             │             │
      └─────────────┴─────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ MongoDB  │  │  Redis   │  │Elasticsea│
│          │  │  +BullMQ │  │   rch    │
└──────────┘  └──────────┘  └──────────┘
```

**Technologies:**
- **Runtime**: Node.js with TypeScript 5.7.3
- **Framework**: Express.js
- **GraphQL**: Apollo Server v4, Apollo Federation (@apollo/subgraph)
- **API**: tRPC v11 for type-safe endpoints
- **Database**: MongoDB with Mongoose (v8.13.2)
- **Cache/Queue**: Redis (ioredis) + BullMQ v5.40.0
- **Search**: Elasticsearch 7
- **Real-time**: GraphQL Subscriptions (graphql-redis-subscriptions)
- **Authentication**: JWT (jsonwebtoken), WorkOS for SSO

### Frontend Stack

```
┌─────────────────────────────────────────┐
│    Core UI (Host - Port 3001)           │
│   Module Federation Host Application    │
└─────────────────────────────────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Plugin   │  │ Plugin   │  │ Plugin   │
│ UI (3005)│  │ UI (3006)│  │ UI (3007)│
└──────────┘  └──────────┘  └──────────┘
```

**Technologies:**
- **Framework**: React 18.3.1
- **Bundler**: Rspack v1.0.5 (Rust-based, faster than Webpack)
- **Module Federation**: @module-federation/enhanced v0.6.6
- **Styling**: TailwindCSS v4.1.17 + PostCSS
- **UI Components**: Radix UI primitives + custom design system (erxes-ui)
- **State Management**: Jotai (atomic state) + Apollo Client
- **Routing**: React Router v7
- **Forms**: React Hook Form + Zod validation
- **i18n**: react-i18next
- **Rich Text**: Blocknote editor
- **Icons**: @tabler/icons-react
- **Data Visualization**: Recharts

### Apps

**Standalone Applications:**
1. **client-portal-template**: Next.js 16 customer portal
2. **posclient-front**: Next.js 14 POS with PWA support
3. **frontline-widgets**: Customer-facing widgets (chat, forms)

## Repository Structure

```
erxes/
├── backend/                    # Backend microservices
│   ├── gateway/               # API Gateway (Port 4000)
│   │   └── src/main.ts       # Gateway entry point
│   ├── core-api/             # Core business logic (Port 3300)
│   │   ├── src/
│   │   │   ├── main.ts       # Core API entry point
│   │   │   ├── apollo/       # GraphQL schema & resolvers
│   │   │   ├── trpc/         # tRPC router
│   │   │   ├── modules/      # Business logic modules
│   │   │   │   ├── contacts/
│   │   │   │   ├── products/
│   │   │   │   ├── segments/
│   │   │   │   ├── automations/
│   │   │   │   └── documents/
│   │   │   ├── meta/         # Automation, segment configs
│   │   │   └── routes.ts     # Express routes
│   │   ├── Dockerfile
│   │   ├── project.json      # Nx configuration
│   │   └── tsconfig.json
│   ├── erxes-api-shared/     # Shared library for all services
│   │   └── src/
│   │       ├── utils/        # Service discovery, Redis, MQ
│   │       ├── core-types/   # TypeScript type definitions
│   │       └── core-modules/ # Reusable business logic
│   ├── plugins/              # Plugin microservices
│   │   ├── sales_api/        # Sales plugin (Port 3305)
│   │   ├── operation_api/    # Operations plugin
│   │   ├── frontline_api/    # Customer service plugin
│   │   ├── accounting_api/   # Accounting plugin (EE)
│   │   ├── content_api/      # Content management (EE)
│   │   └── ...
│   └── services/             # Background services
│       ├── automations/      # Automation execution engine
│       └── logs/             # Logging service
├── frontend/                  # Frontend applications
│   ├── core-ui/              # Module federation host (Port 3001)
│   │   ├── src/
│   │   │   ├── main.ts       # Entry point
│   │   │   └── bootstrap.tsx # App bootstrap
│   │   └── module-federation.config.ts
│   ├── libs/                 # Shared UI libraries
│   │   ├── erxes-ui/         # Core UI components & state
│   │   └── ui-modules/       # Reusable UI modules
│   └── plugins/              # Frontend plugin remotes
│       ├── sales_ui/         # Sales UI plugin (Port 3005)
│       │   ├── src/
│       │   │   ├── config.tsx           # Plugin configuration
│       │   │   ├── modules/             # Module components
│       │   │   ├── pages/               # Page components
│       │   │   └── widgets/             # Widget components
│       │   ├── module-federation.config.ts
│       │   └── rspack.config.ts
│       └── ...
├── apps/                      # Standalone applications
│   ├── client-portal-template/  # Next.js 16 customer portal
│   ├── posclient-front/         # Next.js 14 POS client
│   └── frontline-widgets/       # Customer-facing widgets
├── scripts/                   # Development scripts
│   ├── create-plugin.js       # Plugin generator
│   ├── start-api-dev.js       # Start all API services
│   └── start-ui-dev.js        # Start all UI plugins
├── .github/workflows/         # CI/CD pipelines (26+ workflows)
├── nx.json                    # Nx configuration
├── pnpm-workspace.yaml        # pnpm workspace config
├── package.json               # Root package.json
├── tsconfig.base.json         # Base TypeScript config
└── CLAUDE.md                  # This file
```

### Path Aliases (TypeScript)

All backend services use consistent path aliases:
```typescript
"paths": {
  "~/*": ["./src/*"],              // Service root
  "@/*": ["./src/modules/*"],      // Modules directory
  "erxes-api-shared/*": ["../erxes-api-shared/src/*"]  // Shared lib
}
```

## Development Workflows

### Prerequisites

- **pnpm** ≥ 8 (enforced in package.json)
- **Node.js** 18.16.9+ (see `.nvmrc` if exists)
- **MongoDB** 27017
- **Redis** (default port)
- **Elasticsearch** 7 (optional, for search)

### Initial Setup

```bash
# Clone repository
git clone https://github.com/erxes/erxes.git
cd erxes

# Install dependencies (MUST use pnpm)
pnpm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Running Development Environment

**Option 1: Run Core Only**
```bash
# Runs Gateway + Core API
pnpm dev:core-api
```

**Option 2: Run All APIs**
```bash
# Starts all backend services defined in ENABLED_PLUGINS
pnpm dev:apis
```

**Option 3: Run All UIs**
```bash
# Starts all frontend plugins
pnpm dev:uis
```

**Option 4: Run Specific Service (Nx)**
```bash
# Backend service
pnpm nx serve core-api
pnpm nx serve sales_api

# Frontend plugin
pnpm nx serve sales_ui

# Build specific project
pnpm nx build sales_api

# Run tests
pnpm nx test sales_api

# Run affected commands (only changed projects)
pnpm nx affected:build
pnpm nx affected:test
```

### Important Environment Variables

```bash
# Required
MONGO_URL=mongodb://localhost:27017/erxes
REDIS_HOST=localhost
REDIS_PORT=6379

# Plugin Management
ENABLED_PLUGINS=operation,sales,frontline,accounting

# API Configuration
DOMAIN=http://localhost:3000
REACT_APP_API_URL=http://localhost:4000

# Feature Flags
DISABLE_CHANGE_STREAM=true  # Disable MongoDB change streams in dev

# SAAS Mode (optional)
SAAS_MODE=true
```

### Port Allocation

```
Gateway:       4000
Core API:      3300
Core UI:       3001

Plugin APIs:   3305+ (sales=3305, operation=3306, etc.)
Plugin UIs:    3005+ (sales=3005, operation=3006, etc.)

BullMQ Board:  4000/bullmq-board
```

## Plugin System

### Architecture Overview

erxes uses a **plugin-based architecture** for both backend and frontend:

- **Backend Plugins**: Microservices registered with the gateway via Redis
- **Frontend Plugins**: Module Federation remotes dynamically loaded at runtime

### Backend Plugin Structure

**Standard Plugin Entry Point** (`src/main.ts`):
```typescript
import { startPlugin } from 'erxes-api-shared/utils';
import { appRouter } from './trpc/init-trpc';
import resolvers from './apollo/resolvers';
import { typeDefs } from './apollo/typeDefs';
import { generateModels } from './connectionResolvers';
import { router } from './routes';
import automations from './meta/automations';
import segments from './meta/segments';

startPlugin({
  name: 'sales',
  port: 3305,
  graphql: async () => ({
    typeDefs: await typeDefs(),
    resolvers,
  }),
  expressRouter: router,
  hasSubscriptions: true,
  subscriptionPluginPath: require('path').resolve(
    __dirname,
    'apollo',
    process.env.NODE_ENV === 'production'
      ? 'subscription.js'
      : 'subscription.ts',
  ),
  apolloServerContext: async (subdomain, context) => {
    const models = await generateModels(subdomain, context);
    context.models = models;
    return context;
  },
  trpcAppRouter: {
    router: appRouter,
    createContext: async (subdomain, context) => {
      const models = await generateModels(subdomain);
      context.models = models;
      return context;
    },
  },
  onServerInit: async () => {
    // Initialize workers, cron jobs, etc.
  },
  meta: {
    automations,
    segments,
    notificationModules: [/* ... */],
  },
});
```

**Key Files in Backend Plugin:**
- `main.ts` - Entry point using `startPlugin()`
- `connectionResolvers.ts` - Database models
- `apollo/` - GraphQL schema, resolvers, subscriptions
- `trpc/` - tRPC router and procedures
- `modules/` - Business logic organized by feature
- `meta/` - Automations, segments, exports configuration
- `routes.ts` - Express routes
- `Dockerfile` - Container configuration
- `project.json` - Nx build configuration

### Frontend Plugin Structure

**Plugin Configuration** (`src/config.tsx`):
```typescript
import { IconBriefcase } from '@tabler/icons-react';
import { IUIConfig } from 'erxes-ui';
import { lazy, Suspense } from 'react';

const MainNavigation = lazy(() =>
  import('./modules/MainNavigation').then((module) => ({
    default: module.MainNavigation,
  })),
);

export const CONFIG: IUIConfig = {
  name: 'sales',
  icon: IconBriefcase,
  navigationGroup: {
    name: 'sales',
    icon: IconBriefcase,
    content: () => (
      <Suspense fallback={<div />}>
        <MainNavigation />
      </Suspense>
    ),
  },
  modules: [
    {
      name: 'sales',
      icon: IconBriefcase,
      path: 'sales',
      hasSettings: false,
      hasRelationWidget: true,
      hasFloatingWidget: false,
    },
  ],
  widgets: {
    relationWidgets: [
      {
        name: 'deals',
        icon: IconBriefcase,
      },
    ],
  },
};
```

**Module Federation Configuration** (`module-federation.config.ts`):
```typescript
import { ModuleFederationConfig } from '@nx/rspack/module-federation';

const coreLibraries = new Set([
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
  'erxes-ui',
  '@apollo/client',
  'jotai',
  'ui-modules',
  'react-i18next',
]);

const config: ModuleFederationConfig = {
  name: 'sales_ui',
  exposes: {
    './config': './src/config.tsx',
    './sales': './src/modules/Main.tsx',
    './dealsSettings': './src/pages/SettingsPage.tsx',
    './Widgets': './src/widgets/Widgets.tsx',
    './relationWidget': './src/widgets/relation/RelationWidgets.tsx',
  },
  shared: (libraryName, defaultConfig) => {
    if (coreLibraries.has(libraryName)) {
      return defaultConfig;
    }
    return false;
  },
};

export default config;
```

### Creating a New Plugin

**Using the Plugin Generator:**
```bash
pnpm create-plugin
```

This will prompt for:
- **Plugin name**: e.g., "inventory"
- **Module name**: e.g., "products"

The script creates:
- Backend: `backend/plugins/inventory_api/`
- Frontend: `frontend/plugins/inventory_ui/`

Both with complete boilerplate including:
- GraphQL/tRPC setup
- Module Federation configuration
- Example components and routes
- Nx project configuration

**Plugin Activation:**

Add to `.env`:
```bash
ENABLED_PLUGINS=operation,sales,frontline,inventory
```

### Service Discovery (Backend)

Plugins register with the gateway using Redis:
```typescript
// From erxes-api-shared/utils
await joinErxesGateway({
  name: 'sales',
  address: 'http://localhost:3305',
  config: {
    typeDefs,
    hasSubscriptions: true,
    meta: { automations, segments },
  },
});
```

Gateway dynamically routes requests to plugins:
- GraphQL: Federated via Apollo Router
- REST: Proxy via `/pl:{serviceName}/*`
- tRPC: Proxy via `/trpc/`

## Code Conventions

### TypeScript

**Configuration:**
- Strict null checks: enabled
- No implicit any: disabled (legacy code compatibility)
- Target: ES2017
- Module: CommonJS (backend), ESNext (frontend)

**Naming Conventions:**
```typescript
// Interfaces & Types
interface IUser { ... }
type UserRole = 'admin' | 'user';

// Classes (PascalCase)
class UserService { ... }

// Functions & Variables (camelCase)
const getUserById = (id: string) => { ... };

// Constants (UPPER_SNAKE_CASE for globals)
const MAX_RETRY_COUNT = 3;

// Files
// - Components: PascalCase (UserProfile.tsx)
// - Utils/Services: camelCase (authService.ts)
// - Config: kebab-case (module-federation.config.ts)
```

### Code Style (Prettier)

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "endOfLine": "auto"
}
```

**Key Rules:**
- Single quotes for strings
- Trailing commas in arrays/objects
- 2-space indentation (inferred)
- No semicolons (inferred)

### React Patterns

**Component Structure:**
```typescript
// Prefer functional components with hooks
export const UserList: React.FC<Props> = ({ users, onSelect }) => {
  // State
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Queries (Apollo)
  const { data, loading, error } = useQuery(GET_USERS);

  // Mutations
  const [updateUser] = useMutation(UPDATE_USER);

  // Effects
  useEffect(() => {
    // Side effects
  }, [dependency]);

  // Handlers
  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect(id);
  };

  // Render
  if (loading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} onClick={handleSelect} />
      ))}
    </div>
  );
};
```

**State Management:**
- **Local State**: `useState` for component-local state
- **Global State**: Jotai atoms for app-wide state
- **Server State**: Apollo Client for GraphQL data
- **Form State**: React Hook Form with Zod validation

**Lazy Loading (Module Federation):**
```typescript
// Always lazy load federation modules
const RemoteModule = lazy(() => import('remote/Module'));

// Always wrap in Suspense
<Suspense fallback={<Loading />}>
  <RemoteModule />
</Suspense>
```

### GraphQL Conventions

**Schema Naming:**
```graphql
# Types: PascalCase
type User {
  _id: String!
  email: String
  details: UserDetails
}

# Queries: camelCase with descriptive names
type Query {
  users(page: Int, perPage: Int): [User]
  userDetail(_id: String!): User
  usersTotalCount: Int
}

# Mutations: camelCase verb + noun
type Mutation {
  usersAdd(email: String!, details: UserDetailsInput): User
  usersEdit(_id: String!, doc: UserDetailsInput): User
  usersRemove(_id: String!): JSON
}

# Subscriptions: noun + past tense verb
type Subscription {
  userChanged(_id: String!): User
}
```

**Resolver Structure:**
```typescript
const resolvers = {
  Query: {
    users: async (_, { page, perPage }, { models, subdomain }) => {
      return models.Users.find({})
        .skip((page - 1) * perPage)
        .limit(perPage);
    },
  },
  Mutation: {
    usersAdd: async (_, doc, { models, subdomain, user }) => {
      // Permission check
      if (!user) throw new Error('Unauthorized');

      // Business logic
      return models.Users.createUser(doc);
    },
  },
  User: {
    // Field resolver for computed fields
    fullName: (user) => `${user.firstName} ${user.lastName}`,
  },
};
```

### Backend Patterns

**Service Layer Pattern:**
```typescript
// modules/users/services.ts
export const userService = {
  async createUser(models, doc) {
    // Validation
    if (!doc.email) throw new Error('Email required');

    // Business logic
    const user = await models.Users.create(doc);

    // Side effects
    await sendWelcomeEmail(user.email);

    return user;
  },
};
```

**Model Layer (Mongoose):**
```typescript
// connectionResolvers.ts
export const generateModels = (subdomain: string) => {
  const Users = loadUsersClass(subdomain);

  return {
    Users,
  };
};

// models/definitions/users.ts
export const userSchema = new Schema({
  email: { type: String, unique: true, required: true },
  details: {
    firstName: String,
    lastName: String,
  },
  createdAt: { type: Date, default: Date.now },
});

// models/Users.ts
export class UserModel {
  static async createUser(doc) {
    // Business logic
    return this.create(doc);
  }
}
```

**Error Handling:**
```typescript
// Always throw descriptive errors
throw new Error('User with this email already exists');

// Use custom error classes for API responses
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Multi-tenancy (Subdomains)

Every request includes a `subdomain` for tenant isolation:
```typescript
// Context includes subdomain
const resolver = async (_, args, { subdomain, models, user }) => {
  // Models are scoped to subdomain automatically
  const users = await models.Users.find({ /* tenant-specific */ });
};

// MongoDB collections are prefixed with subdomain
// Example: subdomain_users, subdomain_products
```

## Testing

### Test Structure

```
src/
├── modules/
│   └── users/
│       ├── __tests__/
│       │   ├── users.test.ts       # Unit tests
│       │   └── queries.test.ts     # GraphQL query tests
│       ├── services.ts
│       └── models.ts
```

### Running Tests

```bash
# Run all tests
pnpm nx test <project-name>

# Run tests in watch mode
pnpm nx test <project-name> --watch

# Run tests with coverage
pnpm nx test <project-name> --coverage

# Run affected tests (only changed projects)
pnpm nx affected:test
```

### Test Configuration (Jest)

```typescript
// jest.config.ts
export default {
  displayName: 'sales-api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/backend/plugins/sales_api',
};
```

### Example Tests

**Backend Service Test:**
```typescript
import { generateModels } from '../connectionResolvers';

describe('User Service', () => {
  let models;

  beforeEach(async () => {
    models = await generateModels('test');
  });

  afterEach(async () => {
    await models.Users.deleteMany({});
  });

  it('should create a user', async () => {
    const user = await models.Users.createUser({
      email: 'test@example.com',
    });

    expect(user.email).toBe('test@example.com');
    expect(user._id).toBeDefined();
  });
});
```

**Frontend Component Test:**
```typescript
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { UserList } from './UserList';

describe('UserList', () => {
  it('renders user list', async () => {
    const mocks = [
      {
        request: {
          query: GET_USERS,
        },
        result: {
          data: {
            users: [{ _id: '1', email: 'test@example.com' }],
          },
        },
      },
    ];

    render(
      <MockedProvider mocks={mocks}>
        <UserList />
      </MockedProvider>
    );

    expect(await screen.findByText('test@example.com')).toBeInTheDocument();
  });
});
```

## CI/CD

### GitHub Actions Workflows

Located in `.github/workflows/` with 26+ workflow files:

**Naming Convention:**
- `ci-api-core.yml` - Core API CI
- `ci-plugin-sales.yml` - Sales plugin CI
- `ci-ui-sales.yml` - Sales UI CI

**Workflow Pattern:**
```yaml
name: CI plugin--sales-api

on:
  push:
    branches: [main, develop]
    paths:
      - 'backend/plugins/sales_api/**'
      - 'backend/erxes-api-shared/**'
      - '.github/workflows/ci-plugin-sales.yml'
  pull_request:
    paths:
      - 'backend/plugins/sales_api/**'
      - 'backend/erxes-api-shared/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4

      - run: pnpm install
      - run: pnpm nx build erxes-api-shared  # Build shared lib first
      - run: pnpm nx build sales_api

      # Docker multi-platform build
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          platforms: linux/amd64,linux/arm64
          tags: |
            erxes/erxes-next-sales-api:latest
            erxes/erxes-next-sales-api:${{ env.DATE }}-${{ env.SHORT_SHA }}
```

**Key Features:**
- **Path-based triggers**: Only builds affected services
- **Nx caching**: Leverages Nx build cache
- **Multi-platform**: Builds for AMD64 and ARM64
- **Tagging**: `latest` + `YYYYMMDD-{sha}`
- **Shared lib**: Always builds `erxes-api-shared` first for backend

### Docker Configuration

**Each service has its own Dockerfile:**
```dockerfile
# Example: backend/plugins/sales_api/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy shared dependencies
COPY backend/erxes-api-shared/dist ./erxes-api-shared/dist
COPY backend/plugins/sales_api/dist ./sales_api/dist
COPY backend/plugins/sales_api/package.json ./sales_api/

RUN cd sales_api && npm install --production

WORKDIR /app/sales_api
CMD ["node", "dist/main.js"]
```

**Docker Images:**
- Registry: Docker Hub
- Org: `erxes`
- Naming: `erxes-next-{service-name}`
- Example: `erxes/erxes-next-sales-api:latest`

### Deployment

Services are typically deployed as:
1. **Docker Compose** (development/self-hosted)
2. **Kubernetes** (production/scaled)
3. **Cloud Platforms** (AWS, GCP, Azure)

## Common Tasks

### Adding a New Backend Feature

1. **Identify the service** (core-api or plugin)
2. **Define GraphQL schema** in `apollo/typeDefs/`
3. **Create resolvers** in `apollo/resolvers/`
4. **Add service logic** in `modules/{feature}/`
5. **Create models** if needed in `models/`
6. **Add tRPC endpoints** (optional) in `trpc/`
7. **Write tests** in `__tests__/`
8. **Update meta** if automation/segment related

### Adding a New Frontend Feature

1. **Identify the plugin** (e.g., sales_ui)
2. **Create component** in `modules/{feature}/`
3. **Define routes** if needed
4. **Add GraphQL queries** using Apollo Client
5. **Update config.tsx** to expose in navigation
6. **Update module-federation.config.ts** to expose module
7. **Add translations** in locales
8. **Write tests** in `__tests__/`

### Modifying Shared Code

**Backend Shared (`erxes-api-shared`):**
1. Make changes in `backend/erxes-api-shared/src/`
2. Build: `pnpm nx build erxes-api-shared`
3. Rebuild dependent services (they reference dist/)

**Frontend Shared (`erxes-ui`):**
1. Make changes in `frontend/libs/erxes-ui/src/`
2. No build needed (imported directly)
3. Hot reload works across plugins

### Database Migrations

**Mongoose migrations pattern:**
```typescript
// scripts/migration-{feature}.ts
import { connect } from '../db/connection';

const migrate = async () => {
  const db = await connect();

  // Migration logic
  await db.collection('users').updateMany(
    { role: { $exists: false } },
    { $set: { role: 'user' } }
  );

  console.log('Migration complete');
  process.exit(0);
};

migrate();
```

Run via: `tsx scripts/migration-{feature}.ts`

### Debugging

**Backend:**
```bash
# Enable debug logs
DEBUG=* pnpm nx serve sales_api

# Node inspector
node --inspect dist/main.js
```

**Frontend:**
```bash
# React DevTools
# Apollo DevTools (browser extension)
# Redux DevTools for Jotai (jotai-devtools)

# Rspack dev server provides source maps
pnpm nx serve sales_ui
```

**Common Issues:**
- **Port conflicts**: Check if services are already running
- **Module Federation errors**: Clear cache, restart dev servers
- **GraphQL errors**: Check gateway logs, verify service registration
- **Shared lib not found**: Rebuild `erxes-api-shared`

## Important Patterns

### Subdomain Context (Multi-tenancy)

```typescript
// Always use subdomain for data access
const { subdomain, models } = context;

// Models are automatically scoped
const users = await models.Users.find({});  // Only tenant's users

// Manual subdomain in collection names
const collectionName = `${subdomain}_users`;
```

### Service Communication

**Via GraphQL Federation:**
```typescript
// Reference other service types
type Deal @key(fields: "_id") {
  _id: ID!
  customer: Contact @provides(fields: "email")  # From contacts service
}
```

**Via tRPC:**
```typescript
// backend/plugins/sales_api/src/trpc/routers/deals.ts
export const dealsRouter = t.router({
  list: t.procedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.models.Deals.find({ customerId: input.customerId });
    }),
});

// From another service
import { trpc } from '@/lib/trpc';
const deals = await trpc.deals.list.query({ customerId: '123' });
```

### Redis Patterns

**Caching:**
```typescript
import { redis } from 'erxes-api-shared/utils';

// Set with expiration
await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 3600);

// Get
const cached = await redis.get(`user:${id}`);
const user = cached ? JSON.parse(cached) : null;

// Delete
await redis.del(`user:${id}`);
```

**PubSub (Real-time):**
```typescript
import { RedisPubSub } from 'graphql-redis-subscriptions';

const pubsub = new RedisPubSub({ /* redis config */ });

// Publish
await pubsub.publish('USER_CHANGED', { userChanged: user });

// Subscribe (GraphQL)
const subscriptions = {
  userChanged: {
    subscribe: () => pubsub.asyncIterator(['USER_CHANGED']),
  },
};
```

### BullMQ (Job Queue)

```typescript
import { Queue, Worker } from 'bullmq';

// Create queue
const emailQueue = new Queue('emails', {
  connection: { host: 'localhost', port: 6379 },
});

// Add job
await emailQueue.add('send', {
  to: 'user@example.com',
  subject: 'Welcome',
});

// Process jobs
const worker = new Worker('emails', async (job) => {
  const { to, subject } = job.data;
  await sendEmail(to, subject);
}, {
  connection: { host: 'localhost', port: 6379 },
});

// View dashboard at http://localhost:4000/bullmq-board
```

### Automation System

Plugins can register automation actions/triggers:

```typescript
// meta/automations.ts
export default {
  constants: {
    actions: [
      {
        type: 'sales:createDeal',
        icon: 'file-plus',
        label: 'Create deal',
        description: 'Create a new deal',
      },
    ],
    triggers: [
      {
        type: 'sales:dealCreated',
        icon: 'file-check',
        label: 'Deal created',
        description: 'Triggered when deal is created',
      },
    ],
  },

  actions: async ({ subdomain, data }) => {
    const { action, execution } = data;

    if (action.type === 'sales:createDeal') {
      // Execute action
      const models = await generateModels(subdomain);
      return models.Deals.createDeal(execution.target);
    }
  },

  triggers: async ({ subdomain, data }) => {
    // Emit trigger events
    await emitTrigger('sales:dealCreated', deal);
  },
};
```

### Segment System

Dynamic user/customer segmentation:

```typescript
// meta/segments.ts
export default {
  contentTypes: [
    {
      type: 'sales:deal',
      description: 'Deals',
      fields: [
        {
          key: 'name',
          label: 'Name',
          type: 'string',
        },
        {
          key: 'amount',
          label: 'Amount',
          type: 'number',
        },
      ],
    },
  ],

  esTypes: ['deal'],

  associationTypes: [
    {
      name: 'deal',
      label: 'Deal',
    },
  ],
};
```

### Import/Export System

```typescript
// meta/import-export.ts
export default {
  importTypes: [
    {
      text: 'Deals',
      contentType: 'deal',
      icon: 'file-plus',
    },
  ],

  exporter: async ({ subdomain, data }) => {
    const models = await generateModels(subdomain);
    const deals = await models.Deals.find(data.filter);

    return {
      data: deals.map(deal => ({
        Name: deal.name,
        Amount: deal.amount,
      })),
    };
  },
};
```

## Additional Resources

### Documentation
- **Main Docs**: https://erxes.io/docs
- **Local Setup**: https://erxes.io/docs/local-setup
- **Contributing**: See CONTRIBUTING.md
- **Roadmap**: https://erxes.io/roadmap
- **Changelog**: https://erxes.io/changelog

### Community
- **Discord**: https://discord.com/invite/aaGzy3gQK5
- **GitHub Issues**: https://github.com/erxes/erxes/issues
- **Transifex (i18n)**: https://explore.transifex.com/erxes-inc/erxesxos/

### Code Exploration Tips

**Finding Features:**
```bash
# Find GraphQL type definition
pnpm nx run-many -t grep -p 'type Deal'

# Find component usage
pnpm nx run-many -t grep -p 'UserList'

# Find API endpoint
pnpm nx run-many -t grep -p '/api/deals'
```

**Understanding Plugin Flow:**
1. Start at `main.ts` - entry point
2. Check `apollo/typeDefs.ts` - GraphQL schema
3. Look at `apollo/resolvers/` - query/mutation logic
4. Explore `modules/` - business logic
5. Review `models/` - data layer

**Understanding Frontend Plugin:**
1. Start at `config.tsx` - plugin configuration
2. Check `module-federation.config.ts` - exposed modules
3. Look at `modules/` - main components
4. Check `pages/` - route components
5. Review `widgets/` - reusable widgets

## Best Practices for AI Assistants

### Code Analysis
- Always read existing code before making changes
- Understand the plugin architecture before modifications
- Check both GraphQL and tRPC endpoints when working with APIs
- Review module-federation.config.ts for exposed modules

### Making Changes
- **Backend**: Rebuild `erxes-api-shared` if shared code changed
- **Frontend**: Check if changes affect module federation exports
- Always maintain TypeScript types
- Follow existing patterns in the same service/plugin
- Test multi-tenancy (subdomain) implications

### Common Pitfalls
- Don't bypass plugin system - use proper extension points
- Don't break module federation shared dependencies
- Don't modify core without considering plugin impacts
- Always consider subdomain context for data access
- Remember port allocation when adding new services

### Testing Your Changes
1. Run Nx affected commands to see what's impacted
2. Test in development mode first
3. Verify GraphQL schema still federates correctly
4. Check module federation loads properly
5. Test with different subdomains if multi-tenant

### Git Workflow
- Branch naming: `feat/`, `fix/`, `docs/`
- Reference issues in commits
- Keep commits focused and atomic
- Run affected tests before pushing
- See CONTRIBUTING.md for full guidelines

---

**Last Updated**: 2026-01-15
**Version**: 1.0.0
**Maintainer**: erxes Team

For questions or clarifications, please open an issue or join our Discord community.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**erxes AI Kernel (AI_KERNEL)**

A new pair of plugins (`backend/plugins/ai_api` + `frontend/plugins/ai_ui`) plus a shared `erxes-api-shared/src/ai/` module that turns any erxes deployment into an AI-native platform. Every other plugin (sales, frontline, operation, content, accounting, …) becomes able to consume LLMs, embeddings, RAG, tools, and agents through a single tRPC surface and Module Federation hook set — without touching a vendor SDK. Primary audience: workspace admins who configure providers/budgets, plugin developers who integrate via tRPC + MF hooks, and end users (sales reps, support agents) who interact with the global Copilot, AI suggestions in editors, and AI automation steps.

**Core Value:** A workspace admin can connect an LLM provider, ask the built-in **Workspace Analyst** a natural-language question (e.g. *"How many deals are in the Qualified stage?"*), and get a streamed, citable answer powered by tools that other plugins register — all enforced by per-subdomain budgets and recorded in an audit log. If everything else fails, this end-to-end demo must work.

### Constraints

- **Tech stack**: Must use existing erxes stack — no new bundlers, no new state libraries, no parallel UI library, no new pub/sub transport. — Consistency with monorepo conventions.
- **Multi-tenancy**: Every collection, cache key, BullMQ queue name, vector namespace must include `subdomain`. Never read across subdomains. — Hard tenant isolation guarantee in erxes.
- **Secret encryption**: AES-256-GCM, key derived from `ERXES_SECRET + subdomain`. Decryption only inside provider adapters. — Per-tenant key separation.
- **Provider neutrality**: No hard dependency on any single vendor SDK in `ai_api` itself. All vendor SDKs live behind `ILLMProvider` in `erxes-api-shared/src/ai/providers/`. — Future-proofing + swappability.
- **Plugin extension purity**: Other plugins gain AI by adding **one file** (`meta/aiTools.ts`) and **one line** in `startPlugin({meta: { aiTools, ... }})`. No direct cross-plugin imports. — The architectural promise of the milestone.
- **Graceful disablement**: With `ENABLED_PLUGINS` excluding `ai`, other plugins keep working. `trpc.ai.*` calls fail with a clear "AI plugin not enabled" error. — Plugin must be optional.
- **Coverage**: Jest tests aim >70% on `modules/`. — Acceptance §13.2.
- **Build**: `pnpm install && pnpm nx build ai_api && pnpm nx build ai_ui` from clean clone must succeed. — Acceptance §13.1.
- **Demo target**: End-to-end Workspace Analyst flow from clean DB must work with `ENABLED_PLUGINS=ai,sales,frontline`. — Acceptance §13.3.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.3 - All backend services, all frontend applications, shared libraries
- TSX/JSX - React component files throughout `frontend/`
- JavaScript - Config files (`scripts/`, `eslint.config.js`, `nx.json`)
- Rhai scripting - Apollo Router custom scripts in `backend/gateway/src/apollo-router/rhai/`
## Runtime
- Node.js 18.16.9+ (enforced via `@types/node` 18.16.9 in devDependencies)
- pnpm 9.12.3 (enforced via `packageManager` field and `engines` restrictions)
- npm and yarn are blocked: `"npm": "please-use-pnpm"`, `"yarn": "please-use-pnpm"`
- Lockfile: `pnpm-lock.yaml` (present and committed)
## Monorepo Tooling
- Config: `nx.json`
- Build caching enabled per target (`"cache": true`)
- Dependency graph: `erxes-api-shared` build must run before any plugin builds
- Named inputs: `default`, `production`, `sharedGlobals` (CI workflow acts as invalidator)
- `pnpm-workspace.yaml` covers `backend/**` and `frontend/**`
- Root `package.json` at `/package.json` — private monorepo package
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
- `erxes-api-shared` workspace:^ — Built with `@preconstruct/cli`, provides: Apollo server setup, MongoDB connection, Redis client, BullMQ workers, Elasticsearch client, tRPC setup, service discovery, GraphQL PubSub, file upload abstractions
- `mongoose` ^8.10.0 — Database ODM (declared in `erxes-api-shared`)
- `ioredis` ^5.6.1 — Redis client with reconnection logic (`backend/erxes-api-shared/src/utils/redis.ts`)
- `bullmq` ^5.40.0 — Job queue backed by Redis (used in gateway and all plugins)
- `graphql` ^16.9.0 — GraphQL core runtime
- `graphql-redis-subscriptions` ^2.7.0 — Real-time subscriptions via Redis PubSub (`backend/erxes-api-shared/src/utils/graphqlPubSub.ts`)
- `zod` 3.23.8 — Schema validation (pinned exact version in erxes-api-shared, ^3.23.8 in root)
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
- `preconstruct` (`@preconstruct/cli` ^2.8.12) — Builds `erxes-api-shared` into CJS and ESM outputs
- `tsc-alias` ^1.8.8 — Resolves TypeScript path aliases after compilation in backend services
- `tsx` ^4.19.3 — TypeScript execution for dev mode (`tsx watch src/main.ts`)
- `ts-jest` ^29.1.0 — Jest TypeScript transform
- `esbuild` ^0.19.2 — Used by `@nx/esbuild` targets
- `jest` ^29.7.0 — Test runner
- `@testing-library/react` 15.0.6 — Frontend component testing
- `storybook` 8.6.12 — Component documentation
- `eslint` ^9.8.0 — Linting
- `prettier` ^2.8.8 — Code formatting
- `release-it` ^17.0.0 + `@release-it/conventional-changelog` — Release automation
- `dotenv-cli` ^8.0.0 — Loads `.env` for `pnpm dev:apis` and `pnpm dev:uis`
- `enquirer` ^2.4.1 — Interactive CLI prompts (used in `scripts/create-plugin.js`)
## Configuration
- `.env` file at repository root (`.env.sample` shows minimal keys: `REACT_APP_API_URL`, `NODE_ENV`, `MONGO_URL`, `ENABLED_PLUGINS`, `DISABLE_CHANGE_STREAM`)
- Critical vars: `MONGO_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `ELASTICSEARCH_URL`, `ENABLED_PLUGINS`, `DOMAIN`, `ALLOWED_ORIGINS`
- Plugin activation: `ENABLED_PLUGINS=operation,sales,frontline,...` — comma-separated list controls which backend and frontend plugins start
- `tsconfig.base.json` — Root TypeScript config; sets `strictNullChecks: true`, `allowJs: true`, `checkJs: false`, target `es2015`, path aliases for `erxes-ui`, `ui-modules`, `erxes-api-shared`
- Each backend service has its own `tsconfig.json`, `tsconfig.build.json`, `tsconfig.spec.json`
- Backend build: `tsc --project tsconfig.build.json && tsc-alias -p tsconfig.build.json`
- Frontend build: Rspack via `@nx/rspack:rspack` executor
- `erxes-api-shared` build: `preconstruct build` → produces `dist/erxes-api-shared.cjs.js` + `.esm.js`
- `eslint.config.js` — ESLint v9 flat config at root
- `.prettierrc` — `{ "singleQuote": true, "trailingComma": "all", "endOfLine": "auto" }`
- ESLint plugins: `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `typescript-eslint`
## Platform Requirements
- pnpm ≥ 8 (required by engine field)
- Node.js 18.16.9+
- MongoDB 27017 (local or remote)
- Redis (default port 6379)
- Elasticsearch 7 (optional, for search features)
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: PascalCase (e.g., `DealsBoardCard.tsx`, `AddCardForm.tsx`)
- Hooks (plugin-level): camelCase prefixed with `use` (e.g., `useDeals.tsx`, `useColumnPagination.tsx`)
- Hooks (erxes-ui lib): kebab-case prefixed with `use-` (e.g., `use-query-state.tsx`, `use-cursor-pagination.tsx`)
- Utils/services: camelCase (e.g., `utils.ts`, `fieldUtils.ts`)
- Config files: kebab-case (e.g., `module-federation.config.ts`, `rspack.config.ts`)
- Type/interface files: camelCase (e.g., `deals.ts`, `pipelines.ts`) inside `@types/` or `types/` directories
- Schema definition files: camelCase (e.g., `deals.ts`, `stages.ts`) inside `db/definitions/`
- GraphQL schema files: camelCase (e.g., `deal.ts`, `board.ts`) inside `graphql/schemas/`
- Constants files: camelCase `constants.ts`
- Stories: `[ComponentName].stories.tsx` inside `__stories__/` directories
- Module directories: camelCase (e.g., `sales/`, `ecommerce/`, `pos/`)
- GraphQL directories: `graphql/` with sub-dirs `queries/`, `mutations/`, `subscriptions/`, `schemas/`, `resolvers/`
- State directories: `states/` (frontend)
- Test story directories: `__stories__/`
- Type directories: `@types/` (backend), `types/` (frontend)
- Database directories: `db/` with sub-dirs `models/` and `definitions/`
- Interfaces: `I` prefix + PascalCase (e.g., `IDeal`, `IDealDocument`, `IContext`, `IModels`)
- Document types (Mongoose): `IXxxDocument extends IXxx, Document` pattern
- Model interfaces: `IXxxModel extends Model<IXxxDocument>`
- Props interfaces: `XxxProps` (no `I` prefix, PascalCase) e.g., `DealsBoardCardProps`
- GraphQL types: exported as `const types = \`...\`` (template literals)
- Zod schemas: suffix `Schema` (e.g., `salesFormSchema`, `checklistFormSchema`)
- Zod inferred types: suffix `Type` (e.g., `SalesFormType`, derived from `z.infer<typeof schema>`)
- Functions: camelCase (e.g., `generateFilter`, `createBoardItem`, `watchItem`)
- React component functions: PascalCase (e.g., `DealsBoardCard`, `AddCardForm`)
- Async functions: `async` keyword before `function` or arrow function
- Constants (global/enum-like): `UPPER_SNAKE_CASE` objects (e.g., `SALES_STATUSES`, `CLOSE_DATE_TYPES`, `PRIORITIES`)
- Jotai atoms: camelCase + `Atom` or `State` suffix (e.g., `dealsBoardAtom`, `dealDetailSheetState`, `isDraggingAtom`)
- Types: PascalCase (e.g., `Deal`, `SalesPipeline`, `SalesStage`)
- Fields on types: camelCase (e.g., `assignedUserIds`, `closeDate`, `stageId`)
- Queries: camelCase, descriptive (e.g., `deals`, `dealDetail`, `dealsTotalCount`)
- Mutations: camelCase, `nounVerb` pattern using plural noun + verb (e.g., `dealsAdd`, `dealsEdit`, `dealsRemove`, `dealsWatch`)
- Subscriptions: (e.g., `salesDealListChanged`)
- Input types: PascalCase + `Input` suffix (e.g., `AttachmentInput`, `IDealFilter`)
## Code Style
- Config: `.prettierrc` at repo root
- `singleQuote`: true
- `trailingComma`: "all"
- `endOfLine`: "auto"
- 2-space indentation (inferred from code)
- No semicolons NOT enforced — semicolons appear in backend code, absent in some frontend files; Prettier does not explicitly set this
- Root config: `eslint.config.js` (flat config format)
- Plugin: `@nx/eslint-plugin` with `flat/base`, `flat/typescript`, `flat/javascript` presets
- React plugins get `flat/react` preset (e.g., `frontend/libs/erxes-ui/eslint.config.js`)
- `@typescript-eslint/no-explicit-any`: **off** (explicit `any` is allowed across the codebase)
- `no-console`: **warn** in UI libs (allow `group`, `groupCollapsed`, `groupEnd`)
- `@nx/enforce-module-boundaries`: **error** — prevents cross-boundary imports except via declared allowed list
- `allowCircularSelfDependency`: true
## Import Organization
- `~/*` → `./src/*` (plugin root)
- `@/*` → `./src/modules/*` (modules directory)
- `erxes-api-shared/*` → `../../erxes-api-shared/src/*`
- `@/` or `~/` → `./src/modules/` (module root inside plugin)
- `index.ts` used in shared libs (`erxes-ui`, `ui-modules`) for re-exporting everything
- Plugins export from individual files; no barrel files in plugin modules
## TypeScript Configuration
- `"module": "commonjs"` — CommonJS output
- `"target": "es2017"`
- `"noImplicitAny": false` — `any` allowed
- `"strictNullChecks": true`
- `"alwaysStrict": true`
- `"module": "esnext"` — ESNext output for bundlers
- `"target": "es2015"`
- `"strictNullChecks": true`
- `"useUnknownInCatchVariables": false` — catch variables remain `any`
## Error Handling
- Throw plain `Error` with descriptive message: `throw new Error('Deal not found')`
- No custom error class hierarchy (plain `Error` only)
- Permission errors: `throw new Error('Permission denied')`
- Call `await checkPermission('actionName')` at the start of every mutation resolver
- `catch` blocks: use `console.error(...)` or `console.log(...)` for logging errors in utilities (not structured logging)
- Apollo errors surfaced via `toast` from `erxes-ui`:
- Use `try/catch` only for utility functions; let Apollo hooks handle GraphQL errors via `onError`
## Logging
- No structured logging framework — uses `console.log` and `console.error` directly
- `console.log(subdomain, errorMessage)` for error context in utilities (`backend/plugins/sales_api/src/modules/pos/utils.ts`)
- ESLint `no-console` rule is **not** enabled on backend (only on frontend libs)
- `no-console: warn` — only `console.group`, `console.groupCollapsed`, `console.groupEnd` allowed
- Use `toast` from `erxes-ui` for user-visible error/success messages
## Comments
- Short inline comments for non-obvious logic: `// TODO: implement transaction callback`
- JSDoc-style: `/** Get single deal */`, `/** Create deal */` on static model methods
- Inline schema field comments: `// Product` beside each schema field in definitions
- `// TODO remove after migration` and `// TODO: future list by currency` for known debt
- Sparse — used only on Mongoose model static methods, not on resolver functions
- Not used on React component props
## React Component Patterns
- Always use inline interface above the component: `interface DealsBoardCardProps { deal: IDeal; }`
- Do NOT use anonymous inline types for props
- Used in components that use browser-only APIs or interactive state
- Example: `'use client';` at top of `DealsBoard.tsx`
## State Management Patterns
- `useQuery` with `fetchPolicy: 'cache-and-network'` for board/list queries
- `useMutation` for all write operations
- `subscribeToMore` for real-time updates within `useQuery`
- `const [pipelineId] = useQueryState<string>('pipelineId');` — from `erxes-ui`
- Used for shared UI state in URL search params (pipelineId, boardId, salesItemId)
## Form Patterns
## UI / Styling Patterns
## tRPC Patterns (Backend)
## Multi-tenancy Convention
## Mongoose Model Pattern
## Hard rules for any new plugin in this repo
- Mirror `backend/plugins/sales_api/` and `frontend/plugins/sales_ui/` structure exactly. Don't invent new patterns.
- Backend plugins boot via `startPlugin()` from `erxes-api-shared/utils`. Read `backend/plugins/sales_api/src/main.ts` before writing any new plugin entry point.
- Multi-tenancy via `subdomain`: every collection, cache key, BullMQ queue name, and vector namespace must include subdomain. Never read across subdomains.
- Always use pnpm. Never npm. Always `pnpm nx ...`, never bare scripts.
- After modifying `backend/erxes-api-shared/`, run `pnpm nx build erxes-api-shared` before serving any dependent plugin.
- Tests live in `src/modules/<feature>/__tests__/`. Run with `pnpm nx test <project>`.
- Read `CLAUDE.md` and `AGENTS.md` at repo root before any planning. They are authoritative.
- Plugin meta extension points: `meta/automations.ts`, `meta/segments.ts`, `meta/notifications.ts`. Follow these patterns for new meta types.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Every plugin (backend + frontend) is independently deployable and discoverable at runtime
- Backend plugins self-register via Redis using `joinErxesGateway`; the gateway builds the Apollo supergraph dynamically
- Frontend plugins are Module Federation remotes; the host fetches the remote list from the API at boot and initializes federation at runtime
- Multi-tenancy via `subdomain` extracted from `hostname` on every request — all DB model access is tenant-scoped
- `erxes-api-shared` is the sole cross-cutting library for all backend services; it must be built first (`pnpm nx build erxes-api-shared`)
## Layers
- Purpose: Single entry point for all client traffic; routes GraphQL to the federated supergraph, REST to plugin proxies, WebSocket to subscription aggregator
- Location: `backend/gateway/src/`
- Contains: Express app, Apollo Router integration, proxy middleware, BullMQ board, user middleware, subscription server
- Depends on: `erxes-api-shared/utils` (Redis, service discovery, `getSubdomain`, `getPlugins`)
- Used by: All browser clients, frontline widgets, POS client, client portal
- Purpose: Core business logic — contacts, products, auth, automations engine, segments, documents, org management
- Location: `backend/core-api/src/`
- Contains: Apollo subgraph, tRPC router, Express routes, module-per-feature structure under `modules/`, meta configs
- Depends on: `erxes-api-shared`, MongoDB
- Used by: Gateway (via federation), other plugins (via tRPC inter-service calls)
- Purpose: Domain-specific microservices, each a self-contained Apollo subgraph + tRPC + Express service
- Location: `backend/plugins/{name}_api/src/`
- Contains: `main.ts` (calls `startPlugin()`), `connectionResolvers.ts`, `apollo/`, `trpc/`, `modules/`, `meta/`, `routes.ts`
- Depends on: `erxes-api-shared`, MongoDB (tenant-scoped)
- Used by: Gateway (via GraphQL federation and `/pl:{name}` REST proxy)
- Purpose: Reusable infrastructure for ALL backend services — plugin lifecycle, service discovery, DB connection, Apollo context, tRPC context, Redis, BullMQ, file handling, auth helpers
- Location: `backend/erxes-api-shared/src/`
- Contains: `utils/` (start-plugin, service-discovery, redis, mongo, apollo, trpc, headers, logs), `core-types/`, `core-modules/` (automations, segments, permissions, import-export, payments, notifications, logs)
- Depends on: MongoDB, Redis, external services
- Used by: Every backend service
- Purpose: Long-running workers for automation execution and log aggregation
- Location: `backend/services/automations/src/`, `backend/services/logs/src/`
- Contains: BullMQ workers, AI agent integration, tRPC clients for inter-service calls
- Depends on: Redis (BullMQ), MongoDB, `erxes-api-shared`
- Used by: Core API and plugins (publish jobs to queues)
- Purpose: Module Federation host app — authentication, core routes (contacts, automations, segments, settings), navigation shell, plugin route mounting
- Location: `frontend/core-ui/src/`
- Contains: `bootstrap.tsx` (federation init), `modules/app/` (routing, layout), `modules/auth/`, `modules/contacts/`, `modules/automations/`, `modules/plugins/` (plugin config loader)
- Depends on: `erxes-ui`, `ui-modules`, Apollo Client, Jotai, React Router v7
- Used by: Browsers; loads plugin remotes at runtime
- Purpose: Module Federation remotes — each plugin exposes `./config`, named feature modules, widget components, settings pages
- Location: `frontend/plugins/{name}_ui/src/`
- Contains: `config.tsx` (IUIConfig export), `modules/` (feature components, routes), `pages/` (settings pages), `widgets/` (relation/automation widgets), `module-federation.config.ts`
- Depends on: `erxes-ui`, `ui-modules`, Apollo Client (shared singleton), Jotai (shared store), React Router
- Used by: core-ui loads via `loadRemote()` at runtime
- Purpose: Shared React components, state atoms, and reusable UI modules across all frontend apps
- Location: `frontend/libs/erxes-ui/src/`, `frontend/libs/ui-modules/src/`
- Contains: `erxes-ui` — components, hooks, constants, utils, types; `ui-modules` — Jotai atoms (`currentUserState`, `pluginsConfigState`, `loadingPluginsConfigState`), shared modules (contacts, products, segments, automations, etc.)
- Depends on: React, Apollo Client, Jotai, Radix UI, TailwindCSS
- Used by: core-ui and all plugin UIs (shared singleton via Module Federation `shared` config)
- Purpose: Customer-facing applications separate from the main admin UI
- Location: `apps/client-portal-template/`, `apps/posclient-front/`, `apps/frontline-widgets/`
- Contains: Next.js apps (client portal, POS), standalone React widget bundle (chat/forms)
- Depends on: Gateway API via GraphQL, standalone Apollo clients
## Data Flow
### Primary GraphQL Request Path
### Plugin REST Proxy Path
### tRPC Inter-service Path
### Module Federation Plugin Load Path
### Backend Plugin Registration Path
- Backend: Stateless per-request; Redis for ephemeral shared state (service registry, token cache, pub/sub); MongoDB for persistent data; BullMQ for job queues
- Frontend: Jotai atoms for global state (user, permissions, plugin configs); Apollo Client cache for server data; `useState`/`useReducer` for local component state
## Key Abstractions
- Purpose: Single function to bootstrap any backend plugin microservice — creates Express app, Apollo subgraph (using `buildSubgraphSchema`), tRPC mount, registers meta (automations, segments, notifications, payments, beforeResolvers), calls `joinErxesGateway`
- Examples: `backend/plugins/sales_api/src/main.ts`, `backend/plugins/frontline_api/src/main.ts`
- Pattern: Call once at process entry point; pass `name`, `port`, `graphql()`, `apolloServerContext`, `trpcAppRouter`, `meta`, `importExport`
- Location: `backend/erxes-api-shared/src/utils/start-plugin.ts`
- Purpose: Factory that returns a `generateModels(subdomain)` function. In OS mode, returns models from the single global Mongoose connection. In SaaS mode, returns models from a per-subdomain Mongoose connection to tenant-specific DB
- Examples: `backend/plugins/sales_api/src/connectionResolvers.ts`, `backend/core-api/src/connectionResolvers.ts`
- Pattern: Call `createGenerateModels(loadClasses)` once at module load; the returned async function is called per-request with `subdomain`
- Location: `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`
- Purpose: Redis-based service discovery. `joinErxesGateway` writes the plugin's address and config to Redis. `getPlugin` reads from Redis (with in-memory cache) to resolve a plugin's address for proxying or inter-service calls
- Examples: Called in `startPlugin` for all plugins
- Pattern: Plugin registers itself after server is ready; gateway reads registry on boot and on supergraph updates
- Location: `backend/erxes-api-shared/src/utils/service-discovery.ts`
- Purpose: Standard contract for a frontend plugin to declare its navigation group, routes, exposed modules, and widget types to the host
- Examples: `frontend/plugins/sales_ui/src/config.tsx`, `frontend/plugins/frontline_ui/src/config.tsx`
- Pattern: Export `const CONFIG: IUIConfig` from `./config`; expose it in `module-federation.config.ts` as `'./config': './src/config.tsx'`
- Location: `frontend/libs/erxes-ui/src/` (IUIConfig type)
- Purpose: Every HTTP request carries a subdomain (extracted from `nginx-hostname` header or `req.hostname`). This is passed to `generateModels(subdomain)` which either scopes the DB connection (SaaS) or passes it to model classes for collection-level isolation
- Pattern: `getSubdomain(req)` in middleware/context → pass `subdomain` through entire call stack → `generateModels(subdomain)` at resolver level
- Location: `backend/erxes-api-shared/src/utils/utils.ts` (`getSubdomain`), `backend/erxes-api-shared/src/utils/mongo/generate-models.ts`
- Purpose: Standard GraphQL resolver context interface — carries `user`, `cpUser`, `clientPortal`, `subdomain`, `models`, `loaders`, `req`, `res`, event handlers
- Examples: All resolvers destructure `{ models, subdomain, user }` from context
- Location: `backend/erxes-api-shared/src/core-types/common.ts`
- Purpose: At runtime, the host loads each plugin's JS bundle from the remote dev server (dev) or CDN (prod) using `@module-federation/enhanced/runtime`'s `loadRemote('{pluginName}/{moduleName}')`
- Pattern: `RenderPluginsComponent` wraps `loadRemote` in a `useEffect`, renders the returned `default` export inside a `Suspense`
- Location: `frontend/core-ui/src/modules/plugins/components/RenderPluginsComponent.tsx`
## Entry Points
- Location: `backend/gateway/src/main.ts`
- Triggers: `pnpm nx serve gateway` or `node dist/src/main.js` on port 4000
- Responsibilities: CORS, rate limiting, user auth middleware, GraphQL federation proxy, plugin REST proxy, WebSocket subscriptions, BullMQ board, graceful shutdown
- Location: `backend/core-api/src/main.ts`
- Triggers: `pnpm nx serve core-api` or `node dist/main.js` on port 3300
- Responsibilities: Mounts Apollo subgraph, tRPC, Express routes, registers with gateway via `joinErxesGateway`, starts automation/segment/import-export/broadcast workers
- Location: `backend/plugins/sales_api/src/main.ts`
- Triggers: `pnpm nx serve sales_api` on port 3305
- Responsibilities: Calls `startPlugin({ name: 'sales', port: 3305, ... })` which handles all infrastructure setup and gateway registration
- Location: `frontend/core-ui/src/main.ts` → `frontend/core-ui/src/bootstrap.tsx`
- Triggers: `pnpm nx serve core-ui` on port 3001
- Responsibilities: Fetches remote plugin list from API, initializes Module Federation runtime, renders React app with router
- Location: `frontend/plugins/sales_ui/src/main.ts` → `frontend/plugins/sales_ui/src/bootstrap.tsx`
- Triggers: `pnpm nx serve sales_ui` on port 3005
- Responsibilities: Standalone dev entry point; in prod, serves as Module Federation remote at `{CDN}/{pluginName}/remoteEntry.js`
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
### Calling generateModels without subdomain in SaaS mode
### Exposing a new module in a plugin UI without updating module-federation.config.ts
## Error Handling
- Resolvers throw `new Error('descriptive message')` — Apollo maps to `errors[]` in GraphQL response
- `startPlugin` does not catch; unhandled rejection crashes the process (intentional — let the process manager restart it)
- Gateway gracefully handles plugin unavailability: if `getPlugin(name)` returns no address, responds `404 Service not found`
- Frontend: `RenderPluginsComponent` catches `loadRemote` failures and renders `RenderPluginsComponentErrorState`
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
