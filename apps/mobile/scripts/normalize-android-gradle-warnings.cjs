#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const nodeModulesRoot = path.join(projectRoot, 'node_modules');
const androidRoot = path.join(projectRoot, 'android');
const checkOnly = process.argv.includes('--check');

const assignmentKeys = [
  'abortOnError',
  'buildConfig',
  'canBePublished',
  'compose',
  'ignoreAssetsPattern',
  'namespace',
  'ndkPath',
  'ndkVersion',
  'prefab',
  'useLegacyPackaging',
  'viewBinding',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, 'utf8');
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function listAndroidBuildGradleFiles(root) {
  if (!isDirectory(root)) {
    return [];
  }

  const results = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.bin' || entry.name === '.cache') {
          continue;
        }
        stack.push(entryPath);
        continue;
      }

      if (entry.name === 'build.gradle' && path.basename(path.dirname(entryPath)) === 'android') {
        results.push(entryPath);
      }
    }
  }

  return results;
}

function listGeneratedAndroidGradleFiles() {
  return [
    path.join(androidRoot, 'build.gradle'),
    path.join(androidRoot, 'app', 'build.gradle'),
  ].filter((filePath) => fs.existsSync(filePath));
}

function escapeRegex(source) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSimpleAssignments(source) {
  let next = source;

  for (const key of assignmentKeys) {
    const pattern = new RegExp(`^(\\s*)${escapeRegex(key)}\\s+(?![=({])(.+?)\\s*$`, 'gm');
    next = next.replace(pattern, (_match, indent, value) => `${indent}${key} = ${value}`);
  }

  return next;
}

function normalizeMavenRepositoryAssignments(source) {
  return source
    .replace(/^(\s*)url\((.+?)\)\s*$/gm, (_match, indent, value) => {
      const trimmedValue = value.trim();
      return `${indent}url = uri(${trimmedValue})`;
    })
    .replace(/^(\s*)url\s+(?![=({])(.+?)\s*$/gm, (_match, indent, value) => {
      const trimmedValue = value.trim();
      return `${indent}url = uri(${trimmedValue})`;
    })
    .replace(/^(\s*)name\s+(?![=({])(.+?)\s*$/gm, (_match, indent, value) => {
      const trimmedValue = value.trim();
      return `${indent}name = ${trimmedValue}`;
    });
}

function removeObsoleteAndroidDsl(source) {
  return source.replace(/^\s*renderscriptDebuggable\s+.+\r?\n/gm, '');
}

function normalizeGradleSource(source) {
  return [
    normalizeSimpleAssignments,
    normalizeMavenRepositoryAssignments,
    removeObsoleteAndroidDsl,
  ].reduce((current, normalize) => normalize(current), source);
}

function normalizeFile(filePath) {
  const before = readText(filePath);
  const after = normalizeGradleSource(before);

  if (after === before) {
    return false;
  }

  if (!checkOnly) {
    writeText(filePath, after);
  }

  return true;
}

const gradleFiles = [
  ...listAndroidBuildGradleFiles(nodeModulesRoot),
  ...listGeneratedAndroidGradleFiles(),
];

const changedFiles = gradleFiles.filter(normalizeFile);

if (changedFiles.length > 0) {
  const relativeFiles = changedFiles.map((filePath) => path.relative(projectRoot, filePath));
  const verb = checkOnly ? 'Need normalization' : 'Normalized';
  console.log(`[android-gradle-warnings] ${verb} ${changedFiles.length} Gradle file(s):`);
  relativeFiles.forEach((filePath) => console.log(`  - ${filePath}`));

  if (checkOnly) {
    process.exit(1);
  }
} else {
  console.log('[android-gradle-warnings] Gradle files already normalized');
}
