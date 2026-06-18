import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateUserApi = vi.hoisted(() => vi.fn());
const mockCreateRecoveryApi = vi.hoisted(() => vi.fn());
const mockCreateMfaApi = vi.hoisted(() => vi.fn());
const mockCreateApiRequester = vi.hoisted(() => vi.fn());
const mockGetUserId = vi.hoisted(() => vi.fn(() => 'user-123'));
const mockSessionManagerClass = vi.hoisted(() => vi.fn());

vi.mock('./core/apiRequestFactory', () => ({
    createApiRequester: mockCreateApiRequester,
}));

vi.mock('./user/userApi', () => ({
    createUserApi: mockCreateUserApi,
}));

vi.mock('./auth/recoveryApi', () => ({
    createRecoveryApi: mockCreateRecoveryApi,
}));

vi.mock('./mfa/mfaApi', () => ({
    createMfaApi: mockCreateMfaApi,
}));

vi.mock('./session/sessionManager', () => ({
    SessionManager: mockSessionManagerClass,
}));

vi.mock('../features/auth/domain/authUtils', () => ({
    getUserId: mockGetUserId,
}));

import { ApiClient } from './client';
import { __testResetApiClient, __testSetSessionManager, __testSetUserApi, __testSetRecoveryApi, __testSetMfaApi } from './client';

const makeSm = (): Record<string, ReturnType<typeof vi.fn>> => ({
    storeSessionResponse: vi.fn(),
    clearInMemoryAccessToken: vi.fn(),
    syncRemoteMfaState: vi.fn(),
    createSession: vi.fn(),
    revokeAllSessions: vi.fn(),
    signOut: vi.fn(),
});

beforeEach(() => {
    vi.clearAllMocks();
    __testResetApiClient();
});

describe('ApiClient', () => {
    describe('lazy initialization', () => {
        it('does not create singletons at import time', () => {
            expect(mockCreateApiRequester).not.toHaveBeenCalled();
            expect(mockCreateUserApi).not.toHaveBeenCalled();
            expect(mockCreateRecoveryApi).not.toHaveBeenCalled();
            expect(mockCreateMfaApi).not.toHaveBeenCalled();
        });

        it('initializes all singletons on first access', async () => {
            const requestFn = vi.fn();
            mockCreateApiRequester.mockReturnValue(requestFn);
            const userApi = { get: vi.fn(async () => ({ keys: [] })) };
            mockCreateUserApi.mockReturnValue(userApi);

            await ApiClient.get();

            expect(mockCreateApiRequester).toHaveBeenCalledTimes(1);
            expect(mockCreateUserApi).toHaveBeenCalledTimes(1);
            expect(mockCreateRecoveryApi).toHaveBeenCalledTimes(1);
            expect(mockCreateMfaApi).toHaveBeenCalledTimes(1);
            expect(userApi.get).toHaveBeenCalled();
        });
    });

    describe('session methods delegate to SessionManager', () => {
        it('delegates storeSessionResponse', async () => {
            const sm = makeSm();
            __testSetSessionManager(sm as any);

            await ApiClient.storeSessionResponse({ accessToken: 'at' } as any, 'user-1');

            expect(sm.storeSessionResponse).toHaveBeenCalledWith({ accessToken: 'at' }, 'user-1');
        });

        it('delegates clearInMemoryAccessToken', () => {
            const sm = makeSm();
            __testSetSessionManager(sm as any);

            ApiClient.clearInMemoryAccessToken();

            expect(sm.clearInMemoryAccessToken).toHaveBeenCalled();
        });

        it('delegates createSession', async () => {
            const sm = makeSm();
            sm.createSession.mockResolvedValue({ accessToken: 'at' });
            __testSetSessionManager(sm as any);

            const result = await ApiClient.createSession(true, '123456');

            expect(sm.createSession).toHaveBeenCalledWith(true, '123456', false);
            expect(result).toEqual({ accessToken: 'at' });
        });

        it('delegates signOut', async () => {
            const sm = makeSm();
            __testSetSessionManager(sm as any);

            await ApiClient.signOut();

            expect(sm.signOut).toHaveBeenCalled();
        });

        it('delegates revokeAllSessions', async () => {
            const sm = makeSm();
            __testSetSessionManager(sm as any);

            await ApiClient.revokeAllSessions();

            expect(sm.revokeAllSessions).toHaveBeenCalled();
        });
    });

    describe('user API delegates', () => {
        it('delegates user creation', async () => {
            const ua = { create: vi.fn(async () => ({})) } as any;
            __testSetUserApi(ua);

            await ApiClient.create({} as any);

            expect(ua.create).toHaveBeenCalled();
        });

        it('delegates getKeyRecords', async () => {
            const ua = { getKeyRecords: vi.fn(async () => ({ keys: [] })) } as any;
            __testSetUserApi(ua);

            await ApiClient.getKeyRecords();

            expect(ua.getKeyRecords).toHaveBeenCalled();
        });

        it('delegates deleteUser', async () => {
            const ua = { deleteUser: vi.fn(async () => { }) } as any;
            __testSetUserApi(ua);

            await ApiClient.delete();

            expect(ua.deleteUser).toHaveBeenCalled();
        });
    });

    describe('recovery API delegates', () => {
        it('delegates getRecoveryChallenge', async () => {
            const ra = { getRecoveryChallenge: vi.fn(async () => ({ challenge: 'c' })) } as any;
            __testSetRecoveryApi(ra);

            const result = await ApiClient.getRecoveryChallenge('testuser');

            expect(ra.getRecoveryChallenge).toHaveBeenCalledWith('testuser');
            expect(result).toEqual({ challenge: 'c' });
        });

        it('delegates createRecoveryToken', async () => {
            const ra = { createRecoveryToken: vi.fn(async () => ({ token: 't' })) } as any;
            __testSetRecoveryApi(ra);

            const result = await ApiClient.createRecoveryToken('testuser', 'verifier');

            expect(ra.createRecoveryToken).toHaveBeenCalledWith('testuser', 'verifier');
            expect(result).toEqual({ token: 't' });
        });
    });

    describe('MFA API delegates', () => {
        it('delegates setupMfa', async () => {
            const ma = { setupMfa: vi.fn(async () => ({ secret: 's' })) } as any;
            __testSetMfaApi(ma);

            const result = await ApiClient.setupMfa();

            expect(ma.setupMfa).toHaveBeenCalled();
            expect(result).toEqual({ secret: 's' });
        });

        it('delegates enableMfa', async () => {
            const ma = { enableMfa: vi.fn(async () => ({})) } as any;
            __testSetMfaApi(ma);

            await ApiClient.enableMfa();

            expect(ma.enableMfa).toHaveBeenCalled();
        });

        it('delegates trustSession', async () => {
            const ma = { trustSession: vi.fn(async () => ({ mfaTrusted: true })) } as any;
            __testSetMfaApi(ma);

            const result = await ApiClient.trustSession(true);

            expect(ma.trustSession).toHaveBeenCalledWith(true);
            expect(result).toEqual({ mfaTrusted: true });
        });
    });

    describe('resetForTesting', () => {
        it('re-initializes singletons after reset', async () => {
            const sm = makeSm();
            sm.createSession.mockResolvedValue({ accessToken: 'first' });
            __testSetSessionManager(sm as any);

            await expect(ApiClient.createSession(false)).resolves.toEqual({ accessToken: 'first' });

            __testResetApiClient();

            const sm2 = makeSm();
            sm2.createSession.mockResolvedValue({ accessToken: 'second' });
            __testSetSessionManager(sm2 as any);

            await expect(ApiClient.createSession(false)).resolves.toEqual({ accessToken: 'second' });
        });
    });
});
