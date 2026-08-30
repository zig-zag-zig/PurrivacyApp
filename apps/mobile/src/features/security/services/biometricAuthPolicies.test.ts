import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * APP-SEC-006: biometric policy must be explicit per purpose.
 * - Vault unlock keeps the historical policy (device-credential fallback allowed).
 * - Secret reveal is biometrics-only: no device fallback, Android strong level.
 */

type AuthenticateResult = { success: boolean; error?: string };

type AuthOptions = Record<string, unknown>;

const localAuthenticationMock = vi.hoisted(() => ({
    authenticateAsync: vi.fn<(options?: AuthOptions) => Promise<AuthenticateResult>>(),
    hasHardwareAsync: vi.fn(async () => true),
    isEnrolledAsync: vi.fn(async () => true),
}));

vi.mock('expo-local-authentication', () => ({
    authenticateAsync: localAuthenticationMock.authenticateAsync,
    hasHardwareAsync: localAuthenticationMock.hasHardwareAsync,
    isEnrolledAsync: localAuthenticationMock.isEnrolledAsync,
}));

vi.mock('expo-secure-store', () => ({
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: vi.fn(async () => null),
    setItemAsync: vi.fn(async () => undefined),
    deleteItemAsync: vi.fn(async () => undefined),
    isAvailableAsync: vi.fn(async () => true),
    canUseBiometricAuthentication: vi.fn(() => true),
}));

vi.mock('expo-sqlite/kv-store', () => {
    class SQLiteStorage {
        private readonly store = new Map<string, string>();

        async getItemAsync(key: string): Promise<string | null> {
            return this.store.get(key) ?? null;
        }

        async setItemAsync(key: string, value: string): Promise<void> {
            this.store.set(key, value);
        }

        async removeItemAsync(key: string): Promise<boolean> {
            return this.store.delete(key);
        }
    }

    return { SQLiteStorage };
});

vi.mock('expo-crypto', () => ({
    getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length)),
    digestStringAsync: vi.fn(async () => 'mock-digest'),
}));

vi.mock('expo-crypto/build/aes', () => ({
    aesEncryptAsync: vi.fn(),
    aesDecryptAsync: vi.fn(),
}));

import {
    authenticateForSecretReveal,
    authenticateForVaultUnlock,
    SecureStorageModule,
} from './biometricSecureStorage';

const lastAuthenticateCall = (): AuthOptions => {
    expect(localAuthenticationMock.authenticateAsync).toHaveBeenCalledTimes(1);
    return localAuthenticationMock.authenticateAsync.mock.calls[0]?.[0] ?? {};
};

beforeEach(() => {
    localAuthenticationMock.authenticateAsync.mockClear();
    localAuthenticationMock.authenticateAsync.mockResolvedValue({ success: true });
});

describe('biometric authentication policies (APP-SEC-006)', () => {
    it('routes secret reveal through the biometrics-only policy', async () => {
        const result = await authenticateForSecretReveal('Unlock private key');

        expect(result).toBe(true);
        const options = lastAuthenticateCall();
        expect(options.promptMessage).toBe('Unlock private key');
        expect(options.disableDeviceFallback).toBe(true);
        expect(options.biometricsSecurityLevel).toBe('strong');
    });

    it('keeps the vault-unlock policy unchanged (device fallback allowed, no strong-level pin)', async () => {
        const result = await authenticateForVaultUnlock('Unlock Purrivacy');

        expect(result).toBe(true);
        const options = lastAuthenticateCall();
        expect(options.promptMessage).toBe('Unlock Purrivacy');
        // Historical behavior preserved: fallback to device credentials is allowed.
        expect(options.disableDeviceFallback).toBe(false);
        // The DEK path relies on SecureStore requireAuthentication; the standalone
        // vault prompt must not silently add a stricter Android level than before.
        expect(options.biometricsSecurityLevel).toBeUndefined();
    });

    it('exposes the same split on SecureStorageModule for direct consumers', async () => {
        await SecureStorageModule.authenticateForSecretReveal('Reveal');
        await SecureStorageModule.authenticateForVaultUnlock('Unlock');
        expect(localAuthenticationMock.authenticateAsync).toHaveBeenCalledTimes(2);

        const revealOptions = localAuthenticationMock.authenticateAsync.mock.calls[0]?.[0] ?? {};
        expect(revealOptions).toMatchObject({
            disableDeviceFallback: true,
            biometricsSecurityLevel: 'strong',
        });

        const unlockOptions = localAuthenticationMock.authenticateAsync.mock.calls[1]?.[0] ?? {};
        expect(unlockOptions).toMatchObject({
            disableDeviceFallback: false,
        });
        expect(unlockOptions).not.toHaveProperty('biometricsSecurityLevel');
    });

    it('rejects empty prompt messages without invoking the system prompt', async () => {
        await expect(authenticateForSecretReveal('  ')).resolves.toBe(false);
        await expect(authenticateForVaultUnlock('')).resolves.toBe(false);
        expect(localAuthenticationMock.authenticateAsync).not.toHaveBeenCalled();
    });

    it('propagates authentication failure as false for both policies', async () => {
        localAuthenticationMock.authenticateAsync.mockResolvedValue({
            success: false,
            error: 'user_cancel',
        });

        await expect(authenticateForSecretReveal('Reveal')).resolves.toBe(false);
        await expect(authenticateForVaultUnlock('Unlock')).resolves.toBe(false);
    });
});
