import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpoAesMockControls } from './helpers/expoAesMock';

const storageMock = vi.hoisted(() => {
    const secureStoreValues = new Map<string, string>();
    const sqliteStores = new Map<string, Map<string, string>>();
    const secureStoreKeyPattern = /^[A-Za-z0-9._-]+$/;

    const assertValidSecureStoreKey = (key: string): void => {
        if (!key || !secureStoreKeyPattern.test(key)) {
            throw new Error('Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".');
        }
    };

    const getSqliteStore = (databaseName: string): Map<string, string> => {
        let store = sqliteStores.get(databaseName);
        if (!store) {
            store = new Map<string, string>();
            sqliteStores.set(databaseName, store);
        }
        return store;
    };

    const secureStore = {
        getItemAsync: vi.fn(async (key: string): Promise<string | null> => {
            assertValidSecureStoreKey(key);
            return secureStoreValues.get(key) ?? null;
        }),
        setItemAsync: vi.fn(async (key: string, value: string): Promise<void> => {
            assertValidSecureStoreKey(key);
            secureStoreValues.set(key, value);
        }),
        deleteItemAsync: vi.fn(async (key: string): Promise<void> => {
            assertValidSecureStoreKey(key);
            secureStoreValues.delete(key);
        }),
        isAvailableAsync: vi.fn(async () => true),
        canUseBiometricAuthentication: vi.fn(() => true),
    };

    const localAuthentication = {
        authenticateAsync: vi.fn(async () => ({ success: true })),
        hasHardwareAsync: vi.fn(async () => true),
        isEnrolledAsync: vi.fn(async () => true),
    };

    return {
        secureStore,
        secureStoreValues,
        getSqliteStore,
        localAuthentication,
        sqliteStores,
    };
});

const aesMockRef = vi.hoisted((): { current: ExpoAesMockControls | null; } => ({
    current: null,
}));

const eventMock = vi.hoisted(() => ({
    addEvent: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: storageMock.secureStore.getItemAsync,
    setItemAsync: storageMock.secureStore.setItemAsync,
    deleteItemAsync: storageMock.secureStore.deleteItemAsync,
    isAvailableAsync: storageMock.secureStore.isAvailableAsync,
    canUseBiometricAuthentication: storageMock.secureStore.canUseBiometricAuthentication,
}));

vi.mock('expo-sqlite/kv-store', () => ({
    SQLiteStorage: class SQLiteStorage {
        private readonly store: Map<string, string>;

        constructor(databaseName: string) {
            this.store = storageMock.getSqliteStore(databaseName);
        }

        async getItemAsync(key: string): Promise<string | null> {
            return this.store.get(key) ?? null;
        }

        async setItemAsync(key: string, value: string): Promise<void> {
            this.store.set(key, value);
        }

        async removeItemAsync(key: string): Promise<boolean> {
            return this.store.delete(key);
        }
    },
}));

vi.mock('expo-local-authentication', () => ({
    authenticateAsync: storageMock.localAuthentication.authenticateAsync,
    hasHardwareAsync: storageMock.localAuthentication.hasHardwareAsync,
    isEnrolledAsync: storageMock.localAuthentication.isEnrolledAsync,
}));

vi.mock('expo-crypto', () => ({
    getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(7)),
}));

vi.mock('expo-crypto/build/aes', async () => {
    const { createExpoAesMock } = await import('./helpers/expoAesMock');
    aesMockRef.current = createExpoAesMock();

    return aesMockRef.current.module;
});

vi.mock('../src/services/eventService', () => ({
    EventService: eventMock,
}));

vi.mock('../src/utils/logger', () => ({
    logger: loggerMock,
}));

import { secureAuthStorage } from '../src/config/secureAuthStorage';
import {
    LOCAL_LOCK_PREFIX,
    SESSION_PREFIX,
} from '../src/features/security/domain/secureStorageUtils';
import {
    isLocalSessionLocked,
    setLocalSessionLocked,
} from '../src/features/security/services/localSessionLockStore';
import {
    hasBiometricProtectedStorage,
    hasStandaloneBiometricAuth,
    SecureStorageModule,
    toSecureStoreKey,
} from '../src/features/security/services/biometricSecureStorage';
import {
    clearStoredSession,
    getStoredSession,
    storeSession,
    updateStoredSessionMfaState,
    updateStoredSessionMfaTrust,
} from '../src/features/security/services/storedSessionService';
import { SessionResponse, StoredSession } from '../src/types/types';

const userId = 'user-123';
const sessionSecureStoreKey = (): string => toSecureStoreKey(`${SESSION_PREFIX}${userId}`);
const localLockSecureStoreKey = (): string => toSecureStoreKey(`${LOCAL_LOCK_PREFIX}${userId}`);

const aesMock = (): ExpoAesMockControls => {
    if (!aesMockRef.current) {
        throw new Error('Expo AES mock was not initialized');
    }

    return aesMockRef.current;
};

const createSessionResponse = (overrides: Partial<SessionResponse> = {}): SessionResponse => ({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    mfaTrusted: true,
    mfaEnabled: true,
    ...overrides,
});

const putStoredSession = (session: Partial<StoredSession>): void => {
    storageMock.secureStoreValues.set(sessionSecureStoreKey(), JSON.stringify({
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        mfaTrusted: true,
        mfaEnabled: true,
        ...session,
    }));
};

beforeEach(() => {
    storageMock.secureStoreValues.clear();
    storageMock.sqliteStores.forEach(store => {
        store.clear();
    });
    Object.values(storageMock.secureStore).forEach(mock => mock.mockClear());
    aesMock().reset();
    Object.values(storageMock.localAuthentication).forEach(mock => mock.mockClear());
    Object.values(eventMock).forEach(mock => mock.mockClear());
    Object.values(loggerMock).forEach(mock => mock.mockClear());
});

describe('stored session secure storage', () => {
    it('stores refresh sessions by user and restores expiry values as Dates', async () => {
        const refreshTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        await storeSession(createSessionResponse({ refreshTokenExpiresAt }), userId);

        const storedValue = storageMock.secureStoreValues.get(sessionSecureStoreKey());
        expect(storedValue).toBeDefined();
        expect(JSON.parse(storedValue ?? '{}')).toMatchObject({
            refreshToken: 'refresh-token',
            refreshTokenExpiresAt,
            mfaTrusted: true,
            mfaEnabled: true,
        });

        await expect(getStoredSession(userId)).resolves.toMatchObject({
            refreshToken: 'refresh-token',
            mfaTrusted: true,
            mfaEnabled: true,
        });
        const restoredSession = await getStoredSession(userId);
        expect(restoredSession?.refreshTokenExpiresAt).toBeInstanceOf(Date);
        expect(restoredSession?.refreshTokenExpiresAt.toISOString()).toBe(refreshTokenExpiresAt);
        expect(eventMock.addEvent).toHaveBeenCalledWith('mfaState', {
            mfaState: { mfaTrusted: true, mfaEnabled: true },
        });
    });

    it('drops stored sessions that cannot refresh a backend session', async () => {
        putStoredSession({ refreshToken: '' });

        await expect(getStoredSession(userId)).resolves.toBeNull();

        expect(storageMock.secureStoreValues.has(sessionSecureStoreKey())).toBe(false);
        expect(loggerMock.warn).toHaveBeenCalledWith('stored session is missing refresh token');
    });

    it('drops locally expired refresh sessions before returning them', async () => {
        putStoredSession({
            refreshTokenExpiresAt: new Date(Date.now() - 60 * 1000),
        });

        await expect(getStoredSession(userId)).resolves.toBeNull();

        expect(storageMock.secureStoreValues.has(sessionSecureStoreKey())).toBe(false);
        expect(loggerMock.warn).toHaveBeenCalledWith('stored session refresh token is past local expiry');
    });

    it('does not delete an existing refresh session after a transient secure-storage read error', async () => {
        putStoredSession({ refreshToken: 'still-valid-refresh-token' });
        storageMock.secureStore.getItemAsync.mockRejectedValueOnce(new Error('temporarily unavailable'));

        await expect(getStoredSession(userId)).resolves.toBeNull();

        const storedValue = storageMock.secureStoreValues.get(sessionSecureStoreKey());
        expect(storedValue).toBeDefined();
        expect(JSON.parse(storedValue ?? '{}')).toMatchObject({
            refreshToken: 'still-valid-refresh-token',
        });
        expect(storageMock.secureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('keeps MFA trust false whenever MFA is disabled', async () => {
        putStoredSession({ mfaEnabled: true, mfaTrusted: true });

        await updateStoredSessionMfaState(userId, false, true);

        const storedSession = JSON.parse(storageMock.secureStoreValues.get(sessionSecureStoreKey()) ?? '{}');
        expect(storedSession).toMatchObject({
            mfaEnabled: false,
            mfaTrusted: false,
        });
    });

    it('updates MFA trust and emits the restored MFA state', async () => {
        putStoredSession({ mfaEnabled: true, mfaTrusted: false });

        await updateStoredSessionMfaTrust(userId, true);

        const storedSession = JSON.parse(storageMock.secureStoreValues.get(sessionSecureStoreKey()) ?? '{}');
        expect(storedSession).toMatchObject({
            mfaEnabled: true,
            mfaTrusted: true,
        });
        expect(eventMock.addEvent).toHaveBeenCalledWith('mfaState', {
            mfaState: { mfaTrusted: true, mfaEnabled: true },
        });
    });

    it('clears stored sessions and resets published MFA state', async () => {
        putStoredSession({});

        await clearStoredSession(userId);

        expect(storageMock.secureStoreValues.has(sessionSecureStoreKey())).toBe(false);
        expect(eventMock.addEvent).toHaveBeenCalledWith('mfaState', {
            mfaState: { mfaTrusted: false, mfaEnabled: false },
        });
    });
});

describe('local session lock marker', () => {
    it('writes and clears the local lock marker without persistent side effects for blank users', async () => {
        await setLocalSessionLocked('   ', true);
        await expect(isLocalSessionLocked('   ')).resolves.toBe(false);
        expect(storageMock.secureStore.setItemAsync).not.toHaveBeenCalled();

        await setLocalSessionLocked(userId, true);
        await expect(isLocalSessionLocked(userId)).resolves.toBe(true);
        expect(storageMock.secureStoreValues.get(localLockSecureStoreKey())).toBe('true');

        await setLocalSessionLocked(userId, false);
        await expect(isLocalSessionLocked(userId)).resolves.toBe(false);
        expect(storageMock.secureStoreValues.has(localLockSecureStoreKey())).toBe(false);
    });

    it('fails closed when the lock marker cannot be read', async () => {
        storageMock.secureStore.getItemAsync.mockRejectedValueOnce(new Error('native unavailable'));
        await expect(isLocalSessionLocked(userId)).resolves.toBe(true);
    });
});

describe('Firebase auth secure storage adapter', () => {
    it('round-trips Firebase auth values with SecureStore-safe physical keys', async () => {
        const firebaseAuthKey = 'firebase:authUser:api-key:[DEFAULT]';

        await secureAuthStorage.setItem(firebaseAuthKey, '{"uid":"user-123"}');

        expect(storageMock.secureStoreValues.has(firebaseAuthKey)).toBe(false);
        expect(storageMock.secureStoreValues.get(toSecureStoreKey(firebaseAuthKey))).toBe('{"uid":"user-123"}');
        await expect(secureAuthStorage.getItem(firebaseAuthKey)).resolves.toBe('{"uid":"user-123"}');
        await expect(secureAuthStorage.getItem('missing-auth-state')).resolves.toBeNull();

        await secureAuthStorage.removeItem(firebaseAuthKey);
        await expect(secureAuthStorage.getItem(firebaseAuthKey)).resolves.toBeNull();
    });

    it('stores oversized Firebase auth state through AES using base64 strings for Android', async () => {
        const firebaseAuthKey = 'firebase:authUser:api-key:[DEFAULT]';
        const authState = JSON.stringify({
            uid: 'user-123',
            email: 'superkick@purr.ivacy',
            stsTokenManager: {
                refreshToken: 'refresh-token'.repeat(180),
                accessToken: 'access-token'.repeat(180),
            },
            appName: '[DEFAULT]',
        });
        const expectedPlaintextBase64 = Buffer.from(authState, 'utf8').toString('base64');

        await secureAuthStorage.setItem(firebaseAuthKey, authState);

        expect(storageMock.secureStoreValues.get(toSecureStoreKey(firebaseAuthKey)))
            .toBe(`purrivacy:sqlite-encrypted:v1:${firebaseAuthKey}`);
        expect(aesMock().encryptAsync).toHaveBeenCalledWith(
            expectedPlaintextBase64,
            expect.anything(),
            { tagLength: 16 },
        );
        expect(aesMock().encryptAsync.mock.calls[0][0]).not.toContain('superkick@purr.ivacy');
        await expect(secureAuthStorage.getItem(firebaseAuthKey)).resolves.toBe(authState);
        expect(aesMock().decryptAsync).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            { output: 'base64' },
        );
    });

    it('surfaces secure-storage failures to Firebase auth persistence', async () => {
        storageMock.secureStore.setItemAsync.mockRejectedValueOnce(new Error('secure storage write failed'));

        await expect(secureAuthStorage.setItem('firebase-auth-state', 'value'))
            .rejects
            .toThrow('secure storage write failed');
    });

    it('keeps large sensitive values encrypted in SQLite instead of SecureStore', async () => {
        const largeValue = 'x'.repeat(2000);

        await secureAuthStorage.setItem('large-auth-state', largeValue);

        expect(storageMock.secureStoreValues.get(toSecureStoreKey('large-auth-state'))).toBe('purrivacy:sqlite-encrypted:v1:large-auth-state');
        expect(storageMock.getSqliteStore('purrivacy_encrypted_values.db').get('large-auth-state')).not.toContain(largeValue);
        await expect(secureAuthStorage.getItem('large-auth-state')).resolves.toBe(largeValue);

        await secureAuthStorage.removeItem('large-auth-state');
        expect(storageMock.getSqliteStore('purrivacy_encrypted_values.db').has('large-auth-state')).toBe(false);
    });

    it('drops malformed encrypted SQLite values instead of breaking Firebase auth startup', async () => {
        const firebaseAuthKey = 'firebase:authUser:api-key:[DEFAULT]';
        const sqliteStore = storageMock.getSqliteStore('purrivacy_encrypted_values.db');
        storageMock.secureStoreValues.set(
            toSecureStoreKey(firebaseAuthKey),
            `purrivacy:sqlite-encrypted:v1:${firebaseAuthKey}`,
        );
        sqliteStore.set(firebaseAuthKey, JSON.stringify({ version: 1, ciphertext: 'old-shape' }));

        await expect(secureAuthStorage.getItem(firebaseAuthKey)).resolves.toBeNull();

        expect(storageMock.secureStoreValues.has(toSecureStoreKey(firebaseAuthKey))).toBe(false);
        expect(sqliteStore.has(firebaseAuthKey)).toBe(false);
        expect(aesMock().decryptAsync).not.toHaveBeenCalled();
    });
});

describe('biometric protected storage', () => {
    const keyAlias = 'biometric-key-user-123';
    const storageKey = 'biometric-dek-user-123';
    const markerKey = `purrivacy:biometric-marker:${keyAlias}`;
    const preferencesStore = (): Map<string, string> => (
        storageMock.getSqliteStore('purrivacy_preferences.db')
    );

    it('round-trips biometric protected values with a marker hint', async () => {
        await expect(SecureStorageModule.setBiometricProtectedValue(
            keyAlias,
            storageKey,
            'dek-value',
            'Authenticate',
        )).resolves.toMatchObject({ success: true });

        expect(preferencesStore().get(markerKey)).toBe('true');
        expect(storageMock.secureStoreValues.get(toSecureStoreKey(storageKey))).toBe('dek-value');

        await expect(SecureStorageModule.getBiometricProtectedValue(
            keyAlias,
            storageKey,
            'Authenticate',
        )).resolves.toMatchObject({
            success: true,
            value: 'dek-value',
        });
    });

    it('fails closed and clears the marker when the biometric secret is missing', async () => {
        preferencesStore().set(markerKey, 'true');

        await expect(SecureStorageModule.getBiometricProtectedValue(
            keyAlias,
            storageKey,
            'Authenticate',
        )).resolves.toMatchObject({
            success: false,
            code: 'BIOMETRIC_VALUE_NOT_FOUND',
        });

        expect(preferencesStore().has(markerKey)).toBe(false);
    });

    it('reports biometric support from the Expo module surface', () => {
        expect(hasBiometricProtectedStorage()).toBe(true);
        expect(hasStandaloneBiometricAuth()).toBe(true);
    });
});
