#!/usr/bin/env node
/**
 * Runs the auxiliary (non-gate) Maestro flows against a live local stack.
 *
 * These flows exercise error paths and edge cases that are too slow, flaky,
 * or device-dependent for the canonical `npm run e2e` gate. Run them after a
 * large refactor, not on every commit.
 *
 * Prerequisites (see the README "local E2E" notes / run-local-maestro-e2e.cjs):
 *   - Firebase emulators on 127.0.0.1:9099 (auth), 8080 (firestore), 9000 (rtdb)
 *   - Backend on 127.0.0.1:5000 with the same emulator env (APP_ENV=e2e-test,
 *     FIREBASE_USE_EMULATOR=true, ...)
 *   - A connected emulator/device with the app installed and `adb reverse`
 *     tcp:5000 and tcp:9099 set up (run-maestro.cjs does this automatically)
 *   - Fixtures seeded: `node scripts/seed-e2e-fixtures.cjs` (creates e2e-shared,
 *     e2e-mfa with MFA enabled, and persists a fresh one-time recovery code)
 *
 * Usage:
 *   node scripts/run-auxiliary-e2e.cjs            # run the full auxiliary suite
 *   node scripts/run-auxiliary-e2e.cjs --flow X   # run a single flow
 *
 * Notes:
 *   - Each flow that creates an account uses a fresh random username.
 *   - mfa-login-recovery-code consumes the seeded one-time recovery code:
 *     re-seed before re-running it.
 *   - The emulator stack should be freshly started before seeding; re-seeding
 *     on a long-lived stack accumulates keys on e2e-shared (409 key quota).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUN_MAESTRO = path.join(__dirname, 'run-maestro.cjs');
const FIXTURES_FILE = path.join(ROOT, '.maestro', 'fixtures.json');

// bip39 ships with the app; used to generate a WRONG-but-valid recovery seed
// (BIP39 checksum-valid) for the recovery-wrong-seed-phrase flow.
const { generateMnemonic } = require('bip39');

const ALL_FLOWS = [
  'wrong-password-signin',
  'decrypt-wrong-passphrase',
  'import-invalid-armor',
  'recovery-wrong-seed-phrase',
  'signup-wrong-seed-verification',
  'signup-duplicate-username',
  'mfa-login-recovery-code',
  'passphrase-autofill-after-relaunch',
  'signout-clears-sensitive-state',
  'rapid-double-submit',
  'revoke-sessions-other-device',
];

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const BACKEND_PORT = Number(process.env.PORT || 5000);
const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'purrivacy.test';
const SHARED_USERNAME = 'e2e-shared';
const SHARED_PASSWORD = 'Purrivacy-e2e-password-123';

const freshUsername = () => `purrivacyaux${crypto.randomBytes(6).toString('hex')}`;

const fixtures = () => {
  if (!fs.existsSync(FIXTURES_FILE)) {
    console.error('[aux-e2e] fixtures.json missing — run scripts/seed-e2e-fixtures.cjs first');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf8'));
};

// --- TOTP (RFC 6238) — mirrors the seeder so the runner can mint a fresh
// recovery code without a UI TOTP oracle. ---
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  const cleaned = input.toUpperCase().replace(/=+$/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secretB32, timestampMs = Date.now()) {
  const counter = Math.floor(timestampMs / 30000);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secretB32);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}

/**
 * Mint a fresh single-use MFA recovery code.
 *
 * Recovery codes are consumed by the mfa-login-recovery-code flow, so without
 * this the flow could only pass once per seed — i.e. the suite was not
 * repeatable. Uses the persisted TOTP secret to satisfy sensitive-MFA
 * verification on the regenerate endpoint.
 */
async function regenerateMfaRecoveryCode({ username, password, secret }) {
  const idToken = await firebaseSignIn(`${username}@${EMAIL_DOMAIN}`, password);
  // The MFA-enabled user needs a code both to create the session and to pass
  // the sensitive-operation check on the regenerate endpoint.
  const accessToken = await createBackendSession(idToken, totp(secret));
  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/mfa/recovery-codes/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ mfaCode: totp(secret) }),
  });
  const body = await res.json().catch(() => null);
  const codes = body?.recoveryCodes;
  if (res.status >= 400 || !Array.isArray(codes) || codes.length === 0) {
    throw new Error(`recovery code regeneration failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return codes[0];
}

// --- REST helpers (mirror the seeder) ---
async function firebaseSignIn(email, password) {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-e2e-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json().catch(() => null);
  if (!body?.idToken) {
    throw new Error(`[aux-e2e] firebase sign-in failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.idToken;
}

async function createBackendSession(idToken, mfaCode) {
  const payload = { platform: 'e2e-aux-runner' };
  // Users with MFA enabled cannot create a session without a valid code.
  if (mfaCode) payload.mfaCode = mfaCode;
  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (res.status >= 400 || !body?.accessToken) {
    throw new Error(`[aux-e2e] backend session create failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.accessToken;
}

// The revoke-sessions flow needs a SECOND session that the device flow then
// revokes; afterwards the runner asserts that session is dead (401).
async function setupSecondSession() {
  const idToken = await firebaseSignIn(`${SHARED_USERNAME}@${EMAIL_DOMAIN}`, SHARED_PASSWORD);
  return createBackendSession(idToken);
}

async function assertSecondSessionRevoked(accessToken) {
  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/user/key-records`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status !== 401) {
    console.error(`[aux-e2e] revoke-sessions-other-device: second session NOT revoked (expected 401, got ${res.status})`);
    return false;
  }
  console.log('[aux-e2e] revoke-sessions-other-device: second session verified dead (401)');
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const flowIndex = args.indexOf('--flow');
  const requested = flowIndex !== -1 ? args[flowIndex + 1] : null;
  const flows = requested ? (ALL_FLOWS.includes(requested) ? [requested] : []) : ALL_FLOWS;

  if (flows.length === 0) {
    console.error(`[aux-e2e] unknown flow "${requested}". Available: ${ALL_FLOWS.join(', ')}`);
    process.exit(2);
  }

  const f = fixtures();
  let recoveryCode = f.mfa?.recoveryCode || '';
  if (!recoveryCode && flows.includes('mfa-login-recovery-code')) {
    console.error('[aux-e2e] no mfa.recoveryCode in fixtures.json — re-run scripts/seed-e2e-fixtures.cjs');
    process.exit(2);
  }

  const results = [];
  for (const flow of flows) {
    // Recovery codes are single-use, so mint a fresh one each run to keep the
    // suite repeatable (otherwise it only passes on a freshly seeded stack).
    if (flow === 'mfa-login-recovery-code' && f.mfa?.secret) {
      try {
        recoveryCode = await regenerateMfaRecoveryCode({
          username: f.mfa.username,
          password: f.mfa.password,
          secret: f.mfa.secret,
        });
        console.log('[aux-e2e] minted a fresh MFA recovery code');
      } catch (error) {
        console.error(`[aux-e2e] ${error.message}`);
        results.push({ flow, ok: false, reason: 'recovery code regeneration failed' });
        continue;
      }
    }

    const env = {
      ...process.env,
      E2E_USERNAME: freshUsername(),
      MFA_RECOVERY_CODE: recoveryCode,
    };

    if (flow === 'recovery-wrong-seed-phrase') {
      // A valid 24-word mnemonic that is NOT the user's seed: passes the
      // app's BIP39 checksum validation, fails server-side verification.
      env.WRONG_SEED_PHRASE = generateMnemonic(256);
      // The flow signs up with E2E_USERNAME + 'rec' suffix.
      env.RECOVERY_FLOW_USERNAME = env.E2E_USERNAME + 'rec';
    }

    let secondSessionToken = null;
    if (flow === 'revoke-sessions-other-device') {
      console.log('[aux-e2e] creating second session for revoke-sessions-other-device...');
      try {
        secondSessionToken = await setupSecondSession();
      } catch (error) {
        console.error(`[aux-e2e] ${error.message}`);
        results.push({ flow, ok: false, reason: 'second-session setup failed' });
        continue;
      }
    }

    console.log(`\n[aux-e2e] === ${flow} ===`);
    const run = spawnSync(process.execPath, [RUN_MAESTRO, `.maestro/${flow}.yaml`], {
      cwd: ROOT,
      env,
      stdio: 'inherit',
      timeout: 900_000,
    });
    let ok = run.status === 0;
    let extra = '';

    if (flow === 'revoke-sessions-other-device' && ok && secondSessionToken) {
      const revoked = await assertSecondSessionRevoked(secondSessionToken);
      if (!revoked) {
        ok = false;
        extra = ' (second session still alive)';
      }
    }

    if (flow === 'recovery-wrong-seed-phrase' && ok) {
      // The failed recovery must not have mutated the account: the ORIGINAL
      // password must still sign in (verified via Firebase, backend-authoritative).
      try {
        await firebaseSignIn(`${env.RECOVERY_FLOW_USERNAME}@${EMAIL_DOMAIN}`, SHARED_PASSWORD);
        console.log('[aux-e2e] recovery-wrong-seed-phrase: original password still valid');
      } catch (error) {
        ok = false;
        extra = ' (original password no longer signs in)'; 
        console.error(`[aux-e2e] ${error.message}`);
      }
    }

    results.push({ flow, ok, reason: run.status === 124 ? 'timeout' : (ok ? '' : `exit ${run.status}${extra}`) });
  }

  console.log('\n[aux-e2e] === results ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.flow}${r.reason ? ' — ' + r.reason : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[aux-e2e] Passed: ${results.length - failed}/${results.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('[aux-e2e]', error);
  process.exit(1);
});
