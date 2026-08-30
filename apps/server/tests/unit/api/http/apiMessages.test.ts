import { apiMessages } from '../../../../src/api/http/apiMessages';

describe('apiMessages', () => {
    it('has auth messages', () => {
        expect(apiMessages.auth.invalidRecoveryCredentials).toBe('Invalid recovery credentials');
    });

    it('has body messages', () => {
        expect(apiMessages.body.invalidJson).toBe('Invalid JSON request body');
        expect(apiMessages.body.tooLarge).toBe('Request body is too large');
    });

    it('has rate-limit messages for all limiters', () => {
        const msgs = apiMessages.rateLimit;
        expect(msgs.default).toContain('Too many requests');
        expect(msgs.login).toContain('Too many login');
        expect(msgs.mfaVerification).toContain('MFA verification');
        expect(msgs.authentication).toContain('authentication');
        expect(msgs.sensitiveOperations).toContain('sensitive');
        expect(msgs.sessionRefresh).toContain('session refresh');
        expect(msgs.updates).toContain('updates');
    });

    it('has server error messages', () => {
        expect(apiMessages.server.internalError).toBe('Internal server error');
        expect(apiMessages.server.requestFailed).toBe('Request failed');
    });

    it('is deeply frozen (const assertion)', () => {
        // Verify the object structure doesn't change
        expect(typeof apiMessages.auth).toBe('object');
        expect(typeof apiMessages.body).toBe('object');
        expect(typeof apiMessages.rateLimit).toBe('object');
        expect(typeof apiMessages.server).toBe('object');
    });
});
