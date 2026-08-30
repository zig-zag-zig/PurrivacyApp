#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const rootBuildGradlePath = path.join(androidRoot, 'build.gradle');
const appBuildGradlePath = path.join(androidRoot, 'app', 'build.gradle');
const gradlePropertiesPath = path.join(androidRoot, 'gradle.properties');
const androidManifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');

function fail(message) {
  console.error(`[android-gradle] ${message}`);
  process.exit(1);
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`${path.relative(projectRoot, filePath)} does not exist. Run \`npx expo prebuild --platform android\` first.`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, before, after) {
  if (after === before) {
    return false;
  }

  fs.writeFileSync(filePath, after, 'utf8');
  return true;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    fail(`Could not find ${label}`);
  }

  return source.replace(pattern, replacement);
}

function removeGradleProperties(source, keys) {
  return keys.reduce((next, key) => {
    const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*\\n?`, 'gm');
    return next.replace(pattern, '');
  }, source).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function configureGradleProperties() {
  const before = readRequired(gradlePropertiesPath);
  let source = before;

  source = removeGradleProperties(source, [
    'org.gradle.jvmargs',
    'kotlin.daemon.jvmargs',
    'org.gradle.parallel',
    'org.gradle.workers.max',
  ]);

  return writeIfChanged(gradlePropertiesPath, before, source);
}

function configureRootBuildGradle() {
  const before = readRequired(rootBuildGradlePath);
  let source = before;

  source = source.replace(/url\(reactNativeAndroidDir\)/g, 'url = uri(reactNativeAndroidDir)');
  source = source.replace(/maven\s*\{\s*url\s+['"]https:\/\/www\.jitpack\.io['"]\s*\}/g, "maven { url = uri('https://www.jitpack.io') }");

  return writeIfChanged(rootBuildGradlePath, before, source);
}

function ensureImports(source) {
  const imports = ['import groovy.json.JsonSlurper', 'import java.nio.file.Paths'];
  const missingImports = imports.filter((line) => !source.includes(line));

  if (missingImports.length === 0) {
    return source;
  }

  return replaceRequired(
    source,
    /(apply plugin: "com\.facebook\.react"\n)/,
    `$1\n${missingImports.join('\n')}\n`,
    'React Gradle plugin line',
  );
}

function ensureCredentialsBlock(source) {
  if (source.includes('def androidCredentialsFile = rootProject.file("../credentials.json")')) {
    return source;
  }

  const credentialsBlock = `
def androidCredentialsFile = rootProject.file("../credentials.json")
def androidKeystoreCredentials = null
if (androidCredentialsFile.exists()) {
    def credentialsJson = new JsonSlurper().parse(androidCredentialsFile)
    androidKeystoreCredentials = credentialsJson?.android?.keystore
}
`;

  return replaceRequired(
    source,
    /(def projectRoot = rootDir\.getAbsoluteFile\(\)\.getParentFile\(\)\.getAbsolutePath\(\)\n)/,
    `$1${credentialsBlock}`,
    'projectRoot definition',
  );
}

function normalizeAndroidAssignments(source) {
  return source
    .replace(/ndkVersion\s+rootProject\.ext\.ndkVersion/g, 'ndkVersion = rootProject.ext.ndkVersion')
    .replace(/buildToolsVersion\s+rootProject\.ext\.buildToolsVersion/g, 'buildToolsVersion = rootProject.ext.buildToolsVersion')
    .replace(/compileSdk\s+rootProject\.ext\.compileSdkVersion/g, 'compileSdk = rootProject.ext.compileSdkVersion')
    .replace(/namespace\s+['"]([^'"]+)['"]/g, "namespace = '$1'")
    .replace(/applicationId\s+['"]([^'"]+)['"]/g, "applicationId = '$1'")
    .replace(/minSdkVersion\s+rootProject\.ext\.minSdkVersion/g, 'minSdk = rootProject.ext.minSdkVersion')
    .replace(/targetSdkVersion\s+rootProject\.ext\.targetSdkVersion/g, 'targetSdk = rootProject.ext.targetSdkVersion')
    .replace(/versionCode\s*(?:=\s*)?(\d+)/g, 'versionCode = $1')
    .replace(/versionName\s*(?:=\s*)?["']([^"']+)["']/g, 'versionName = "$1"')
    .replace(/useLegacyPackaging\s+enableLegacyPackaging\.toBoolean\(\)/g, 'useLegacyPackaging = enableLegacyPackaging.toBoolean()')
    .replace(/useLegacyPackaging\s+\((findProperty\('expo\.useLegacyPackaging'\)\?\.toBoolean\(\) \?: false)\)/g, 'useLegacyPackaging = ($1)')
    .replace(/ignoreAssetsPattern\s+['"]([^'"]+)['"]/g, "ignoreAssetsPattern = '$1'");
}

function configureAppBuildGradle() {
  const before = readRequired(appBuildGradlePath);
  let source = before;
  const debugApplicationIdSuffix = process.env.EXPO_ANDROID_DEBUG_APPLICATION_ID_SUFFIX?.trim();
  const debugVersionNameSuffix = process.env.EXPO_ANDROID_DEBUG_VERSION_NAME_SUFFIX?.trim();
  const debugVariantLines = [
    debugApplicationIdSuffix ? `            applicationIdSuffix = "${debugApplicationIdSuffix}"` : null,
    debugVersionNameSuffix ? `            versionNameSuffix = "${debugVersionNameSuffix}"` : null,
  ].filter(Boolean).join('\n');

  source = ensureImports(source);
  source = ensureCredentialsBlock(source);
  source = normalizeAndroidAssignments(source);

  const signingConfigs = `    signingConfigs {
        debug {
            storeFile = file('debug.keystore')
            storePassword = 'android'
            keyAlias = 'androiddebugkey'
            keyPassword = 'android'
        }
        release {
            if (androidKeystoreCredentials) {
                def keystorePath = Paths.get(androidKeystoreCredentials.keystorePath)
                def storeFilePath = keystorePath.isAbsolute()
                    ? keystorePath
                    : rootProject.file("..").toPath().resolve(keystorePath)

                storeFile = storeFilePath.toFile()
                storePassword = androidKeystoreCredentials.keystorePassword
                keyAlias = androidKeystoreCredentials.keyAlias
                keyPassword = androidKeystoreCredentials.keyPassword ?: androidKeystoreCredentials.keystorePassword
            }
        }
    }
`;

  const buildTypes = `    buildTypes {
        debug {
            signingConfig = signingConfigs.debug
${debugVariantLines ? `${debugVariantLines}\n` : ''}        }
        release {
            if (!androidKeystoreCredentials) {
                throw new GradleException("Release signing requires credentials.json with android.keystore. See README Production Builds.")
            }
            signingConfig = signingConfigs.release
            shrinkResources = (findProperty('android.enableShrinkResourcesInReleaseBuilds')?.toBoolean() ?: false)
            minifyEnabled = enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            crunchPngs = (findProperty('android.enablePngCrunchInReleaseBuilds')?.toBoolean() ?: true)
        }
    }
`;

  source = replaceRequired(
    source,
    /    signingConfigs\s*\{[\s\S]*?\n    \}\n    buildTypes\s*\{/,
    `${signingConfigs}    buildTypes {`,
    'signingConfigs block',
  );
  source = replaceRequired(
    source,
    /    buildTypes\s*\{[\s\S]*?\n    \}\n    packagingOptions\s*\{/,
    `${buildTypes}    packagingOptions {`,
    'buildTypes block',
  );

  return writeIfChanged(appBuildGradlePath, before, source);
}

function configureAndroidManifest() {
  const before = readRequired(androidManifestPath);
  const source = before.replace(
    /<activity android:name="\.MainActivity"(?![^>]*android:label=)/,
    '<activity android:name=".MainActivity" android:label="@string/app_name"',
  );

  return writeIfChanged(androidManifestPath, before, source);
}

const changed = [
  configureGradleProperties(),
  configureRootBuildGradle(),
  configureAppBuildGradle(),
  configureAndroidManifest(),
].some(Boolean);

console.log(changed
  ? '[android-gradle] Configured generated Android Gradle files'
  : '[android-gradle] Generated Android Gradle files already configured');
