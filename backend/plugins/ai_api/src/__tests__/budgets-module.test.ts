/**
 * Unit tests for the Phase 1.2 budgets module.
 *
 * Phase 1.2 — provider-config-encryption-budget-enforcement / Plan 07.
 *
 * Covers:
 *   1.  estimateCostCents — known model (gpt-4o)
 *   2.  estimateCostCents — unknown model falls back to defaults + drift
 *   3.  estimateCostCents — tool-defs overhead inflates the estimate
 *   4.  checkBudget — happy path returns reservation receipt + sets TTL
 *   5.  checkBudget — over-cap rolls back via decrby + throws BudgetExceededError
 *   6.  checkBudget — no budget configured = unlimited (no Redis call)
 *   7.  checkBudget — XCUT-08 $0 cap throws immediately on first chargeable call
 *   8.  reconcileBudget — positive delta (under-estimated)
 *   9.  reconcileBudget — negative delta (over-estimated)
 *   10. reconcileBudget — zero delta: no incrby, but TTL refreshed
 *   11. releaseBudget — decrby on provider failure
 *   12. emitThresholdCrossed — fires once at first crossing
 *   13. emitThresholdCrossed — already-fired in same month: no duplicate publish
 *   14. aiBudgetsSet resolver — upserts via models.AiBudgets.setBudget + augments
 *       response with live Redis spend
 *
 * Strategy: mock `erxes-api-shared/utils` (redis) and the in-tree
 * `BudgetExceededError` is imported from the real `erxes-api-shared/ai`
 * barrel (so the instanceof check is meaningful). System time is pinned
 * via fake timers so `monthlyKey()` is deterministic across tests.
 */

// ---------------------------------------------------------------------------
// Mock erxes-api-shared/utils BEFORE the SUT modules load. The barrel is
// heavy (mongoose, elasticsearch, etc.); we only need `redis` for these
// tests. Mirror the partial-mock pattern from
// __tests__/erxes-secret-validation.test.ts.
// ---------------------------------------------------------------------------
const mockRedis = {
  incrby: jest.fn(),
  decrby: jest.fn(),
  get: jest.fn(),
  expire: jest.fn(),
  sadd: jest.fn(),
  publish: jest.fn(),
};

jest.mock('erxes-api-shared/utils', () => ({
  redis: mockRedis,
  mongooseStringRandomId: { type: String, default: () => 'test-id' },
  createGenerateModels: () => async () => ({}),
}));

// `connectionResolvers` is type-only inside check.ts (the IModels import
// is erased at runtime). Stub anyway so the require graph stays light.
jest.mock('../connectionResolvers', () => ({}));

// Note: we deliberately do NOT mock erxes-api-shared/ai — the SUT throws
// the REAL BudgetExceededError, and tests assert on it.

import { BudgetExceededError } from 'erxes-api-shared/ai';

import { checkBudget, releaseBudget } from '../modules/budgets/check';
import { estimateCostCents } from '../modules/budgets/estimate';
import {
  emitThresholdCrossed,
  monthlyKey,
  reconcileBudget,
  secondsToEndOfMonth,
} from '../modules/budgets/service';
import { budgetMutations } from '../modules/budgets/mutations';

// Helper — build an IModels-shaped stub with a configurable AiBudgets.
const makeModels = (overrides: Record<string, unknown> = {}): any => ({
  AiBudgets: {
    getBudget: jest.fn(),
    setBudget: jest.fn(),
    listBudgets: jest.fn(),
    removeBudget: jest.fn(),
    findOne: jest.fn(),
    ...overrides,
  },
});

beforeAll(() => {
  jest.useFakeTimers();
  // Mid-month UTC timestamp so monthlyKey() === '202605' for every test.
  jest.setSystemTime(new Date('2026-05-21T12:00:00Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  Object.values(mockRedis).forEach((f: any) => f.mockReset && f.mockReset());
});

describe('estimateCostCents', () => {
  it('Test 1 — known model (openai:gpt-4o) returns the expected ceil cents', () => {
    // gpt-4o: input $2.5 / 1M, output $10 / 1M, drift openai = 1.0
    // input: 1000/1M * 100 * 2.5 * 1.0 = 0.25¢
    // output: 500/1M * 100 * 10 * 1.0 = 0.5¢
    // total: ceil(0.75) = 1
    const c = estimateCostCents({
      providerKind: 'openai',
      model: 'gpt-4o',
      inputTokens: 1000,
      expectedOutputTokens: 500,
    });
    expect(c).toBe(1);
  });

  it('Test 2 — unknown model falls back to defaults + drift', () => {
    // custom drift = 1.2, defaults inputUSD=5, outputUSD=15
    // in: 100000/1M * 100 * 5 * 1.2 = 60¢
    // out: 1000/1M * 100 * 15 * 1.2 = 1.8¢
    // total: ceil(61.8) = 62
    const c = estimateCostCents({
      providerKind: 'custom',
      model: 'mystery-model-9000',
      inputTokens: 100000,
      expectedOutputTokens: 1000,
    });
    expect(c).toBe(62);
  });

  it('Test 3 — toolDefsOverheadTokens inflates the estimate (P8)', () => {
    const without = estimateCostCents({
      providerKind: 'custom',
      model: 'mystery-model-9000',
      inputTokens: 100000,
      expectedOutputTokens: 1000,
    });
    const withOverhead = estimateCostCents({
      providerKind: 'custom',
      model: 'mystery-model-9000',
      inputTokens: 100000,
      toolDefsOverheadTokens: 50000,
      expectedOutputTokens: 1000,
    });
    expect(withOverhead).toBeGreaterThan(without);
  });
});

describe('checkBudget', () => {
  it('Test 4 — happy path returns reservation + sets TTL on first reservation', async () => {
    const models = makeModels();
    models.AiBudgets.getBudget.mockResolvedValue({
      monthlyUsdCap: 10, // 1000¢
      alertThresholds: [0.8],
    });
    // First reservation — newSpend equals the increment.
    mockRedis.incrby.mockResolvedValue(100);
    // SADD returns 0 because there's nothing to cross at 100/1000 = 10%.
    mockRedis.sadd.mockResolvedValue(0);

    const res = await checkBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      estimatedCents: 100,
      models,
    });

    expect(res).toEqual({ reservedCents: 100, currentSpend: 100, cap: 1000 });

    const expectedKey = 'ai:budget:tenant-a:workspace:ws-1:202605';
    expect(mockRedis.incrby).toHaveBeenCalledWith(expectedKey, 100);
    expect(mockRedis.expire).toHaveBeenCalledWith(
      expectedKey,
      secondsToEndOfMonth(),
    );
    expect(mockRedis.decrby).not.toHaveBeenCalled();
  });

  it('Test 5 — over-cap rolls back via decrby and throws BudgetExceededError', async () => {
    const models = makeModels();
    models.AiBudgets.getBudget.mockResolvedValue({
      monthlyUsdCap: 5, // 500¢
    });
    // newSpend = 501 — over by 1¢. The estimatedCents must match the
    // incrby return minus the pre-spend; we set estimatedCents = 1 so
    // currentSpend (after rollback) = 501 - 1 = 500.
    mockRedis.incrby.mockResolvedValue(501);

    let thrown: unknown;
    try {
      await checkBudget({
        subdomain: 'tenant-a',
        scope: 'workspace',
        scopeId: 'ws-1',
        estimatedCents: 1,
        models,
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BudgetExceededError);
    const err = thrown as BudgetExceededError;
    expect(err.cap).toBe(500);
    expect(err.currentSpend).toBe(500);
    expect(err.scope).toBe('workspace');
    expect(err.scopeId).toBe('ws-1');
    expect(err.suggestionUrl).toContain('/settings/ai/budgets?scope=');

    const expectedKey = 'ai:budget:tenant-a:workspace:ws-1:202605';
    expect(mockRedis.incrby).toHaveBeenCalledWith(expectedKey, 1);
    expect(mockRedis.decrby).toHaveBeenCalledWith(expectedKey, 1);
    // Rollback happens BEFORE the throw.
    const decrbyOrder = mockRedis.decrby.mock.invocationCallOrder[0];
    expect(decrbyOrder).toBeDefined();
  });

  it('Test 6 — no budget configured returns unlimited and skips Redis', async () => {
    const models = makeModels();
    models.AiBudgets.getBudget.mockResolvedValue(null);

    const res = await checkBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-unbudgeted',
      estimatedCents: 250,
      models,
    });

    expect(res).toEqual({
      reservedCents: 0,
      currentSpend: 0,
      cap: Number.POSITIVE_INFINITY,
    });
    expect(mockRedis.incrby).not.toHaveBeenCalled();
    expect(mockRedis.decrby).not.toHaveBeenCalled();
  });

  it('Test 7 — XCUT-08: $0 cap throws BudgetExceededError on the first call', async () => {
    const models = makeModels();
    models.AiBudgets.getBudget.mockResolvedValue({
      monthlyUsdCap: 0, // 0¢ — XCUT-08
    });
    // Any positive reservation pushes newSpend > capCents=0.
    mockRedis.incrby.mockResolvedValue(50);

    let thrown: unknown;
    try {
      await checkBudget({
        subdomain: 'tenant-a',
        scope: 'workspace',
        scopeId: 'ws-frozen',
        estimatedCents: 50,
        models,
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BudgetExceededError);
    const err = thrown as BudgetExceededError;
    expect(err.cap).toBe(0);
    expect(mockRedis.decrby).toHaveBeenCalled();
  });
});

describe('reconcileBudget', () => {
  it('Test 8 — positive delta (under-estimated): incrby with +50', async () => {
    mockRedis.incrby.mockResolvedValue(0); // return value irrelevant
    mockRedis.expire.mockResolvedValue(1);
    await reconcileBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      estimatedCents: 100,
      actualCents: 150,
    });
    const key = 'ai:budget:tenant-a:workspace:ws-1:202605';
    expect(mockRedis.incrby).toHaveBeenCalledWith(key, 50);
    expect(mockRedis.expire).toHaveBeenCalledWith(key, secondsToEndOfMonth());
  });

  it('Test 9 — negative delta (over-estimated): incrby with -120', async () => {
    mockRedis.incrby.mockResolvedValue(0);
    mockRedis.expire.mockResolvedValue(1);
    await reconcileBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      estimatedCents: 200,
      actualCents: 80,
    });
    const key = 'ai:budget:tenant-a:workspace:ws-1:202605';
    expect(mockRedis.incrby).toHaveBeenCalledWith(key, -120);
  });

  it('Test 10 — zero delta: no incrby, but TTL is refreshed', async () => {
    mockRedis.expire.mockResolvedValue(1);
    await reconcileBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      estimatedCents: 100,
      actualCents: 100,
    });
    expect(mockRedis.incrby).not.toHaveBeenCalled();
    expect(mockRedis.expire).toHaveBeenCalledWith(
      'ai:budget:tenant-a:workspace:ws-1:202605',
      secondsToEndOfMonth(),
    );
  });
});

describe('releaseBudget', () => {
  it('Test 11 — decrby on provider failure', async () => {
    mockRedis.decrby.mockResolvedValue(0);
    await releaseBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      estimatedCents: 100,
    });
    expect(mockRedis.decrby).toHaveBeenCalledWith(
      'ai:budget:tenant-a:workspace:ws-1:202605',
      100,
    );
  });

  it('releaseBudget — no-op on zero or negative reservation', async () => {
    await releaseBudget({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      estimatedCents: 0,
    });
    expect(mockRedis.decrby).not.toHaveBeenCalled();
  });
});

describe('emitThresholdCrossed', () => {
  it('Test 12 — first crossing publishes once via atomic SADD', async () => {
    mockRedis.sadd.mockResolvedValue(1); // newly added
    mockRedis.publish.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    await emitThresholdCrossed({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      previousSpend: 799,
      currentSpend: 801,
      cap: 1000,
      alertThresholds: [0.8],
    });

    expect(mockRedis.sadd).toHaveBeenCalledWith(
      'ai:budget:threshold:fired:tenant-a:workspace:ws-1:202605',
      '0.8',
    );
    expect(mockRedis.publish).toHaveBeenCalledTimes(1);
    const [channel, payloadStr] = mockRedis.publish.mock.calls[0];
    expect(channel).toBe('ai:budget:threshold:tenant-a:workspace:ws-1');
    const payload = JSON.parse(payloadStr as string);
    expect(payload.threshold).toBe(0.8);
    expect(payload.currentSpend).toBe(801);
    expect(payload.cap).toBe(1000);
    expect(payload.monthlyKey).toBe(monthlyKey());
  });

  it('Test 13 — same threshold already fired: SADD returns 0 → no duplicate publish', async () => {
    mockRedis.sadd.mockResolvedValue(0); // already in set
    mockRedis.expire.mockResolvedValue(1);

    await emitThresholdCrossed({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      previousSpend: 799,
      currentSpend: 801,
      cap: 1000,
      alertThresholds: [0.8],
    });

    expect(mockRedis.publish).not.toHaveBeenCalled();
  });

  it('emitThresholdCrossed — $0 cap exits early (XCUT-08 has nothing to cross)', async () => {
    await emitThresholdCrossed({
      subdomain: 'tenant-a',
      scope: 'workspace',
      scopeId: 'ws-1',
      previousSpend: 0,
      currentSpend: 50,
      cap: 0,
      alertThresholds: [0.8],
    });
    expect(mockRedis.sadd).not.toHaveBeenCalled();
    expect(mockRedis.publish).not.toHaveBeenCalled();
  });
});

describe('budgetMutations.aiBudgetsSet', () => {
  it('Test 14 — upserts the row via models.AiBudgets.setBudget and augments response with live Redis spend', async () => {
    const upsertedRow = {
      _id: 'b-1',
      scope: 'workspace',
      scopeId: 'ws-1',
      monthlyKey: '202605',
      monthlyUsdCap: 25,
      alertThresholds: [0.5, 0.8],
      currentMonthSpend: 0,
      toObject() {
        return { ...this };
      },
    };
    const setBudgetSpy = jest.fn().mockResolvedValue(upsertedRow);
    mockRedis.get.mockResolvedValue('1234'); // live spend = 1234¢

    const ctx: any = {
      models: { AiBudgets: { setBudget: setBudgetSpy } },
      subdomain: 'tenant-a',
      user: { _id: 'u-1' },
      checkPermission: jest.fn().mockResolvedValue(undefined),
    };

    const args = {
      scope: 'workspace',
      scopeId: 'ws-1',
      monthlyUsdCap: 25,
      alertThresholds: [0.5, 0.8],
    };

    const res: any = await (budgetMutations.aiBudgetsSet as any)(
      null,
      args,
      ctx,
    );

    expect(ctx.checkPermission).toHaveBeenCalledWith('aiBudgetsSet');
    expect(setBudgetSpy).toHaveBeenCalledWith({
      scope: 'workspace',
      scopeId: 'ws-1',
      monthlyKey: monthlyKey(),
      monthlyUsdCap: 25,
      alertThresholds: [0.5, 0.8],
      createdBy: 'u-1',
    });
    // Augmented with live Redis spend, overriding Mongo's stored value.
    expect(res.currentMonthSpend).toBe(1234);
    expect(res._id).toBe('b-1');
  });
});
