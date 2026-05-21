/**
 * AES-256-GCM symmetric encryption for per-tenant secrets (provider API keys
 * in Phase 1.2, plus any other at-rest secret a later phase needs).
 *
 * - Key derivation: `scryptSync(ERXES_SECRET, subdomain, 32)` — the subdomain
 *   is the scrypt salt, so each tenant gets a distinct 256-bit key.
 * - IV: 12-byte (96-bit) nonce per NIST SP 800-38D for AES-GCM.
 * - Auth tag: 16-byte (128-bit).
 * - Envelope: base64-encoded JSON `{ version: 1, iv, ciphertext, authTag }`
 *   (versioned per PITFALLS §P14 Policy A so Phase 1.2's rotation script
 *   does not need a migration).
 *
 * Cross-subdomain decryption: subdomain B's derived key will not validate
 * the auth tag of a v1 envelope encrypted for subdomain A — the decipher
 * throws. This is the desired hard-tenant-isolation behavior.
 *
 * Length validation of `ERXES_SECRET` is OUT of scope here — that's
 * `ai_api/src/main.ts`'s responsibility per D-10/D-11. This module only
 * checks the variable is set so consumers can encrypt with a clear error
 * if the env is missing.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGO = 'aes-256-gcm' as const;
const IV_LENGTH = 12; // 96-bit nonce
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key
export const ENCRYPTION_ENVELOPE_VERSION = 1 as const;

export interface EncryptedEnvelope {
  version: typeof ENCRYPTION_ENVELOPE_VERSION;
  iv: string;
  ciphertext: string;
  authTag: string;
}

const deriveKey = (subdomain: string): Buffer => {
  const secret = process.env.ERXES_SECRET;
  if (!secret) {
    throw new Error(
      'ERXES_SECRET environment variable is not set. AI provider secrets cannot be encrypted/decrypted.',
    );
  }
  return scryptSync(secret, subdomain, KEY_LENGTH);
};

/**
 * Encrypt `plaintext` for the given `subdomain`. Returns a base64-encoded
 * JSON envelope of shape `{ version: 1, iv, ciphertext, authTag }`.
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

  const key = deriveKey(subdomain);
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
 * Decrypt a v1 envelope (base64 JSON) for the given `subdomain`. Throws on:
 *  - missing/garbled envelope
 *  - unsupported envelope version
 *  - auth-tag mismatch (wrong subdomain, wrong ERXES_SECRET, or tamper)
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

  const key = deriveKey(subdomain);
  const iv = Buffer.from(parsed.iv, 'base64');
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64');
  const authTag = Buffer.from(parsed.authTag, 'base64');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  // `decipher.final()` throws if the auth tag does not validate — this is
  // the cross-subdomain failure path we rely on.
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
};
