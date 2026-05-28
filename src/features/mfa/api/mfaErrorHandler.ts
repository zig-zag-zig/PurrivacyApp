import { AuthErrorResponse } from '../../../types/types';
import { securityService } from '../../security/services/securityService';
import { RequestOptions } from '../../../api/requestHelpers';
import { getUserId } from '../../auth/domain/authUtils';
import { MfaUtils } from '../domain/mfaUtils';
import { logger } from '../../../utils/logger';
export class MfaErrorHandler {
    /**
     * Handle sensitive MFA errors (for sensitive endpoints)
     */
    static async handleSensitiveMfaError(
        endpoint: string,
        method: string,
        body: any,
        requiresAuth: boolean,
        retryOnFailure: boolean,
        options: RequestOptions,
        requestFn: (endpoint: string, method: string, body?: any, requiresAuth?: boolean, options?: RequestOptions, retryOnFailure?: boolean) => Promise<any>
    ): Promise<any> {
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
        body: any,
        requiresAuth: boolean,
        retryOnFailure: boolean,
        options: RequestOptions,
        isSession: boolean,
        requestFn: (endpoint: string, method: string, body?: any, requiresAuth?: boolean, options?: RequestOptions, retryOnFailure?: boolean) => Promise<any>,
        createSessionFn: (retryOnFailure: boolean, mfaCode?: string) => Promise<any>
    ): Promise<any> {
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
        body: any,
        requiresAuth: boolean,
        retryOnFailure: boolean,
        options: RequestOptions,
        errorData: AuthErrorResponse,
        requestFn: (endpoint: string, method: string, body?: any, requiresAuth?: boolean, options?: RequestOptions, retryOnFailure?: boolean) => Promise<any>,
        createSessionFn: (retryOnFailure: boolean, mfaCode?: string) => Promise<any>
    ): Promise<any> {
        if (!requiresAuth) {
            const errorMessage = (errorData as any).error || `Authentication failed: Missing headers`;
            throw new Error(errorMessage);
        }

        try {
            const userId = getUserId();
            const sessionResponse = await createSessionFn(retryOnFailure);
            await securityService.storeSession(sessionResponse, userId);

            return await requestFn(endpoint, method, body, requiresAuth, options);
        } catch (sessionError: any) {
            logger.warn('failed to create session for missing headers retry', { error: sessionError });
            if (sessionError.sessionError?.mfaRequired) {
                throw { sessionError: sessionError.sessionError, status: sessionError.status };
            }
            throw { sessionError: errorData, status: 401 };
        }
    }

    /**
     * Handle rate limit errors
     */
    static async handleRateLimitError(errorData: any): Promise<never> {
        const retryAfterSeconds = Number(errorData.retryAfter);
        const retryAfter =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
                ? retryAfterSeconds
                : undefined;
        const baseMessage = errorData.error || 'Too many requests. Please try again later.';
        const message = retryAfter
            ? `${baseMessage} Please try again in ${retryAfter} seconds.`
            : baseMessage;

        throw {
            rateLimited: true,
            retryAfter: message,
            retryAfterSeconds: retryAfter,
            status: 429,
            message,
        };
    }
}
