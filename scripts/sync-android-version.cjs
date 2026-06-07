#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const appJsonPath = path.join(projectRoot, 'app.json');
const appConfigPath = path.join(projectRoot, 'app.config.js');
const androidBuildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');

function fail(message) {
  console.error(`[android-version] ${message}`);
  process.exit(1);
}

function readAppConfig() {
  try {
    return JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  } catch (error) {
    fail(`Failed to read app.json: ${error.message}`);
  }
}

function readExpoConfig(appConfig) {
  if (!fs.existsSync(appConfigPath)) {
    return appConfig.expo;
  }

  try {
    delete require.cache[require.resolve(appConfigPath)];
    const createConfig = require(appConfigPath);
    if (typeof createConfig === 'function') {
      return createConfig({ config: {} });
    }
  } catch (error) {
    fail(`Failed to read app.config.js: ${error.message}`);
  }

  return appConfig.expo;
}

function validateVersion(version) {
  if (typeof version !== 'string' || version.trim().length === 0) {
    fail('expo.version must be set in app.json');
  }

  const trimmed = version.trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed)) {
    fail(`expo.version must look like 1.0.0, got "${version}"`);
  }

  return trimmed;
}

function validateVersionCode(versionCode) {
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    fail('expo.android.versionCode must be a positive integer in app.json');
  }

  return versionCode;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    fail(`Could not find ${label} in android/app/build.gradle`);
  }

  return source.replace(pattern, replacement);
}

function resolveAppEnv() {
  return process.env.APP_ENV || process.env.NODE_ENV || 'development';
}

function getAndroidApplicationId(androidNamespace) {
  return resolveAppEnv() === 'e2e-test'
    ? `${androidNamespace}.dev`
    : androidNamespace;
}

const appConfig = readAppConfig();
const expoConfig = readExpoConfig(appConfig);
const versionName = validateVersion(appConfig.expo?.version);
const versionCode = validateVersionCode(appConfig.expo?.android?.versionCode);
const androidNamespace = expoConfig.android?.package || appConfig.expo?.android?.package;

if (typeof androidNamespace !== 'string' || androidNamespace.trim().length === 0) {
  fail('expo.android.package must be configured.');
}

const androidApplicationId = getAndroidApplicationId(androidNamespace);

if (!fs.existsSync(androidBuildGradlePath)) {
  fail('android/app/build.gradle does not exist. Run `npx expo prebuild --platform android` first.');
}

let buildGradle = fs.readFileSync(androidBuildGradlePath, 'utf8');
buildGradle = replaceRequired(
  buildGradle,
  /versionCode\s*(?:=\s*)?\d+/,
  `versionCode = ${versionCode}`,
  'versionCode',
);
buildGradle = replaceRequired(
  buildGradle,
  /versionName\s*(?:=\s*)?["'][^"']+["']/,
  `versionName = "${versionName}"`,
  'versionName',
);
buildGradle = replaceRequired(
  buildGradle,
  /namespace\s*=\s*["'][^"']+["']/,
  `namespace = '${androidNamespace}'`,
  'namespace',
);
buildGradle = replaceRequired(
  buildGradle,
  /applicationId\s*=\s*["'][^"']+["']/,
  `applicationId = '${androidApplicationId}'`,
  'applicationId',
);

fs.writeFileSync(androidBuildGradlePath, buildGradle, 'utf8');
console.log(`[android-version] Synced Android versionName=${versionName}, versionCode=${versionCode}, namespace=${androidNamespace}, applicationId=${androidApplicationId}`);
