import {
    CLIPBOARD_SENSITIVITY_TTL_MS,
    ClipboardSensitivity,
    DEFAULT_CLIPBOARD_SENSITIVITY,
} from './clipboardSensitivity';

/**
 * Imperative clipboard controller used by `useSecureCopy` (APP-SEC-005).
 *
 * Split from the React hook so the security-critical behavior (per-class TTLs,
 * conditional wipe that never clobbers a newer user copy) can be unit-tested
 * without a React renderer. The hook only wires this controller to refs,
 * timers, and the AppState listener.
 */

export interface SecureClipboardNativeModule {
    copySecure(text: string): void;
    clearClipboardIfMatches(text: string): void;
}

export interface ClipboardLike {
    setStringAsync(text: string): Promise<unknown>;
    getStringAsync(): Promise<string>;
}

export interface SecureCopyOptions {
    sensitivity?: ClipboardSensitivity;
}

export interface SecureClipboardControllerDependencies {
    platformOS: string;
    nativeModule: SecureClipboardNativeModule | null | undefined;
    clipboard: ClipboardLike;
    now?: () => number;
    setTimeoutFn?: (handler: () => void, timeout: number) => unknown;
    clearTimeoutFn?: (handle: unknown) => void;
    warn?: (message: string, ...args: unknown[]) => void;
}

export interface SecureClipboardController {
    secureCopy(text: string, options?: SecureCopyOptions): Promise<void>;
    wipeClipboard(): Promise<void>;
    onAppStateChange(nextAppState: string): void;
}

export const createSecureClipboardController = ({
    platformOS,
    nativeModule,
    clipboard,
    now = Date.now,
    setTimeoutFn = (handler, timeout) => setTimeout(handler, timeout),
    clearTimeoutFn = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    warn = (message, ...args) => console.warn(message, ...args),
}: SecureClipboardControllerDependencies): SecureClipboardController => {
    let timerHandle: unknown | null = null;
    let expectedClearTime: number | null = null;
    let copiedValue: string | null = null;

    /**
     * Clear the clipboard only when it still holds the value this app copied.
     * Never clobber something the user copied afterwards.
     */
    const wipeClipboard = async (): Promise<void> => {
        try {
            if (copiedValue === null) {
                return;
            }

            if (platformOS === 'android' && nativeModule) {
                // Native equality check on the primary clip; clears only on match.
                nativeModule.clearClipboardIfMatches(copiedValue);
            } else {
                const currentClipboardText = await clipboard.getStringAsync();
                if (currentClipboardText === copiedValue) {
                    await clipboard.setStringAsync('');
                }
            }
        } catch (error) {
            warn('[useSecureCopy] Failed to clear clipboard:', error);
        } finally {
            expectedClearTime = null;
            copiedValue = null;
            if (timerHandle !== null) {
                clearTimeoutFn(timerHandle);
                timerHandle = null;
            }
        }
    };

    const secureCopy = async (text: string, options?: SecureCopyOptions): Promise<void> => {
        if (!text) {
            return;
        }

        const sensitivity = options?.sensitivity ?? DEFAULT_CLIPBOARD_SENSITIVITY;
        const ttlMs = CLIPBOARD_SENSITIVITY_TTL_MS[sensitivity];

        // Clear any existing TTL timer before replacing the clipboard content.
        if (timerHandle !== null) {
            clearTimeoutFn(timerHandle);
            timerHandle = null;
        }

        try {
            if (platformOS === 'android' && nativeModule) {
                // Native module applies EXTRA_IS_SENSITIVE metadata on Android.
                nativeModule.copySecure(text);
            } else {
                // expo-clipboard on iOS: no localOnly/expiration options exist in
                // the installed SDK (56.0.4), so we keep the plain set and rely on
                // the TTL wipe. See residual risks in the lane report.
                await clipboard.setStringAsync(text);
            }
        } catch (error) {
            warn('[useSecureCopy] Failed to copy:', error);
            return;
        }

        copiedValue = text;
        expectedClearTime = now() + ttlMs;
        timerHandle = setTimeoutFn(() => {
            void wipeClipboard();
        }, ttlMs);
    };

    /**
     * AppState watcher: if the JS timer was suspended while backgrounded and the
     * TTL expired, wipe as soon as the app returns to the foreground.
     */
    const onAppStateChange = (nextAppState: string): void => {
        if (nextAppState === 'active' && expectedClearTime !== null && now() >= expectedClearTime) {
            void wipeClipboard();
        }
    };

    return { secureCopy, wipeClipboard, onAppStateChange };
};
