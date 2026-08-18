import { Buffer } from 'buffer';
import crypto from 'react-native-quick-crypto';

/**
 * Release-signing public key pinned in the app (APP-SEC-002).
 *
 * SPKI DER, base64. The matching private key lives OUTSIDE the repository
 * (scripts/release-signing/, gitignored, mode 0600). Generate a fresh keypair
 * with `node scripts/update-signing-keygen.cjs` and re-pin the public key here
 * before every production release.
 *
 * DEV KEYPAIR — the release owner MUST regenerate and re-pin before production:
 * see README "Signed Android update manifests".
 */
export const UPDATE_SIGNING_PUBLIC_KEY_SPKI_DER =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/mq9Z8eDU8HNE4kCWGzWAErUK/ehjaE8LQOkDFK3LtBbygfoxjMlTWP47JP2YfoXOQmv3kmJDtldCK2s2dUmTg==';

const SIGNING_PUBLIC_KEY = Buffer.from(UPDATE_SIGNING_PUBLIC_KEY_SPKI_DER, 'base64');

/**
 * This module is the ONLY place that touches native crypto for update
 * verification. Under Vitest (node environment) `react-native-quick-crypto` is
 * mocked with `node:crypto`, whose createVerify/createHash APIs are compatible.
 *
 * Algorithm note: the manifest is signed with ECDSA P-256 + SHA-256 rather than
 * Ed25519 because react-native-quick-crypto 0.7.17 cannot verify Ed25519:
 * its node-style createVerify resolves the algorithm through
 * EVP_get_digestbyname (ed25519 is a key type, not a digest, so init() fails)
 * and its subtle Ed25519 cases are commented out. ECDSA P-256/SHA-256 is
 * supported by quick-crypto's native EVP verify path and by node:crypto, so
 * production and tests exercise the same construction.
 */

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Verifies an ECDSA P-256 (SHA-256) signature over `message`.
 *
 * @param message    the exact bytes that were signed (canonical manifest JSON, UTF-8)
 * @param signatureHex DER-encoded signature as hex
 * @param publicKeyDer SPKI DER public key; defaults to the pinned key
 * @returns true only if the signature is valid; never throws
 */
export function verifyReleaseSignature(
  message: Uint8Array,
  signatureHex: string,
  publicKeyDer: Uint8Array = SIGNING_PUBLIC_KEY,
): boolean {
  if (!HEX_PATTERN.test(signatureHex)) {
    return false;
  }

  try {
    const verifier = crypto.createVerify('sha256');
    verifier.update(message);
    return verifier.verify(
      { key: Buffer.from(publicKeyDer), format: 'der', type: 'spki' },
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}

export type Sha256Hasher = {
  update(chunk: Uint8Array): void;
  digestHex(): string;
};

/**
 * Streaming SHA-256 hasher for downloaded files. Uses quick-crypto's
 * createHash in the app (native, constant memory per chunk) and node:crypto's
 * createHash under Vitest.
 */
export function createSha256Hasher(): Sha256Hasher {
  const hash = crypto.createHash('sha256');
  return {
    update(chunk: Uint8Array): void {
      hash.update(chunk as unknown as ArrayBuffer);
    },
    digestHex(): string {
      return hash.digest('hex') as string;
    },
  };
}
