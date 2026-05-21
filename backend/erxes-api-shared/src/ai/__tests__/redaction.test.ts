/**
 * Unit tests for `redaction.ts` — verifies all 5 provider key patterns
 * from PITFALLS §P1 are redacted, and a clean string passes through
 * unchanged. Also exercises the redactPii/rehydratePii public surface
 * (Phase 1.1 no-op wrappers).
 */
import {
  redactKey,
  redactPii,
  rehydratePii,
  REDACTED_PLACEHOLDER,
} from '../redaction';

describe('redaction — redactKey covers all 5 provider patterns', () => {
  it('redacts OpenAI sk- keys', () => {
    const key = 'sk-proj-1234567890abcdefghij';
    const input = `Authorization: Bearer ${key} failed`;
    const out = redactKey(input);
    expect(out).toBe(`Authorization: Bearer ${REDACTED_PLACEHOLDER} failed`);
    expect(out).not.toContain(key);
  });

  it('redacts Anthropic sk-ant- keys as a single Anthropic token (not a generic sk- partial)', () => {
    const key = 'sk-ant-api01-abcdefghijklmnopqrstuv';
    const input = `key=${key} done`;
    const out = redactKey(input);
    expect(out).toBe(`key=${REDACTED_PLACEHOLDER} done`);
    // Critical: the "ant-..." suffix must NOT be left visible by a generic
    // sk- match that ate only `sk-` and skipped the rest.
    expect(out).not.toContain('ant-');
    expect(out).not.toContain(key);
  });

  it('redacts Groq gsk_ keys', () => {
    const key = 'gsk_abcdefghijklmnopqrst';
    const input = `groq=${key}`;
    const out = redactKey(input);
    expect(out).toBe(`groq=${REDACTED_PLACEHOLDER}`);
    expect(out).not.toContain(key);
  });

  it('redacts Google AIza... keys', () => {
    const key = 'AIzaSyA1234567890abcdefghijklmnopqrstuv';
    const input = `google_key=${key} ok`;
    const out = redactKey(input);
    expect(out).toBe(`google_key=${REDACTED_PLACEHOLDER} ok`);
    expect(out).not.toContain(key);
  });

  it('redacts Azure-style 32-hex keys', () => {
    const key = 'abcdef0123456789abcdef0123456789';
    const input = `azure_key=${key} live`;
    const out = redactKey(input);
    expect(out).toBe(`azure_key=${REDACTED_PLACEHOLDER} live`);
    expect(out).not.toContain(key);
  });

  it('returns a string with no key patterns unchanged', () => {
    const input = 'Order #1234 — customer name Jane Doe, deal stage Qualified';
    expect(redactKey(input)).toBe(input);
  });

  it('redactKey is idempotent and tolerates non-string input', () => {
    const input = 'no secrets here';
    expect(redactKey(redactKey(input))).toBe(input);
    // The public type is `string`, but defensive code accepts non-strings
    // (returns them as-is) so logger middleware can call it on `unknown`.
    expect(redactKey(123 as unknown as string)).toBe(123);
  });
});

describe('redaction — redactPii / rehydratePii (Phase 1.1 no-op wrappers)', () => {
  it('redactPii returns {redacted, map} with the public type surface', () => {
    const result = redactPii('Hello Jane Doe, jane@example.com, 555-1234');
    expect(result).toHaveProperty('redacted');
    expect(result).toHaveProperty('map');
    expect(typeof result.redacted).toBe('string');
    expect(typeof result.map).toBe('object');
  });

  it('redactPii on non-string returns input untouched', () => {
    const out = redactPii(null as unknown as string);
    expect(out.redacted).toBeNull();
    expect(out.map).toEqual({});
  });

  it('rehydratePii returns the input when the map is empty', () => {
    expect(rehydratePii('hello world', {})).toBe('hello world');
  });

  it('rehydratePii substitutes placeholders from a non-empty map', () => {
    const map = { '<<NAME_1>>': 'Jane Doe' };
    expect(rehydratePii('Hello <<NAME_1>>, welcome', map)).toBe(
      'Hello Jane Doe, welcome',
    );
  });

  it('rehydratePii tolerates a non-string input', () => {
    expect(rehydratePii(undefined as unknown as string, {})).toBeUndefined();
  });
});
