import { describe, expect, it } from 'vitest';

import {
    isRateLimitError,
    hasRefreshTokenFailure,
    isMfaRequired,
    requiresSignOut,
} from './errorGuards';

describe('isRateLimitError', () => {
    it('returns true for rateLimited flag', () => {
        expect(isRateLimitError({ rateLimited: true })).toBe(true);
    });

    it('returns true for status 429', () => {
        expect(isRateLimitError({ status: 429 })).toBe(true);
    });

    it('returns true for retryAfter', () => {
        expect(isRateLimitError({ retryAfter: '30' })).toBe(true);
    });

    it('returns true for nested sessionError rate limited', () => {
        expect(isRateLimitError({ sessionError: { rateLimited: true } })).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(isRateLimitError({ status: 500 })).toBe(false);
    });
});

describe('hasRefreshTokenFailure', () => {
    it('returns true for requiresSignOut', () => {
        expect(hasRefreshTokenFailure({ requiresSignOut: true })).toBe(true);
    });

    it('returns true for direct refreshTokenMissing', () => {
        expect(hasRefreshTokenFailure({ refreshTokenMissing: true })).toBe(true);
    });

    it('returns true for nested sessionError refreshTokenMissing', () => {
        expect(hasRefreshTokenFailure({ sessionError: { refreshTokenMissing: true } })).toBe(true);
    });

    it('returns true for direct flag even when sessionError exists', () => {
        expect(hasRefreshTokenFailure({ refreshTokenInvalid: true, sessionError: { foo: 'bar' } })).toBe(true);
    });

    it('returns false for unrelated error', () => {
        expect(hasRefreshTokenFailure({ status: 500 })).toBe(false);
    });
});

describe('isMfaRequired', () => {
    it('returns true for top-level mfaRequired', () => {
        expect(isMfaRequired({ mfaRequired: true })).toBe(true);
    });

    it('returns true for top-level mfaRequiredSensitive', () => {
        expect(isMfaRequired({ mfaRequiredSensitive: true })).toBe(true);
    });

    it('returns true for nested sessionError mfaRequired', () => {
        expect(isMfaRequired({ sessionError: { mfaRequired: true } })).toBe(true);
    });

    it('returns false when mfa is not required', () => {
        expect(isMfaRequired({ status: 200 })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isMfaRequired(null)).toBe(false);
        expect(isMfaRequired(undefined)).toBe(false);
    });
});

describe('requiresSignOut', () => {
    it('returns true when requiresSignOut is set', () => {
        expect(requiresSignOut({ requiresSignOut: true })).toBe(true);
    });

    it('returns false when requiresSignOut is absent', () => {
        expect(requiresSignOut({ status: 401 })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(requiresSignOut(null)).toBe(false);
        expect(requiresSignOut(undefined)).toBe(false);
    });
});
