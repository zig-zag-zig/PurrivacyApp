const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

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

    return config;
}

module.exports = withNativeSecurity;
module.exports.plugin = withNativeSecurity;
