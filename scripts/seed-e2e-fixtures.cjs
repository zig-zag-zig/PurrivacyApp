#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('node:crypto');

const FIXTURES_FILE = path.join(__dirname, '..', '.maestro', 'fixtures.json');
const SEED_FLOW = '.maestro/seed-fixture-users.yaml';
const SEED_MFA_FLOW = '.maestro/seed-mfa-user.yaml';
const RUN_MAESTRO = path.join(__dirname, 'run-maestro.cjs');

const MFA_USERNAME = 'e2e-mfa';
const MFA_PASSWORD = 'Purrivacy-e2e-password-123';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const BACKEND_PORT = Number(process.env.PORT || 5000);
const EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'purrivacy.test';

const api = async (pathname, options = {}) => {
  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};

// --- TOTP (RFC 6238) ---
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

async function enableMfaViaApi() {
  // Sign in to Firebase emulator (user was created by the UI seed flow).
  const signIn = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-e2e-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${MFA_USERNAME}@${EMAIL_DOMAIN}`,
      password: MFA_PASSWORD,
      returnSecureToken: true,
    }),
  });
  const signInBody = await signIn.json();
  if (!signInBody.idToken) {
    throw new Error(`[fixtures] firebase sign-in failed: ${JSON.stringify(signInBody)}`);
  }

  // Create a backend session (fresh authentication — nonce can be minted).
  const session = await api('/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${signInBody.idToken}` },
    body: JSON.stringify({ platform: 'e2e-seeder' }),
  });
  if (session.status >= 400) {
    throw new Error(`[fixtures] session create failed: ${session.status} ${JSON.stringify(session.body)}`);
  }
  const accessToken = session.body.accessToken;

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const nonceRes = await api('/auth/session/mfa-setup-nonce', {
    method: 'POST',
    headers: authHeaders,
    body: '{}',
  });
  if (nonceRes.status >= 400) {
    throw new Error(`[fixtures] nonce mint failed: ${nonceRes.status} ${JSON.stringify(nonceRes.body)}`);
  }

  const setupRes = await api('/mfa/setup', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ nonce: nonceRes.body.nonce }),
  });
  if (setupRes.status >= 400) {
    throw new Error(`[fixtures] mfa setup failed: ${setupRes.status} ${JSON.stringify(setupRes.body)}`);
  }

  const secret = setupRes.body.secret;
  const code = totp(secret);
  const enableRes = await api('/mfa/enable', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ mfaCode: code, mfaTrusted: true }),
  });
  if (enableRes.status >= 400) {
    throw new Error(`[fixtures] mfa enable failed: ${enableRes.status} ${JSON.stringify(enableRes.body)}`);
  }

  console.log(`[fixtures] MFA enabled for ${MFA_USERNAME} (secret ${secret.slice(0, 4)}…, code ${code})`);
}

async function main() {
  console.log('[fixtures] registering test user via Maestro...');
  const sharedResult = spawnSync(process.execPath, [RUN_MAESTRO, SEED_FLOW], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  if (sharedResult.status !== 0) {
    console.error('[fixtures] Maestro seeding failed (shared user)');
    process.exit(1);
  }

  console.log('[fixtures] registering MFA test user via Maestro...');
  const mfaResult = spawnSync(process.execPath, [RUN_MAESTRO, SEED_MFA_FLOW], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  if (mfaResult.status !== 0) {
    console.error('[fixtures] Maestro seeding failed (MFA user)');
    process.exit(1);
  }

  try {
    await enableMfaViaApi();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const fixtures = {
    shared: { username: 'e2e-shared', password: 'Purrivacy-e2e-password-123' },
    mfa: { username: MFA_USERNAME, password: MFA_PASSWORD },
  };
  fs.writeFileSync(FIXTURES_FILE, JSON.stringify(fixtures, null, 2));
  console.log('[fixtures] done');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
