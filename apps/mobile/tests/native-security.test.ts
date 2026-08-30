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
