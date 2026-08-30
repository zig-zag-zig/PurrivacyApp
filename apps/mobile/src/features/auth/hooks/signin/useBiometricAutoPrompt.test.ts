import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.example/';
    process.env.EXPO_PUBLIC_AUTH_EMAIL_DOMAIN = 'test.example';
});

// The hook file imports these services, whose real import chains pull in
// expo/firebase/react-native modules that cannot run in Node. The pure
// functions under test are DI-based and never touch the real services.
vi.mock('../../../security/services/biometricAuthService', () => ({ BiometricAuthService: {} }));
vi.mock('../../../security/services/securityService', () => ({ securityService: {} }));
// usernameIdentity -> config/env -> expo-constants (cannot run in Node).
vi.mock('expo-constants', () => ({ default: {} }));

import {
    applyBackgroundResetTiming,
    AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS,
    didLastUseBiometrics,
    refreshBiometricPromptSuppression,
    resolveBiometricButtonVisibility,
    shouldAutoPromptBiometricUnlock,
} from './useBiometricAutoPrompt';
import type { RefreshBiometricPromptSuppressionDeps } from './useBiometricAutoPrompt';
import { suppressAutoBiometricUsername, clearAutoBiometricSuppression } from './autoBiometricSuppression';
import type { User } from 'firebase/auth';

const user = { uid: 'uid-1' } as User;
const lastSignedInUser = { uid: 'uid-1', username: 'alice' };

describe('didLastUseBiometrics', () => {
    it('returns false without lookup for invalid usernames', async () => {
        const lookup = vi.fn();
        expect(await didLastUseBiometrics('ab', new Set(), lookup)).toBe(false);
        expect(lookup).not.toHaveBeenCalled();
    });

    it('returns the lookup result and memoizes negative answers', async () => {
        const cache = new Set<string>();
        const lookup = vi.fn().mockResolvedValue(false);

        expect(await didLastUseBiometrics('alice', cache, lookup)).toBe(false);
        expect(cache.has('alice')).toBe(true);

        expect(await didLastUseBiometrics('alice', cache, lookup)).toBe(false);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('returns true when the lookup succeeds and does not cache it', async () => {
        const cache = new Set<string>();
        const lookup = vi.fn().mockResolvedValue(true);

        expect(await didLastUseBiometrics('alice', cache, lookup)).toBe(true);
        expect(cache.has('alice')).toBe(false);
    });
});

describe('refreshBiometricPromptSuppression', () => {
    afterEach(() => {
        clearAutoBiometricSuppression('alice');
    });

    const baseDeps = (overrides: Partial<RefreshBiometricPromptSuppressionDeps> = {}): RefreshBiometricPromptSuppressionDeps => ({
        username: 'alice',
        onSuppressedChange: vi.fn(),
        negativeCache: new Set<string>(),
        lookupLastUsed: vi.fn().mockResolvedValue(false),
        onLastUsedChange: vi.fn(),
        isDisabledInPhoneSettings: vi.fn().mockResolvedValue(null),
        onBiometricsDisabled: vi.fn(),
        ...overrides,
    });

    it('syncs suppression state from the module registry', async () => {
        suppressAutoBiometricUsername('alice');
        const deps = baseDeps();

        await refreshBiometricPromptSuppression(deps);

        expect(deps.onSuppressedChange).toHaveBeenCalledWith(true);
    });

    it('reports last-used biometric flag and skips disabled handling when not disabled', async () => {
        const deps = baseDeps({ lookupLastUsed: vi.fn().mockResolvedValue(true) });

        await refreshBiometricPromptSuppression(deps);

        expect(deps.onLastUsedChange).toHaveBeenCalledWith(true);
        expect(deps.onBiometricsDisabled).not.toHaveBeenCalled();
    });

    it('hides the biometric path when biometrics are disabled in phone settings', async () => {
        const deps = baseDeps({ isDisabledInPhoneSettings: vi.fn().mockResolvedValue(true) });
        const onBiometricsDisabled = vi.fn();

        await refreshBiometricPromptSuppression({ ...deps, onBiometricsDisabled });

        expect(onBiometricsDisabled).toHaveBeenCalledTimes(1);
    });
});

describe('applyBackgroundResetTiming (15s background reset)', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('records the background entry time and clears it on early foreground without reset', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const timeRef = { current: null };
        const onReset = vi.fn();

        applyBackgroundResetTiming(true, timeRef, Date.now(), onReset);
        expect(timeRef.current).toBe(1_000_000);

        vi.advanceTimersByTime(AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS - 1);
        applyBackgroundResetTiming(false, timeRef, Date.now(), onReset);

        expect(onReset).not.toHaveBeenCalled();
        expect(timeRef.current).toBeNull();
    });

    it('resets exactly once when the background duration reaches the 15s threshold', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const timeRef = { current: null };
        const onReset = vi.fn();

        applyBackgroundResetTiming(true, timeRef, Date.now(), onReset);
        vi.advanceTimersByTime(AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS);
        applyBackgroundResetTiming(false, timeRef, Date.now(), onReset);

        expect(onReset).toHaveBeenCalledTimes(1);
        expect(timeRef.current).toBeNull();
    });

    it('clears the recorded time on re-evaluation while backgrounded (no reset under threshold)', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const timeRef = { current: null };
        const onReset = vi.fn();

        applyBackgroundResetTiming(true, timeRef, Date.now(), onReset);
        expect(timeRef.current).toBe(1_000_000);

        // A re-evaluation with a recorded timestamp (e.g. username change
        // while backgrounded) always evaluates and clears the reference;
        // with elapsed < threshold no reset fires.
        applyBackgroundResetTiming(true, timeRef, Date.now(), onReset);

        expect(timeRef.current).toBeNull();
        expect(onReset).not.toHaveBeenCalled();
    });
});

describe('shouldAutoPromptBiometricUnlock', () => {
    const base = {
        authCompleted: true,
        user: null,
        canGoDirectlyToBiometricAuth: true,
        alreadyPrompted: false,
        autoBiometricSuppressed: false,
        isUsernameSuppressed: false,
        showBiometricButton: true,
    };

    it('allows the auto prompt only when every gate is clear', () => {
        expect(shouldAutoPromptBiometricUnlock(base)).toBe(true);
    });

    it('never auto-prompts before auth bootstrap completed', () => {
        expect(shouldAutoPromptBiometricUnlock({ ...base, authCompleted: false })).toBe(false);
    });

    it('never auto-prompts while a user is signed in', () => {
        expect(shouldAutoPromptBiometricUnlock({ ...base, user })).toBe(false);
    });

    it.each([
        ['canGoDirectlyToBiometricAuth', false],
        ['alreadyPrompted', true],
        ['autoBiometricSuppressed', true],
        ['isUsernameSuppressed', true],
        ['showBiometricButton', false],
    ] as Array<[keyof typeof base, boolean]>)('blocks when %s is %s', (key, value) => {
        expect(shouldAutoPromptBiometricUnlock({ ...base, [key]: value })).toBe(false);
    });
});

describe('resolveBiometricButtonVisibility', () => {
    it('hides the button when a user is signed in', async () => {
        const hasDek = vi.fn();
        expect(await resolveBiometricButtonVisibility({ user, lastSignedInUser, username: 'alice', hasBiometricDek: hasDek })).toBe(false);
        expect(hasDek).not.toHaveBeenCalled();
    });

    it('hides the button when no last signed-in user matches', async () => {
        expect(await resolveBiometricButtonVisibility({ user: null, lastSignedInUser, username: 'bob', hasBiometricDek: vi.fn() })).toBe(false);
        expect(await resolveBiometricButtonVisibility({ user: null, lastSignedInUser: null, username: 'alice', hasBiometricDek: vi.fn() })).toBe(false);
    });

    it('shows the button when the user has a biometric DEK', async () => {
        const hasDek = vi.fn().mockResolvedValue(true);
        expect(await resolveBiometricButtonVisibility({ user: null, lastSignedInUser, username: 'alice', hasBiometricDek: hasDek })).toBe(true);
        expect(hasDek).toHaveBeenCalledWith('uid-1');
    });

    it('hides the button when the DEK check fails', async () => {
        const hasDek = vi.fn().mockResolvedValue(false);
        expect(await resolveBiometricButtonVisibility({ user: null, lastSignedInUser, username: 'alice', hasBiometricDek: hasDek })).toBe(false);
    });

    it('hides the button when the DEK check throws', async () => {
        const hasDek = vi.fn().mockRejectedValue(new Error('boom'));
        expect(await resolveBiometricButtonVisibility({ user: null, lastSignedInUser, username: 'alice', hasBiometricDek: hasDek })).toBe(false);
    });
});
