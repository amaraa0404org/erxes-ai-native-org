/**
 * Unit tests for `encryption.ts` — AES-256-GCM envelope round-trip,
 * cross-subdomain isolation, envelope shape, and Phase 1.2 multi-version
 * `ERXES_SECRET` rotation parsing (D-03 / PITFALLS §P14 Policy A).
 */
import {
  encryptSecret,
  decryptSecret,
  ENCRYPTION_ENVELOPE_VERSION,
} from '../encryption';
import { SecretRotationRequiredError } from '../errors';

describe('encryption — encryptSecret/decryptSecret', () => {
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.ERXES_SECRET;
    // 64-char hex (32 bytes) — Phase 1.1 does not enforce this length here,
    // but using a realistic value matches operational shape.
    process.env.ERXES_SECRET = 'a'.repeat(64);
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.ERXES_SECRET;
    } else {
      process.env.ERXES_SECRET = originalSecret;
    }
  });

  it('round-trips plaintext for the same subdomain', () => {
    const plaintext = 'my-secret-key-abc123';
    const ct = encryptSecret(plaintext, 'tenantA');
    const pt = decryptSecret(ct, 'tenantA');
    expect(pt).toBe(plaintext);
  });

  it('fails to decrypt a tenantA ciphertext when called with tenantB', () => {
    const ct = encryptSecret('cross-tenant-secret', 'tenantA');
    expect(() => decryptSecret(ct, 'tenantB')).toThrow();
  });

  it('produces an envelope of shape { version: 1, iv, ciphertext, authTag }', () => {
    const ct = encryptSecret('shape-check', 'tenantA');
    const decoded = Buffer.from(ct, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);

    expect(parsed.version).toBe(ENCRYPTION_ENVELOPE_VERSION);
    expect(parsed.version).toBe(1);
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.ciphertext).toBe('string');
    expect(typeof parsed.authTag).toBe('string');

    const keys = Object.keys(parsed).sort();
    expect(keys).toEqual(['authTag', 'ciphertext', 'iv', 'version']);

    // IV is 12 bytes → 16 chars base64 (`xxxx`-aligned).
    expect(Buffer.from(parsed.iv, 'base64').byteLength).toBe(12);
    // Auth tag is 16 bytes.
    expect(Buffer.from(parsed.authTag, 'base64').byteLength).toBe(16);
  });

  it('uses a fresh IV per encrypt — two ciphertexts of the same plaintext differ', () => {
    const a = encryptSecret('repeat-me', 'tenantA');
    const b = encryptSecret('repeat-me', 'tenantA');
    expect(a).not.toBe(b);
    // Sanity: both still decrypt to the same value.
    expect(decryptSecret(a, 'tenantA')).toBe('repeat-me');
    expect(decryptSecret(b, 'tenantA')).toBe('repeat-me');
  });

  it('throws a clear error when ERXES_SECRET is missing', () => {
    const saved = process.env.ERXES_SECRET;
    delete process.env.ERXES_SECRET;
    try {
      expect(() => encryptSecret('x', 'tenantA')).toThrow(/ERXES_SECRET/);
    } finally {
      process.env.ERXES_SECRET = saved;
    }
  });

  it('rejects an envelope with an unsupported version', () => {
    const badEnvelope = Buffer.from(
      JSON.stringify({
        version: 99,
        iv: Buffer.alloc(12).toString('base64'),
        ciphertext: Buffer.alloc(0).toString('base64'),
        authTag: Buffer.alloc(16).toString('base64'),
      }),
      'utf8',
    ).toString('base64');

    expect(() => decryptSecret(badEnvelope, 'tenantA')).toThrow(
      /unsupported envelope version/,
    );
  });
});

describe('encryption — multi-version ERXES_SECRET rotation (D-03 / P14 Policy A)', () => {
  const hexA = 'a'.repeat(64);
  const hexB = 'b'.repeat(64);
  const hexShort = 'c'.repeat(50); // 25 bytes — below the 32-byte floor
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.ERXES_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.ERXES_SECRET;
    } else {
      process.env.ERXES_SECRET = originalSecret;
    }
  });

  it('Test 3: forward multi-version path — encrypted with newest key decrypts under both newest-only and full list', () => {
    // Encrypt with full list (newest v2:hexA is used for encryption)
    process.env.ERXES_SECRET = `v2:${hexA},v1:${hexB}`;
    const envelope = encryptSecret('forward-secret', 'tenantA');

    // Decryption under full list succeeds.
    expect(decryptSecret(envelope, 'tenantA')).toBe('forward-secret');

    // Re-set to v2-only — same envelope still decrypts (proves v2 was used).
    process.env.ERXES_SECRET = `v2:${hexA}`;
    expect(decryptSecret(envelope, 'tenantA')).toBe('forward-secret');
  });

  it('Test 4: rotation fall-through — envelope encrypted by v1 decrypts under v2,v1 list (iterator falls through v2 to v1)', () => {
    // Encrypt with v1 only
    process.env.ERXES_SECRET = `v1:${hexB}`;
    const envelope = encryptSecret('rotated-secret', 'tenantA');

    // Re-set to v2,v1 — newest v2 fails auth tag, falls through to v1, success.
    process.env.ERXES_SECRET = `v2:${hexA},v1:${hexB}`;
    expect(decryptSecret(envelope, 'tenantA')).toBe('rotated-secret');
  });

  it('Test 5: exhausted versions throws SecretRotationRequiredError with subdomain + envelopeVersion', () => {
    // Encrypt with v1
    process.env.ERXES_SECRET = `v1:${hexB}`;
    const envelope = encryptSecret('orphaned-secret', 'tenantA');

    // Drop v1 — only v2 remains, which cannot decrypt the v1-encrypted envelope.
    process.env.ERXES_SECRET = `v2:${hexA}`;

    let caught: unknown = null;
    try {
      decryptSecret(envelope, 'tenantA');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(SecretRotationRequiredError);
    const err = caught as SecretRotationRequiredError;
    expect(err.name).toBe('SecretRotationRequiredError');
    expect(err.subdomain).toBe('tenantA');
    expect(err.envelopeVersion).toBe(1);
    expect(err.message).toMatch(/rotate/i);
    expect(err.message).toMatch(/scripts\/ai\/rotate-secret/);
  });

  it('Test 6: invalid ERXES_SECRET format — throws clear parse error, not a cipher error', () => {
    process.env.ERXES_SECRET = 'not-a-version';
    expect(() => encryptSecret('x', 'tenantA')).toThrow(
      /ERXES_SECRET must be a comma-separated list of/,
    );
  });

  it('Test 7: short-key entries skipped — v1 envelope decrypts when v2 entry is too short', () => {
    // Encrypt with v1 only
    process.env.ERXES_SECRET = `v1:${hexB}`;
    const envelope = encryptSecret('mixed-validity', 'tenantA');

    // v2 entry is too short — must be skipped; v1 must still decrypt.
    process.env.ERXES_SECRET = `v2:${hexShort},v1:${hexB}`;
    expect(decryptSecret(envelope, 'tenantA')).toBe('mixed-validity');
  });

  it('preserves bare-hex backward compat: ERXES_SECRET=<64-hex> treated as v1', () => {
    // Encrypt with bare hex.
    process.env.ERXES_SECRET = hexB;
    const envelope = encryptSecret('legacy-bare-hex', 'tenantA');

    // Same bare-hex decrypts.
    expect(decryptSecret(envelope, 'tenantA')).toBe('legacy-bare-hex');

    // Equivalent v1:hexB list decrypts the same envelope (proves the bare-hex
    // path derives the same key as v1:hexB).
    process.env.ERXES_SECRET = `v1:${hexB}`;
    expect(decryptSecret(envelope, 'tenantA')).toBe('legacy-bare-hex');
  });
});
