import { describe, expect, it } from 'vitest';

import { ERROR_MESSAGES, getUserFacingErrorMessage } from './errorHandling';

describe('getUserFacingErrorMessage', () => {
    it('uses generic account creation copy for an existing identity', () => {
        const message = getUserFacingErrorMessage({ code: 'auth/email-already-in-use' });

        expect(message).toBe(ERROR_MESSAGES.SIGN_UP_FAILED);
        expect(message).not.toMatch(/already|taken|exists/i);
    });

    it('recognizes wrapped Firebase auth codes without displaying provider details', () => {
        const message = getUserFacingErrorMessage(
            new Error('Firebase: Error (auth/email-already-in-use).'),
        );

        expect(message).toBe(ERROR_MESSAGES.SIGN_UP_FAILED);
        expect(message).not.toContain('Firebase');
    });

    it('does not display unknown backend or technical error text', () => {
        expect(getUserFacingErrorMessage(
            { message: 'SQLSTATE connection details and internal table name' },
            'Action failed. Please try again.',
        )).toBe('Action failed. Please try again.');
    });

    it('builds rate-limit copy from safe structured data', () => {
        expect(getUserFacingErrorMessage({
            message: 'Internal limiter bucket auth-user-123 exceeded',
            rateLimited: true,
            retryAfterSeconds: 12.2,
        })).toBe('Too many attempts. Please try again in 13 seconds.');
    });
});
