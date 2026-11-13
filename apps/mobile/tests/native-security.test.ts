import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(import.meta.url);

interface MainActivityPatchResult {
    contents: string;
    requiresWrite: boolean;
}

const nativeSecurity = require('../scripts/native-security.js') as {
    patchMainActivitySource: (source: string) => MainActivityPatchResult;
    patchAndroidMainActivity: (projectRoot: string, packageName: string) => boolean;
    patchIosAppDelegate: (projectRoot: string) => void;
    shouldApplyAndroidFlagSecure: (appEnv?: string) => boolean;
};

const UNPATCHED_MAIN_ACTIVITY = `package vip.chi_chi.purrivacy
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }
}
`;

const UNPATCHED_IOS_APP_DELEGATE = `import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }
}
`;

function withIosAppDelegate(contents: string, fn: (projectRoot: string) => void) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-security-test-'));
    const appDir = path.join(projectRoot, 'ios', 'Purrivacy');
    fs.mkdirSync(appDir, { recursive: true });
    const appDelegatePath = path.join(appDir, 'AppDelegate.swift');
    fs.writeFileSync(appDelegatePath, contents, 'utf8');

    try {
        fn(projectRoot);
        return fs.readFileSync(appDelegatePath, 'utf8');
    } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    }
}

describe('scripts/native-security.js iOS background grace task patching', () => {
    it('adds the bounded background task alongside the privacy cover', () => {
        const patched = withIosAppDelegate(UNPATCHED_IOS_APP_DELEGATE, projectRoot => {
            nativeSecurity.patchIosAppDelegate(projectRoot);
        });

        expect(patched).toContain('import UIKit');
        expect(patched).toContain('private var privacyCoverView: UIView?');
        expect(patched).toContain('private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid');
        expect(patched).toContain('UIApplication.shared.beginBackgroundTask(withName: "PurrivacyActiveOperationGrace")');
        expect(patched).toContain('UIApplication.shared.endBackgroundTask(backgroundTaskId)');
        expect(patched.match(/beginOperationGraceTask\(\)/g)).toHaveLength(2); // call + declaration guard
        expect(patched.match(/UIApplication\.shared\.beginBackgroundTask/g)).toHaveLength(1);
    });

    it('is idempotent across repeated prebuilds', () => {
        const once = withIosAppDelegate(UNPATCHED_IOS_APP_DELEGATE, projectRoot => {
            nativeSecurity.patchIosAppDelegate(projectRoot);
        });
        const twice = withIosAppDelegate(UNPATCHED_IOS_APP_DELEGATE, projectRoot => {
            nativeSecurity.patchIosAppDelegate(projectRoot);
            nativeSecurity.patchIosAppDelegate(projectRoot);
        });

        expect(twice).toBe(once);
        expect(twice.match(/private var backgroundTaskId/g)).toHaveLength(1);
        expect(twice.match(/UIApplication\.shared\.endBackgroundTask/g)).toHaveLength(1);
    });

    it('upgrades an AppDelegate that already had only the privacy cover', () => {
        const legacy = UNPATCHED_IOS_APP_DELEGATE
            .replace(
                '  var window: UIWindow?\n',
                '  var window: UIWindow?\n  private var privacyCoverView: UIView?\n'
            )
            .replace(
                '    bindReactNativeFactory(factory)\n',
                [
                    '    bindReactNativeFactory(factory)',
                    '    NotificationCenter.default.addObserver(self, selector: #selector(showPrivacyCover), name: UIApplication.willResignActiveNotification, object: nil)',
                    '    NotificationCenter.default.addObserver(self, selector: #selector(hidePrivacyCover), name: UIApplication.didBecomeActiveNotification, object: nil)',
                    '',
                ].join('\n')
            )
            .replace(
                '  // Linking API\n',
                [
                    '  @objc private func showPrivacyCover() {',
                    '    guard let window = window, privacyCoverView == nil else {',
                    '      return',
                    '    }',
                    '    let coverView = UIView(frame: window.bounds)',
                    '    coverView.backgroundColor = .black',
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

        const patched = withIosAppDelegate(legacy, projectRoot => {
            nativeSecurity.patchIosAppDelegate(projectRoot);
        });

        expect(patched).toContain('  @objc private func showPrivacyCover() {\n    beginOperationGraceTask()');
        expect(patched).toContain('  @objc private func hidePrivacyCover() {\n    endOperationGraceTask()');
        expect(patched).toContain('private func beginOperationGraceTask() {');
        expect(patched.match(/private var backgroundTaskId/g)).toHaveLength(1);
        expect(patched.match(/UIApplication\.shared\.beginBackgroundTask/g)).toHaveLength(1);
    });
});

describe('scripts/native-security.js Android FLAG_SECURE patching', () => {
    it('keeps FLAG_SECURE enabled except for the isolated local E2E build', () => {
        expect(nativeSecurity.shouldApplyAndroidFlagSecure('production')).toBe(true);
        expect(nativeSecurity.shouldApplyAndroidFlagSecure('development')).toBe(true);
        expect(nativeSecurity.shouldApplyAndroidFlagSecure('e2e-test')).toBe(false);
    });

    it('adds FLAG_SECURE and the WindowManager import to an unpatched MainActivity', () => {
        const result = nativeSecurity.patchMainActivitySource(UNPATCHED_MAIN_ACTIVITY);

        expect(result.requiresWrite).toBe(true);
        expect(result.contents).toContain('window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)');
        expect(result.contents).toContain('import android.view.WindowManager');

        const onCreate = result.contents.slice(result.contents.indexOf('super.onCreate(null)'));
        expect(
            onCreate.startsWith(
                'super.onCreate(null)\n    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)'
            )
        ).toBe(true);

        expect(result.contents).toContain(
            'import expo.modules.ReactActivityDelegateWrapper\nimport android.view.WindowManager'
        );
    });

    it('is a no-op when the source is already patched (idempotent)', () => {
        const once = nativeSecurity.patchMainActivitySource(UNPATCHED_MAIN_ACTIVITY);
        const twice = nativeSecurity.patchMainActivitySource(once.contents);

        expect(twice.requiresWrite).toBe(false);
        expect(twice.contents).toBe(once.contents);
        expect(once.contents.match(/window.addFlags/g)).toHaveLength(1);
        expect(once.contents.match(/import android.view.WindowManager/g)).toHaveLength(1);
    });

    it('adds only the missing WindowManager import when the flag is already present', () => {
        const withFlagOnly = UNPATCHED_MAIN_ACTIVITY.replace(
            '    super.onCreate(null)',
            '    super.onCreate(null)\n    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)'
        );
        const result = nativeSecurity.patchMainActivitySource(withFlagOnly);

        expect(result.requiresWrite).toBe(true);
        expect(result.contents).toContain('import android.view.WindowManager');
        expect(result.contents.match(/import android.view.WindowManager/g)).toHaveLength(1);
        expect(result.contents.match(/window.addFlags/g)).toHaveLength(1);
    });

    it('adds the import after the package declaration when the source has no imports', () => {
        const noImports = [
            'package vip.chi_chi.purrivacy',
            '',
            'class MainActivity : ReactActivity() {',
            '  override fun onCreate(savedInstanceState: Bundle?) {',
            '    super.onCreate(null)',
            '  }',
            '}',
            '',
        ].join('\n');

        const result = nativeSecurity.patchMainActivitySource(noImports);

        expect(result.requiresWrite).toBe(true);
        expect(result.contents).toContain(
            'package vip.chi_chi.purrivacy\nimport android.view.WindowManager'
        );
        expect(result.contents).toContain(
            'window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)'
        );
    });

    it('throws when the onCreate anchor is missing so the plugin can log and continue', () => {
        const unrecognized = 'package vip.chi_chi.purrivacy\nclass MainActivity : ReactActivity() {}\n';

        expect(() => nativeSecurity.patchMainActivitySource(unrecognized)).toThrow(
            /super\.onCreate\(null\)/
        );
    });

    it('writes the patched file once and is a no-op on the next run', () => {
        const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'native-security-test-'));
        const packageDir = path.join(
            projectRoot,
            'android',
            'app',
            'src',
            'main',
            'java',
            'vip',
            'chi_chi',
            'purrivacy'
        );
        const mainActivityPath = path.join(packageDir, 'MainActivity.kt');

        try {
            fs.mkdirSync(packageDir, { recursive: true });
            fs.writeFileSync(mainActivityPath, UNPATCHED_MAIN_ACTIVITY, 'utf8');

            expect(nativeSecurity.patchAndroidMainActivity(projectRoot, 'vip.chi_chi.purrivacy')).toBe(true);
            expect(nativeSecurity.patchAndroidMainActivity(projectRoot, 'vip.chi_chi.purrivacy')).toBe(false);

            const onDisk = fs.readFileSync(mainActivityPath, 'utf8');
            expect(onDisk).toContain('window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)');
            expect(onDisk).toContain('import android.view.WindowManager');
            expect(onDisk.match(/window.addFlags/g)).toHaveLength(1);
        } finally {
            fs.rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});
