import { MfaErrorHandler } from '../../features/mfa/api/mfaErrorHandler';
import { MfaUtils } from '../../features/mfa/domain/mfaUtils';
import { EventService } from '../../services/eventService';
import { ApiRequestError } from '../apiError';
import { AuthFlowError } from '../auth/authFlowError';
import type { CreateSessionFn, RequestFn, RequestOptions } from './requestOptions';

const signOut = (): never => {
    EventService.addEvent('signOut');
    throw new ApiRequestError('Authentication invalid. Please sign in again.', 401, { sessionInvalid: true });
};

const AUTH_INVALIDATING_ERROR_FLAGS = [
    'bearerTokenInvalid',
    'refreshTokenMissing',
    'refreshTokenInvalid',
    'refreshTokenExpired',
    'refreshTokenReuse',
    'sessionHeaderMissing',
    'sessionInvalid',
    'sessionExpired',
    'accessTokenInvalid',
    'accessTokenExpired',
];

const hasAuthInvalidatingError = (errorData: any): boolean => (
    AUTH_INVALIDATING_ERROR_FLAGS.some(error => errorData?.[error] === true)
);

export async function handleHttpError(
    status: number,
    errorData: any,
    endpoint: string,
    method: string,
    body: any,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions | undefined,
    requestFn: RequestFn,
    createSessionFn: CreateSessionFn,
): Promise<any> {
    if (errorData.wrongMfaCode) {
        EventService.addEvent('clearMfaCode', { isWrongMfaCode: true });
    }

    const isSession = endpoint === '/auth/session';
    const isRefresh = endpoint === '/auth/session/refresh';

    if (isRefresh) {
        if (
            errorData.mfaRequired ||
            errorData.refreshTokenMissing ||
            errorData.refreshTokenInvalid ||
            errorData.refreshTokenExpired ||
            errorData.refreshTokenReuse
        ) {
            throw new AuthFlowError('Refresh token error', { sessionError: errorData, status: status ?? 0 });
        }
    }

    if (errorData.wrongMfaCode && MfaUtils.getIsInMfaHandler()) {
        throw new AuthFlowError('Wrong MFA code', {
            wrongMfaCode: true,
            sessionError: {
                mfaRequired: errorData.mfaRequired,
                mfaRequiredSensitive: errorData.mfaRequiredSensitive,
            },
            status: status ?? 0,
        });
    }

    if (status === 429) {
        await MfaErrorHandler.handleRateLimitError(errorData);
    }

    if (retryOnFailure && !errorData.wrongMfaCode) {
        if (errorData.mfaRequiredSensitive || (errorData.mfaRequired && isSession)) {
            if (requiresAuth) {
                if (errorData.mfaRequiredSensitive) {
                    return await MfaErrorHandler.handleSensitiveMfaError(
                        endpoint, method, body, requiresAuth, retryOnFailure,
                        options || {}, requestFn,
                    );
                }

                return await MfaErrorHandler.handleSessionMfaError(
                    endpoint, method, body, requiresAuth, retryOnFailure,
                    options || {}, isSession, requestFn, createSessionFn,
                );
            }

            throw new AuthFlowError('MFA required but not authenticated', { sessionError: errorData, status: status ?? 0 });
        }

        if (
            requiresAuth &&
            !isSession &&
            !isRefresh &&
            (errorData.accessTokenExpired || errorData.accessTokenInvalid || errorData.sessionExpired || errorData.sessionInvalid)
        ) {
            const session = await createSessionFn(true);
            if (session?.accessToken) {
                return await requestFn(endpoint, method, body, requiresAuth, options, false);
            }
        }

        if (hasAuthInvalidatingError(errorData) || (errorData.mfaRequired && !isSession)) {
            signOut();
        }

        if (
            (errorData.sessionHeaderMissing || errorData.accessTokenInvalid || errorData.accessTokenExpired) &&
            endpoint !== '/auth/session'
        ) {
            return await MfaErrorHandler.handleMissingHeadersError(
                endpoint, method, body, requiresAuth, retryOnFailure, options || {}, errorData, requestFn, createSessionFn,
            );
        }
    }

    if (!retryOnFailure && !errorData.wrongMfaCode) {
        if (isSession && errorData.mfaRequired) {
            throw new AuthFlowError('MFA required for session', { sessionError: errorData, status: status ?? 0 });
        }

        if (hasAuthInvalidatingError(errorData) || (errorData.mfaRequired && !isSession)) {
            signOut();
        }
    }

    throw new ApiRequestError(errorData.error || `Request failed with status ${status}`, status, errorData);
}
