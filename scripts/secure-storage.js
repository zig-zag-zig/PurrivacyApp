const { withAndroidManifest, withDangerousMod, withProjectBuildGradle } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const secureStoragePackageImport = 'vip.chi_chi.purrivacy.secureStorage.SecureStoragePackage';

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

function disableAndroidBackups(androidManifest) {
    const application = androidManifest.manifest.application?.[0];
    if (!application) {
        return androidManifest;
    }

    application.$ = application.$ || {};
    application.$['android:allowBackup'] = 'false';
    delete application.$['android:fullBackupContent'];
    delete application.$['android:dataExtractionRules'];

    return androidManifest;
}

function patchIosAppDelegate(projectRoot) {
    const appDelegatePath = path.join(projectRoot, 'ios', 'Purrivacy', 'AppDelegate.swift');
    let appDelegate = fs.readFileSync(appDelegatePath, 'utf8');
    let requiresWrite = false;

    if (!appDelegate.includes('import UIKit')) {
        appDelegate = appDelegate.replace(
            'import ReactAppDependencyProvider\n',
            'import ReactAppDependencyProvider\nimport UIKit\n'
        );
        requiresWrite = true;
    }

    if (!appDelegate.includes('private var privacyCoverView: UIView?')) {
        appDelegate = appDelegate.replace(
            '  var window: UIWindow?\n',
            '  var window: UIWindow?\n  private var privacyCoverView: UIView?\n'
        );
        requiresWrite = true;
    }

    if (!appDelegate.includes('#selector(showPrivacyCover)')) {
        appDelegate = appDelegate.replace(
            '    bindReactNativeFactory(factory)\n',
            [
                '    bindReactNativeFactory(factory)',
                '    NotificationCenter.default.addObserver(self, selector: #selector(showPrivacyCover), name: UIApplication.willResignActiveNotification, object: nil)',
                '    NotificationCenter.default.addObserver(self, selector: #selector(showPrivacyCover), name: UIApplication.didEnterBackgroundNotification, object: nil)',
                '    NotificationCenter.default.addObserver(self, selector: #selector(hidePrivacyCover), name: UIApplication.didBecomeActiveNotification, object: nil)',
                '',
            ].join('\n')
        );
        requiresWrite = true;
    }

    if (!appDelegate.includes('@objc private func showPrivacyCover()')) {
        appDelegate = appDelegate.replace(
            '  // Linking API\n',
            [
                '  @objc private func showPrivacyCover() {',
                '    guard let window = window, privacyCoverView == nil else {',
                '      return',
                '    }',
                '',
                '    let coverView = UIView(frame: window.bounds)',
                '    coverView.backgroundColor = .black',
                '    coverView.autoresizingMask = [.flexibleWidth, .flexibleHeight]',
                '    window.addSubview(coverView)',
                '    privacyCoverView = coverView',
                '  }',
                '',
                '  @objc private func hidePrivacyCover() {',
                '    privacyCoverView?.removeFromSuperview()',
                '    privacyCoverView = nil',
                '  }',
                '',
                '  // Linking API',
                '',
            ].join('\n')
        );
        requiresWrite = true;
    }

    if (requiresWrite) {
        fs.writeFileSync(appDelegatePath, appDelegate, 'utf8');
    }
}

function withSecureStorage(config) {
    config = withAndroidManifest(config, (config) => {
        config.modResults = disableAndroidBackups(config.modResults);
        return config;
    });

    config = withProjectBuildGradle(config, async (config) => {
        const projectRoot = config.modRequest.projectRoot;
        const templateDir = path.join(projectRoot, 'scripts', 'android-template');
        const destDir = path.join(
            projectRoot,
            'android',
            'app',
            'src',
            'main',
            'java',
            'vip',
            'chi_chi',
            'purrivacy',
            'secureStorage'
        );

        try {
            // Copy template files (MyCustomSecureStorageProvider.kt, etc.)
            fs.mkdirSync(destDir, { recursive: true });
            const files = fs.readdirSync(templateDir);
            for (const f of files) {
                const src = path.join(templateDir, f);
                const dst = path.join(destDir, f);
                fs.copyFileSync(src, dst);
            }

            // Patch app/build.gradle
            const appBuildGradle = path.join(projectRoot, 'android', 'app', 'build.gradle');
            try {
                let buildGradle = fs.readFileSync(appBuildGradle, 'utf8');
                let requiresWrite = false;

                // Collect missing dependencies
                const depsToAdd = [];
                if (!buildGradle.includes("androidx.biometric:biometric")) {
                    depsToAdd.push("    implementation 'androidx.biometric:biometric:1.1.0'");
                }
                if (!buildGradle.includes("androidx.security:security-crypto")) {
                    depsToAdd.push("    implementation 'androidx.security:security-crypto:1.0.0'");
                }

                // Inject them all at once
                if (depsToAdd.length > 0) {
                    buildGradle = buildGradle.replace(/dependencies\s*\{/, match => match + "\n" + depsToAdd.join("\n") + "\n");
                    requiresWrite = true;
                }

                if (requiresWrite) {
                    fs.writeFileSync(appBuildGradle, buildGradle, 'utf8');
                }
            } catch (e) {
                console.error('[appCheck-plugin] Failed to patch build.gradle:', e);
            }

            // Patch MainApplication.kt
            const mainAppPath = path.join(
                projectRoot,
                'android',
                'app',
                'src',
                'main',
                'java',
                'vip',
                'chi_chi',
                'purrivacy',
                'MainApplication.kt'
            );

            try {
                let mainApp = fs.readFileSync(mainAppPath, 'utf8');
                const originalMainApp = mainApp;

                // Add package imports if not present
                mainApp = addKotlinImport(mainApp, secureStoragePackageImport);

                // Add package registration if not present
                mainApp = addReactPackage(mainApp, 'SecureStoragePackage');

                if (mainApp !== originalMainApp) {
                    fs.writeFileSync(mainAppPath, mainApp, 'utf8');
                }
            } catch (e) {
                console.error('[secureStorage-plugin] Failed to patch MainApplication.kt:', e);
                throw e;
            }

        } catch (e) {
            console.error('[secureStorage-plugin] Failed to copy template files:', e);
        }

        return config;
    });

    config = withDangerousMod(config, ['ios', (config) => {
        try {
            patchIosAppDelegate(config.modRequest.projectRoot);
        } catch (e) {
            console.error('[secureStorage-plugin] Failed to patch AppDelegate.swift:', e);
        }

        return config;
    }]);

    return config;
}

module.exports = withSecureStorage;
module.exports.plugin = withSecureStorage;
