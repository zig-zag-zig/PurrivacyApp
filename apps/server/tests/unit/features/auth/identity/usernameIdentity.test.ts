import { UsernameIdentity } from '../../../../../src/features/auth/identity/UsernameIdentity';

describe('UsernameIdentity', () => {
    describe('normalizeUsername', () => {
        it('accepts a valid 3-character alphanumeric username', () => {
            expect(UsernameIdentity.normalizeUsername('abc')).toBe('abc');
        });

        it('accepts a valid 32-character username', () => {
            const username = 'a'.repeat(32);
            expect(UsernameIdentity.normalizeUsername(username)).toBe(username);
        });

        it('lowercases and trims whitespace', () => {
            expect(UsernameIdentity.normalizeUsername('  MyUser  ')).toBe('myuser');
        });

        it('accepts underscores', () => {
            expect(UsernameIdentity.normalizeUsername('my_user_123')).toBe('my_user_123');
        });

        it('rejects a 2-character username (too short)', () => {
            expect(() => UsernameIdentity.normalizeUsername('ab')).toThrow(/3-32 characters/);
        });

        it('rejects a 33-character username (too long)', () => {
            expect(() => UsernameIdentity.normalizeUsername('a'.repeat(33))).toThrow(/3-32 characters/);
        });

        it('rejects usernames with special characters', () => {
            expect(() => UsernameIdentity.normalizeUsername('user@name')).toThrow(/3-32 characters/);
        });

        it('rejects usernames with spaces after normalization', () => {
            expect(() => UsernameIdentity.normalizeUsername('user name')).toThrow(/3-32 characters/);
        });

        it('throws when input is not a string', () => {
            expect(() => UsernameIdentity.normalizeUsername(123 as unknown)).toThrow('username is required');
            expect(() => UsernameIdentity.normalizeUsername(null as unknown)).toThrow('username is required');
            expect(() => UsernameIdentity.normalizeUsername(undefined as unknown)).toThrow('username is required');
        });
    });

    describe('toFirebaseEmail', () => {
        it('appends the configured auth email domain', () => {
            // AUTH_EMAIL_DOMAIN is set to 'purrivacy.test' in setupEnv.ts
            expect(UsernameIdentity.toFirebaseEmail('testuser')).toBe('testuser@purrivacy.test');
        });

        it('normalizes the username before constructing email', () => {
            expect(UsernameIdentity.toFirebaseEmail('  TestUser  ')).toBe('testuser@purrivacy.test');
        });
    });

    describe('fromFirebaseEmail', () => {
        it('extracts the username from a valid email', () => {
            expect(UsernameIdentity.fromFirebaseEmail('testuser@purrivacy.test')).toBe('testuser');
        });

        it('returns null for an email with wrong domain', () => {
            expect(UsernameIdentity.fromFirebaseEmail('user@other-domain.com')).toBeNull();
        });

        it('returns null for null input', () => {
            expect(UsernameIdentity.fromFirebaseEmail(null)).toBeNull();
        });

        it('returns null for undefined input', () => {
            expect(UsernameIdentity.fromFirebaseEmail(undefined)).toBeNull();
        });

        it('returns null for empty string input', () => {
            expect(UsernameIdentity.fromFirebaseEmail('')).toBeNull();
        });

        it('returns null for whitespace-only input', () => {
            expect(UsernameIdentity.fromFirebaseEmail('   ')).toBeNull();
        });

        it('handles uppercase email by lowercasing', () => {
            expect(UsernameIdentity.fromFirebaseEmail('TestUser@PURRIVACY.TEST')).toBe('testuser');
        });
    });
});
