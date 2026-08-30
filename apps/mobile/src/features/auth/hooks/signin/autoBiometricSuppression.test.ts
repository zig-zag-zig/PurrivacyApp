import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.example/';
    process.env.EXPO_PUBLIC_AUTH_EMAIL_DOMAIN = 'test.example';
});
// usernameIdentity -> config/env -> expo-constants (cannot run in Node).
vi.mock('expo-constants', () => ({ default: {} }));
import {
    autoBiometricUsernameKey,
    clearAutoBiometricSuppression,
    isAutoBiometricSuppressed,
    resetAutoBiometricSuppression,
    suppressAutoBiometricUsername,
} from './autoBiometricSuppression';

describe('autoBiometricSuppression (APP-ARCH-002)', () => {
    afterEach(() => {
        clearAutoBiometricSuppression('alice');
        clearAutoBiometricSuppression('bob');
        clearAutoBiometricSuppression('charlie');
    });

    it('normalizes usernames with trim + lowercase', () => {
        expect(autoBiometricUsernameKey('  Alice  ')).toBe('alice');
        expect(autoBiometricUsernameKey('ALICE')).toBe('alice');
    });

    it('suppresses a valid username and reports it as suppressed', () => {
        expect(suppressAutoBiometricUsername('alice')).toBe(true);
        expect(isAutoBiometricSuppressed('alice')).toBe(true);
        expect(isAutoBiometricSuppressed('Alice ')).toBe(true);
    });

    it('ignores invalid usernames (mirrors the original validate guard)', () => {
        expect(suppressAutoBiometricUsername('')).toBe(false);
        expect(suppressAutoBiometricUsername('ab')).toBe(false);
        expect(isAutoBiometricSuppressed('ab')).toBe(false);
    });

    it('clearAutoBiometricSuppression removes the entry by normalized key', () => {
        suppressAutoBiometricUsername('bob');
        clearAutoBiometricSuppression('  BOB ');
        expect(isAutoBiometricSuppressed('bob')).toBe(false);
    });

    it('resetAutoBiometricSuppression clears only valid usernames', () => {
        suppressAutoBiometricUsername('charlie');
        expect(resetAutoBiometricSuppression('charlie')).toBe(true);
        expect(isAutoBiometricSuppressed('charlie')).toBe(false);

        expect(resetAutoBiometricSuppression('')).toBe(false);
    });

    it('persists suppression across screen remounts (module scope)', () => {
        suppressAutoBiometricUsername('alice');

        // Simulates Signin unmounting and remounting: the entry survives
        // because it lives at module scope, not in component state.
        expect(isAutoBiometricSuppressed('alice')).toBe(true);
        expect(isAutoBiometricSuppressed('alice')).toBe(true);
    });
});
