#!/usr/bin/env node

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const allowedArgs = new Set(['--clean', '--dry-run', '--smoke']);
const defaultAvdName = 'PurrivacyPawifyE2E';

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    console.error(`[e2e] Unknown option: ${arg}`);
    console.error('[e2e] Usage: node scripts/run-local-android-e2e.cjs [--clean] [--smoke] [--dry-run]');
    process.exit(2);
  }
}

const clean = args.includes('--clean');
const dryRun = args.includes('--dry-run');
const smoke = args.includes('--smoke');

class CommandError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new CommandError(`[e2e] Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CommandError(`[e2e] ${command} exited with status ${result.status}`, result.status ?? 1);
  }
}

function runBestEffort(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: options.stdio ?? 'ignore',
    encoding: options.encoding,
  });
}

function runAdbBestEffort(deviceId, commandArgs, options = {}) {
  return runBestEffort('adb', ['-s', deviceId, ...commandArgs], options);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listConnectedEmulatorIds() {
  const result = runBestEffort('adb', ['devices'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    return [];
  }

  return String(result.stdout ?? '')
    .split('\n')
    .map(line => line.trim().match(/^(.+)\s+device(?:\s|$)/)?.[1]?.trim())
    .filter(device => device?.startsWith('emulator-'));
}

function getAndroidSdkRoot() {
  return process.env.ANDROID_HOME?.trim()
    || process.env.ANDROID_SDK_ROOT?.trim()
    || path.join(process.env.HOME ?? '', 'Android', 'Sdk');
}

function addAndroidPlatformToolsToPath() {
  const platformTools = path.join(getAndroidSdkRoot(), 'platform-tools');
  const adbBinary = path.join(platformTools, process.platform === 'win32' ? 'adb.exe' : 'adb');
  if (!fs.existsSync(adbBinary)) {
    return;
  }

  const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
  if (!pathEntries.includes(platformTools)) {
    process.env.PATH = [platformTools, ...pathEntries].filter(Boolean).join(path.delimiter);
  }
}

function getEmulatorBinary() {
  if (process.env.ANDROID_EMULATOR?.trim()) {
    return process.env.ANDROID_EMULATOR.trim();
  }

  const candidate = path.join(getAndroidSdkRoot(), 'emulator', 'emulator');
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  return process.platform === 'win32' ? 'emulator.exe' : 'emulator';
}

function listAvdNames(emulatorBinary) {
  const result = runBestEffort(emulatorBinary, ['-list-avds'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    throw new CommandError(`[e2e] Could not list Android emulators with ${emulatorBinary}`);
  }

  return String(result.stdout ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function resolveAvdName(emulatorBinary) {
  const requestedAvd = process.env.PURRIVACY_E2E_AVD?.trim() || defaultAvdName;
  const avds = listAvdNames(emulatorBinary);

  if (avds.includes(requestedAvd)) {
    return requestedAvd;
  }
  if (process.env.PURRIVACY_E2E_AVD?.trim()) {
    throw new CommandError(`[e2e] Android emulator AVD does not exist: ${requestedAvd}`);
  }
  if (avds.length > 0) {
    console.warn(`[e2e] Default AVD ${defaultAvdName} was not found; using ${avds[0]}`);
    return avds[0];
  }

  throw new CommandError('[e2e] No Android emulator AVDs are available.');
}

function waitForEmulatorDevice(timeoutMs = 120000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const deviceId = listConnectedEmulatorIds()[0];
    if (deviceId) {
      return deviceId;
    }
    sleep(1000);
  }

  throw new CommandError('[e2e] Timed out waiting for Android emulator to appear in adb devices.');
}

function waitForEmulatorBoot(deviceId, timeoutMs = 180000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const bootCompleted = runAdbBestEffort(deviceId, ['shell', 'getprop', 'sys.boot_completed'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });

    if (String(bootCompleted.stdout ?? '').trim() === '1') {
      runAdbBestEffort(deviceId, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
      runAdbBestEffort(deviceId, ['shell', 'wm', 'dismiss-keyguard']);
      return;
    }

    sleep(1000);
  }

  throw new CommandError(`[e2e] Timed out waiting for Android emulator to finish booting: ${deviceId}`);
}

function ensureEmulatorForE2E() {
  if (dryRun) {
    return null;
  }

  const requestedSerial = process.env.ANDROID_SERIAL?.trim();
  if (requestedSerial) {
    if (!requestedSerial.startsWith('emulator-')) {
      throw new CommandError(`[e2e] ANDROID_SERIAL must identify an Android emulator, got: ${requestedSerial}`);
    }
    waitForEmulatorBoot(requestedSerial);
    console.log(`[e2e] using requested Android emulator ${requestedSerial}`);
    return null;
  }

  const existingEmulator = listConnectedEmulatorIds()[0];
  if (existingEmulator) {
    process.env.ANDROID_SERIAL = existingEmulator;
    waitForEmulatorBoot(existingEmulator);
    console.log(`[e2e] using running Android emulator ${existingEmulator}`);
    return null;
  }

  const emulatorBinary = getEmulatorBinary();
  const avdName = resolveAvdName(emulatorBinary);
  const emulatorArgs = ['-avd', avdName, '-no-boot-anim', '-no-snapshot-save'];
  if (process.env.PURRIVACY_E2E_HEADLESS === 'true') {
    emulatorArgs.push('-no-window');
  }

  console.log(`[e2e] starting Android emulator ${avdName}`);
  const emulator = spawn(emulatorBinary, emulatorArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  emulator.on('error', (error) => {
    console.error(`[e2e] Failed to start Android emulator: ${error.message}`);
  });
  emulator.unref();

  let deviceId = null;
  try {
    deviceId = waitForEmulatorDevice();
    process.env.ANDROID_SERIAL = deviceId;
    waitForEmulatorBoot(deviceId);
    console.log(`[e2e] Android emulator ready: ${deviceId}`);
  } catch (error) {
    if (deviceId) {
      runAdbBestEffort(deviceId, ['emu', 'kill']);
    } else {
      emulator.kill('SIGTERM');
    }
    throw error;
  }

  return { deviceId };
}

function stopEmulatorForE2E(emulatorState) {
  if (!emulatorState || process.env.PURRIVACY_E2E_KEEP_EMULATOR === 'true') {
    return;
  }

  console.log(`[e2e] stopping Android emulator ${emulatorState.deviceId}`);
  runAdbBestEffort(emulatorState.deviceId, ['emu', 'kill']);
}

const buildArgs = [
  'scripts/with-local-e2e-env.cjs',
  '--',
  process.execPath,
  'scripts/android-local-build.cjs',
  'release',
  '--install',
];

if (clean) {
  buildArgs.push('--clean');
}
if (dryRun) {
  buildArgs.push('--dry-run');
}

const maestroArgs = ['scripts/run-local-maestro-e2e.cjs'];
if (smoke) {
  maestroArgs.push('--smoke');
}

let emulatorState = null;

try {
  addAndroidPlatformToolsToPath();
  emulatorState = ensureEmulatorForE2E();
  run(process.execPath, buildArgs);

  if (dryRun) {
    console.log('[e2e] dry run complete; skipping Maestro.');
  } else {
    run(process.execPath, maestroArgs);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode ?? 1;
} finally {
  stopEmulatorForE2E(emulatorState);
}
