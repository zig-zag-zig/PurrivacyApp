const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEFAULT_ANDROID_PACKAGE = 'vip.chi_chi.purrivacy';
const FLAG_SECURE_MARKER = 'WindowManager.LayoutParams.FLAG_SECURE';
const WINDOW_MANAGER_IMPORT = 'import android.view.WindowManager';
const SECURE_FLAG_LINE = '    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)';

function getAndroidPackageName(config) {
    return config?.android?.package || DEFAULT_ANDROID_PACKAGE;
}

function addKotlinImport(source, importStatement) {
    if (source.includes(importStatement)) {
        return source;
    }

    const importMatches = Array.from(source.matchAll(/^import .+$/gm));
    if (importMatches.length === 0) {
        return source.replace(/^package .+\n/, match => `${match}${importStatement}\n`);
    }

    const lastImport = importMatches[importMatches.length - 1];
    const insertIndex = lastImport.index + lastImport[0].length;
    return `${source.slice(0, insertIndex)}\n${importStatement}${source.slice(insertIndex)}`;
}

function patchMainActivitySource(source) {
    let patched = source;
    let requiresWrite = false;

    if (!patched.includes(FLAG_SECURE_MARKER)) {
        if (!/super\.onCreate\(null\)/.test(patched)) {
            throw new Error('Unable to locate super.onCreate(null) in MainActivity.kt');
        }
        patched = patched.replace(/super\.onCreate\(null\)/, `$&\n${SECURE_FLAG_LINE}`);
        requiresWrite = true;
    }

    if (!patched.includes(WINDOW_MANAGER_IMPORT)) {
        patched = addKotlinImport(patched, WINDOW_MANAGER_IMPORT);
        requiresWrite = true;
    }

    return { contents: patched, requiresWrite };
}

function patchAndroidMainActivity(projectRoot, packageName) {
    const mainActivityPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        'MainActivity.kt'
    );

    const original = fs.readFileSync(mainActivityPath, 'utf8');
    const { contents, requiresWrite } = patchMainActivitySource(original);

    if (requiresWrite) {
        fs.writeFileSync(mainActivityPath, contents, 'utf8');
    }

    return requiresWrite;
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

function withNativeSecurity(config) {
    config = withAndroidManifest(config, (config) => {
        config.modResults = disableAndroidBackups(config.modResults);
        return config;
    });

    config = withDangerousMod(config, ['ios', (config) => {
        try {
            patchIosAppDelegate(config.modRequest.projectRoot);
        } catch (e) {
            console.error('[native-security-plugin] Failed to patch AppDelegate.swift:', e);
        }

        return config;
    }]);

    config = withDangerousMod(config, ['android', (config) => {
        try {
            patchAndroidMainActivity(
                config.modRequest.projectRoot,
                getAndroidPackageName(config)
            );
        } catch (e) {
            console.error('[native-security-plugin] Failed to patch MainActivity.kt:', e);
        }

        return config;
    }]);

    return config;
}

module.exports = withNativeSecurity;
module.exports.plugin = withNativeSecurity;
module.exports.addKotlinImport = addKotlinImport;
module.exports.patchMainActivitySource = patchMainActivitySource;
module.exports.patchAndroidMainActivity = patchAndroidMainActivity;
