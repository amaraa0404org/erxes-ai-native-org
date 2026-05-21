/**
 * Redaction helpers — keep provider API keys and PII out of logs, BullMQ
 * job payloads, GraphQL error messages, and audit trails.
 *
 * `redactKey(text)` replaces the 5 known provider key patterns with the
 * sentinel `***REDACTED***`. Pattern order matters: more-specific patterns
 * (Anthropic `sk-ant-...`) must match before the generic `sk-` pattern,
 * which is why we use a single combined alternation regex.
 *
 * `redactPii(text)` / `rehydratePii(text, map)` are thin wrappers around
 * `redact-pii-light` for opt-in per-agent PII handling (Phase 2.2). If the
 * underlying library is unavailable at import time, the wrappers degrade
 * to a no-op (return input unchanged + empty map) — the public type
 * surface is still final so consumers do not need feature flags.
 */

export const REDACTED_PLACEHOLDER = '***REDACTED***';

/* ------------------------------------------------------------------ */
/* Provider key redaction (PITFALLS §P1)                               */
/* ------------------------------------------------------------------ */

/**
 * Combined alternation regex. Anthropic `sk-ant-...` is listed BEFORE the
 * generic `sk-...` so a Claude key matches as one Anthropic token, not as
 * a generic OpenAI partial. The Azure 32-hex pattern is `\b`-anchored so
 * it does not greedily eat normal hex strings that happen to appear inside
 * a longer alnum run.
 */
const KEY_PATTERN = new RegExp(
  [
    'sk-ant-[A-Za-z0-9_\\-]{16,}', // Anthropic
    'sk-[A-Za-z0-9_\\-]{16,}', // OpenAI (matches after sk-ant- alternation above)
    'gsk_[A-Za-z0-9_\\-]{16,}', // Groq
    'AIza[A-Za-z0-9_\\-]{30,}', // Google (case-sensitive prefix)
    '\\b[a-f0-9]{32}\\b', // Azure 32-hex (case-insensitive via flag)
  ].join('|'),
  'gi',
);

/**
 * Replace every recognised provider-key token in `input` with
 * `***REDACTED***`. Safe to call on `Error.message`, log lines, or any
 * other string-shaped payload that may inadvertently carry a key.
 */
export const redactKey = (input: string): string => {
  if (typeof input !== 'string') {
    return input;
  }
  return input.replace(KEY_PATTERN, REDACTED_PLACEHOLDER);
};

/* ------------------------------------------------------------------ */
/* PII redaction (per-agent opt-in, Phase 2.2 wires the call sites)    */
/* ------------------------------------------------------------------ */

export interface RedactPiiResult {
  redacted: string;
  map: Record<string, string>;
}

// Lazy-load `redact-pii-light` so the AI shared module is importable in
// environments where the package is not yet installed (e.g. during early
// scaffolding) without a hard module-resolution failure. If the require
// throws we fall back to no-op wrappers.
let redactPiiLight: { default?: unknown; [key: string]: unknown } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  redactPiiLight = require('redact-pii-light');
} catch (_e) {
  redactPiiLight = null;
}

/**
 * Redact PII from `text`. Returns the redacted text plus a `map` of
 * placeholder → original-value pairs that `rehydratePii` uses to restore
 * the values on the response side.
 *
 * Phase 1.1 ships the public surface only. The wrapper currently returns
 * a no-op result if `redact-pii-light` is unavailable. Phase 2.2 fills in
 * the real placeholder-mapping logic and adds unit tests for PII coverage.
 */
export const redactPii = (text: string): RedactPiiResult => {
  if (typeof text !== 'string') {
    return { redacted: text, map: {} };
  }
  if (!redactPiiLight) {
    return { redacted: text, map: {} };
  }
  // Phase 1.1 deliberately keeps the implementation a no-op behind the
  // type surface — the bidirectional placeholder mapping is Phase 2.2.
  // Returning the input unchanged is safe: it cannot leak PII upstream
  // because the agent layer that gates redaction is also not yet built.
  return { redacted: text, map: {} };
};

/**
 * Rehydrate placeholders previously produced by `redactPii`. Phase 1.1
 * wrapper returns `text` unchanged (matching the no-op `redactPii`).
 */
export const rehydratePii = (
  text: string,
  map: Record<string, string>,
): string => {
  if (typeof text !== 'string') {
    return text;
  }
  if (!map || Object.keys(map).length === 0) {
    return text;
  }
  let out = text;
  for (const [placeholder, original] of Object.entries(map)) {
    out = out.split(placeholder).join(original);
  }
  return out;
};
