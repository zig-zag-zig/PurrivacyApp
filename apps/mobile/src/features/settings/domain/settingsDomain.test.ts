import { describe, expect, it } from 'vitest';
import { getMfaDescription } from './settingsDomain';

describe('getMfaDescription', () => {
    it('returns enabled description when MFA is enabled', () => {
        const result = getMfaDescription(true);
        expect(result).toContain('Two-factor authentication is enabled');
        expect(result).toContain('protected with an additional security layer');
    });

    it('returns disabled description when MFA is disabled', () => {
        const result = getMfaDescription(false);
        expect(result).toContain('Add an extra layer of security');
        expect(result).toContain('Requires an authenticator app');
    });
});
