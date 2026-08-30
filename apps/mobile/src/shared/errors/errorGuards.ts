/**
 * Shared error guard functions for rate limiting, refresh token failures,
 * MFA detection, and wrong-code detection.
 *
 * Consolidated from sessionErrors.ts and authErrorGuards.ts to eliminate
 * duplicated classification logic.
 *
 * Naming conventions across the codebase:
 * - `hasRefreshTokenFailure` (shared) → `isTerminalStoredSessionError` (session),
 *   `shouldEndPartialBackendAuth` (auth)
 * - `isMfaRequired` (shared) → `isStoredSessionMfaRequired` (session, narrower: only
 *   checks `mfaRequired`, not `mfaRequiredSensitive`),
 *   `isMfaRequiredAuthError` (auth, wider: checks both)
 * - `isRateLimitError` (shared) → used directly by all consumers
 * - `isWrongMfaCode` (shared) → used directly by all consumers
 *
 * All guards accept `unknown` (e.g. the caught value of `catch (error)`) and
 * never throw: non-object values simply carry no flags. Property reads use
 * truthiness, mirroring the pre-typing behavior of `error?.flag` checks.
 */

/**
 * True when the value is a non-null object (arrays included, matching the
 * `typeof value === 'object' && value !== null` checks used historically).
 * Use in condition position: `isRecord(v) ? v : null`.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** True when the error represents a rate-limit condition. */
export const isRateLimitError = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    const session = rec && isRecord(rec.sessionError) ? rec.sessionError : null;
    return Boolean(
        rec?.rateLimited ||
        rec?.status === 429 ||
        rec?.retryAfter ||
        session?.rateLimited ||
        session?.status === 429,
    );
};

/** True when the error indicates a refresh token failure that requires sign-out. */
export const hasRefreshTokenFailure = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    const session = rec && isRecord(rec.sessionError) ? rec.sessionError : null;
    return Boolean(
        rec?.requiresSignOut ||
        rec?.refreshTokenMissing ||
        rec?.refreshTokenInvalid ||
        rec?.refreshTokenExpired ||
        rec?.refreshTokenReuse ||
        session?.refreshTokenMissing ||
        session?.refreshTokenInvalid ||
        session?.refreshTokenExpired ||
        session?.refreshTokenReuse,
    );
};

/** True when the error indicates MFA is required. */
export const isMfaRequired = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    if (!rec) {
        return false;
    }
    const session = isRecord(rec.sessionError) ? rec.sessionError : rec;
    return Boolean(
        rec.mfaRequired ||
        rec.mfaRequiredSensitive ||
        session.mfaRequired ||
        session.mfaRequiredSensitive,
    );
};

/**
 * Narrow check used by the MFA missing-headers retry path: only the nested
 * `sessionError.mfaRequired` flag triggers the "MFA is required to continue"
 * flow. Deliberately narrower than `isMfaRequired`.
 */
export const isSessionErrorMfaRequired = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    const session = rec && isRecord(rec.sessionError) ? rec.sessionError : null;
    return Boolean(session?.mfaRequired);
};

/** True when the error indicates a wrong MFA code was submitted. */
export const isWrongMfaCode = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    if (!rec) {
        return false;
    }
    const session = isRecord(rec.sessionError) ? rec.sessionError : null;
    return Boolean(rec.wrongMfaCode || session?.wrongMfaCode);
};

/** True when the error explicitly requires a sign-out. */
export const requiresSignOut = (error: unknown): boolean => {
    const rec = isRecord(error) ? error : null;
    return Boolean(rec?.requiresSignOut);
};
