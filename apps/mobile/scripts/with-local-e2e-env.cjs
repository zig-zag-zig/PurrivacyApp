#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Defaults match historical e2e (emulator → host via 10.0.2.2).
// Override with PURRIVACY_E2E_* env vars to run alongside other Firebase emulators.
const backendPort = process.env.PURRIVACY_E2E_BACKEND_PORT || '5000';
const authHostPort = process.env.PURRIVACY_E2E_FIREBASE_AUTH_HOST || '127.0.0.1:9099';
const authPort = authHostPort.includes(':') ? authHostPort.split(':').pop() : authHostPort;

const defaults = {
  APP_ENV: 'e2e-test',
  NODE_ENV: 'development',
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || `http://10.0.2.2:${backendPort}/`,
  EXPO_PUBLIC_API_VERSION: 'v1',
  EXPO_PUBLIC_AUTH_EMAIL_DOMAIN: 'purrivacy.test',
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || `10.0.2.2:${authPort}`,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-purrivacy-e2e',
  EXPO_PUBLIC_SENTRY_DSN: '',
  EXPO_PUBLIC_SENTRY_ENABLED: 'false',
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0',
  SENTRY_DISABLE_AUTO_UPLOAD: 'true',
};

const env = { ...process.env };
for (const [key, value] of Object.entries(defaults)) {
  // Prefer explicit process.env for overrides that were already set before defaults.
  if (process.env[key] === undefined) {
    env[key] = value;
  }
}
env.EXPO_NO_DOTENV = '1';
env.CMAKE_BUILD_PARALLEL_LEVEL = env.CMAKE_BUILD_PARALLEL_LEVEL ?? '2';
// Ensure backend / reverse ports are visible to nested scripts.
env.PURRIVACY_E2E_BACKEND_PORT = backendPort;
env.PURRIVACY_E2E_FIREBASE_AUTH_HOST = authHostPort;
env.PURRIVACY_E2E_ADB_REVERSE_PORTS = process.env.PURRIVACY_E2E_ADB_REVERSE_PORTS
  || `${backendPort},${authPort}`;

const delegatedArgs = process.argv.slice(2);
const commandArgs = delegatedArgs[0] === '--' ? delegatedArgs.slice(1) : delegatedArgs;

if (commandArgs.length === 0) {
  console.error('[e2e-env] Missing command. Usage: node scripts/with-local-e2e-env.cjs -- <command>');
  process.exit(2);
}

console.log('[e2e-env] APP_ENV=e2e-test');
console.log(`[e2e-env] API=${env.EXPO_PUBLIC_API_BASE_URL} auth_emulator=${env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}`);
console.log(`[e2e-env] command=${commandArgs.join(' ')}`);

const child = spawn(commandArgs[0], commandArgs.slice(1), {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
