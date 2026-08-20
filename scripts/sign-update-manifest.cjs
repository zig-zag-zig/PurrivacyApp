#!/usr/bin/env node
/**
 * Builds and signs the update manifest for a release APK (APP-SEC-002).
 *
 * Usage:
 *   node scripts/sign-update-manifest.cjs \
 *     --apk ./Purrivacy.apk \
 *     --tag v1.0.9 \
 *     --url https://github.com/<owner>/<repo>/releases/download/v1.0.9/Purrivacy.apk \
 *     [--asset-name Purrivacy.apk] [--version 1.0.9] [--key <private-key>] [--output update-manifest.json]
 *
 * The manifest contract (must match src/features/updates/services/updateManifest.ts):
 *   - JSON object with exactly the fields version, tagName, apkAssetName, apkUrl,
 *     apkSizeBytes, apkSha256, createdAt, plus "signature".
 *   - The signature is computed over the canonical serialization of the payload
 *     WITHOUT the signature field: a UTF-8 JSON object whose keys are sorted
 *     lexicographically (ASCII), no whitespace, apkSizeBytes as a JSON number.
 *   - Signature algorithm: ECDSA P-256 (SHA-256), signature encoded as hex DER
 *     (node crypto.sign('sha256', canonical, key)). The app verifies with
 *     createVerify('sha256') and a pinned SPKI public key.
 *
 * Upload the generated update-manifest.json as a release asset named
 * update-manifest.json next to the APK in the GitHub release.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_KEY_PATH = path.join(REPO_ROOT, 'scripts', 'release-signing', 'update-signing-key.pem');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = { key: DEFAULT_KEY_PATH, output: path.resolve(process.cwd(), 'update-manifest.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/sign-update-manifest.cjs --apk <apk> --tag <vX.Y.Z> --url <https apk url> [--asset-name <name>] [--version <ver>] [--key <private-key.pem>] [--output <out.json>]`);
      process.exit(0);
    }
    if (!['--apk', '--tag', '--url', '--asset-name', '--version', '--key', '--output'].includes(arg)) {
      fail(`unknown argument: ${arg}`);
    }
    if (!value) {
      fail(`missing value for ${arg}`);
    }
    values[arg.slice(2)] = value;
    i += 1;
  }
  return values;
}

function normalizeVersion(tagName) {
  return tagName.trim().replace(/^v/i, '').split('+')[0];
}

function canonicalizePayload(payload) {
  // Canonical form: sorted keys (ASCII), no whitespace. Must stay byte-identical
  // with canonicalizeManifestPayload in src/features/updates/services/updateManifest.ts.
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const apkPath = path.resolve(REPO_ROOT, args.apk);
  if (!args.apk || !fs.existsSync(apkPath)) {
    fail(`APK not found: ${apkPath} (pass --apk)`);
  }
  if (!args.tag || !/^v?\d+\.\d+\.\d+/.test(args.tag.trim())) {
    fail(`--tag must look like v1.0.9, got "${args.tag}"`);
  }
  if (!args.url || !/^https:\/\//i.test(args.url.trim())) {
    fail('--url must be an https:// URL of the APK release asset');
  }
  if (!fs.existsSync(args.key)) {
    fail(`signing key not found: ${args.key} — run node scripts/update-signing-keygen.cjs first`);
  }

  const privateKey = fs.readFileSync(args.key, 'utf8');
  const tagName = args.tag.trim();
  const apkAssetName = args['asset-name'] || path.basename(apkPath);
  const apkUrl = args.url.trim();
  const version = args.version ? args.version.trim() : normalizeVersion(tagName);
  const apkSizeBytes = fs.statSync(apkPath).size;
  const apkSha256 = await sha256File(apkPath);

  const payload = {
    version,
    tagName,
    apkAssetName,
    apkUrl,
    apkSizeBytes,
    apkSha256,
    createdAt: new Date().toISOString(),
  };

  const canonical = canonicalizePayload(payload);
  const signature = crypto.sign('sha256', Buffer.from(canonical, 'utf8'), privateKey).toString('hex');

  const manifest = { ...payload, signature };
  const outputPath = path.resolve(process.cwd(), args.output);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });

  console.log(`APK:          ${apkPath}`);
  console.log(`Size:         ${apkSizeBytes} bytes`);
  console.log(`SHA-256:      ${apkSha256}`);
  console.log(`Tag:          ${tagName}`);
  console.log(`Version:      ${version}`);
  console.log(`Signed with:  ${args.key}`);
  console.log(`Manifest:     ${outputPath}`);
  console.log('');
  console.log('Upload this file as the release asset "update-manifest.json" next to the APK.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
