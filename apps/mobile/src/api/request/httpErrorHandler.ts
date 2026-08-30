import { getApiRuntime } from '../runtime';
import { EventService } from '../../services/eventService';
import { ApiRequestError } from '../apiError';
import { AuthFlowError } from '../auth/authFlowError';
import { isApiErrorData, isJsonObject } from './errorData';
import { hasRecentSessionSwap } from '../session/sessionSwap';
import type { AuthErrorResponse } from '../../types/types';
import type { CreateSessionFn, RequestFn, RequestOptions } from './requestOptions';

const signOut = (): never => {
    // MFA state transitions swap the session mid-flow: the backend revokes
    // the OLD family while the new session is stored client-side. A request
    // that raced the swap then refreshes with a revoked token
    // (refreshTokenReuse) — that is a stale-token artifact, not a dead
    // session. Stay quiet shortly after a swap so the app keeps using the
    // fresh session instead of logging the user out.
    if (!hasRecentSessionSwap()) {
        EventService.addEvent('signOut');
    }
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

const hasAuthInvalidatingError = (errorData: unknown): boolean => {
    const error = isJsonObject(errorData) ? errorData : null;
    return AUTH_INVALIDATING_ERROR_FLAGS.some(flag => error?.[flag] === true);
};

export async function handleHttpError(
    status: number,
    errorData: unknown,
    endpoint: string,
    method: string,
    body: unknown,
    requiresAuth: boolean,
    retryOnFailure: boolean,
    options: RequestOptions | undefined,
    requestFn: RequestFn,
    createSessionFn: CreateSessionFn,
): Promise<unknown> {
    // The backend error body is untrusted: only object payloads carry flags.
    // Non-object bodies (empty string, array, literal null) carry no flags and
    // fall through to the generic failure path.
    const error = isJsonObject(errorData) ? errorData : null;

    if (error?.wrongMfaCode) {
        EventService.addEvent('clearMfaCode', { isWrongMfaCode: true });
    }

    const isSession = endpoint === '/auth/session';
    const isRefresh = endpoint === '/auth/session/refresh';

    if (isRefresh) {
        if (
            error?.mfaRequired ||
            error?.refreshTokenMissing ||
            error?.refreshTokenInvalid ||
            error?.refreshTokenExpired ||
            error?.refreshTokenReuse
        ) {
            throw new AuthFlowError('Refresh token error', { sessionError: errorData as AuthErrorResponse | undefined, status: status ?? 0 });
        }
    }

    if (error?.wrongMfaCode && getApiRuntime().mfa.getIsInMfaHandler()) {
        throw new AuthFlowError('Wrong MFA code', {
            wrongMfaCode: true,
            sessionError: {
                mfaRequired: error?.mfaRequired as boolean | undefined,
                mfaRequiredSensitive: error?.mfaRequiredSensitive as boolean | undefined,
            },
            status: status ?? 0,
        });
    }

    if (status === 429) {
        // Guarded: a non-object 429 body is treated as having no retry info.
        await getApiRuntime().mfa.handleRateLimitError(isApiErrorData(errorData) ? errorData : {});
    }

    if (retryOnFailure && !error?.wrongMfaCode) {
        if (error?.mfaRequiredSensitive || (error?.mfaRequired && isSession)) {
            if (requiresAuth) {
                if (error?.mfaRequiredSensitive) {
                    return await getApiRuntime().mfa.handleSensitiveMfaError(
                        endpoint, method, body, requiresAuth, retryOnFailure,
                        options || {}, requestFn,
                    );
                }

                return await getApiRuntime().mfa.handleSessionMfaError(
                    endpoint, method, body, requiresAuth, retryOnFailure,
                    options || {}, isSession, requestFn, createSessionFn,
                );
            }

            throw new AuthFlowError('MFA required but not authenticated', { sessionError: errorData as AuthErrorResponse | undefined, status: status ?? 0 });
        }

        if (
            requiresAuth &&
            !isSession &&
            !isRefresh &&
            (error?.accessTokenExpired || error?.accessTokenInvalid || error?.sessionExpired || error?.sessionInvalid)
        ) {
            const session = await createSessionFn(true);
            if (session?.accessToken) {
                return await requestFn(endpoint, method, body, requiresAuth, options, false);
            }
        }

        if (hasAuthInvalidatingError(errorData) || (error?.mfaRequired && !isSession)) {
            signOut();
        }

        if (
            (error?.sessionHeaderMissing || error?.accessTokenInvalid || error?.accessTokenExpired) &&
            endpoint !== '/auth/session'
        ) {
            return await getApiRuntime().mfa.handleMissingHeadersError(
                endpoint, method, body, requiresAuth, retryOnFailure, options || {},
                isApiErrorData(errorData) ? errorData : {}, requestFn, createSessionFn,
            );
        }
    }

    if (!retryOnFailure && !error?.wrongMfaCode) {
        if (isSession && error?.mfaRequired) {
            throw new AuthFlowError('MFA required for session', { sessionError: errorData as AuthErrorResponse | undefined, status: status ?? 0 });
        }

        if (hasAuthInvalidatingError(errorData) || (error?.mfaRequired && !isSession)) {
            signOut();
        }
    }

    const rawMessage = error?.error;
    const message = rawMessage ? String(rawMessage) : `Request failed with status ${status}`;
    throw new ApiRequestError(message, status, errorData as Record<string, unknown>);
}
