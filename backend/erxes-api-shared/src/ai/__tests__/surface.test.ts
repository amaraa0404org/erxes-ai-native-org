/**
 * Lightweight smoke tests for the public surface — `index.ts` re-exports,
 * `tokens.ts` static data, `types.ts` Zod schemas / ProviderError.
 *
 * These tests do not validate behavior beyond the contract; they exist to
 * give meaningful line coverage on files that are pure re-exports or
 * static data tables (and to surface accidental removal of public exports
 * in future refactors).
 *
 * `../../utils/service-discovery` is mocked here too because the index
 * re-exports `createAIClient`, which would otherwise import the real
 * service-discovery module at load time and pull in Redis.
 */

jest.mock('../../utils/service-discovery', () => ({
  isEnabled: jest.fn().mockResolvedValue(false),
}));

import * as aiPublic from '../index';
import {
  COST_TABLE,
  DRIFT_MULTIPLIER,
  getTiktokenModule,
} from '../tokens';
import {
  chatMessageSchema,
  toolDefSchema,
  usageSchema,
  aiToolDefSchema,
  chatRequestSchema,
  chatResponseSchema,
  embedRequestSchema,
  embedResponseSchema,
  modelInfoSchema,
  ProviderError,
  PROVIDER_KINDS,
} from '../types';
import { PROVIDER_REGISTRY } from '../providers/index';

describe('index — public surface re-exports', () => {
  it('re-exports the documented names', () => {
    const expected = [
      'createAIClient',
      'AINotEnabledError',
      'encryptSecret',
      'decryptSecret',
      'ENCRYPTION_ENVELOPE_VERSION',
      'redactKey',
      'redactPii',
      'rehydratePii',
      'REDACTED_PLACEHOLDER',
      'COST_TABLE',
      'DRIFT_MULTIPLIER',
      'getTiktokenModule',
      'PROVIDER_REGISTRY',
      'ProviderError',
      'PROVIDER_KINDS',
      'chatMessageSchema',
      'toolDefSchema',
      'usageSchema',
      'aiToolDefSchema',
    ];
    for (const name of expected) {
      expect(aiPublic).toHaveProperty(name);
    }
  });
});

describe('tokens — COST_TABLE + DRIFT_MULTIPLIER + lazy tiktoken', () => {
  it('seeds the canonical model set in COST_TABLE', () => {
    expect(COST_TABLE['openai:gpt-4o']).toBeDefined();
    expect(COST_TABLE['openai:gpt-4o-mini']).toBeDefined();
    expect(COST_TABLE['openai:text-embedding-3-small']).toBeDefined();
    expect(COST_TABLE['anthropic:claude-3-5-sonnet-latest']).toBeDefined();
    expect(COST_TABLE['google:gemini-1.5-pro']).toBeDefined();
  });

  it('every COST_TABLE entry has positive contextWindow + non-negative costs', () => {
    for (const [key, entry] of Object.entries(COST_TABLE)) {
      expect(entry.contextWindow).toBeGreaterThan(0);
      expect(entry.inputCostPer1M).toBeGreaterThanOrEqual(0);
      expect(entry.outputCostPer1M).toBeGreaterThanOrEqual(0);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      // sanity: key is "<kind>:<modelId>"
      expect(key).toMatch(/^[a-z]+:[A-Za-z0-9_\-.\/:]+$/);
    }
  });

  it('DRIFT_MULTIPLIER covers every ProviderKind with values per PITFALLS §P7', () => {
    expect(DRIFT_MULTIPLIER.openai).toBe(1.0);
    expect(DRIFT_MULTIPLIER.azure).toBe(1.0);
    expect(DRIFT_MULTIPLIER.anthropic).toBe(1.15);
    expect(DRIFT_MULTIPLIER.google).toBe(1.1);
    expect(DRIFT_MULTIPLIER.ollama).toBe(1.1);
    expect(DRIFT_MULTIPLIER.custom).toBe(1.2);
  });

  it('getTiktokenModule returns null when NODE_ENV is "test"', () => {
    // The gate must skip the WASM load under test even if NX overrides
    // NODE_ENV at the runner level — we set it explicitly here.
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect(getTiktokenModule()).toBeNull();
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});

describe('types — Zod schemas + ProviderError', () => {
  it('chatMessageSchema accepts a well-formed message and rejects extra fields', () => {
    expect(() =>
      chatMessageSchema.parse({ role: 'user', content: 'hi' }),
    ).not.toThrow();
    expect(() =>
      chatMessageSchema.parse({
        role: 'user',
        content: 'hi',
        toolCallId: 'tc1',
        name: 'jane',
      }),
    ).not.toThrow();
    // .strict() rejects unknown keys
    expect(() =>
      chatMessageSchema.parse({
        role: 'user',
        content: 'hi',
        bogus: 'field',
      } as Record<string, unknown>),
    ).toThrow();
  });

  it('usageSchema rejects negative token counts', () => {
    expect(() =>
      usageSchema.parse({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      }),
    ).not.toThrow();
    expect(() =>
      usageSchema.parse({
        inputTokens: -1,
        outputTokens: 20,
        totalTokens: 19,
      }),
    ).toThrow();
  });

  it('toolDefSchema, aiToolDefSchema, embed/chat request+response, modelInfoSchema parse the canonical shape', () => {
    expect(() =>
      toolDefSchema.parse({
        name: 'sales.search_deals',
        description: 'Search deals',
        inputSchema: { _placeholder: 'zod-schema' },
        sideEffects: 'read',
      }),
    ).not.toThrow();

    expect(() =>
      aiToolDefSchema.parse({
        name: 'sales.search_deals',
        description: 'Search deals',
        inputJsonSchema: { type: 'object' },
        scopes: ['deals:read'],
        pluginName: 'sales',
        sideEffects: 'read',
        lastSeenAt: new Date(),
      }),
    ).not.toThrow();

    expect(() =>
      chatRequestSchema.parse({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).not.toThrow();

    expect(() =>
      chatResponseSchema.parse({
        content: 'hello',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    ).not.toThrow();

    expect(() =>
      embedRequestSchema.parse({
        model: 'text-embedding-3-small',
        input: 'hello',
      }),
    ).not.toThrow();

    expect(() =>
      embedResponseSchema.parse({
        embeddings: [[0.1, 0.2]],
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      }),
    ).not.toThrow();

    expect(() =>
      modelInfoSchema.parse({
        id: 'gpt-4o',
        providerKind: 'openai',
        contextWindow: 128000,
        capabilities: ['chat', 'tools', 'vision'],
      }),
    ).not.toThrow();
  });

  it('PROVIDER_KINDS lists exactly the 6 kinds in DRIFT_MULTIPLIER', () => {
    expect(PROVIDER_KINDS.sort()).toEqual(
      Object.keys(DRIFT_MULTIPLIER).sort(),
    );
  });

  it('ProviderError carries a sanitized shape with no raw cause', () => {
    const err = new ProviderError({
      providerKind: 'openai',
      model: 'gpt-4o',
      statusCode: 429,
      code: 'rate_limited',
      message: 'rate limited',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProviderError');
    expect(err.providerKind).toBe('openai');
    expect(err.model).toBe('gpt-4o');
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('rate_limited');
    expect(err.message).toBe('rate limited');
  });
});

describe('providers — registry is empty in Phase 1.1', () => {
  it('PROVIDER_REGISTRY exposes an empty Partial<Record<...>>', () => {
    expect(PROVIDER_REGISTRY).toEqual({});
    expect(typeof PROVIDER_REGISTRY).toBe('object');
  });
});
