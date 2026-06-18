/**
 * Shared error guard functions for rate limiting, refresh token failures,
 * and MFA detection.
 *
 * Consolidated from sessionErrors.ts and authErrorGuards.ts to eliminate
 * duplicated classification logic.
 */

/** True when the error represents a rate-limit condition. */
export const isRateLimitError = (error: any): boolean => {
    return Boolean(
        error?.rateLimited ||
        error?.status === 429 ||
        error?.retryAfter ||
        error?.sessionError?.rateLimited ||
        error?.sessionError?.status === 429,
    );
};

/** True when the error indicates a refresh token failure that requires sign-out. */
export const hasRefreshTokenFailure = (error: any): boolean => {
    const sessionError = error?.sessionError;
    return Boolean(
        error?.requiresSignOut ||
        error?.refreshTokenMissing ||
        error?.refreshTokenInvalid ||
        error?.refreshTokenExpired ||
        error?.refreshTokenReuse ||
        sessionError?.refreshTokenMissing ||
        sessionError?.refreshTokenInvalid ||
        sessionError?.refreshTokenExpired ||
        sessionError?.refreshTokenReuse,
    );
};

/** True when the error indicates MFA is required. */
export const isMfaRequired = (error: any): boolean => {
    const sessionError = error?.sessionError ?? error;
    return Boolean(
        error?.mfaRequired ||
        error?.mfaRequiredSensitive ||
        sessionError?.mfaRequired ||
        sessionError?.mfaRequiredSensitive,
    );
};

/** True when the error explicitly requires a sign-out. */
export const requiresSignOut = (error: any): boolean => {
    return Boolean(error?.requiresSignOut);
};
