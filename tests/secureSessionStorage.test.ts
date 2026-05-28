import { beforeEach, describe, expect, it, vi } from 'vitest';

type SecureStorageResponse = {
    success?: boolean;
    value?: string;
    code?: string;
    message?: string;
};

const storageMock = vi.hoisted(() => {
    const sensitiveValues = new Map<string, string>();

    const secureStorageModule = {
        setSensitiveValue: vi.fn(async (key: string, value: string): Promise<SecureStorageResponse> => {
            sensitiveValues.set(key, value);
            return { success: true };
        }),
        getSensitiveValue: vi.fn(async (key: string): Promise<SecureStorageResponse> => ({
            success: true,
            value: sensitiveValues.get(key),
        })),
        deleteSensitiveValue: vi.fn(async (key: string): Promise<SecureStorageResponse> => {
            sensitiveValues.delete(key);
            return { success: true };
        }),
        setValue: vi.fn(),
        getValue: vi.fn(),
        deleteValue: vi.fn(),
        deleteBiometricKey: vi.fn(),
        authenticateBiometric: vi.fn(),
        isBiometricAvailable: vi.fn(),
        isBiometricEnabledInApp: vi.fn(),
        isBiometricEnabledOnPhone: vi.fn(),
    };

    return { secureStorageModule, sensitiveValues };
});

const eventMock = vi.hoisted(() => ({
    addEvent: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('react-native', () => ({
    NativeModules: {
        SecureStorageModule: storageMock.secureStorageModule,
    },
}));

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
    clearStoredSession,
    getStoredSession,
    storeSession,
    updateStoredSessionMfaState,
    updateStoredSessionMfaTrust,
} from '../src/features/security/services/storedSessionService';
import { SessionResponse, StoredSession } from '../src/types/types';

const userId = 'user-123';

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
    storageMock.sensitiveValues.set(`${SESSION_PREFIX}${userId}`, JSON.stringify({
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        mfaTrusted: true,
        mfaEnabled: true,
        ...session,
    }));
};

beforeEach(() => {
    storageMock.sensitiveValues.clear();
    Object.values(storageMock.secureStorageModule).forEach(mock => mock.mockClear());
    Object.values(eventMock).forEach(mock => mock.mockClear());
    Object.values(loggerMock).forEach(mock => mock.mockClear());
});

describe('stored session secure storage', () => {
    it('stores refresh sessions by user and restores expiry values as Dates', async () => {
        const refreshTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        await storeSession(createSessionResponse({ refreshTokenExpiresAt }), userId);

        const storedValue = storageMock.sensitiveValues.get(`${SESSION_PREFIX}${userId}`);
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

        expect(storageMock.sensitiveValues.has(`${SESSION_PREFIX}${userId}`)).toBe(false);
        expect(loggerMock.warn).toHaveBeenCalledWith('stored session is missing refresh token');
    });

    it('drops locally expired refresh sessions before returning them', async () => {
        putStoredSession({
            refreshTokenExpiresAt: new Date(Date.now() - 60 * 1000),
        });

        await expect(getStoredSession(userId)).resolves.toBeNull();

        expect(storageMock.sensitiveValues.has(`${SESSION_PREFIX}${userId}`)).toBe(false);
        expect(loggerMock.warn).toHaveBeenCalledWith('stored session refresh token is past local expiry');
    });

    it('does not delete an existing refresh session after a transient secure-storage read error', async () => {
        putStoredSession({ refreshToken: 'still-valid-refresh-token' });
        storageMock.secureStorageModule.getSensitiveValue.mockResolvedValueOnce({
            success: false,
            code: 'SECURE_STORAGE_ERROR',
            message: 'temporarily unavailable',
        });

        await expect(getStoredSession(userId)).resolves.toBeNull();

        const storedValue = storageMock.sensitiveValues.get(`${SESSION_PREFIX}${userId}`);
        expect(storedValue).toBeDefined();
        expect(JSON.parse(storedValue ?? '{}')).toMatchObject({
            refreshToken: 'still-valid-refresh-token',
        });
        expect(storageMock.secureStorageModule.deleteSensitiveValue).not.toHaveBeenCalled();
    });

    it('keeps MFA trust false whenever MFA is disabled', async () => {
        putStoredSession({ mfaEnabled: true, mfaTrusted: true });

        await updateStoredSessionMfaState(userId, false, true);

        const storedSession = JSON.parse(storageMock.sensitiveValues.get(`${SESSION_PREFIX}${userId}`) ?? '{}');
        expect(storedSession).toMatchObject({
            mfaEnabled: false,
            mfaTrusted: false,
        });
    });

    it('updates MFA trust and emits the restored MFA state', async () => {
        putStoredSession({ mfaEnabled: true, mfaTrusted: false });

        await updateStoredSessionMfaTrust(userId, true);

        const storedSession = JSON.parse(storageMock.sensitiveValues.get(`${SESSION_PREFIX}${userId}`) ?? '{}');
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

        expect(storageMock.sensitiveValues.has(`${SESSION_PREFIX}${userId}`)).toBe(false);
        expect(eventMock.addEvent).toHaveBeenCalledWith('mfaState', {
            mfaState: { mfaTrusted: false, mfaEnabled: false },
        });
    });
});

describe('local session lock marker', () => {
    it('writes and clears the local lock marker without persistent side effects for blank users', async () => {
        await setLocalSessionLocked('   ', true);
        await expect(isLocalSessionLocked('   ')).resolves.toBe(false);
        expect(storageMock.secureStorageModule.setSensitiveValue).not.toHaveBeenCalled();

        await setLocalSessionLocked(userId, true);
        await expect(isLocalSessionLocked(userId)).resolves.toBe(true);
        expect(storageMock.sensitiveValues.get(`${LOCAL_LOCK_PREFIX}${userId}`)).toBe('true');

        await setLocalSessionLocked(userId, false);
        await expect(isLocalSessionLocked(userId)).resolves.toBe(false);
        expect(storageMock.sensitiveValues.has(`${LOCAL_LOCK_PREFIX}${userId}`)).toBe(false);
    });

    it('fails closed when the lock marker cannot be read', async () => {
        storageMock.secureStorageModule.getSensitiveValue.mockResolvedValueOnce({
            success: false,
            code: 'SECURE_STORAGE_ERROR',
            message: 'read failed',
        });
        await expect(isLocalSessionLocked(userId)).resolves.toBe(true);

        storageMock.secureStorageModule.getSensitiveValue.mockRejectedValueOnce(new Error('native unavailable'));
        await expect(isLocalSessionLocked(userId)).resolves.toBe(true);
    });
});

describe('Firebase auth secure storage adapter', () => {
    it('round-trips values through sensitive storage and returns null for missing keys', async () => {
        await secureAuthStorage.setItem('firebase-auth-state', '{"uid":"user-123"}');

        await expect(secureAuthStorage.getItem('firebase-auth-state')).resolves.toBe('{"uid":"user-123"}');
        await expect(secureAuthStorage.getItem('missing-auth-state')).resolves.toBeNull();

        await secureAuthStorage.removeItem('firebase-auth-state');
        await expect(secureAuthStorage.getItem('firebase-auth-state')).resolves.toBeNull();
    });

    it('surfaces native secure-storage failures to Firebase auth persistence', async () => {
        storageMock.secureStorageModule.setSensitiveValue.mockResolvedValueOnce({
            success: false,
            message: 'secure storage write failed',
        });

        await expect(secureAuthStorage.setItem('firebase-auth-state', 'value'))
            .rejects
            .toThrow('secure storage write failed');
    });
});
