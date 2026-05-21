# Coding Conventions

**Analysis Date:** 2026-05-21

## Naming Patterns

**Files:**
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

**Directories:**
- Module directories: camelCase (e.g., `sales/`, `ecommerce/`, `pos/`)
- GraphQL directories: `graphql/` with sub-dirs `queries/`, `mutations/`, `subscriptions/`, `schemas/`, `resolvers/`
- State directories: `states/` (frontend)
- Test story directories: `__stories__/`
- Type directories: `@types/` (backend), `types/` (frontend)
- Database directories: `db/` with sub-dirs `models/` and `definitions/`

**TypeScript Interfaces & Types:**
- Interfaces: `I` prefix + PascalCase (e.g., `IDeal`, `IDealDocument`, `IContext`, `IModels`)
- Document types (Mongoose): `IXxxDocument extends IXxx, Document` pattern
- Model interfaces: `IXxxModel extends Model<IXxxDocument>`
- Props interfaces: `XxxProps` (no `I` prefix, PascalCase) e.g., `DealsBoardCardProps`
- GraphQL types: exported as `const types = \`...\`` (template literals)
- Zod schemas: suffix `Schema` (e.g., `salesFormSchema`, `checklistFormSchema`)
- Zod inferred types: suffix `Type` (e.g., `SalesFormType`, derived from `z.infer<typeof schema>`)

**Functions & Variables:**
- Functions: camelCase (e.g., `generateFilter`, `createBoardItem`, `watchItem`)
- React component functions: PascalCase (e.g., `DealsBoardCard`, `AddCardForm`)
- Async functions: `async` keyword before `function` or arrow function
- Constants (global/enum-like): `UPPER_SNAKE_CASE` objects (e.g., `SALES_STATUSES`, `CLOSE_DATE_TYPES`, `PRIORITIES`)
- Jotai atoms: camelCase + `Atom` or `State` suffix (e.g., `dealsBoardAtom`, `dealDetailSheetState`, `isDraggingAtom`)

**GraphQL:**
- Types: PascalCase (e.g., `Deal`, `SalesPipeline`, `SalesStage`)
- Fields on types: camelCase (e.g., `assignedUserIds`, `closeDate`, `stageId`)
- Queries: camelCase, descriptive (e.g., `deals`, `dealDetail`, `dealsTotalCount`)
- Mutations: camelCase, `nounVerb` pattern using plural noun + verb (e.g., `dealsAdd`, `dealsEdit`, `dealsRemove`, `dealsWatch`)
- Subscriptions: (e.g., `salesDealListChanged`)
- Input types: PascalCase + `Input` suffix (e.g., `AttachmentInput`, `IDealFilter`)

## Code Style

**Formatting (Prettier):**
- Config: `.prettierrc` at repo root
- `singleQuote`: true
- `trailingComma`: "all"
- `endOfLine`: "auto"
- 2-space indentation (inferred from code)
- No semicolons NOT enforced — semicolons appear in backend code, absent in some frontend files; Prettier does not explicitly set this

**Linting:**
- Root config: `eslint.config.js` (flat config format)
- Plugin: `@nx/eslint-plugin` with `flat/base`, `flat/typescript`, `flat/javascript` presets
- React plugins get `flat/react` preset (e.g., `frontend/libs/erxes-ui/eslint.config.js`)
- `@typescript-eslint/no-explicit-any`: **off** (explicit `any` is allowed across the codebase)
- `no-console`: **warn** in UI libs (allow `group`, `groupCollapsed`, `groupEnd`)
- `@nx/enforce-module-boundaries`: **error** — prevents cross-boundary imports except via declared allowed list
- `allowCircularSelfDependency`: true

## Import Organization

**Backend plugins:**
Order is: external packages → shared lib (`erxes-api-shared/*`) → internal path-aliased modules

```typescript
// 1. Third-party
import { Model } from 'mongoose';
import moment from 'moment';

// 2. Shared library (erxes-api-shared)
import { createBoardItem } from 'erxes-api-shared/utils';
import { Resolver } from 'erxes-api-shared/core-types';

// 3. Internal modules via path alias (~/* or @/*)
import { IContext, IModels } from '~/connectionResolvers';
import { IDeal } from '~/modules/sales/@types';
import { SALES_STATUSES } from '~/modules/sales/constants';
```

**Path Aliases (backend plugins):**
- `~/*` → `./src/*` (plugin root)
- `@/*` → `./src/modules/*` (modules directory)
- `erxes-api-shared/*` → `../../erxes-api-shared/src/*`

**Frontend plugins:**
Order is: external packages → shared libs → internal path-aliased modules

```typescript
// 1. Third-party
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useAtom, useAtomValue } from 'jotai';

// 2. Shared UI libraries
import { toast, useQueryState } from 'erxes-ui';
import { SelectCompany, SelectCustomer } from 'ui-modules';

// 3. Internal modules via @ alias
import { ADD_DEALS } from '@/deals/graphql/mutations/DealsMutations';
import { IDeal } from '@/deals/types/deals';
import { useDealsBoard } from '@/deals/states/dealsBoardState';
```

**Path Aliases (frontend plugins, e.g., `sales_ui`):**
- `@/` or `~/` → `./src/modules/` (module root inside plugin)

**Barrel files:**
- `index.ts` used in shared libs (`erxes-ui`, `ui-modules`) for re-exporting everything
- Plugins export from individual files; no barrel files in plugin modules

## TypeScript Configuration

**Backend plugins:**
- `"module": "commonjs"` — CommonJS output
- `"target": "es2017"`
- `"noImplicitAny": false` — `any` allowed
- `"strictNullChecks": true`
- `"alwaysStrict": true`

**Frontend (base tsconfig):**
- `"module": "esnext"` — ESNext output for bundlers
- `"target": "es2015"`
- `"strictNullChecks": true`
- `"useUnknownInCatchVariables": false` — catch variables remain `any`

**Do NOT use TypeScript `enum` keyword** — use plain constant objects with `ALL` array:
```typescript
// Correct pattern
export const SALES_STATUSES = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  ALL: ['active', 'archived'],
};

// Not used in this codebase
enum SalesStatus { ACTIVE = 'active' }
```

## Error Handling

**Backend:**
- Throw plain `Error` with descriptive message: `throw new Error('Deal not found')`
- No custom error class hierarchy (plain `Error` only)
- Permission errors: `throw new Error('Permission denied')`
- Call `await checkPermission('actionName')` at the start of every mutation resolver
- `catch` blocks: use `console.error(...)` or `console.log(...)` for logging errors in utilities (not structured logging)

**Frontend:**
- Apollo errors surfaced via `toast` from `erxes-ui`:
  ```typescript
  onError: (e) => {
    toast({ title: 'Error', description: e.message, variant: 'destructive' });
  }
  ```
- Use `try/catch` only for utility functions; let Apollo hooks handle GraphQL errors via `onError`

## Logging

**Backend:**
- No structured logging framework — uses `console.log` and `console.error` directly
- `console.log(subdomain, errorMessage)` for error context in utilities (`backend/plugins/sales_api/src/modules/pos/utils.ts`)
- ESLint `no-console` rule is **not** enabled on backend (only on frontend libs)

**Frontend (erxes-ui, ui-modules):**
- `no-console: warn` — only `console.group`, `console.groupCollapsed`, `console.groupEnd` allowed
- Use `toast` from `erxes-ui` for user-visible error/success messages

## Comments

**When to Comment:**
- Short inline comments for non-obvious logic: `// TODO: implement transaction callback`
- JSDoc-style: `/** Get single deal */`, `/** Create deal */` on static model methods
- Inline schema field comments: `// Product` beside each schema field in definitions
- `// TODO remove after migration` and `// TODO: future list by currency` for known debt

**JSDoc/TSDoc:**
- Sparse — used only on Mongoose model static methods, not on resolver functions
- Not used on React component props

## React Component Patterns

**Component definition style — mix of two patterns:**

Named arrow function (preferred for typed props):
```typescript
export const DealsBoardCard = memo(function DealsBoardCard({
  deal,
}: DealsBoardCardProps) { ... });
```

Named function with `React.FC` annotation (also used):
```typescript
const CircularProgressBar: React.FC<CircularProgressBarProps> = ({ ... }) => { ... };
```

Regular function (preferred for forms/containers, no type annotation needed):
```typescript
export function AddCardForm({ onCloseSheet, onComplete, showWorkflowFields }: Props) { ... }
```

**Props typing:**
- Always use inline interface above the component: `interface DealsBoardCardProps { deal: IDeal; }`
- Do NOT use anonymous inline types for props

**Lazy loading (Module Federation):**
```typescript
const DealsMain = lazy(() =>
  import('~/pages/SalesIndexPage').then((module) => ({
    default: module.SalesIndexPage,
  })),
);
// Always wrap with <Suspense fallback={<Spinner />}>
```

**'use client' directive:**
- Used in components that use browser-only APIs or interactive state
- Example: `'use client';` at top of `DealsBoard.tsx`

## State Management Patterns

**Jotai atoms — defined in `states/` directory:**
```typescript
// Primitive atoms
export const dealCreateSheetState = atom(false);
export const dealsBoardAtom = atom<DealsBoardState | null>(null);

// Derived atoms
export const dealTotalCountBoardAtom = atom((get) => ...);

// Custom hooks wrapping atoms (preferred pattern)
export function useDealsBoard() {
  const [state, setState] = useAtom(dealsBoardAtom);
  return [state, setState];
}
```

**Apollo Client for server state:**
- `useQuery` with `fetchPolicy: 'cache-and-network'` for board/list queries
- `useMutation` for all write operations
- `subscribeToMore` for real-time updates within `useQuery`

**URL state via `useQueryState`:**
- `const [pipelineId] = useQueryState<string>('pipelineId');` — from `erxes-ui`
- Used for shared UI state in URL search params (pipelineId, boardId, salesItemId)

## Form Patterns

**React Hook Form + Zod:**
```typescript
// 1. Define schema in constants/formSchema.ts or inline constants file
export const salesFormSchema = z.object({
  name: z.string().default(''),
  assignedUserIds: z.array(z.string()).optional(),
});
export type SalesFormType = z.infer<typeof salesFormSchema>;

// 2. Use in component
const form = useForm<SalesFormType>({
  resolver: zodResolver(salesFormSchema),
  defaultValues: { name: '', assignedUserIds: [] },
});
```

**Form schema location:** Dedicated files like `constants/formSchema.ts` or co-located constants files.

## UI / Styling Patterns

**TailwindCSS v4** via `@import 'tailwindcss'` in `frontend/core-ui/src/styles.css`. Sources span all frontend:
```css
@source '.';
@source '../../libs/';
@source '../../plugins/';
```

**`cn()` utility** (clsx + tailwind-merge) from `erxes-ui/lib`:
```typescript
import { cn } from 'erxes-ui/lib';
className={cn(buttonVariants({ variant, size, className }))}
```

**`cva` (class-variance-authority)** for component variants in `erxes-ui`:
```typescript
export const buttonVariants = cva('base-classes', {
  variants: { variant: { default: '...', destructive: '...' } },
  defaultVariants: { variant: 'default' },
});
```

**Radix UI primitives** wrapped by `erxes-ui` components — import from `erxes-ui`, not directly from `radix-ui`.

**Icons:** Always use `@tabler/icons-react` (e.g., `IconBriefcase`, `IconAlertCircleFilled`).

## tRPC Patterns (Backend)

**Router definition:**
```typescript
const t = initTRPC.context<SalesTRPCContext>().create();

export const appRouter = t.mergeRouters(dealTrpcRouter, posTrpcRouter, t.router({
  fields: t.router({
    getFieldList: t.procedure.input(fieldQueryInput).query(async ({ ctx, input }) => {
      const { models, subdomain } = ctx;
      return ...;
    }),
  }),
}));
```

**Zod input validation in tRPC procedures:**
```typescript
const fieldQueryInput = z.object({
  moduleType: z.string(),
  segmentId: z.string().optional(),
});
t.procedure.input(fieldQueryInput).query(async ({ ctx, input }) => { ... });
```

**Cross-service calls:** Use `sendTRPCMessage({ serviceName, action, data, subdomain })` from `erxes-api-shared/utils`.

## Multi-tenancy Convention

Every resolver and model access receives `subdomain` from context:
```typescript
async dealsAdd(_root, doc, { user, models, subdomain, checkPermission }: IContext) {
  await checkPermission('dealsAdd');
  return await addDeal({ models, subdomain, user, doc });
}
```

`generateModels(subdomain, context?)` is called in `apolloServerContext` and `trpcAppRouter.createContext` — never call it inside individual resolvers unless needed for background/worker contexts.

## Mongoose Model Pattern

```typescript
// definitions/deals.ts — schema only
export const dealSchema = new Schema({ ... });

// models/Deals.ts — model class with statics
export interface IDealModel extends Model<IDealDocument> {
  getDeal(_id: string): Promise<IDealDocument>;
  createDeal(doc: IDeal): Promise<IDealDocument>;
}

export const loadDealClass = (models, subdomain, eventHandlers) => {
  class Deal {
    public static async getDeal(_id: string) {
      const deal = await models.Deals.findOne({ _id });
      if (!deal) throw new Error('Deal not found');
      return deal;
    }
    public static async createDeal(doc: IDeal) { ... }
  }
  return Deal;
};
```

All model classes use **static methods only** — no instance methods.

---

*Convention analysis: 2026-05-21*
