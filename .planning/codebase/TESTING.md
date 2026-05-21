# Testing Patterns

**Analysis Date:** 2026-05-21

## Test Framework

**Runner:**
- Jest (via `@nx/jest/plugin` — configured as Nx plugin in `nx.json`)
- Root orchestrator: `jest.config.ts` (uses `getJestProjectsAsync()` to discover all projects)
- Per-project configs: `jest.config.ts` in each project root
- Preset: `jest.preset.js` (repo root — extends `@nx/jest/preset`)

**Transform:**
- Backend: `ts-jest` with `tsconfig.spec.json`
- Frontend: `babel-jest` with `@nx/react/babel` preset

**Run Commands:**
```bash
# Run tests for a specific project
pnpm nx test <project-name>

# Run in watch mode
pnpm nx test <project-name> --watch

# Run with coverage
pnpm nx test <project-name> --coverage

# Run only tests affected by recent changes
pnpm nx affected:test

# Run tests across all projects
pnpm nx run-many -t test
```

## Test File Organization

**Location:**
- Spec files use co-location pattern (next to source) OR `__tests__/` subdirectory
- The `tsconfig.spec.json` in each package includes both patterns:
  ```json
  "include": [
    "**/__mocks__/**/*",
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx"
  ]
  ```

**Naming:**
- Unit/integration: `*.test.ts` or `*.test.tsx`
- Spec files: `*.spec.ts` or `*.spec.tsx`
- Both naming conventions are accepted by the Jest configuration

**Current state — no test files exist in project source:**
The test infrastructure (jest configs, tsconfig.spec.json, preset) is fully scaffolded in all packages, but **no actual test files have been written** in `backend/`, `frontend/`, or `apps/` directories. The codebase has zero test coverage.

## Frontend Jest Config Pattern

All frontend plugins share the same structure (`frontend/plugins/sales_ui/jest.config.ts`):
```typescript
export default {
  displayName: 'sales_ui',
  preset: '../../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../../coverage/frontend/plugins/sales_ui',
};
```

This pattern is identical across:
- `frontend/plugins/accounting_ui/jest.config.ts`
- `frontend/plugins/sales_ui/jest.config.ts`
- `frontend/plugins/content_ui/jest.config.ts`
- `frontend/libs/erxes-ui/jest.config.ts`
- `frontend/libs/ui-modules/jest.config.ts`

## Backend Jest Config Pattern

Backend projects use `ts-jest` (from `tsconfig.spec.json` which includes `"types": ["jest", "node"]`). The erxes-api-shared package at `backend/erxes-api-shared/tsconfig.spec.json` is the only backend package with test scaffolding.

Backend jest would follow this pattern (from CLAUDE.md guidance):
```typescript
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

## Mocking Patterns

**GraphQL / Apollo (for future tests):**

The Storybook setup demonstrates the intended `MockedProvider` pattern for component stories. This same approach applies to Jest tests:

```typescript
import { MockedProvider } from '@apollo/client/testing';
import { GET_CUSTOMERS } from '../graphql/queries/getCustomers';

// In test/story — mock GraphQL responses
const mocks = [
  {
    request: {
      query: GET_CUSTOMERS,
      variables: { page: 1, perPage: 20, searchValue: '' },
    },
    result: {
      data: {
        customersMain: {
          list: [{ _id: '1', firstName: 'Jane', lastName: 'Doe' }],
          totalCount: 1,
        },
      },
    },
  },
];

// Wrap component with MockedProvider
render(
  <MockedProvider mocks={mocks} addTypename={false}>
    <ComponentUnderTest />
  </MockedProvider>
);
```

Pattern source: `frontend/libs/ui-modules/.storybook/preview.tsx` and `frontend/libs/ui-modules/src/modules/__stories__/SelectCustomer.stories.tsx`

**Backend models (for future tests):**

From `backend/erxes-api-shared/src/` and CLAUDE.md guidance, models are tested via `generateModels(subdomain)`:
```typescript
import { generateModels } from '../connectionResolvers';

describe('Deal Model', () => {
  let models;

  beforeEach(async () => {
    models = await generateModels('test');
  });

  afterEach(async () => {
    await models.Deals.deleteMany({});
  });

  it('should create a deal', async () => {
    const deal = await models.Deals.createDeal({
      name: 'Test Deal',
      stageId: 'stage-id',
    });
    expect(deal.name).toBe('Test Deal');
    expect(deal._id).toBeDefined();
  });
});
```

**Jotai atoms (for future tests):**

Jotai atoms are plain values — test atom state by wrapping with a `Provider`:
```typescript
import { Provider } from 'jotai';
import { render } from '@testing-library/react';

render(
  <Provider>
    <ComponentWithAtoms />
  </Provider>
);
```

## Storybook (Active — primary UI testing mechanism)

Storybook is the **active** UI development and testing tool. Jest tests are scaffolded but unwritten; Storybook stories exist for `erxes-ui` components and `ui-modules` shared components.

**Story file locations:**
- `frontend/libs/erxes-ui/src/components/__stories__/*.stories.tsx`
- `frontend/libs/ui-modules/src/modules/__stories__/*.stories.tsx`

**Storybook configs:**
- `frontend/libs/ui-modules/.storybook/main.ts` — `@storybook/react-webpack5` framework
- `frontend/libs/ui-modules/.storybook/preview.tsx` — wraps all stories with `MockedProvider`

**Story pattern:**
```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { SelectCustomer } from '../contacts/components/SelectCustomer';

const meta: Meta<typeof SelectCustomer> = {
  title: 'Modules/Contacts/SelectCustomer',
  component: SelectCustomer,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SelectCustomer>;

export const Default: Story = {
  args: { onValueChange: (value) => console.log(value) },
  parameters: {
    mocks: [
      {
        request: { query: GET_CUSTOMERS, variables: { page: 1, perPage: 20, searchValue: '' } },
        result: { data: { customersMain: { list: [...], totalCount: 2 } } },
      },
    ],
  },
};

export const Loading: Story = {
  args: {},
  parameters: {
    mocks: [{ request: { query: GET_CUSTOMERS, variables: {...} }, result: undefined, delay: 2000 }],
  },
};

export const Error: Story = {
  args: {},
  parameters: {
    mocks: [{ request: { query: GET_CUSTOMERS, variables: {...} }, error: new Error('Failed') }],
  },
};
```

**Storybook run commands:**
```bash
# Serve Storybook for erxes-ui
pnpm nx storybook erxes-ui

# Build Storybook
pnpm nx build-storybook erxes-ui

# Run Storybook tests (if configured)
pnpm nx test-storybook erxes-ui
```

## Coverage

**Requirements:** No coverage thresholds enforced in any `jest.config.ts`.

**Coverage output directories:**
- Frontend plugins: `coverage/frontend/plugins/<plugin-name>/`
- Shared libs: `coverage/packages/frontend/libs/<lib-name>/`

**View Coverage:**
```bash
pnpm nx test <project-name> --coverage
# Report written to coverageDirectory defined in jest.config.ts
```

## Test Types — Current Status

**Unit Tests:**
- Infrastructure: Scaffolded (tsconfig.spec.json, jest.config.ts in all packages)
- Status: **Not written** — zero test files in project source code

**Storybook Component Stories:**
- Status: **Active** — stories exist for `erxes-ui` components and `ui-modules` shared components
- These provide visual testing and are the primary mechanism for UI verification
- Use `MockedProvider` for Apollo-dependent components

**Integration Tests:**
- Status: **Not written**

**E2E Tests:**
- Framework: Not configured
- Status: Not applicable

## Where to Write New Tests

**New backend service test:**
```
backend/plugins/<plugin>_api/src/modules/<module>/__tests__/<feature>.test.ts
```

**New frontend component test:**
```
frontend/plugins/<plugin>_ui/src/modules/<module>/<component>.test.tsx
```

**New Storybook story for shared component:**
```
frontend/libs/erxes-ui/src/components/__stories__/<Component>.stories.tsx
frontend/libs/ui-modules/src/modules/__stories__/<Component>.stories.tsx
```

## Nx Test Target

The `test` target is auto-discovered by `@nx/jest/plugin` from each `jest.config.ts` file. No explicit `"test"` target is needed in `project.json`. Running `pnpm nx test <project-name>` picks up the jest config automatically.

```bash
# Confirm which projects have test targets
pnpm nx show projects --with-target=test
```

---

*Testing analysis: 2026-05-21*
