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

    it('returns session expired for refreshTokenMissing', () => {
        expect(getUserFacingErrorMessage({ sessionError: { refreshTokenMissing: true } })).toBe(
            ERROR_MESSAGES.SESSION_EXPIRED,
        );
    });

    it('returns wrong MFA code message', () => {
        expect(getUserFacingErrorMessage({ wrongMfaCode: true })).toBe(
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

    it('returns biometric disabled message', () => {
        expect(getUserFacingErrorMessage({ message: 'Biometrics disabled in phone settings' })).toBe(
            'Biometric unlock is disabled in your device settings.',
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
});
