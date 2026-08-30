import { describe, expect, it } from 'vitest';

import {
    isRateLimitError,
    shouldEndPartialBackendAuth,
    isMfaRequiredAuthError,
    isRefreshTokenMissingAuthError,
} from './authErrorGuards';

describe('isRateLimitError', () => {
    it('returns true for rateLimited flag', () => {
        expect(isRateLimitError({ rateLimited: true })).toBe(true);
    });

    it('returns true for status 429', () => {
        expect(isRateLimitError({ status: 429 })).toBe(true);
    });

    it('returns true for retryAfter', () => {
        expect(isRateLimitError({ retryAfter: 30 })).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isRateLimitError({ status: 500 })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isRateLimitError(null)).toBe(false);
        expect(isRateLimitError(undefined)).toBe(false);
    });
});

describe('shouldEndPartialBackendAuth', () => {
    it('returns true for requiresSignOut', () => {
        expect(shouldEndPartialBackendAuth({ requiresSignOut: true })).toBe(true);
    });

    it('returns true for refreshTokenMissing', () => {
        expect(shouldEndPartialBackendAuth({ refreshTokenMissing: true })).toBe(true);
    });

    it('returns true for refreshTokenInvalid', () => {
        expect(shouldEndPartialBackendAuth({ refreshTokenInvalid: true })).toBe(true);
    });

    it('returns true for refreshTokenExpired', () => {
        expect(shouldEndPartialBackendAuth({ refreshTokenExpired: true })).toBe(true);
    });

    it('returns true for refreshTokenReuse', () => {
        expect(shouldEndPartialBackendAuth({ refreshTokenReuse: true })).toBe(true);
    });

    it('returns true for nested sessionError with refresh token flags', () => {
        expect(
            shouldEndPartialBackendAuth({
                sessionError: { refreshTokenMissing: true },
            }),
        ).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(shouldEndPartialBackendAuth({ status: 500 })).toBe(false);
    });
});

describe('isMfaRequiredAuthError', () => {
    it('returns true for top-level mfaRequired', () => {
        expect(isMfaRequiredAuthError({ mfaRequired: true })).toBe(true);
    });

    it('returns true for top-level mfaRequiredSensitive', () => {
        expect(isMfaRequiredAuthError({ mfaRequiredSensitive: true })).toBe(true);
    });

    it('returns true for nested sessionError mfaRequired', () => {
        expect(
            isMfaRequiredAuthError({ sessionError: { mfaRequired: true } }),
        ).toBe(true);
    });

    it('returns true for nested sessionError mfaRequiredSensitive', () => {
        expect(
            isMfaRequiredAuthError({ sessionError: { mfaRequiredSensitive: true } }),
        ).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isMfaRequiredAuthError({ status: 500 })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isMfaRequiredAuthError(null)).toBe(false);
        expect(isMfaRequiredAuthError(undefined)).toBe(false);
    });
});

describe('isRefreshTokenMissingAuthError', () => {
    it('returns true for direct refreshTokenMissing', () => {
        expect(isRefreshTokenMissingAuthError({ refreshTokenMissing: true })).toBe(true);
    });

    it('returns true for nested sessionError', () => {
        expect(
            isRefreshTokenMissingAuthError({
                sessionError: { refreshTokenMissing: true },
            }),
        ).toBe(true);
    });

    it('returns true for nested errorData', () => {
        expect(
            isRefreshTokenMissingAuthError({
                errorData: { refreshTokenMissing: true },
            }),
        ).toBe(true);
    });

    it('returns false when flag is absent', () => {
        expect(isRefreshTokenMissingAuthError({ status: 401 })).toBe(false);
    });
});
