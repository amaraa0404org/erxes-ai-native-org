/**
 * Unit tests for `encryption.ts` — AES-256-GCM envelope round-trip,
 * cross-subdomain isolation, and envelope shape.
 */
import {
  encryptSecret,
  decryptSecret,
  ENCRYPTION_ENVELOPE_VERSION,
} from '../encryption';

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
