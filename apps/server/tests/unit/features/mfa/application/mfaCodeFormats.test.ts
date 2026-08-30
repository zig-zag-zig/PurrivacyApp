import { getMfaCodeKind } from '../../../../../src/features/mfa/application/mfaCodeFormats';

describe('getMfaCodeKind', () => {
    describe('TOTP codes (6-digit numeric strings)', () => {
        it('classifies a 6-digit string as totp', () => {
            expect(getMfaCodeKind('123456')).toBe('totp');
        });

        it('classifies all-zeros as totp', () => {
            expect(getMfaCodeKind('000000')).toBe('totp');
        });

        it('classifies all-nines as totp', () => {
            expect(getMfaCodeKind('999999')).toBe('totp');
        });
    });

    describe('Recovery codes (12-char uppercase alphanumeric)', () => {
        it('classifies a 12-char uppercase alphanumeric string as recovery', () => {
            expect(getMfaCodeKind('ABCDEFGHIJKL')).toBe('recovery');
        });

        it('classifies 12-char alphanumeric with digits as recovery', () => {
            expect(getMfaCodeKind('A1B2C3D4E5F6')).toBe('recovery');
        });

        it('classifies all-digit 12-char as recovery (not totp since length != 6)', () => {
            expect(getMfaCodeKind('123456789012')).toBe('recovery');
        });
    });

    describe('Invalid codes', () => {
        it('rejects lowercase recovery codes', () => {
            expect(getMfaCodeKind('abcdefghijkl')).toBe('invalid');
        });

        it('rejects mixed-case codes', () => {
            expect(getMfaCodeKind('AbCdEfGhIjKl')).toBe('invalid');
        });

        it('rejects codes with special characters', () => {
            expect(getMfaCodeKind('ABC-DEFG-HIJ')).toBe('invalid');
        });

        it('rejects too-short numeric codes', () => {
            expect(getMfaCodeKind('12345')).toBe('invalid');
        });

        it('rejects too-long numeric codes', () => {
            expect(getMfaCodeKind('1234567')).toBe('invalid');
        });

        it('rejects too-short alphanumeric codes', () => {
            expect(getMfaCodeKind('ABCDEFGHIJK')).toBe('invalid');
        });

        it('rejects too-long alphanumeric codes', () => {
            expect(getMfaCodeKind('ABCDEFGHIJKLM')).toBe('invalid');
        });

        it('rejects empty string', () => {
            expect(getMfaCodeKind('')).toBe('invalid');
        });

        it('rejects codes with spaces', () => {
            expect(getMfaCodeKind('123 456')).toBe('invalid');
        });
    });
});
