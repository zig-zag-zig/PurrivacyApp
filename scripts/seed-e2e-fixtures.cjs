#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FIXTURES_FILE = path.join(__dirname, '..', '.maestro', 'fixtures.json');
const SEED_FLOW = '.maestro/seed-fixture-users.yaml';
const RUN_MAESTRO = path.join(__dirname, 'run-maestro.cjs');

console.log('[fixtures] registering test user via Maestro...');
const result = spawnSync(process.execPath, [RUN_MAESTRO, SEED_FLOW], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

if (result.status !== 0) {
  console.error('[fixtures] Maestro seeding failed');
  process.exit(1);
}

const fixtures = {
  shared: { username: 'e2e-shared', password: 'Purrivacy-e2e-password-123' },
};
fs.writeFileSync(FIXTURES_FILE, JSON.stringify(fixtures, null, 2));
console.log('[fixtures] done');
