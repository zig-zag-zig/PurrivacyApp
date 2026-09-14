#!/usr/bin/env node

/**
 * E2E for file encryption/decryption, secure notes, and account lifecycle
 * (create + delete) against the locally-built backend + Firebase emulators on
 * an Android emulator. Reuses the existing run-local-maestro-e2e.cjs
 * bootstrap; adds a fixture-file push and a per-file SHA-256 so the file
 * roundtrip flow can assert byte-for-byte equality.
 *
 * Usage:
 *   node scripts/run-e2e-file-notes.cjs [--file <localPath>] [--device-path <devicePath>]
 *
 * Defaults: ../test-1mb.bin pushed to /sdcard/Download/test-1mb.bin.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const appRoot = path.resolve(__dirname, '..');

const getArg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

// The app generates a deterministic file in its own sandbox (byte[i] =
// (i*31+7) & 0xff) for the size preset the flow selects. We compute the
// expected SHA-256 here so the flow can assert the decrypted bytes match the
// source exactly. Generating in-app avoids Android scoped-storage restrictions
// on pushed fixtures.
const SIZE_PRESETS = {
  '256KB': 256 * 1024,
  '256KB1': 256 * 1024 + 1,
  '1MB': 1024 * 1024,
  '10MB': 10 * 1024 * 1024,
  '50MB': 50 * 1024 * 1024,
};
const sizeLabel = getArg('--size') || process.env.E2E_SIZE_LABEL || '1MB';
const sizeBytes = SIZE_PRESETS[sizeLabel];
if (!sizeBytes) {
  console.error(`[e2e-file-notes] unknown --size '${sizeLabel}'. Options: ${Object.keys(SIZE_PRESETS).join(', ')}`);
  process.exit(2);
}
const content = Buffer.alloc(sizeBytes);
for (let i = 0; i < sizeBytes; i += 1) content[i] = (i * 31 + 7) & 0xff;
const sha256 = crypto.createHash('sha256').update(content).digest('hex');
console.log(`[e2e-file-notes] fixture size=${sizeLabel} (${sizeBytes} bytes) sha256=${sha256}`);

// The shared fixture user is deterministic (seed-e2e-fixtures.cjs). Flows that
// log in via subflows/login-fixture.yaml need these as Maestro env vars.
const FIXTURE_USERNAME = 'e2e-shared';
const FIXTURE_PASSWORD = 'Purrivacy-e2e-password-123';

const flows = process.env.E2E_ONLY_FLOWS || [
  '.maestro/file-encrypt-decrypt-roundtrip.yaml',
  '.maestro/secure-notes-crud.yaml',
  '.maestro/create-and-delete-account.yaml',
].join(',');

// Route through run-local-android-e2e.cjs so the release APK is REBUILT and
// reinstalled before the flows run — otherwise the device runs a stale build
// without the current testIDs (file e2e hooks, security form ids, etc).
const result = spawnSync(
  process.execPath,
  ['scripts/run-local-android-e2e.cjs', '--flows', flows],
  {
    cwd: appRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_SIZE_LABEL: sizeLabel,
      E2E_FILE_SHA256: sha256,
      FIXTURE_USERNAME,
      FIXTURE_PASSWORD,
    },
  },
);

process.exit(result.status ?? 1);
