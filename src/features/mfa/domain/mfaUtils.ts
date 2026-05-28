import { getMfaModalHandler } from '../../../api/modalHandler';
import { securityService } from '../../security/services/securityService';
import { getUserId } from '../../auth/domain/authUtils';
import { RequestOptions } from '../../../api/requestHelpers';
import { EventService } from '../../../services/eventService';
// Track if we're already in an MFA handler to prevent recursive calls
let isInMfaHandler = false;

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
                throw { status: 401, message: 'MFA modal handler not available' };
            }

            while (true) {
                try {
                    const result = await handler({
                        isSensitive: params.isSensitive,
                        isLoginFlow: params.isLoginFlow,
                    });

                    if (!result?.code) {
                        throw { mfaCancelled: true };
                    }
                    return await params.onMfaCode(result.code);
                } catch (error: any) {
                    if (error?.wrongMfaCode) {
                        // Continue retrying with new MFA code
                        continue;
                    }

                    EventService.addEvent('closeMfaModal');

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
