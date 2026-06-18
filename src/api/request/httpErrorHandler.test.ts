import { describe, expect, it, vi, beforeEach } from 'vitest';

const eventServiceMock = vi.hoisted(() => ({
    addEvent: vi.fn(),
}));

const mfaUtilsMock = vi.hoisted(() => ({
    getIsInMfaHandler: vi.fn(() => false),
}));

const mfaErrorHandlerMock = vi.hoisted(() => ({
    handleRateLimitError: vi.fn(async () => { }),
    handleSensitiveMfaError: vi.fn(async () => ({})),
    handleSessionMfaError: vi.fn(async () => ({})),
    handleMissingHeadersError: vi.fn(async () => ({})),
}));

vi.mock('../../services/eventService', () => ({
    EventService: eventServiceMock,
}));

vi.mock('../../features/mfa/domain/mfaUtils', () => ({
    MfaUtils: mfaUtilsMock,
}));

vi.mock('../../features/mfa/api/mfaErrorHandler', () => ({
    MfaErrorHandler: mfaErrorHandlerMock,
}));

vi.mock('../../utils/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { handleHttpError } from './httpErrorHandler';
import { ApiRequestError } from '../apiError';
import { AuthFlowError } from '../auth/authFlowError';

const noop = async () => ({} as any);

describe('handleHttpError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('emits clearMfaCode for wrongMfaCode errors', async () => {
        await expect(
            handleHttpError(400, { wrongMfaCode: true }, '/api/test', 'POST', {}, false, false, undefined, noop, noop),
        ).rejects.toThrow();
        expect(eventServiceMock.addEvent).toHaveBeenCalledWith('clearMfaCode', { isWrongMfaCode: true });
    });

    it('delegates to MfaErrorHandler for 429 status', async () => {
        await expect(
            handleHttpError(429, { error: 'rate limited' }, '/api/test', 'GET', {}, false, false, undefined, noop, noop),
        ).rejects.toThrow();
        expect(mfaErrorHandlerMock.handleRateLimitError).toHaveBeenCalled();
    });

    it('throws AuthFlowError for refresh endpoint with refreshTokenMissing', async () => {
        await expect(
            handleHttpError(401, { refreshTokenMissing: true }, '/auth/session/refresh', 'POST', {}, true, true, undefined, noop, noop),
        ).rejects.toMatchObject({
            name: 'AuthFlowError',
            sessionError: { refreshTokenMissing: true },
            status: 401,
        });
    });

    it('triggers sign-out for auth-invalidating errors with retryOnFailure', async () => {
        await expect(
            handleHttpError(401, { refreshTokenMissing: true }, '/api/test', 'GET', {}, true, true, undefined, noop, noop),
        ).rejects.toThrow(ApiRequestError);
        expect(eventServiceMock.addEvent).toHaveBeenCalledWith('signOut');
    });

    it('triggers sign-out for auth-invalidating errors without retryOnFailure', async () => {
        await expect(
            handleHttpError(401, { bearerTokenInvalid: true }, '/api/test', 'GET', {}, true, false, undefined, noop, noop),
        ).rejects.toThrow(ApiRequestError);
        expect(eventServiceMock.addEvent).toHaveBeenCalledWith('signOut');
    });

    it('throws ApiRequestError for non-retryable generic errors', async () => {
        await expect(
            handleHttpError(500, { error: 'server error' }, '/api/test', 'GET', {}, false, false, undefined, noop, noop),
        ).rejects.toThrow(ApiRequestError);
    });

    it('throws AuthFlowError for session endpoint with mfaRequired', async () => {
        await expect(
            handleHttpError(403, { mfaRequired: true }, '/auth/session', 'POST', {}, true, false, undefined, noop, noop),
        ).rejects.toMatchObject({
            name: 'AuthFlowError',
            sessionError: { mfaRequired: true },
            status: 403,
        });
    });

    it('delegates to handleSensitiveMfaError for mfaRequiredSensitive with retry', async () => {
        mfaErrorHandlerMock.handleSensitiveMfaError.mockResolvedValueOnce({ success: true });
        const requestFn = vi.fn(async () => ({} as any));

        const result = await handleHttpError(
            403, { mfaRequiredSensitive: true },
            '/api/test', 'POST', {}, true, true, {}, requestFn, noop,
        );
        expect(result).toEqual({ success: true });
        expect(mfaErrorHandlerMock.handleSensitiveMfaError).toHaveBeenCalled();
    });

    it('delegates to handleSessionMfaError for session mfaRequired with retry', async () => {
        mfaErrorHandlerMock.handleSessionMfaError.mockResolvedValueOnce({ success: true });
        const requestFn = vi.fn(async () => ({} as any));

        const result = await handleHttpError(
            403, { mfaRequired: true },
            '/auth/session', 'POST', {}, true, true, {}, requestFn, noop,
        );
        expect(result).toEqual({ success: true });
        expect(mfaErrorHandlerMock.handleSessionMfaError).toHaveBeenCalled();
    });

    it('refreshes session on accessTokenExpired with retry', async () => {
        const sessionResponse = { accessToken: 'new-at' };
        const createSession = vi.fn(async () => sessionResponse);
        const requestFn = vi.fn(async () => ({ result: 'ok' }));

        await handleHttpError(
            401, { accessTokenExpired: true },
            '/api/test', 'GET', {}, true, true, undefined, requestFn, createSession,
        );
        expect(createSession).toHaveBeenCalledWith(true);
        expect(requestFn).toHaveBeenCalledWith('/api/test', 'GET', {}, true, undefined, false);
    });

    it('signs out for accessTokenInvalid (in auth-invalidating list)', async () => {
        await expect(
            handleHttpError(
                401, { accessTokenInvalid: true },
                '/api/test', 'GET', {}, true, true, {}, vi.fn(), noop,
            ),
        ).rejects.toThrow(ApiRequestError);
        expect(eventServiceMock.addEvent).toHaveBeenCalledWith('signOut');
    });

    it('throws AuthFlowError with wrongMfaCode when MfaHandler is active', async () => {
        mfaUtilsMock.getIsInMfaHandler.mockReturnValueOnce(true);

        await expect(
            handleHttpError(
                400, { wrongMfaCode: true, mfaRequired: true },
                '/api/test', 'POST', {}, false, true, undefined, noop, noop,
            ),
        ).rejects.toMatchObject({
            name: 'AuthFlowError',
            wrongMfaCode: true,
        });
    });

    it('throws AuthFlowError when MFA required but does not need auth (retry path)', async () => {
        await expect(
            handleHttpError(
                403, { mfaRequiredSensitive: true },
                '/api/test', 'POST', {}, false, true, undefined, noop, noop,
            ),
        ).rejects.toMatchObject({
            name: 'AuthFlowError',
            sessionError: { mfaRequiredSensitive: true },
            status: 403,
        });
    });

    it('triggers sign-out for non-session MFA required without retry', async () => {
        await expect(
            handleHttpError(
                403, { mfaRequired: true },
                '/api/test', 'POST', {}, true, false, undefined, noop, noop,
            ),
        ).rejects.toThrow(ApiRequestError);
        expect(eventServiceMock.addEvent).toHaveBeenCalledWith('signOut');
    });

    it('throws AuthFlowError for session MFA without retry', async () => {
        await expect(
            handleHttpError(
                403, { mfaRequired: true },
                '/auth/session', 'POST', {}, true, false, undefined, noop, noop,
            ),
        ).rejects.toMatchObject({
            name: 'AuthFlowError',
            sessionError: { mfaRequired: true },
            status: 403,
        });
    });

    it('signs out for bearerTokenInvalid without requiresAuth', async () => {
        await expect(
            handleHttpError(
                401, { bearerTokenInvalid: true },
                '/api/test', 'GET', {}, false, false, undefined, noop, noop,
            ),
        ).rejects.toThrow(ApiRequestError);
        expect(eventServiceMock.addEvent).toHaveBeenCalledWith('signOut');
    });
});
