import { AuthErrorResponse } from '../../../types/types';
import { securityService } from '../../security/services/securityService';
import { RequestOptions } from '../../../api/requestHelpers';
import type { ApiErrorData } from '../../../api/request/errorData';
import { getUserId } from '../../auth/domain/authUtils';
import { MfaUtils } from '../domain/mfaUtils';
import { logger } from '../../../utils/logger';
import { AuthFlowError } from '../../../api/auth/authFlowError';
import { isRecord, isSessionErrorMfaRequired } from '../../../shared/errors/errorGuards';
import type { MfaApiRequestFn } from '../../../api/runtime';
import type { CreateSessionFn } from '../../../api/request/requestOptions';
export class MfaErrorHandler {
    /**
     * Handle sensitive MFA errors (for sensitive endpoints)
     */
    static async handleSensitiveMfaError(
        endpoint: string,
        method: string,
        body: unknown,
        requiresAuth: boolean,
        retryOnFailure: boolean,
        options: RequestOptions,
        requestFn: MfaApiRequestFn
    ): Promise<unknown> {
        return await MfaUtils.executeMfaFlow({
            isSensitive: true,
            isLoginFlow: false,
            onMfaCode: async (mfaCode: string) => {
                const retryOptions = MfaUtils.createRetryOptions(options, mfaCode);
                return await requestFn(endpoint, method, body, requiresAuth, retryOptions, retryOnFailure);
            },
            onError: (error) => {
                throw error;
            }
        });
    }

    /**
     * Handle session MFA errors (for session creation)
     */
    static async handleSessionMfaError(
        endpoint: string,
        method: string,
        body: unknown,
        requiresAuth: boolean,
        retryOnFailure: boolean,
        options: RequestOptions,
        isSession: boolean,
        requestFn: MfaApiRequestFn,
        createSessionFn: CreateSessionFn
    ): Promise<unknown> {
        return await MfaUtils.executeMfaFlow({
            isSensitive: false,
            isLoginFlow: true,
            onMfaCode: async (mfaCode: string) => {
                const sessionResponse = await MfaUtils.handleSessionCreationWithMfa(
                    mfaCode,
                    createSessionFn,
                    retryOnFailure
                );

                if (isSession) {
                    return sessionResponse;
                }

                return await requestFn(endpoint, method, body, requiresAuth, options);
            },
            onError: (error) => {
                throw error;
            }
        });
    }

    /**
     * Handle missing headers error (session header missing)
     */
    static async handleMissingHeadersError(
        endpoint: string,
        method: string,
        body: unknown,
        requiresAuth: boolean,
        retryOnFailure: boolean,
        options: RequestOptions,
        errorData: ApiErrorData,
        requestFn: MfaApiRequestFn,
        createSessionFn: CreateSessionFn
    ): Promise<unknown> {
        if (!requiresAuth) {
            const errorMessage = errorData.error || `Authentication failed: Missing headers`;
            throw new Error(errorMessage);
        }

        try {
            const userId = getUserId();
            const sessionResponse = await createSessionFn(retryOnFailure);
            if (sessionResponse) {
                await securityService.storeSession(sessionResponse, userId);
            }

            return await requestFn(endpoint, method, body, requiresAuth, options);
        } catch (sessionError: unknown) {
            logger.warn('failed to create session for missing headers retry', { error: sessionError });
            if (isSessionErrorMfaRequired(sessionError)) {
                const rec = isRecord(sessionError) ? sessionError : null;
                throw new AuthFlowError('MFA is required to continue', {
                    sessionError: (rec?.sessionError ?? undefined) as AuthErrorResponse | undefined,
                    status: rec?.status as number | undefined,
                });
            }
            throw new AuthFlowError('Authentication headers are missing', {
                sessionError: errorData,
                status: 401,
            });
        }
    }

    /**
     * Handle rate limit errors
     */
    static async handleRateLimitError(errorData: unknown): Promise<never> {
        const rec = isRecord(errorData) ? errorData : null;
        const retryAfterSeconds = Number(rec?.retryAfter);
        const retryAfter =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                ? retryAfterSeconds
                : undefined;
        const rawMessage = rec?.error;
        const baseMessage = rawMessage ? String(rawMessage) : 'Too many requests. Please try again later.';
        const message = retryAfter
            ? `${baseMessage} Please try again in ${retryAfter} seconds.`
            : baseMessage;

        throw new AuthFlowError(message, {
            rateLimited: true,
            retryAfter: message,
            retryAfterSeconds: retryAfter,
            status: 429,
        });
    }
}
