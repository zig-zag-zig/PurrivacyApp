import { describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { getUserFacingErrorMessage, ERROR_MESSAGES } from './errorHandling';

describe('getUserFacingErrorMessage', () => {
    it('returns default message for null/undefined', () => {
        expect(getUserFacingErrorMessage(null)).toBe(ERROR_MESSAGES.GENERIC_ERROR);
        expect(getUserFacingErrorMessage(undefined)).toBe(ERROR_MESSAGES.GENERIC_ERROR);
    });

    it('returns network error for isNetworkError flag', () => {
        expect(getUserFacingErrorMessage({ isNetworkError: true })).toBe(ERROR_MESSAGES.NETWORK_ERROR);
    });

    it('returns network error for errorData.networkUnavailable', () => {
        expect(getUserFacingErrorMessage({ errorData: { networkUnavailable: true } })).toBe(
            ERROR_MESSAGES.NETWORK_ERROR,
        );
    });

    it('returns session expired for refreshTokenMissing', () => {
        expect(getUserFacingErrorMessage({ sessionError: { refreshTokenMissing: true } })).toBe(
            ERROR_MESSAGES.SESSION_EXPIRED,
        );
    });

    it('returns session expired for refreshTokenInvalid', () => {
        expect(getUserFacingErrorMessage({ sessionError: { refreshTokenInvalid: true } })).toBe(
            ERROR_MESSAGES.SESSION_EXPIRED,
        );
    });

    it('returns session expired for refreshTokenExpired', () => {
        expect(getUserFacingErrorMessage({ sessionError: { refreshTokenExpired: true } })).toBe(
            ERROR_MESSAGES.SESSION_EXPIRED,
        );
    });

    it('returns wrong MFA code message (direct)', () => {
        expect(getUserFacingErrorMessage({ wrongMfaCode: true })).toBe(
            'The MFA code was incorrect. Please try again.',
        );
    });

    it('returns wrong MFA code message (nested errorData)', () => {
        expect(getUserFacingErrorMessage({ errorData: { wrongMfaCode: true } })).toBe(
            'The MFA code was incorrect. Please try again.',
        );
    });

    it('returns rate limit with seconds', () => {
        expect(getUserFacingErrorMessage({ rateLimited: true, retryAfterSeconds: 30 })).toBe(
            'Too many attempts. Please try again in 30 seconds.',
        );
    });

    it('returns rate limit generic when no seconds', () => {
        expect(getUserFacingErrorMessage({ rateLimited: true })).toBe(
            'Too many attempts. Please try again later.',
        );
    });

    it('returns rate limit for status 429', () => {
        expect(getUserFacingErrorMessage({ status: 429 })).toBe(
            'Too many attempts. Please try again later.',
        );
    });

    it('returns rate limit from errorData retryAfter', () => {
        expect(getUserFacingErrorMessage({ errorData: { rateLimited: true, retryAfter: '45' } })).toBe(
            'Too many attempts. Please try again in 45 seconds.',
        );
    });

    it('returns biometric disabled message', () => {
        expect(getUserFacingErrorMessage({ message: 'Biometrics disabled in phone settings' })).toBe(
            'Biometric unlock is disabled in your device settings.',
        );
    });

    it('returns biometric not set up message', () => {
        expect(getUserFacingErrorMessage({ message: 'Biometric unlock is not set up' })).toBe(
            'Biometric unlock is not set up on this device. Sign in with your password.',
        );
    });

    it('returns incorrect passphrase message', () => {
        expect(getUserFacingErrorMessage({ message: 'Incorrect passphrase' })).toBe(
            'Incorrect passphrase.',
        );
    });

    it('returns recovery failed message', () => {
        expect(getUserFacingErrorMessage({ message: 'Invalid recovery credentials' })).toBe(
            ERROR_MESSAGES.RECOVERY_FAILED,
        );
    });

    it('returns MFA timeout message', () => {
        expect(getUserFacingErrorMessage({ message: 'MFA verification timed out' })).toBe(
            'MFA verification timed out. Please try again.',
        );
    });

    it('maps auth/invalid-credential to sign-in error', () => {
        expect(getUserFacingErrorMessage({ code: 'auth/invalid-credential' })).toBe(
            'Sign in failed. Check your username and password and try again.',
        );
    });

    it('maps auth/email-already-in-use to sign-up error', () => {
        expect(getUserFacingErrorMessage({ code: 'auth/email-already-in-use' })).toBe(
            ERROR_MESSAGES.SIGN_UP_FAILED,
        );
    });

    it('maps auth/too-many-requests to rate limit', () => {
        expect(getUserFacingErrorMessage({ code: 'auth/too-many-requests' })).toBe(
            'Too many attempts. Please try again later.',
        );
    });

    it('extracts auth code from message text', () => {
        expect(getUserFacingErrorMessage({ message: 'Firebase: auth/weak-password (invalid)' })).toBe(
            'Password is too weak.',
        );
    });

    it('returns default for auth data flags without other matching criteria', () => {
        expect(getUserFacingErrorMessage({ errorData: { sessionHeaderMissing: true } })).toBe(
            ERROR_MESSAGES.GENERIC_ERROR,
        );
    });

    it('returns default message for unauthenticated user message', () => {
        expect(getUserFacingErrorMessage({ message: 'User not authenticated' })).toBe(
            ERROR_MESSAGES.GENERIC_ERROR,
        );
    });

    it('returns default message for user not signed in', () => {
        expect(getUserFacingErrorMessage({ message: 'User is not signed in' })).toBe(
            ERROR_MESSAGES.GENERIC_ERROR,
        );
    });

    it('uses custom defaultMessage parameter', () => {
        expect(getUserFacingErrorMessage({ status: 500 }, 'Custom fallback')).toBe('Custom fallback');
    });

    it('falls through to default for unknown message', () => {
        expect(getUserFacingErrorMessage({ message: 'Something completely unknown' })).toBe(
            ERROR_MESSAGES.GENERIC_ERROR,
        );
    });
});
