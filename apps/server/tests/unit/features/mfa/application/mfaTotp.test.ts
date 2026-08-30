import { createMfaTotp, verifyMfaTotp } from '../../../../../src/features/mfa/application/mfaTotp';
import { Secret } from 'otpauth';

describe('mfaTotp', () => {
    describe('createMfaTotp', () => {
        it('creates a TOTP instance with correct parameters', () => {
            const totp = createMfaTotp('testuser');
            expect(totp.issuer).toBe('Purrivacy');
            expect(totp.label).toBe('testuser');
            expect(totp.algorithm).toBe('SHA1');
            expect(totp.digits).toBe(6);
            expect(totp.period).toBe(30);
        });

        it('generates a valid secret', () => {
            const totp = createMfaTotp('testuser');
            expect(totp.secret.base32).toBeDefined();
            expect(totp.secret.base32.length).toBeGreaterThan(0);
        });

        it('generates a valid otpauth URL', () => {
            const totp = createMfaTotp('testuser');
            const url = totp.toString();
            expect(url).toMatch(/^otpauth:\/\/totp\//);
            expect(url).toContain('Purrivacy');
            expect(url).toContain('testuser');
        });
    });

    describe('verifyMfaTotp', () => {
        it('verifies a freshly generated TOTP code', () => {
            const totp = createMfaTotp('testuser');
            const code = totp.generate();
            expect(verifyMfaTotp(totp.secret.base32, code)).toBe(true);
        });

        it('rejects a wrong code', () => {
            const totp = createMfaTotp('testuser');
            // Generate a different TOTP to get a different secret, then use its code
            const otherTotp = createMfaTotp('other');
            const otherCode = otherTotp.generate();
            expect(verifyMfaTotp(totp.secret.base32, otherCode)).toBe(false);
        });

        it('rejects an invalid format code', () => {
            const totp = createMfaTotp('testuser');
            expect(verifyMfaTotp(totp.secret.base32, 'abc')).toBe(false);
        });
    });
});
