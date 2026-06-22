import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env', () => ({
    ENV: { authEmailDomain: 'purrivacy.example' },
}));

import {
    sanitizeUsernameInput,
    validateUsername,
    usernameToAuthEmail,
    getUsernameFromUser,
} from './usernameIdentity';

describe('sanitizeUsernameInput', () => {
    it('strips @domain suffix and lowercases', () => {
        expect(sanitizeUsernameInput('Cat@purrivacy.example')).toBe('cat');
    });

    it('strips @domain, removes special characters and trims', () => {
        expect(sanitizeUsernameInput('  C@t!#$  ')).toBe('c');
    });

    it('removes special characters without @', () => {
        expect(sanitizeUsernameInput('  c!a$t  ')).toBe('cat');
    });

    it('preserves underscores', () => {
        expect(sanitizeUsernameInput('cool_cat')).toBe('cool_cat');
    });

    it('respects max length (32 chars)', () => {
        const long = 'a'.repeat(50);
        expect(sanitizeUsernameInput(long)).toHaveLength(32);
    });
});

describe('validateUsername', () => {
    it('rejects empty username', () => {
        expect(validateUsername('')).not.toBeNull();
        expect(validateUsername('   ')).not.toBeNull();
    });

    it('rejects username with @ (email input)', () => {
        expect(validateUsername('cat@example.com')).toBe(
            'Enter your username, not an email address',
        );
    });

    it('rejects too-short username', () => {
        expect(validateUsername('ab')).not.toBeNull();
    });

    it('rejects too-long username', () => {
        expect(validateUsername('a'.repeat(33))).not.toBeNull();
    });

    it('rejects special characters', () => {
        expect(validateUsername('cat!name')).toBe(
            'Use only letters, numbers, underscores, hyphens, dots, and plus signs',
        );
    });

    it('accepts valid username', () => {
        expect(validateUsername('cool_cat_99')).toBeNull();
    });
});

describe('usernameToAuthEmail', () => {
    it('returns username@domain for valid username', () => {
        expect(usernameToAuthEmail('mycat')).toBe('mycat@purrivacy.example');
    });

    it('normalizes to lowercase', () => {
        expect(usernameToAuthEmail('MyCat')).toBe('mycat@purrivacy.example');
    });

    it('throws on invalid username', () => {
        expect(() => usernameToAuthEmail('ab')).toThrow();
        expect(() => usernameToAuthEmail('user@example.com')).toThrow();
    });
});

describe('getUsernameFromUser', () => {
    it('extracts username from Firebase email', () => {
        const user = { email: 'mycat@purrivacy.example' } as any;
        expect(getUsernameFromUser(user)).toBe('mycat');
    });

    it('returns null for null user', () => {
        expect(getUsernameFromUser(null)).toBeNull();
    });

    it('returns null for undefined user', () => {
        expect(getUsernameFromUser(undefined)).toBeNull();
    });

    it('returns null when email does not match auth domain', () => {
        const user = { email: 'mycat@other-domain.com' } as any;
        expect(getUsernameFromUser(user)).toBeNull();
    });

    it('returns null for user with null email', () => {
        const user = { email: null } as any;
        expect(getUsernameFromUser(user)).toBeNull();
    });
});
