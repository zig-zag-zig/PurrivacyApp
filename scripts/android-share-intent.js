const { AndroidConfig, withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const packageName = 'vip.chi_chi.purrivacy';
const shareIntentPackageImport = `${packageName}.shareIntent.ShareIntentPackage`;

function addKotlinImport(source, importPath) {
    if (source.includes(`import ${importPath}`)) {
        return source;
    }

    const importMatches = Array.from(source.matchAll(/^import .+$/gm));
    if (importMatches.length === 0) {
        return source.replace(/^package .+\n/, match => `${match}\nimport ${importPath}\n`);
    }

    const lastImport = importMatches[importMatches.length - 1];
    const insertIndex = lastImport.index + lastImport[0].length;
    return `${source.slice(0, insertIndex)}\nimport ${importPath}${source.slice(insertIndex)}`;
}

function addReactPackage(source, packageClassName) {
    if (
        source.includes(`add(${packageClassName}())`) ||
        source.includes(`packages.add(${packageClassName}())`)
    ) {
        return source;
    }

    const expoReactHostPattern = /(PackageList\(this\)\.packages\.apply\s*\{\n)/;
    if (expoReactHostPattern.test(source)) {
        return source.replace(expoReactHostPattern, `$1          add(${packageClassName}())\n`);
    }

    const classicReactNativeHostPattern = /(\s+)return packages/;
    if (classicReactNativeHostPattern.test(source)) {
        return source.replace(
            classicReactNativeHostPattern,
            `$1packages.add(${packageClassName}())\n$1return packages`,
        );
    }

    throw new Error(`Unable to register ${packageClassName} in MainApplication.kt`);
}

function getMainActivity(androidManifest) {
    return AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
}

function ensureShareIntentFilters(androidManifest) {
    const mainActivity = getMainActivity(androidManifest);
    mainActivity.$ = mainActivity.$ || {};
    mainActivity.$['android:launchMode'] = 'singleTask';

    const intentFilters = mainActivity['intent-filter'] || [];
    const hasAction = (filter, actionName) =>
        filter.action?.some(action => action.$?.['android:name'] === actionName);

    if (!intentFilters.some(filter => hasAction(filter, 'android.intent.action.SEND'))) {
        intentFilters.push({
            action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
            data: [{ $: { 'android:mimeType': 'text/*' } }],
            category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        });
    }

    if (!intentFilters.some(filter => hasAction(filter, 'android.intent.action.PROCESS_TEXT'))) {
        intentFilters.push({
            action: [{ $: { 'android:name': 'android.intent.action.PROCESS_TEXT' } }],
            data: [{ $: { 'android:mimeType': 'text/*' } }],
            category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        });
    }

    mainActivity['intent-filter'] = intentFilters;
    return androidManifest;
}

function copyShareIntentTemplates(projectRoot) {
    const templateDir = path.join(projectRoot, 'scripts', 'android-share-intent-template');
    const destinationDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'vip',
        'chi_chi',
        'purrivacy',
        'shareIntent',
    );

    fs.mkdirSync(destinationDir, { recursive: true });
    for (const fileName of fs.readdirSync(templateDir)) {
        fs.copyFileSync(path.join(templateDir, fileName), path.join(destinationDir, fileName));
    }
}

function patchMainActivity(projectRoot) {
    const mainActivityPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'vip',
        'chi_chi',
        'purrivacy',
        'MainActivity.kt',
    );

    let mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
    let requiresWrite = false;

    if (!mainActivity.includes('import android.content.Intent')) {
        mainActivity = mainActivity.replace(
            'import android.os.Bundle\n',
            'import android.os.Bundle\nimport android.content.Intent\n',
        );
        requiresWrite = true;
    }

    if (!mainActivity.includes('override fun onNewIntent(intent: Intent)')) {
        mainActivity = mainActivity.replace(
            '\n  /**\n   * Returns the name of the main component registered from JavaScript.',
            [
                '',
                '  override fun onNewIntent(intent: Intent) {',
                '    super.onNewIntent(intent)',
                '    setIntent(intent)',
                '  }',
                '',
                '  /**',
                '   * Returns the name of the main component registered from JavaScript.',
            ].join('\n'),
        );
        requiresWrite = true;
    }

    if (requiresWrite) {
        fs.writeFileSync(mainActivityPath, mainActivity, 'utf8');
    }
}

function patchMainApplication(projectRoot) {
    const mainApplicationPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'vip',
        'chi_chi',
        'purrivacy',
        'MainApplication.kt',
    );

    let mainApplication = fs.readFileSync(mainApplicationPath, 'utf8');
    const originalMainApplication = mainApplication;

    mainApplication = addKotlinImport(mainApplication, shareIntentPackageImport);
    mainApplication = addReactPackage(mainApplication, 'ShareIntentPackage');

    if (mainApplication !== originalMainApplication) {
        fs.writeFileSync(mainApplicationPath, mainApplication, 'utf8');
    }
}

function withAndroidShareIntent(config) {
    config = withAndroidManifest(config, (config) => {
        config.modResults = ensureShareIntentFilters(config.modResults);
        return config;
    });

    config = withProjectBuildGradle(config, async (config) => {
        const projectRoot = config.modRequest.projectRoot;
        copyShareIntentTemplates(projectRoot);
        patchMainActivity(projectRoot);
        patchMainApplication(projectRoot);
        return config;
    });

    return config;
}

module.exports = withAndroidShareIntent;
module.exports.plugin = withAndroidShareIntent;
