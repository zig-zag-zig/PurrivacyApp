import { useCallback, useRef, useEffect } from 'react';
import { Platform, NativeModules, AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
    createSecureClipboardController,
    SecureClipboardNativeModule,
    SecureCopyOptions,
} from '../clipboard/secureClipboardController';

const SecureClipboardModule = NativeModules.SecureClipboard as SecureClipboardNativeModule | undefined;

export { SecureCopyOptions };

/**
 * Secure clipboard copy with per-sensitivity TTLs (APP-SEC-005).
 *
 * `secureCopy(text, { sensitivity })` defaults to `'high'` (20s) when no class
 * is specified. The wipe is conditional: it only clears the clipboard if it
 * still holds the value we copied, so a newer user copy is never clobbered.
 */
export function useSecureCopy() {
    const controllerRef = useRef<ReturnType<typeof createSecureClipboardController> | null>(null);
    if (controllerRef.current === null) {
        controllerRef.current = createSecureClipboardController({
            platformOS: Platform.OS,
            nativeModule: SecureClipboardModule,
            clipboard: Clipboard,
        });
    }
    const controller = controllerRef.current;

    // AppState Watcher: Wipes if TTL expires while app is backgrounded
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            controller.onAppStateChange(nextAppState);
        });

        return () => {
            subscription.remove();
            // NOTE: We intentionally DO NOT wipe on unmount here.
            // If a user copies a key and navigates to another app to paste it,
            // the clipboard must survive the navigation. The TTL handles the cleanup.
        };
    }, [controller]);

    const secureCopy = useCallback(
        (text: string, options?: SecureCopyOptions) => controller.secureCopy(text, options),
        [controller],
    );

    const wipeClipboard = useCallback(
        () => controller.wipeClipboard(),
        [controller],
    );

    return { secureCopy, wipeClipboard };
}
