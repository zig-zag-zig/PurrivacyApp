import { AuthErrorDetails } from '../../../core/types';
import { apiMessages } from '../../../api/http/apiMessages';
import { AppError, AuthError } from '../../../utils/errors';

export const getInvalidMfaError = (isSensitive: boolean): AuthError => {
    const authErrorResponse: AuthErrorDetails = {
        wrongMfaCode: true,
    };
    if (isSensitive) {
        authErrorResponse.mfaRequiredSensitive = true;
    } else {
        authErrorResponse.mfaRequired = true;
    }
    return new AuthError('Invalid MFA code', authErrorResponse, 403);
};

/**
 * 401: the MFA setup nonce is missing, malformed, expired, replayed, or not
 * bound to the current user/session family (API-SEC-006).
 */
export class MfaSetupNonceError extends AppError {
    constructor(details?: Record<string, unknown>) {
        super(apiMessages.mfa.nonceInvalid, 401, details);
    }
}

/**
 * 401: the session is not fresh and the account has no MFA to prove, so a new
 * Firebase-authenticated login is required before MFA enrollment (API-SEC-006).
 */
export class FreshAuthRequiredError extends AuthError {
    constructor() {
        super(apiMessages.mfa.freshAuthRequired, {}, 401);
    }
}

