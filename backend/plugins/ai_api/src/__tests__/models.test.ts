/**
 * Smoke tests for the Phase 1.2 ai_api Mongoose model wiring.
 *
 * What this verifies:
 *   1. `loadClasses` registers exactly four models on the per-subdomain
 *      connection — at the canonical brief §4 collection names.
 *   2. The returned `IModels` exposes `AiProviders`, `AiModels`, `AiBudgets`,
 *      `AiProviderTestAudit` (typed entries).
 *   3. CI grep gate (CONTEXT D-06d / P13): no Mongoose schema in
 *      `src/models/definitions/` declares an `apiKey` field. The only
 *      `apiKey` substring is within `encryptedApiKey`. This runs in every
 *      jest pass so a regression cannot ship undetected.
 */

// Mock `erxes-api-shared/utils` BEFORE any module import — same pattern
// as Phase 1.1's `erxes-secret-validation.test.ts`. The full barrel is
// too heavy to load in unit tests (transitively pulls in elasticsearch,
// redis, saas-mongo-connection); we mock only the two surfaces our SUT
// graph actually reads at module load:
//   - `mongooseStringRandomId`: used by every schema definition
//   - `createGenerateModels`: connectionResolvers calls this at module
//     load. We replace it with a no-op so no real `mongoose.connect()`
//     attempt fires during the test.
jest.mock('erxes-api-shared/utils', () => ({
  mongooseStringRandomId: {
    type: String,
    default: () => 'test-id',
  },
  createGenerateModels: () => async () => ({}),
}));

// `core-modules` and `core-types` are imported only for types (erased at
// runtime). Stub to empty objects so the heavy real implementations are
// not loaded.
jest.mock('erxes-api-shared/core-modules', () => ({}));
jest.mock('erxes-api-shared/core-types', () => ({}));

import * as fs from 'fs';
import * as path from 'path';

describe('ai_api model definitions', () => {
  it('grep gate: no `apiKey:` field declaration in any definition file (P13)', () => {
    // CONTEXT D-06d / P13 — first-save leak surface.
    //
    // The literal substring `apiKey` is allowed only inside
    // `encryptedApiKey` (or inside narrative comments). The regex anchors
    // at line start (after whitespace) and demands a `:` immediately after
    // the bare identifier — narrative mentions like `... an apiKey field`
    // do not trigger it.
    const defsDir = path.resolve(
      __dirname,
      '..',
      'models',
      'definitions',
    );
    const files = fs
      .readdirSync(defsDir)
      .filter((f) => f.endsWith('.ts'));

    expect(files.length).toBeGreaterThanOrEqual(4);

    for (const file of files) {
      const full = path.join(defsDir, file);
      const contents = fs.readFileSync(full, 'utf8');
      const fieldRegex = /^\s*apiKey\s*:/m;
      const match = contents.match(fieldRegex);
      expect(match).toBeNull();
    }
  });

  it('definition files exist for all four brief §4 collections', () => {
    const defsDir = path.resolve(
      __dirname,
      '..',
      'models',
      'definitions',
    );
    const required = [
      'providers.ts',
      'models.ts',
      'budgets.ts',
      'provider-test-audit.ts',
    ];
    const present = fs.readdirSync(defsDir);
    for (const f of required) {
      expect(present).toContain(f);
    }
  });

  it('providers.ts declares `encryptedApiKey` and not `apiKey` as a field', () => {
    const file = path.resolve(
      __dirname,
      '..',
      'models',
      'definitions',
      'providers.ts',
    );
    const contents = fs.readFileSync(file, 'utf8');
    // Positive: encryptedApiKey is declared as a required String field.
    expect(contents).toMatch(/encryptedApiKey\s*:\s*{[^}]*required:\s*true/);
    // Negative: no bare `apiKey:` field declaration.
    expect(contents).not.toMatch(/^\s*apiKey\s*:/m);
  });
});

describe('ai_api Mongoose model wiring', () => {
  // Imported lazily inside the describe so the mocks above are in place
  // BEFORE module evaluation runs. (jest.mock calls are hoisted, but
  // importing connectionResolvers eagerly at file top can still trip
  // the mock-resolution order on some Jest versions.)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mongoose = require('mongoose');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadClasses } = require('../connectionResolvers');

  it('registers four models at brief §4 collection names', () => {
    const calls: Array<[string, unknown]> = [];

    const stubDb = {
      model: jest.fn((name: string, schema: unknown) => {
        calls.push([name, schema]);
        return { __collection: name };
      }),
    };

    const models = loadClasses(stubDb, 'tenant-a', jest.fn());

    expect(calls).toHaveLength(4);
    expect(calls.map(([n]) => n)).toEqual([
      'ai_providers',
      'ai_models',
      'ai_budgets',
      'ai_provider_test_audit',
    ]);
    for (const [, schema] of calls) {
      expect(schema).toBeInstanceOf(mongoose.Schema);
    }
    expect(models).toBeDefined();
  });

  it('returned IModels exposes all four typed model handles', () => {
    const stubDb = {
      model: jest.fn((name: string) => ({ __collection: name })),
    };

    const models = loadClasses(stubDb, 'tenant-a', jest.fn());

    expect(Object.keys(models).sort()).toEqual(
      ['AiBudgets', 'AiModels', 'AiProviders', 'AiProviderTestAudit'].sort(),
    );
  });
});
