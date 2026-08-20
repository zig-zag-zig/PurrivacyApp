import { Buffer } from 'buffer';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// Run the app's update-signing crypto under node:crypto (same API surface as
// react-native-quick-crypto: createVerify/createHash). Signatures are produced
// with ephemeral test keypairs and verified through the module under test, so
// the full ECDSA P-256 path is exercised for real.
vi.mock('react-native-quick-crypto', () => import('node:crypto'));

// updateManifest -> updateVersion -> expo-constants -> react-native (Flow).
vi.mock('expo-constants', () => ({ default: {} }));

import {
  UpdateManifestError,
  canonicalizeManifestPayload,
  parseUpdateManifest,
  verifyUpdateManifestSignature,
} from './updateManifest';
import type { UpdateManifestErrorCode, UpdateManifestPayload } from './updateManifest';

const APK_SHA256 = 'a'.repeat(64);
const APK_URL = 'https://github.com/zig-zag-zig/PurrivacyApp/releases/download/v1.0.9/Purrivacy.apk';
const CREATED_AT = '2026-08-18T08:00:00.000Z';

function createPayload(overrides: Partial<UpdateManifestPayload> = {}): UpdateManifestPayload {
  return {
    version: '1.0.9',
    tagName: 'v1.0.9',
    apkAssetName: 'Purrivacy.apk',
    apkUrl: APK_URL,
    apkSizeBytes: 4096,
    apkSha256: APK_SHA256,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

const expectedCanonical = [
  '{',
  '"apkAssetName":"Purrivacy.apk",',
  `"apkSha256":"${APK_SHA256}",`,
  '"apkSizeBytes":4096,',
  `"apkUrl":"${APK_URL}",`,
  `"createdAt":"${CREATED_AT}",`,
  '"tagName":"v1.0.9",',
  '"version":"1.0.9"',
  '}',
].join('');

function createKeyPair() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
}

function signPayload(payload: UpdateManifestPayload, privateKey: crypto.KeyObject): string {
  // Signature is computed over the exact documented canonical serialization.
  return crypto.sign('sha256', Buffer.from(expectedCanonical, 'utf8'), privateKey).toString('hex');
}

function toRaw(payload: UpdateManifestPayload, signature: string): Record<string, unknown> {
  return { ...payload, signature };
}

function expectManifestError(
  fn: () => unknown,
  code: UpdateManifestErrorCode,
  message: RegExp,
): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UpdateManifestError);
  expect((caught as UpdateManifestError).code).toBe(code);
  expect((caught as UpdateManifestError).message).toMatch(message);
}

describe('updateManifest canonicalization', () => {
  it('serializes the payload with sorted keys and no whitespace (contract stability)', () => {
    // Deliberately unordered input: canonicalization must be order-independent.
    const unordered = {
      apkUrl: APK_URL,
      version: '1.0.9',
      apkSha256: APK_SHA256,
      createdAt: CREATED_AT,
      tagName: 'v1.0.9',
      apkAssetName: 'Purrivacy.apk',
      apkSizeBytes: 4096,
    };
    expect(canonicalizeManifestPayload(unordered)).toBe(expectedCanonical);
  });

  it('canonicalization matches the documented contract byte-for-byte', () => {
    const canonical = canonicalizeManifestPayload(createPayload());
    expect(canonical).toBe(expectedCanonical);
    expect(canonical).not.toContain('\n');
    expect(canonical).not.toContain('signature');
  });
});

describe('parseUpdateManifest', () => {
  it('accepts a valid signed manifest', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const raw = toRaw(payload, signPayload(payload, privateKey));

    const manifest = parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' }));

    expect(manifest).toMatchObject(payload);
    expect(manifest.signature).toBe(raw.signature);
  });

  it('accepts a manifest whose stored JSON has non-sorted keys (signature over canonical form)', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const raw = JSON.parse(JSON.stringify({
      signature: signPayload(payload, privateKey),
      createdAt: CREATED_AT,
      apkSizeBytes: 4096,
      tagName: 'v1.0.9',
      version: '1.0.9',
      apkUrl: APK_URL,
      apkSha256: APK_SHA256,
      apkAssetName: 'Purrivacy.apk',
    }));

    const manifest = parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' }));
    expect(manifest.tagName).toBe('v1.0.9');
  });

  it('rejects a tampered payload (bad signature)', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const raw = toRaw({ ...payload, apkSizeBytes: payload.apkSizeBytes + 1 }, signPayload(payload, privateKey));

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'bad-signature',
      /signature verification failed/,
    );
  });

  it('rejects a signature made with a different key', () => {
    const { publicKey } = createKeyPair();
    const other = createKeyPair();
    const payload = createPayload();
    const raw = toRaw(payload, signPayload(payload, other.privateKey));

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'bad-signature',
      /signature verification failed/,
    );
  });

  it('rejects manifests signed by a foreign key when no override is given (pinned key is enforced)', () => {
    const foreign = createKeyPair();
    const payload = createPayload();
    const raw = toRaw(payload, signPayload(payload, foreign.privateKey));

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9'),
      'bad-signature',
      /signature verification failed/,
    );
  });

  it('rejects a manifest without a signature field', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const raw = toRaw(payload, signPayload(payload, privateKey));
    delete raw.signature;

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'missing-field',
      /signature/,
    );
  });

  it('rejects a manifest missing a required payload field', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const raw = toRaw(payload, signPayload(payload, privateKey));
    delete raw.apkSha256;

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'missing-field',
      /apkSha256/,
    );
  });

  it('rejects unknown extra fields', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const raw = toRaw(payload, signPayload(payload, privateKey));
    raw.apkUrlExtra = 'https://evil.example/';

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'malformed',
      /unknown field/,
    );
  });

  it('rejects non-object manifests', () => {
    for (const raw of ['text', 42, null, ['array'], true]) {
      expectManifestError(() => parseUpdateManifest(raw), 'malformed', /JSON object/);
    }
  });

  it('rejects invalid apkSizeBytes values', () => {
    const { publicKey, privateKey } = createKeyPair();
    for (const bad of [0, -1, 1.5, '4096']) {
      const payload = createPayload({ apkSizeBytes: bad as number });
      const raw = toRaw(payload, signPayload(payload, privateKey));
      expectManifestError(
        () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
        'invalid-value',
        /apkSizeBytes/,
      );
    }
  });

  it('rejects invalid apkSha256 values (case-insensitive hex is normalized)', () => {
    const { publicKey, privateKey } = createKeyPair();
    for (const bad of ['abc', 'g'.repeat(64), 'a'.repeat(63)]) {
      const payload = createPayload({ apkSha256: bad });
      const raw = toRaw(payload, signPayload(payload, privateKey));
      expectManifestError(
        () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
        'invalid-value',
        /apkSha256/,
      );
    }

    // Empty string is treated as a missing field.
    const empty = toRaw(createPayload({ apkSha256: '' }), signPayload(createPayload(), privateKey));
    expectManifestError(
      () => parseUpdateManifest(empty, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'missing-field',
      /apkSha256/,
    );

    // Uppercase hex is accepted and normalized to lowercase.
    const upper = toRaw(createPayload({ apkSha256: 'A'.repeat(64) }), signPayload(createPayload(), privateKey));
    const manifest = parseUpdateManifest(upper, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' }));
    expect(manifest.apkSha256).toBe('a'.repeat(64));
  });

  it('rejects non-https and non-GitHub apkUrl values', () => {
    const { publicKey, privateKey } = createKeyPair();
    for (const bad of [
      'http://github.com/owner/repo/releases/download/v1.0.9/a.apk',
      'https://evil.example/a.apk',
      'not-a-url',
    ]) {
      const payload = createPayload({ apkUrl: bad });
      const raw = toRaw(payload, signPayload(payload, privateKey));
      expectManifestError(
        () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
        'invalid-value',
        /apkUrl/,
      );
    }
  });

  it('rejects invalid createdAt values', () => {
    const { publicKey, privateKey } = createKeyPair();
    for (const bad of ['yesterday', '2026-13-99T99:99:99.000Z']) {
      const payload = createPayload({ createdAt: bad });
      const raw = toRaw(payload, signPayload(payload, privateKey));
      expectManifestError(
        () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
        'invalid-value',
        /createdAt/,
      );
    }

    const empty = toRaw(createPayload({ createdAt: '' }), signPayload(createPayload(), privateKey));
    expectManifestError(
      () => parseUpdateManifest(empty, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'missing-field',
      /createdAt/,
    );
  });

  it('rejects a manifest whose tag does not match the release tag', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload({ tagName: 'v2.0.0', version: '2.0.0' });
    const raw = toRaw(payload, signPayload(payload, privateKey));

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'version-mismatch',
      /v2\.0\.0/,
    );
  });

  it('rejects a manifest whose version contradicts its own tag', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload({ version: '2.0.0' });
    const raw = toRaw(payload, signPayload(payload, privateKey));

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'version-mismatch',
      /2\.0\.0/,
    );
  });

  it('rejects non-hex signatures', () => {
    const { publicKey } = createKeyPair();
    const raw = toRaw(createPayload(), 'zzzz');

    expectManifestError(
      () => parseUpdateManifest(raw, 'v1.0.9', publicKey.export({ type: 'spki', format: 'der' })),
      'invalid-value',
      /signature/,
    );
  });
});

describe('verifyUpdateManifestSignature', () => {
  it('verifies an already-parsed valid manifest', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const manifest = parseUpdateManifest(
      toRaw(payload, signPayload(payload, privateKey)),
      'v1.0.9',
      publicKey.export({ type: 'spki', format: 'der' }),
    );

    expect(verifyUpdateManifestSignature(manifest, publicKey.export({ type: 'spki', format: 'der' }))).toBe(true);
  });

  it('rejects a tampered parsed manifest', () => {
    const { publicKey, privateKey } = createKeyPair();
    const payload = createPayload();
    const manifest = parseUpdateManifest(
      toRaw(payload, signPayload(payload, privateKey)),
      'v1.0.9',
      publicKey.export({ type: 'spki', format: 'der' }),
    );

    expect(verifyUpdateManifestSignature(
      { ...manifest, apkSha256: 'b'.repeat(64) },
      publicKey.export({ type: 'spki', format: 'der' }),
    )).toBe(false);
  });

  it('returns false (never throws) for garbage input', () => {
    expect(verifyUpdateManifestSignature({} as never)).toBe(false);
    expect(verifyUpdateManifestSignature({ version: 1 } as never)).toBe(false);
  });
});
