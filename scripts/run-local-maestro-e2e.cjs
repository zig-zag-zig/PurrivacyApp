#!/usr/bin/env node

const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(appRoot, '..', 'Purrivacy');
const backendPort = Number(process.env.PURRIVACY_E2E_BACKEND_PORT || 5000);
const firebaseProject = process.env.PURRIVACY_E2E_FIREBASE_PROJECT || 'demo-purrivacy-e2e';
const firebaseAuthHost = process.env.PURRIVACY_E2E_FIREBASE_AUTH_HOST || '127.0.0.1:9099';
const firestoreHost = process.env.PURRIVACY_E2E_FIRESTORE_HOST || '127.0.0.1:8080';
const firebaseDatabaseHost = process.env.PURRIVACY_E2E_FIREBASE_DATABASE_HOST || '127.0.0.1:9000';
const insideEmulators = process.argv.includes('--inside-emulators');
const defaultMaestroTargets = [
  '.maestro/invalid-login.yaml',
  '.maestro/logged-in-happy-path.yaml',
  '.maestro/encrypt-decrypt-roundtrip.yaml',
  '.maestro/relogin-existing-user.yaml',
  '.maestro/smoke.yaml',
];

class CommandError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function getMaestroTargets() {
  const explicitFlow = getArgValue('--flow');
  if (explicitFlow) {
    return [explicitFlow];
  }

  return process.argv.includes('--smoke') ? ['.maestro/smoke.yaml'] : defaultMaestroTargets;
}

const maestroTargets = getMaestroTargets();

const backendEnv = {
  ...process.env,
  E2E_USERNAME: process.env.E2E_USERNAME || `purrivacye2e${Date.now().toString(36)}`,
  APP_ENV: 'e2e-test',
  NODE_ENV: 'development',
  DEBUG: '',
  PORT: String(backendPort),
  AUTH_EMAIL_DOMAIN: 'purrivacy.test',
  LOG_LEVEL: process.env.E2E_BACKEND_LOG_LEVEL || 'error',
  MFA_KEK: 'test-mfa-kek-with-enough-entropy-for-local-emulator-tests',
  SENTRY_ENABLED: 'false',
  FIREBASE_USE_EMULATOR: 'true',
  FIREBASE_PROJECT_ID: firebaseProject,
  GCLOUD_PROJECT: firebaseProject,
  FIREBASE_DATABASE_URL: `https://${firebaseProject}-default-rtdb.firebaseio.com`,
  FIREBASE_AUTH_EMULATOR_HOST: firebaseAuthHost,
  FIRESTORE_EMULATOR_HOST: firestoreHost,
  FIREBASE_DATABASE_EMULATOR_HOST: firebaseDatabaseHost,
};

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });

  if (result.error) {
    throw new CommandError(`[e2e] Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CommandError(`[e2e] ${command} exited with status ${result.status}`, result.status ?? 1);
  }
  return result;
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      request.on('error', retry);
      request.setTimeout(1000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 500);
    };

    attempt();
  });
}

function stopChild(child, label) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(killTimer);
      resolve();
    };

    const killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        console.warn(`[e2e] ${label} did not stop after SIGTERM; sending SIGKILL`);
        child.kill('SIGKILL');
      }
    }, 5000);

    child.once('exit', finish);
    console.log(`[e2e] stopping ${label}`);
    child.kill('SIGTERM');
  });
}

async function runInsideEmulators() {
  runSync('npm', ['run', 'build:unchecked'], { cwd: backendRoot, env: backendEnv });

  const backend = spawn(process.execPath, ['--enable-source-maps', 'lib/server.js'], {
    cwd: backendRoot,
    env: backendEnv,
    stdio: 'inherit',
  });

  const stopBackend = () => stopChild(backend, 'Purrivacy backend');
  const stopAndExit = (exitCode) => {
    stopBackend().finally(() => process.exit(exitCode));
  };
  const onSigint = () => stopAndExit(130);
  const onSigterm = () => stopAndExit(143);

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    await waitForUrl(`http://127.0.0.1:${backendPort}/v1/health`);
    runSync('node', ['scripts/run-maestro.cjs', ...maestroTargets], { cwd: appRoot, env: backendEnv });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    await stopBackend();
  }
}

function reportAndExit(error) {
  console.error(`[e2e] ${error.message}`);
  process.exit(error.exitCode ?? 1);
}

if (!insideEmulators) {
  const commandArgs = [process.execPath, __filename, '--inside-emulators'];
  if (process.argv.includes('--smoke')) {
    commandArgs.push('--smoke');
  }
  const explicitFlow = getArgValue('--flow');
  if (explicitFlow) {
    commandArgs.push('--flow', explicitFlow);
  }
  const command = commandArgs.map(arg => JSON.stringify(arg)).join(' ');

  try {
    runSync('npx', [
      'firebase',
      'emulators:exec',
      '--project',
      firebaseProject,
      '--only',
      'auth,firestore,database',
      command,
    ], {
      env: backendEnv,
    });
  } catch (error) {
    reportAndExit(error);
  }
} else {
  runInsideEmulators().catch(reportAndExit);
}
