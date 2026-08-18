#!/usr/bin/env node
/**
 * Generates an ECDSA P-256 update-signing keypair for the in-app APK updater
 * (APP-SEC-002 signed update manifests).
 *
 * Usage:
 *   node scripts/update-signing-keygen.cjs [--key <output-path>]
 *
 * The private key is written (mode 0600) to scripts/release-signing/update-signing-key.pem
 * by default. That directory is gitignored; never commit the private key.
 *
 * After running this script, paste the printed base64 public key (SPKI DER) into
 * UPDATE_SIGNING_PUBLIC_KEY_SPKI_DER in src/features/updates/services/updateSigning.ts.
 *
 * SECURITY NOTE: the pinned key in the app is a DEV keypair. The release owner MUST
 * regenerate a fresh keypair and re-pin the new public key in the app before the
 * next production release (see README "Signed Android update manifests").
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

const args = process.argv.slice(2);
let keyPath = DEFAULT_KEY_PATH;

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--key' || args[i] === '--output') {
    const value = args[i + 1];
    if (!value) {
      fail(`missing value for ${args[i]}`);
    }
    keyPath = path.resolve(REPO_ROOT, value);
    i += 1;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node scripts/update-signing-keygen.cjs [--key <output-path>]');
    process.exit(0);
  } else {
    fail(`unknown argument: ${args[i]}`);
  }
}

if (fs.existsSync(keyPath)) {
  fail(`refusing to overwrite existing key: ${keyPath}`);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const publicBase64 = publicDer.toString('base64');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(keyPath, privatePem, { mode: 0o600 });
fs.chmodSync(keyPath, 0o600);
fs.chmodSync(path.dirname(keyPath), 0o700);

console.log(`Private key written to: ${keyPath} (mode 0600)`);
console.log('');
console.log('Public key (SPKI DER, base64) — pin this in updateSigning.ts:');
console.log('');
console.log(publicBase64);
console.log('');
console.log('Public key (PEM, for reference / external verification):');
console.log(publicPem.trim());
console.log('');
console.log('Next steps:');
console.log('  1. Paste the base64 key into UPDATE_SIGNING_PUBLIC_KEY_SPKI_DER in');
console.log('     src/features/updates/services/updateSigning.ts');
console.log('  2. Sign a release with: node scripts/sign-update-manifest.cjs --apk <apk> --tag <vX.Y.Z> --url <https apk url>');
console.log('  3. Upload update-manifest.json next to the APK in the GitHub release.');
console.log('');
console.log('SECURITY: regenerate a fresh keypair and re-pin it in the app before production releases.');
