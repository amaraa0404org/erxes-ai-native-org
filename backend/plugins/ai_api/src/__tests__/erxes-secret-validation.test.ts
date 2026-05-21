/**
 * Unit tests for the ERXES_SECRET fail-fast validation in ai_api/src/main.ts.
 *
 * The validation function (`validateErxesSecret`) is a named export so we can
 * test it without touching `process.exit` or `process.env`. The actual main.ts
 * module-load code calls this function and exits the process on `{ ok: false }`.
 *
 * Per CONTEXT D-09:
 *   - Requirement: ERXES_SECRET must be >= 32 hex bytes (i.e. >= 64 hex chars).
 *   - On failure: exact error message
 *       "ERXES_SECRET must be >= 32 hex bytes (got N). Generate with `openssl rand -hex 32`."
 *   - exit code 1
 *   - BEFORE startPlugin({...}) is invoked.
 *
 * Per PITFALLS §P14 (rotation context):
 *   - The check must tolerate a comma-separated multi-version secret list
 *     and use the FIRST entry's hex content for the byte-count check, so
 *     Phase 1.2's rotation policy ships without code change here.
 *   - Versioned entries look like `v1:<hex>` / `v2:<hex>` — the leading
 *     `vN:` prefix is stripped before counting bytes.
 */

// Hard-pin NODE_ENV before main.ts loads — main.ts calls validateErxesSecret
// at module load and would process.exit(1) if ERXES_SECRET is unset.
// Setting a valid secret here keeps the module load harmless; the unit tests
// below use the named export directly with crafted inputs.
process.env.ERXES_SECRET = 'a'.repeat(64); // 64 hex chars = 32 bytes

// Stub erxes-api-shared/utils so we never bring up Express / Apollo at test
// time. main.ts calls startPlugin(...) at module load — without this stub
// jest would try to bind a real port.
jest.mock('erxes-api-shared/utils', () => ({
  startPlugin: jest.fn(),
  apolloCommonTypes: '',
  apolloCustomScalars: {},
  createGenerateModels: () => () => Promise.resolve({}),
}));

// Stub the apollo + trpc + routes barrel imports so main.ts loads without
// dragging in Apollo Server, tRPC, Express, etc.
jest.mock('../apollo/resolvers', () => ({ default: {} }));
jest.mock('../apollo/typeDefs', () => ({ typeDefs: async () => ({}) }));
jest.mock('../connectionResolvers', () => ({
  generateModels: async () => ({}),
}));
jest.mock('../routes', () => ({ router: {} }));
jest.mock('../trpc/init-trpc', () => ({ appRouter: {} }));

import { validateErxesSecret } from '../main';

describe('validateErxesSecret', () => {
  const EXACT_MESSAGE_PREFIX = 'ERXES_SECRET must be >= 32 hex bytes (got ';
  const EXACT_MESSAGE_SUFFIX =
    '). Generate with `openssl rand -hex 32`.';

  it('rejects undefined ERXES_SECRET with bytes=0', () => {
    const result = validateErxesSecret(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bytes).toBe(0);
      expect(result.message).toBe(
        `${EXACT_MESSAGE_PREFIX}0${EXACT_MESSAGE_SUFFIX}`,
      );
    }
  });

  it('rejects empty string ERXES_SECRET with bytes=0', () => {
    const result = validateErxesSecret('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bytes).toBe(0);
      expect(result.message).toBe(
        `${EXACT_MESSAGE_PREFIX}0${EXACT_MESSAGE_SUFFIX}`,
      );
    }
  });

  it('rejects 31-byte secret (62 hex chars) with bytes=31', () => {
    const result = validateErxesSecret('a'.repeat(62));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bytes).toBe(31);
      expect(result.message).toBe(
        `${EXACT_MESSAGE_PREFIX}31${EXACT_MESSAGE_SUFFIX}`,
      );
    }
  });

  it('accepts exactly 32-byte secret (64 hex chars)', () => {
    const result = validateErxesSecret('a'.repeat(64));
    expect(result.ok).toBe(true);
  });

  it('accepts 64-byte secret (128 hex chars)', () => {
    const result = validateErxesSecret('b'.repeat(128));
    expect(result.ok).toBe(true);
  });

  it('accepts comma-separated versioned multi-secret list (uses first entry)', () => {
    // Phase 1.2 rotation policy A: ERXES_SECRET=v1:<hex>,v2:<hex>
    // Phase 1.1 validation uses the first entry's hex content and strips
    // the leading `vN:` prefix.
    const secret = `v1:${'a'.repeat(64)},v2:${'b'.repeat(64)}`;
    const result = validateErxesSecret(secret);
    expect(result.ok).toBe(true);
  });

  it('rejects when first entry of multi-secret list is too short', () => {
    const secret = `v1:${'a'.repeat(62)},v2:${'b'.repeat(64)}`;
    const result = validateErxesSecret(secret);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.bytes).toBe(31);
    }
  });
});
