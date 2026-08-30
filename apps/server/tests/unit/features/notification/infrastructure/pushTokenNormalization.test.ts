import { normalizePushToken, normalizePushTokens, requireDeviceId } from '../../../../../src/features/notification/infrastructure/pushTokens/pushTokenNormalization';
import { BadRequestError } from '../../../../../src/utils/errors';
import { MAX_PUSH_TOKEN_LENGTH } from '../../../../../src/core/constants';

describe('pushTokenNormalization', () => {
    describe('normalizePushToken', () => {
        it('trims whitespace', () => {
            expect(normalizePushToken('  token123  ')).toBe('token123');
        });

        it('returns null for empty string', () => {
            expect(normalizePushToken('')).toBeNull();
        });

        it('returns null for whitespace-only string', () => {
            expect(normalizePushToken('   ')).toBeNull();
        });

        it('throws when exceeding max length', () => {
            const long = 'x'.repeat(MAX_PUSH_TOKEN_LENGTH + 1);
            expect(() => normalizePushToken(long)).toThrow(BadRequestError);
        });

        it('accepts token at exactly max length', () => {
            const exact = 'x'.repeat(MAX_PUSH_TOKEN_LENGTH);
            expect(normalizePushToken(exact)).toBe(exact);
        });
    });

    describe('normalizePushTokens', () => {
        it('deduplicates tokens', () => {
            expect(normalizePushTokens(['a', 'b', 'a'])).toEqual(['a', 'b']);
        });

        it('filters null results', () => {
            expect(normalizePushTokens(['a', '  ', 'b'])).toEqual(['a', 'b']);
        });
    });

    describe('requireDeviceId', () => {
        it('returns trimmed device id', () => {
            expect(requireDeviceId('  dev-1  ')).toBe('dev-1');
        });

        it('throws for empty string', () => {
            expect(() => requireDeviceId('')).toThrow(BadRequestError);
        });

        it('throws for whitespace-only', () => {
            expect(() => requireDeviceId('   ')).toThrow(BadRequestError);
        });

        it('throws when exceeding max length', () => {
            const long = 'x'.repeat(257);
            expect(() => requireDeviceId(long)).toThrow(BadRequestError);
        });
    });
});
