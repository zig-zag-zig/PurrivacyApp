import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * iOS screen-capture protection (APP-SEC-003, iOS half).
 *
 * Android is already covered globally by FLAG_SECURE, applied to
 * MainActivity at prebuild (scripts/native-security.js) — it protects the
 * window from before first paint with no JS timing dependency. This hook
 * therefore targets iOS only.
 *
 * While `active` (user authenticated), screenshots are blocked and screen
 * recording captures a black frame (secure-layer technique). This is
 * prevention, which is strictly stronger than the capture *detection* the
 * security review asked for; the iOS background privacy cover added by the
 * native-security plugin continues to handle app-switcher snapshots.
 */

/** Effect body as a pure-ish function: returns the cleanup or undefined. */
export function screenCaptureEffect(
    active: boolean,
    platform: string,
    prevent: () => void = () => void ScreenCapture.preventScreenCaptureAsync(),
    allow: () => void = () => void ScreenCapture.allowScreenCaptureAsync(),
): (() => void) | undefined {
    if (platform !== 'ios' || !active) {
        return undefined;
    }

    prevent();

    return () => {
        allow();
    };
}

export function useScreenCaptureProtection(active: boolean): void {
    useEffect(() => screenCaptureEffect(active, Platform.OS), [active]);
}
