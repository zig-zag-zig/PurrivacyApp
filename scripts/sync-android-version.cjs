#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const appJsonPath = path.join(projectRoot, 'app.json');
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

const appConfig = readAppConfig();
const versionName = validateVersion(appConfig.expo?.version);
const versionCode = validateVersionCode(appConfig.expo?.android?.versionCode);

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

fs.writeFileSync(androidBuildGradlePath, buildGradle, 'utf8');
console.log(`[android-version] Synced Android versionName=${versionName}, versionCode=${versionCode}`);
