/**
 * AI module error hierarchy (Phase 1.2).
 *
 * Every named error class extends `AIError` so consumers can switch on a
 * single `instanceof AIError` to discriminate AI-domain failures from
 * generic `Error`. Each subclass also sets `this.name` to its own
 * constructor name so structured handlers / JSON serialization can route
 * on `err.name` without dragging the constructor reference in.
 *
 * IMPORTANT (T-01.2-01): Error messages and details NEVER contain
 * ciphertext, IV, or any portion of the user-supplied secret. Only opaque
 * scope identifiers (subdomain, scopeId, envelopeVersion) are surfaced.
 *
 * Subclasses ship in Phase 1.2 but are consumed across waves:
 *   - SecretRotationRequiredError → encryption.ts (Wave 1)
 *   - NotYetImplementedError      → provider adapters (Wave 2 — chat/embed stubs)
 *   - ProviderRateLimitError      → provider adapters (Wave 2 — 429 mapping)
 *   - BudgetExceededError         → budgets pre-check (Wave 3)
 */

export interface AIErrorInit {
  message: string;
  [detail: string]: unknown;
}

export class AIError extends Error {
  constructor(init: AIErrorInit) {
    super(init.message);
    this.name = new.target.name;

    // Attach every key from `init` (besides `message`) as an own readable
    // property on the instance. Stored via Object.defineProperty so the
    // declared subclass fields can be enumerated alongside these and the
    // shape is stable across JSON serialization.
    for (const key of Object.keys(init)) {
      if (key === 'message') continue;
      Object.defineProperty(this, key, {
        value: (init as Record<string, unknown>)[key],
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }

    // V8: restore correct stack trace pointing at the subclass constructor.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }
}

// ---------------------------------------------------------------------------
// SecretRotationRequiredError — encryption.ts throws this when every
// configured ERXES_SECRET version has been exhausted without producing a
// matching auth tag (D-03 / PITFALLS §P14 Policy A).
// ---------------------------------------------------------------------------
export interface SecretRotationRequiredErrorInit {
  subdomain: string;
  envelopeVersion: number;
  message?: string;
}

export class SecretRotationRequiredError extends AIError {
  public readonly subdomain!: string;
  public readonly envelopeVersion!: number;

  constructor(init: SecretRotationRequiredErrorInit) {
    const message =
      init.message ??
      `Failed to decrypt AI secret for subdomain '${init.subdomain}' — no configured ERXES_SECRET version produced a matching auth tag. The secret has likely rotated. Run \`pnpm tsx scripts/ai/rotate-secret.ts\` to re-encrypt every ai_providers row with the current ERXES_SECRET (see scripts/ai/README.md).`;
    super({
      message,
      subdomain: init.subdomain,
      envelopeVersion: init.envelopeVersion,
    });
  }
}

// ---------------------------------------------------------------------------
// BudgetExceededError — workspace/user budget pre-check refuses an
// invocation because the projected spend would exceed the cap (Wave 3).
// ---------------------------------------------------------------------------
export interface BudgetExceededErrorInit {
  scope: string;
  scopeId: string;
  currentSpend: number;
  cap: number;
  suggestionUrl: string;
  message?: string;
}

export class BudgetExceededError extends AIError {
  public readonly scope!: string;
  public readonly scopeId!: string;
  public readonly currentSpend!: number;
  public readonly cap!: number;
  public readonly suggestionUrl!: string;

  constructor(init: BudgetExceededErrorInit) {
    const message =
      init.message ??
      `AI budget exceeded for ${init.scope}:${init.scopeId} (spent ${init.currentSpend}¢ / cap ${init.cap}¢).`;
    super({
      message,
      scope: init.scope,
      scopeId: init.scopeId,
      currentSpend: init.currentSpend,
      cap: init.cap,
      suggestionUrl: init.suggestionUrl,
    });
  }
}

// ---------------------------------------------------------------------------
// NotYetImplementedError — Phase 1.2 provider adapters throw this from
// `chat()` and `embed()` until Phase 1.3 wires real implementations (D-05).
// ---------------------------------------------------------------------------
export interface NotYetImplementedErrorInit {
  phase: string;
  message?: string;
}

export class NotYetImplementedError extends AIError {
  public readonly phase!: string;

  constructor(init: NotYetImplementedErrorInit) {
    const message =
      init.message ?? `AI feature not yet implemented (lands in ${init.phase}).`;
    super({
      message,
      phase: init.phase,
    });
  }
}

// ---------------------------------------------------------------------------
// ProviderRateLimitError — vendor SDK returned 429. Carries the optional
// `retryAfterMs` so callers / retry middleware can back off (Wave 2).
// ---------------------------------------------------------------------------
export interface ProviderRateLimitErrorInit {
  providerKind: string;
  retryAfterMs?: number;
  message?: string;
}

export class ProviderRateLimitError extends AIError {
  public readonly providerKind!: string;
  public readonly retryAfterMs?: number;

  constructor(init: ProviderRateLimitErrorInit) {
    const message =
      init.message ??
      `Provider ${init.providerKind} rate-limited the request${
        typeof init.retryAfterMs === 'number'
          ? ` (retry after ${init.retryAfterMs}ms)`
          : ''
      }.`;
    const detail: Record<string, unknown> = {
      message,
      providerKind: init.providerKind,
    };
    if (typeof init.retryAfterMs === 'number') {
      detail.retryAfterMs = init.retryAfterMs;
    }
    super(detail as AIErrorInit);
  }
}
