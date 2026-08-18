import { describe, expect, it } from 'vitest';

import {
    isRateLimitError,
    hasRefreshTokenFailure,
    isMfaRequired,
    isWrongMfaCode,
    requiresSignOut,
    isSessionErrorMfaRequired,
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

describe('isWrongMfaCode', () => {
    it('returns true for top-level wrongMfaCode', () => {
        expect(isWrongMfaCode({ wrongMfaCode: true })).toBe(true);
    });

    it('returns true for nested sessionError.wrongMfaCode', () => {
        expect(isWrongMfaCode({ sessionError: { wrongMfaCode: true } })).toBe(true);
    });

    it('returns false when wrongMfaCode is absent', () => {
        expect(isWrongMfaCode({ status: 400 })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isWrongMfaCode(null)).toBe(false);
        expect(isWrongMfaCode(undefined)).toBe(false);
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

describe('unknown-input hardening', () => {
    it('treats primitives as flagless instead of throwing', () => {
        expect(isRateLimitError('rate limited')).toBe(false);
        expect(isRateLimitError(429)).toBe(false);
        expect(hasRefreshTokenFailure('token')).toBe(false);
        expect(isMfaRequired('mfa')).toBe(false);
        expect(isWrongMfaCode(0)).toBe(false);
        expect(requiresSignOut(false)).toBe(false);
    });

    it('treats arrays as flagless', () => {
        expect(isRateLimitError([{ rateLimited: true }])).toBe(false);
        expect(isMfaRequired(['mfaRequired'])).toBe(false);
        expect(isWrongMfaCode([{ wrongMfaCode: true }])).toBe(false);
    });

    it('ignores flags on tampered (non-boolean) values', () => {
        expect(isRateLimitError({ rateLimited: 'yes' })).toBe(true);
        expect(isMfaRequired({ mfaRequired: 1 })).toBe(true);
        expect(isWrongMfaCode({ wrongMfaCode: 'true' })).toBe(true);
    });

    it('reads nested sessionError flags only from records', () => {
        expect(isRateLimitError({ sessionError: { rateLimited: true } })).toBe(true);
        expect(isRateLimitError({ sessionError: 'rateLimited' })).toBe(false);
        expect(isMfaRequired({ sessionError: 'mfaRequired' })).toBe(false);
    });
});

describe('isSessionErrorMfaRequired', () => {
    it('returns true only for nested sessionError.mfaRequired', () => {
        expect(isSessionErrorMfaRequired({ sessionError: { mfaRequired: true } })).toBe(true);
    });

    it('returns false for top-level-only flags', () => {
        expect(isSessionErrorMfaRequired({ mfaRequired: true })).toBe(false);
        expect(isSessionErrorMfaRequired({ mfaRequiredSensitive: true })).toBe(false);
    });

    it('returns false for null, primitives, and missing sessionError', () => {
        expect(isSessionErrorMfaRequired(null)).toBe(false);
        expect(isSessionErrorMfaRequired('mfa')).toBe(false);
        expect(isSessionErrorMfaRequired({})).toBe(false);
        expect(isSessionErrorMfaRequired({ sessionError: 'mfa' })).toBe(false);
    });
});
