import { useCallback, useRef, useEffect } from 'react';
import { Platform, NativeModules, AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';

interface SecureClipboardSpec {
    copySecure(text: string): void;
    clearClipboard(): void;
}
const SecureClipboardModule = NativeModules.SecureClipboard as SecureClipboardSpec | undefined;

const CLIPBOARD_TTL_MS = 180000; // 3 Minutes

export function useSecureCopy() {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const expectedClearTimeRef = useRef<number | null>(null);

    const wipeClipboard = useCallback(async () => {
        try {
            if (Platform.OS === 'android' && SecureClipboardModule) {
                SecureClipboardModule.clearClipboard();
            } else {
                await Clipboard.setStringAsync('');
            }
        } catch (error) {
            console.warn('[useSecureCopy] Failed to clear clipboard:', error);
        }

        expectedClearTimeRef.current = null;
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // AppState Watcher: Wipes if TTL expires while app is backgrounded
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active' && expectedClearTimeRef.current) {
                if (Date.now() >= expectedClearTimeRef.current) {
                    wipeClipboard();
                }
            }
        });

        return () => {
            subscription.remove();
            // NOTE: We intentionally DO NOT wipe on unmount here. 
            // If a user copies a key and navigates to another app to paste it, 
            // the clipboard must survive the navigation. The TTL handles the cleanup.
        };
    }, [wipeClipboard]);

    const secureCopy = useCallback(async (text: string) => {
        if (!text) return;

        // Clear any existing TTL timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        try {
            if (Platform.OS === 'android' && SecureClipboardModule) {
                // Uses Native Module to apply EXTRA_IS_SENSITIVE flag
                SecureClipboardModule.copySecure(text);
            } else {
                await Clipboard.setStringAsync(text);
            }
        } catch (error) {
            console.warn('[useSecureCopy] Failed to copy:', error);
            return;
        }

        // Start 3-minute TTL wipe
        expectedClearTimeRef.current = Date.now() + CLIPBOARD_TTL_MS;
        timerRef.current = setTimeout(wipeClipboard, CLIPBOARD_TTL_MS);
    }, [wipeClipboard]);

    return { secureCopy, wipeClipboard };
}