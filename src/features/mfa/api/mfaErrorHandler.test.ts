import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMfaUtils = vi.hoisted(() => ({
    executeMfaFlow: vi.fn(),
    handleSessionCreationWithMfa: vi.fn(),
    createRetryOptions: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

const mockAuthFlowErrorModule = vi.hoisted(() => ({
    AuthFlowError: class AuthFlowError extends Error {
        mfaCancelled?: boolean;
        mfaTimedOut?: boolean;
        rateLimited?: boolean;
        requiresSignOut?: boolean;
        retryAfter?: string;
        retryAfterSeconds?: number;
        sessionError?: any;
        status?: number;
        wrongMfaCode?: boolean;
        constructor(message: string, options: any = {}) {
            super(message);
            this.name = 'AuthFlowError';
            Object.assign(this, options);
        }
    },
}));

vi.mock('../../mfa/domain/mfaUtils', () => ({
    MfaUtils: mockMfaUtils,
}));

vi.mock('../../../utils/logger', () => ({
    logger: mockLogger,
}));

vi.mock('../../../api/auth/authFlowError', () => mockAuthFlowErrorModule);

vi.mock('../../security/services/securityService', () => ({
    securityService: { storeSession: vi.fn(), getStoredSession: vi.fn() },
}));

vi.mock('../../auth/domain/authUtils', () => ({
    getUserId: vi.fn(() => 'user-123'),
}));

import { MfaErrorHandler } from '../../mfa/api/mfaErrorHandler';

const requestFn = vi.fn();
const createSessionFn = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    mockMfaUtils.createRetryOptions.mockImplementation((opts: any, code: string) => ({
        ...opts,
        mfaCode: code,
    }));
});

describe('MfaErrorHandler.handleSensitiveMfaError', () => {
    it('calls executeMfaFlow with isSensitive: true and isLoginFlow: false', async () => {
        mockMfaUtils.executeMfaFlow.mockImplementationOnce(async (params: any) => {
            return params.onMfaCode('123456');
        });
        requestFn.mockResolvedValueOnce({ ok: true });

        const result = await MfaErrorHandler.handleSensitiveMfaError(
            '/user/change-password',
            'POST',
            { password: 'new' },
            true,
            true,
            {},
            requestFn,
        );

        expect(mockMfaUtils.executeMfaFlow).toHaveBeenCalledWith(
            expect.objectContaining({
                isSensitive: true,
                isLoginFlow: false,
            }),
        );
        expect(mockMfaUtils.createRetryOptions).toHaveBeenCalledWith({}, '123456');
        expect(requestFn).toHaveBeenCalledWith(
            '/user/change-password',
            'POST',
            { password: 'new' },
            true,
            { mfaCode: '123456' },
            true,
        );
        expect(result).toEqual({ ok: true });
    });

    it('propagates the error when onError is called', async () => {
        const testError = new Error('MFA cancelled');
        mockMfaUtils.executeMfaFlow.mockImplementationOnce(async (params: any) => {
            params.onError(testError);
            throw testError;
        });

        await expect(
            MfaErrorHandler.handleSensitiveMfaError(
                '/test', 'POST', {}, true, false, {}, requestFn,
            ),
        ).rejects.toThrow('MFA cancelled');
    });
});

describe('MfaErrorHandler.handleSessionMfaError', () => {
    it('calls executeMfaFlow with isLoginFlow: true', async () => {
        mockMfaUtils.executeMfaFlow.mockImplementationOnce(async (params: any) => {
            return params.onMfaCode('654321');
        });
        mockMfaUtils.handleSessionCreationWithMfa.mockResolvedValueOnce({
            accessToken: 'at',
            refreshToken: 'rt',
        });

        const result = await MfaErrorHandler.handleSessionMfaError(
            '/auth/session',
            'POST',
            {},
            true,
            true,
            {},
            true,
            requestFn,
            createSessionFn,
        );

        expect(mockMfaUtils.executeMfaFlow).toHaveBeenCalledWith(
            expect.objectContaining({
                isSensitive: false,
                isLoginFlow: true,
            }),
        );
        expect(mockMfaUtils.handleSessionCreationWithMfa).toHaveBeenCalledWith(
            '654321',
            createSessionFn,
            true,
        );
        expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });

    it('retries the original request when isSession is false', async () => {
        mockMfaUtils.executeMfaFlow.mockImplementationOnce(async (params: any) => {
            return params.onMfaCode('999999');
        });
        mockMfaUtils.handleSessionCreationWithMfa.mockResolvedValueOnce({
            accessToken: 'at',
            refreshToken: 'rt',
        });
        requestFn.mockResolvedValueOnce({ ok: true });

        const result = await MfaErrorHandler.handleSessionMfaError(
            '/user/key-records',
            'GET',
            undefined,
            true,
            true,
            {},
            false,
            requestFn,
            createSessionFn,
        );

        expect(result).toEqual({ ok: true });
    });
});

describe('MfaErrorHandler.handleMissingHeadersError', () => {
    it('throws immediately when does not require auth', async () => {
        await expect(
            MfaErrorHandler.handleMissingHeadersError(
                '/test',
                'GET',
                undefined,
                false,
                false,
                {},
                { error: 'Missing headers' } as any,
                requestFn,
                createSessionFn,
            ),
        ).rejects.toThrow('Missing headers');
    });

    it('creates a session and retries when requires auth', async () => {
        createSessionFn.mockResolvedValueOnce({ accessToken: 'at' });
        requestFn.mockResolvedValueOnce({ ok: true });

        const result = await MfaErrorHandler.handleMissingHeadersError(
            '/test',
            'GET',
            undefined,
            true,
            true,
            {},
            {},
            requestFn,
            createSessionFn,
        );

        expect(createSessionFn).toHaveBeenCalledWith(true);
        expect(requestFn).toHaveBeenCalledWith('/test', 'GET', undefined, true, {});
        expect(result).toEqual({ ok: true });
    });

    it('wraps MFA-required session errors as AuthFlowError', async () => {
        const sessionError = { mfaRequired: true };
        createSessionFn.mockRejectedValueOnce({ sessionError, status: 403 });

        await expect(
            MfaErrorHandler.handleMissingHeadersError(
                '/test', 'GET', undefined, true, false, {}, {},
                requestFn, createSessionFn,
            ),
        ).rejects.toMatchObject({
            message: 'MFA is required to continue',
        });
    });

    it('wraps non-MFA session failures as AuthFlowError', async () => {
        createSessionFn.mockRejectedValueOnce(new Error('Failed'));

        await expect(
            MfaErrorHandler.handleMissingHeadersError(
                '/test', 'GET', undefined, true, false, {}, {},
                requestFn, createSessionFn,
            ),
        ).rejects.toMatchObject({
            message: 'Authentication headers are missing',
        });
    });
});

describe('MfaErrorHandler.handleRateLimitError', () => {
    it('throws AuthFlowError with rate limit flags and parsed retryAfter', async () => {
        await expect(
            MfaErrorHandler.handleRateLimitError({
                retryAfter: '60',
                error: 'Rate limited',
            }),
        ).rejects.toMatchObject({
            rateLimited: true,
            retryAfterSeconds: 60,
            status: 429,
        });
    });

    it('handles missing retryAfter gracefully', async () => {
        await expect(
            MfaErrorHandler.handleRateLimitError({ error: 'Too many requests' }),
        ).rejects.toMatchObject({
            rateLimited: true,
        });
    });
});
