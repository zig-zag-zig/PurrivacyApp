import { getInvalidMfaError } from '../../../../../src/features/mfa/application/mfaErrors';

describe('getInvalidMfaError', () => {
    it('returns 403 AuthError with mfaRequired when not sensitive', () => {
        const error = getInvalidMfaError(false);

        expect(error).toBeInstanceOf(Error);
        expect(error.statusCode).toBe(403);
        expect(error.message).toBe('Invalid MFA code');
        expect(error.details).toMatchObject({
            wrongMfaCode: true,
            mfaRequired: true,
        });
        expect(error.details).not.toHaveProperty('mfaRequiredSensitive');
    });

    it('returns 403 AuthError with mfaRequiredSensitive when sensitive', () => {
        const error = getInvalidMfaError(true);

        expect(error.statusCode).toBe(403);
        expect(error.message).toBe('Invalid MFA code');
        expect(error.details).toMatchObject({
            wrongMfaCode: true,
            mfaRequiredSensitive: true,
        });
        expect(error.details).not.toHaveProperty('mfaRequired');
    });

    it('always sets wrongMfaCode regardless of sensitivity', () => {
        expect(getInvalidMfaError(false).details?.wrongMfaCode).toBe(true);
        expect(getInvalidMfaError(true).details?.wrongMfaCode).toBe(true);
    });
});
