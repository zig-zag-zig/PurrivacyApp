import { Buffer } from 'buffer';

import { normalizeVersion } from './updateVersion';
import { verifyReleaseSignature } from './updateSigning';

/**
 * Signed update manifest contract (APP-SEC-002).
 *
 * A release that offers in-app APK installation MUST also carry a JSON asset
 * named `update-manifest.json` with exactly these fields:
 *
 *   {
 *     "version":      "1.0.9",          // normalized app version (no "v" prefix)
 *     "tagName":      "v1.0.9",         // exact GitHub release tag
 *     "apkAssetName": "Purrivacy.apk",  // exact APK release asset name
 *     "apkUrl":       "https://...",    // https URL of the APK release asset
 *     "apkSizeBytes": 123456,           // exact APK size in bytes (JSON number)
 *     "apkSha256":    "<64 hex>",       // SHA-256 of the APK, lowercase hex
 *     "createdAt":    "2026-08-18T...", // ISO-8601 UTC timestamp
 *     "signature":    "<hex>",          // ECDSA P-256/SHA-256 over the canonical payload
 *   }
 *
 * Canonical serialization (the bytes that are signed):
 *   - UTF-8 JSON object containing ONLY the seven payload fields above
 *     (signature excluded), keys sorted lexicographically by ASCII code point,
 *     no whitespace, apkSizeBytes as a plain JSON number.
 *   - Produced by `canonicalizeManifestPayload` here and by the release-side
 *     `scripts/sign-update-manifest.cjs` (byte-identical).
 *
 * Signature: ECDSA P-256 with SHA-256 over the canonical bytes, encoded as hex
 * DER. Verified against a public key pinned in updateSigning.ts. Any missing,
 * malformed, or tampered field fails verification and disables in-app install.
 */

export const UPDATE_MANIFEST_ASSET_NAME = 'update-manifest.json';

const PAYLOAD_KEYS = [
  'version',
  'tagName',
  'apkAssetName',
  'apkUrl',
  'apkSizeBytes',
  'apkSha256',
  'createdAt',
] as const;

export type UpdateManifestPayload = {
  version: string;
  tagName: string;
  apkAssetName: string;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
  createdAt: string;
};

export type UpdateManifest = UpdateManifestPayload & {
  signature: string;
};

export type UpdateManifestErrorCode =
  | 'malformed'
  | 'missing-field'
  | 'invalid-value'
  | 'version-mismatch'
  | 'bad-signature';

export class UpdateManifestError extends Error {
  readonly code: UpdateManifestErrorCode;

  constructor(code: UpdateManifestErrorCode, message: string) {
    super(message);
    this.name = 'UpdateManifestError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  raw: Record<string, unknown>,
  key: string,
): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new UpdateManifestError('missing-field', `Update manifest is missing field "${key}"`);
  }
  return value.trim();
}

function requireNumber(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new UpdateManifestError(
      'invalid-value',
      `Update manifest field "${key}" must be a positive integer`,
    );
  }
  return value;
}

function requireSha256(raw: Record<string, unknown>): string {
  const value = requireString(raw, 'apkSha256').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new UpdateManifestError('invalid-value', 'Update manifest field "apkSha256" must be 64 hex chars');
  }
  return value;
}

function requireHttpsGitHubUrl(raw: Record<string, unknown>): string {
  // NOTE (ops): sign the literal GitHub `browser_download_url`. The signature
  // covers the URL exactly as normalized here (new URL(...).toString()); a
  // differently-encoded but equivalent URL fails verification by design.
  const value = requireString(raw, 'apkUrl');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UpdateManifestError('invalid-value', 'Update manifest field "apkUrl" must be a valid URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new UpdateManifestError(
      'invalid-value',
      'Update manifest field "apkUrl" must be an https://github.com URL',
    );
  }
  return parsed.toString();
}

function requireCreatedAt(raw: Record<string, unknown>): string {
  const value = requireString(raw, 'createdAt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new UpdateManifestError('invalid-value', 'Update manifest field "createdAt" must be an ISO-8601 timestamp');
  }
  return value;
}

/**
 * Canonical serialization of the signed payload: sorted keys, no whitespace,
 * no signature field. Must stay byte-identical with
 * scripts/sign-update-manifest.cjs.
 */
export function canonicalizeManifestPayload(payload: UpdateManifestPayload): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    sorted[key] = (payload as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}

/**
 * Parses and fail-closed verifies a raw manifest (e.g. parsed release asset JSON).
 *
 * @param raw raw JSON value fetched from the release
 * @param expectedTagName when set, manifest.tagName must equal it and
 *        manifest.version must equal the normalized tag (version mismatch check)
 * @param publicKeyDer optional SPKI DER public key override (tests); defaults to
 *        the key pinned in updateSigning.ts
 * @throws UpdateManifestError on any missing/malformed field, version mismatch,
 *         or signature failure
 */
export function parseUpdateManifest(
  raw: unknown,
  expectedTagName: string | null = null,
  publicKeyDer?: Uint8Array,
): UpdateManifest {
  if (!isRecord(raw)) {
    throw new UpdateManifestError('malformed', 'Update manifest must be a JSON object');
  }

  for (const key of Object.keys(raw)) {
    if (!(PAYLOAD_KEYS as readonly string[]).includes(key) && key !== 'signature') {
      throw new UpdateManifestError('malformed', `Update manifest contains unknown field "${key}"`);
    }
  }

  const payload: UpdateManifestPayload = {
    version: requireString(raw, 'version'),
    tagName: requireString(raw, 'tagName'),
    apkAssetName: requireString(raw, 'apkAssetName'),
    apkUrl: requireHttpsGitHubUrl(raw),
    apkSizeBytes: requireNumber(raw, 'apkSizeBytes'),
    apkSha256: requireSha256(raw),
    createdAt: requireCreatedAt(raw),
  };

  const signature = requireString(raw, 'signature');
  if (!/^[0-9a-fA-F]{1,1024}$/.test(signature)) {
    throw new UpdateManifestError('invalid-value', 'Update manifest field "signature" must be hex');
  }

  if (expectedTagName !== null && payload.tagName !== expectedTagName) {
    throw new UpdateManifestError(
      'version-mismatch',
      `Update manifest tag "${payload.tagName}" does not match release tag "${expectedTagName}"`,
    );
  }

  if (payload.version !== normalizeVersion(payload.tagName)) {
    throw new UpdateManifestError(
      'version-mismatch',
      `Update manifest version "${payload.version}" does not match tag "${payload.tagName}"`,
    );
  }

  const canonical = Buffer.from(canonicalizeManifestPayload(payload), 'utf8');
  if (!verifyReleaseSignature(canonical, signature, publicKeyDer)) {
    throw new UpdateManifestError('bad-signature', 'Update manifest signature verification failed');
  }

  return { ...payload, signature };
}

/**
 * Re-verifies the signature of an already-parsed manifest (used again right
 * before installation, defense in depth).
 */
export function verifyUpdateManifestSignature(
  manifest: UpdateManifest,
  publicKeyDer?: Uint8Array,
): boolean {
  try {
    const { signature, ...payload } = manifest;
    const canonical = Buffer.from(canonicalizeManifestPayload(payload), 'utf8');
    return verifyReleaseSignature(canonical, signature, publicKeyDer);
  } catch {
    return false;
  }
}
