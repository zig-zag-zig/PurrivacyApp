const { withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const basePackageName = 'vip.chi_chi.purrivacy';
const SERVICE_SUFFIX = '.operations.OperationKeepAliveService';
const DATA_SYNC_PERMISSION = 'android.permission.FOREGROUND_SERVICE_DATA_SYNC';

function getAndroidPackageName(config) {
    return config.android?.package || basePackageName;
}

function getAndroidPackagePath(packageName) {
    return packageName.split('.');
}

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

function ensureManifestKeepAliveService(androidManifest) {
    const manifest = androidManifest.manifest;
    if (!manifest) {
        return androidManifest;
    }

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const hasDataSyncPermission = manifest['uses-permission'].some(
        entry => entry?.$?.['android:name'] === DATA_SYNC_PERMISSION,
    );
    if (!hasDataSyncPermission) {
        manifest['uses-permission'].push({
            $: { 'android:name': DATA_SYNC_PERMISSION },
        });
    }

    const application = manifest.application?.[0];
    if (!application) {
        return androidManifest;
    }

    application.service = application.service || [];
    const existing = application.service.find(
        service => service?.$?.['android:name'] === SERVICE_SUFFIX,
    );
    if (existing) {
        existing.$['android:exported'] = 'false';
        existing.$['android:foregroundServiceType'] = 'dataSync';
    } else {
        application.service.push({
            $: {
                'android:name': SERVICE_SUFFIX,
                'android:exported': 'false',
                'android:foregroundServiceType': 'dataSync',
            },
        });
    }

    return androidManifest;
}

function withAndroidOperationKeepAlive(config) {
    config = withAndroidManifest(config, config => {
        config.modResults = ensureManifestKeepAliveService(config.modResults);
        return config;
    });

    return withProjectBuildGradle(config, async (config) => {
        const projectRoot = config.modRequest.projectRoot;
        const templateDir = path.join(projectRoot, 'scripts', 'android-operation-keepalive-template');
        const packageName = getAndroidPackageName(config);
        const destDir = path.join(
            projectRoot,
            'android',
            'app',
            'src',
            'main',
            'java',
            ...getAndroidPackagePath(packageName),
            'operations',
        );

        try {
            fs.mkdirSync(destDir, { recursive: true });
            const files = fs.readdirSync(templateDir);
            for (const f of files) {
                const src = path.join(templateDir, f);
                const dst = path.join(destDir, f);
                const source = fs.readFileSync(src, 'utf8');
                fs.writeFileSync(
                    dst,
                    source.replace(
                        new RegExp(`^package ${basePackageName.replace(/\./g, '\\.')}(\\.operations)?`, 'm'),
                        `package ${packageName}$1`,
                    ),
                    'utf8',
                );
            }

            const mainAppPath = path.join(
                projectRoot,
                'android',
                'app',
                'src',
                'main',
                'java',
                ...getAndroidPackagePath(packageName),
                'MainApplication.kt',
            );

            let mainApp = fs.readFileSync(mainAppPath, 'utf8');
            const originalMainApp = mainApp;
            mainApp = addKotlinImport(mainApp, `${packageName}.operations.OperationKeepAlivePackage`);
            mainApp = addReactPackage(mainApp, 'OperationKeepAlivePackage');

            if (mainApp !== originalMainApp) {
                fs.writeFileSync(mainAppPath, mainApp, 'utf8');
            }
        } catch (e) {
            console.error('[android-operation-keepalive-plugin] Failed to configure operation keep-alive:', e);
            throw e;
        }

        return config;
    });
}

module.exports = withAndroidOperationKeepAlive;
module.exports.plugin = withAndroidOperationKeepAlive;
module.exports.ensureManifestKeepAliveService = ensureManifestKeepAliveService;
