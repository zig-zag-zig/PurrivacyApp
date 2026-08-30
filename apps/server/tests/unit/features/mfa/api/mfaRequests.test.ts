import { BadRequestError } from '../../../../../src/utils/errors';
import {
    parseMfaEnableRequest,
    parseMfaSetupNonceRequest,
    parseSessionTrustRequest,
} from '../../../../../src/features/mfa/api/mfaRequests';

describe('mfaRequests', () => {
    it('parses valid MFA enable request with trusted', () => {
        expect(parseMfaEnableRequest({ mfaCode: ' 123456 ', mfaTrusted: true })).toEqual({
            mfaCode: '123456',
            mfaTrusted: true,
        });
    });

    it('parses MFA enable with mfaTrusted false', () => {
        expect(parseMfaEnableRequest({ mfaCode: '654321' })).toEqual({
            mfaCode: '654321',
            mfaTrusted: false,
        });
    });

    it('rejects non-6-digit MFA code', () => {
        expect(() => parseMfaEnableRequest({ mfaCode: 'A1B2C3D4E5F6' })).toThrow(BadRequestError);
        expect(() => parseMfaEnableRequest({ mfaCode: '12345' })).toThrow(BadRequestError);
    });

    it('rejects missing mfaCode', () => {
        expect(() => parseMfaEnableRequest({})).toThrow(BadRequestError);
    });

    it('rejects non-string mfaCode', () => {
        expect(() => parseMfaEnableRequest({ mfaCode: 123456 })).toThrow(BadRequestError);
    });

    it('parses a valid MFA setup nonce', () => {
        expect(parseMfaSetupNonceRequest({ nonce: '  ' + 'n'.repeat(43) + '  ' })).toBe('  ' + 'n'.repeat(43) + '  ');
    });

    it('returns undefined when the MFA setup nonce is absent', () => {
        expect(parseMfaSetupNonceRequest({})).toBeUndefined();
    });

    it('passes non-string values through for application-level 401 handling', () => {
        expect(parseMfaSetupNonceRequest({ nonce: 123456 })).toBe(123456);
    });

    it('parseSessionTrustRequest accepts boolean true', () => {
        expect(parseSessionTrustRequest({ mfaTrusted: true })).toBe(true);
    });

    it('parseSessionTrustRequest accepts boolean false', () => {
        expect(parseSessionTrustRequest({ mfaTrusted: false })).toBe(false);
    });

    it('parseSessionTrustRequest rejects non-boolean', () => {
        expect(() => parseSessionTrustRequest({})).toThrow(BadRequestError);
        expect(() => parseSessionTrustRequest({ mfaTrusted: 'true' as unknown })).toThrow(BadRequestError);
    });
});
