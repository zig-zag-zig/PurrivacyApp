import { getMfaModalHandler } from '../../../api/modalHandler';
import { securityService } from '../../security/services/securityService';
import { getUserId } from '../../auth/domain/authUtils';
import { RequestOptions } from '../../../api/requestHelpers';
import { EventService } from '../../../services/eventService';
import { AuthFlowError } from '../../../api/auth/authFlowError';
// Track if we're already in an MFA handler to prevent recursive calls
let isInMfaHandler = false;
const MFA_SUBMISSION_TIMEOUT_MS = 30_000;

const withMfaSubmissionTimeout = async <T>(submission: Promise<T>): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new AuthFlowError('MFA verification timed out. Please try again.', {
                mfaTimedOut: true,
            }));
        }, MFA_SUBMISSION_TIMEOUT_MS);
    });

    try {
        return await Promise.race([submission, timeout]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

/**
 * Common MFA handler logic that can be shared between different MFA error types
 */
export class MfaUtils {
    /**
     * Check if we're currently in an MFA handler
     */
    static getIsInMfaHandler(): boolean {
        return isInMfaHandler;
    }

    /**
     * Execute MFA flow with retry logic for wrong codes
     * This is the core logic shared between session and sensitive MFA errors
     */
    static async executeMfaFlow<T>(params: {
        isSensitive: boolean;
        isLoginFlow: boolean;
        onMfaCode: (mfaCode: string) => Promise<T>;
        onError?: (error: any) => void;
    }): Promise<T> {
        if (isInMfaHandler) {
            throw new Error('Already in MFA handler');
        }

        isInMfaHandler = true;

        try {
            const handler = getMfaModalHandler();
            if (!handler) {
                throw new AuthFlowError('MFA modal handler not available', { status: 401 });
            }

            while (true) {
                try {
                    const result = await handler({
                        isSensitive: params.isSensitive,
                        isLoginFlow: params.isLoginFlow,
                    });

                    if (!result?.code) {
                        throw new AuthFlowError('MFA verification was cancelled', { mfaCancelled: true });
                    }

                    const response = await withMfaSubmissionTimeout(params.onMfaCode(result.code));
                    if (!params.isLoginFlow) {
                        EventService.addEvent('closeMfaModal');
                    }
                    return response;
                } catch (error: any) {
                    if (error?.wrongMfaCode) {
                        EventService.addEvent('clearMfaCode', { isWrongMfaCode: true });
                        continue;
                    }

                    EventService.addEvent('closeMfaModal', { force: true });

                    if (params.onError) {
                        params.onError(error);
                    }
                    throw error;
                }
            }
        } finally {
            isInMfaHandler = false;
        }
    }

    /**
     * Handle session creation with MFA code
     */
    static async handleSessionCreationWithMfa(
        mfaCode: string,
        createSessionFn: (retryOnFailure: boolean, mfaCode?: string) => Promise<any>,
        retryOnFailure: boolean
    ): Promise<any> {
        const sessionResponse = await createSessionFn(retryOnFailure, mfaCode);

        if (sessionResponse?.accessToken) {
            // Store the new session
            const userId = getUserId();
            await securityService.storeSession(sessionResponse, userId);
            return sessionResponse;
        }
        throw new Error('Failed to create session with MFA');
    }

    /**
     * Create retry options with MFA code
     */
    static createRetryOptions(options: RequestOptions, mfaCode: string): RequestOptions {
        return {
            ...options,
            mfaCode,
        };
    }
}
