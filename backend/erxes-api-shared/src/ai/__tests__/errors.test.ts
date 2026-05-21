/**
 * Unit tests for `errors.ts` — AIError base class + concrete subclasses
 * consumed across Phase 1.2 modules (adapters, budget pre-check, encryption
 * rotation gate).
 *
 * Each subclass:
 *   - extends AIError (which extends Error)
 *   - has `name` matching the constructor class name (so structured handlers
 *     can switch on `err.name` without an `instanceof` chain)
 *   - exposes its detail properties as public readonly fields
 *   - works with `instanceof` against both itself and AIError + Error
 */
import {
  AIError,
  BudgetExceededError,
  NotYetImplementedError,
  ProviderRateLimitError,
  SecretRotationRequiredError,
} from '../errors';

describe('errors — AIError base class', () => {
  it('extends Error and sets name from constructor.name', () => {
    const err = new AIError({ message: 'plain' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIError);
    expect(err.name).toBe('AIError');
    expect(err.message).toBe('plain');
  });

  it('stores additional details as readable properties', () => {
    const err = new AIError({ message: 'with-detail', foo: 'bar', n: 42 });
    expect((err as any).foo).toBe('bar');
    expect((err as any).n).toBe(42);
  });
});

describe('errors — SecretRotationRequiredError', () => {
  it('extends AIError + Error and reports its own name', () => {
    const err = new SecretRotationRequiredError({
      subdomain: 'acme',
      envelopeVersion: 1,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toBeInstanceOf(SecretRotationRequiredError);
    expect(err.name).toBe('SecretRotationRequiredError');
  });

  it('exposes subdomain + envelopeVersion as public readonly properties', () => {
    const err = new SecretRotationRequiredError({
      subdomain: 'tenantX',
      envelopeVersion: 1,
    });
    expect(err.subdomain).toBe('tenantX');
    expect(err.envelopeVersion).toBe(1);
  });

  it('default message mentions rotation + rotate-secret script', () => {
    const err = new SecretRotationRequiredError({
      subdomain: 'acme',
      envelopeVersion: 1,
    });
    expect(err.message).toMatch(/rotate/i);
    expect(err.message).toMatch(/scripts\/ai\/rotate-secret/);
  });

  it('does NOT leak ciphertext or iv substrings in message or stack', () => {
    const err = new SecretRotationRequiredError({
      subdomain: 'acme',
      envelopeVersion: 1,
    });
    expect(err.message).not.toMatch(/iv/i);
    expect(err.message).not.toMatch(/ciphertext/i);
    expect((err.stack ?? '')).not.toMatch(/ciphertext/i);
  });
});

describe('errors — BudgetExceededError', () => {
  it('extends AIError + Error and reports its own name', () => {
    const err = new BudgetExceededError({
      scope: 'workspace',
      scopeId: 'ws-1',
      currentSpend: 501,
      cap: 500,
      suggestionUrl: 'https://example.com/budgets',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect(err.name).toBe('BudgetExceededError');
  });

  it('exposes scope, scopeId, currentSpend, cap, suggestionUrl', () => {
    const err = new BudgetExceededError({
      scope: 'workspace',
      scopeId: 'ws-1',
      currentSpend: 501,
      cap: 500,
      suggestionUrl: 'https://example.com/budgets',
    });
    expect(err.scope).toBe('workspace');
    expect(err.scopeId).toBe('ws-1');
    expect(err.currentSpend).toBe(501);
    expect(err.cap).toBe(500);
    expect(err.suggestionUrl).toBe('https://example.com/budgets');
  });
});

describe('errors — NotYetImplementedError', () => {
  it('extends AIError + Error and reports its own name', () => {
    const err = new NotYetImplementedError({ phase: '1.3' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toBeInstanceOf(NotYetImplementedError);
    expect(err.name).toBe('NotYetImplementedError');
  });

  it('exposes phase and includes it in default message', () => {
    const err = new NotYetImplementedError({ phase: '1.3' });
    expect(err.phase).toBe('1.3');
    expect(err.message).toMatch(/1\.3/);
  });
});

describe('errors — ProviderRateLimitError', () => {
  it('extends AIError + Error and reports its own name', () => {
    const err = new ProviderRateLimitError({ providerKind: 'openai' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toBeInstanceOf(ProviderRateLimitError);
    expect(err.name).toBe('ProviderRateLimitError');
  });

  it('exposes providerKind and optional retryAfterMs', () => {
    const err = new ProviderRateLimitError({
      providerKind: 'anthropic',
      retryAfterMs: 1500,
    });
    expect(err.providerKind).toBe('anthropic');
    expect(err.retryAfterMs).toBe(1500);
  });

  it('handles missing retryAfterMs gracefully in message', () => {
    const err = new ProviderRateLimitError({ providerKind: 'openai' });
    expect(err.message).toMatch(/openai/);
  });
});
