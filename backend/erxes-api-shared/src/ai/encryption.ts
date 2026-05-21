/**
 * AES-256-GCM symmetric encryption for per-tenant secrets (provider API keys
 * in Phase 1.2, plus any other at-rest secret a later phase needs).
 *
 * - Key derivation: `scryptSync(ERXES_SECRET_ENTRY, subdomain, 32)` — the
 *   subdomain is the scrypt salt, so each tenant gets a distinct 256-bit key.
 *   In Phase 1.2 `ERXES_SECRET` MAY be a comma-separated versioned list
 *   (newest first), e.g. `v2:<hex>,v1:<hex>` (D-03 / PITFALLS §P14 Policy A).
 * - IV: 12-byte (96-bit) nonce per NIST SP 800-38D for AES-GCM.
 * - Auth tag: 16-byte (128-bit).
 * - Envelope: base64-encoded JSON `{ version: 1, iv, ciphertext, authTag }`
 *   (versioned per PITFALLS §P14 Policy A so a future envelope-format change
 *   can co-exist with v1 data via the existing `version` field).
 *
 * Multi-version decrypt cost: each call performs at most N scrypt + N
 * decipher attempts, where N = number of `vN:<hex>` entries (typical: 1
 * active version, plus 1 grace version during rotation = N ≤ 3). Scrypt
 * parameters from Phase 1.1 are unchanged.
 *
 * Cross-subdomain decryption: subdomain B's derived key will not validate
 * the auth tag of a v1 envelope encrypted for subdomain A — every iteration
 * throws and `decryptSecret` raises `SecretRotationRequiredError` (which
 * the caller can map to a clear admin-facing message). This is the desired
 * hard-tenant-isolation behavior.
 *
 * Length validation of `ERXES_SECRET` is OUT of scope here — that's
 * `ai_api/src/main.ts`'s responsibility per D-10/D-11. This module only
 * checks the variable is set and parses the version list at runtime; if
 * every entry is malformed it raises a clear format error.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';
import { SecretRotationRequiredError } from './errors';

const ALGO = 'aes-256-gcm' as const;
const IV_LENGTH = 12; // 96-bit nonce
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key
const MIN_HEX_CHARS = 64; // 32 bytes -> 64 hex chars (D-03b floor)
export const ENCRYPTION_ENVELOPE_VERSION = 1 as const;

export interface EncryptedEnvelope {
  version: typeof ENCRYPTION_ENVELOPE_VERSION;
  iv: string;
  ciphertext: string;
  authTag: string;
}

// Process-global Set of signatures we have already warn-logged. Idempotent
// (T-01.2-02): a misconfigured deployment must not flood logs with repeated
// key fragments on every decrypt call.
const __warnedShortKeys = new Set<string>();

interface ParsedSecretEntry {
  /** The vN version label (e.g. 2 for `v2:<hex>`). Bare-hex secrets default to 1. */
  version: number;
  /** The raw hex string (BEFORE scrypt) — used for key derivation. */
  hex: string;
}

/**
 * Parse `ERXES_SECRET` (or any equivalent raw secret string) into an ordered
 * list of `{ version, hex }` entries. Entries below the 32-byte hex floor are
 * skipped with a (warn-once) `console.warn`. Returned order matches input
 * order so callers iterate newest-first.
 *
 * Throws if no entry parses successfully.
 *
 * Exported for testability — runtime callers should use
 * `deriveKeysAllVersions(subdomain)` instead.
 */
export const parseSecretVersions = (
  rawSecret: string,
): ParsedSecretEntry[] => {
  const entries: ParsedSecretEntry[] = [];
  const parts = rawSecret.split(',').map((p) => p.trim()).filter((p) => p.length > 0);

  const versionedRe = /^v(\d+):([0-9a-fA-F]+)$/;
  const bareHexRe = /^[0-9a-fA-F]+$/;

  for (const part of parts) {
    const m = part.match(versionedRe);
    if (m) {
      const version = parseInt(m[1], 10);
      const hex = m[2];
      if (hex.length < MIN_HEX_CHARS) {
        const signature = `v${version}:len${hex.length}`;
        if (!__warnedShortKeys.has(signature)) {
          __warnedShortKeys.add(signature);
          // T-01.2-02: log version label + byte count only — never the key hex.
          // eslint-disable-next-line no-console
          console.warn(
            `[ai/encryption] Skipping ERXES_SECRET entry v${version}: hex is ${hex.length} chars (need >= ${MIN_HEX_CHARS}).`,
          );
        }
        continue;
      }
      entries.push({ version, hex });
      continue;
    }

    // Backwards compat: bare hex of acceptable length is treated as v1.
    if (bareHexRe.test(part) && part.length >= MIN_HEX_CHARS) {
      entries.push({ version: 1, hex: part });
      continue;
    }
    // Otherwise the entry is malformed — silently skip; if NO entry survives
    // we throw a clear format error below.
  }

  if (entries.length === 0) {
    throw new Error(
      'ERXES_SECRET must be a comma-separated list of `vN:<hex>` entries or a bare 32-byte hex string',
    );
  }

  return entries;
};

/**
 * Derive a 32-byte scrypt key for every configured ERXES_SECRET version,
 * scoped to `subdomain`. Returns keys in input order (newest first).
 *
 * Throws if ERXES_SECRET is missing or if no entry parses successfully.
 */
const deriveKeysAllVersions = (subdomain: string): Buffer[] => {
  const secret = process.env.ERXES_SECRET;
  if (!secret) {
    throw new Error(
      'ERXES_SECRET environment variable is not set. AI provider secrets cannot be encrypted/decrypted.',
    );
  }
  const entries = parseSecretVersions(secret);
  return entries.map((e) => scryptSync(e.hex, subdomain, KEY_LENGTH));
};

/**
 * Encrypt `plaintext` for the given `subdomain`. Returns a base64-encoded
 * JSON envelope of shape `{ version: 1, iv, ciphertext, authTag }`.
 *
 * Always uses the NEWEST (first) configured ERXES_SECRET version for new
 * envelopes — older versions only exist for rotation grace.
 */
export const encryptSecret = (
  plaintext: string,
  subdomain: string,
): string => {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptSecret: plaintext must be a string');
  }
  if (!subdomain) {
    throw new Error('encryptSecret: subdomain is required');
  }

  const keys = deriveKeysAllVersions(subdomain);
  // D-03: newest-first — keys[0] is the active key used for new envelopes.
  const key = keys[0];
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    version: ENCRYPTION_ENVELOPE_VERSION,
    iv: iv.toString('base64'),
    ciphertext: enc.toString('base64'),
    authTag: authTag.toString('base64'),
  };

  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
};

/**
 * Decrypt a v1 envelope (base64 JSON) for the given `subdomain`. Iterates
 * every configured ERXES_SECRET version (newest first) and returns the
 * plaintext on the first successful auth-tag verification.
 *
 * Throws on:
 *  - missing/garbled envelope
 *  - unsupported envelope `version` field (NOT a rotation problem —
 *    structural; preserves Phase 1.1 contract)
 *  - exhausted version list (every configured key failed) →
 *    `SecretRotationRequiredError` (D-03 / PROV-06)
 */
export const decryptSecret = (
  b64Envelope: string,
  subdomain: string,
): string => {
  if (!b64Envelope) {
    throw new Error('decryptSecret: envelope is empty');
  }
  if (!subdomain) {
    throw new Error('decryptSecret: subdomain is required');
  }

  let parsed: EncryptedEnvelope;
  try {
    const json = Buffer.from(b64Envelope, 'base64').toString('utf8');
    parsed = JSON.parse(json) as EncryptedEnvelope;
  } catch (_e) {
    throw new Error('decryptSecret: envelope is not valid base64 JSON');
  }

  if (parsed.version !== ENCRYPTION_ENVELOPE_VERSION) {
    throw new Error(
      `decryptSecret: unsupported envelope version ${String(parsed.version)} (expected ${ENCRYPTION_ENVELOPE_VERSION})`,
    );
  }
  if (!parsed.iv || !parsed.ciphertext || !parsed.authTag) {
    throw new Error('decryptSecret: envelope is missing required fields');
  }

  const iv = Buffer.from(parsed.iv, 'base64');
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64');
  const authTag = Buffer.from(parsed.authTag, 'base64');

  // Iterate newest-first; the first key whose `decipher.final()` does not
  // throw wins. T-01.2-01: if every key fails, we throw
  // SecretRotationRequiredError WITHOUT including any portion of the
  // ciphertext, IV, or attempted keys in the message.
  const keys = deriveKeysAllVersions(subdomain);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(authTag);
      const dec = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return dec.toString('utf8');
    } catch (_e) {
      // Auth-tag mismatch — try the next configured version. Do NOT leak
      // the underlying CipherError message into our public error path.
      continue;
    }
  }

  throw new SecretRotationRequiredError({
    subdomain,
    envelopeVersion: parsed.version,
  });
};
