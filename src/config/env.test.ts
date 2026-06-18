import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.example/';
    process.env.EXPO_PUBLIC_AUTH_EMAIL_DOMAIN = 'test.example';
});
vi.mock('react-native', () => ({}));
vi.mock('expo-modules-core', () => ({}));
vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('./firebaseEmulator', () => ({ getFirebaseAuthEmulatorUrl: () => null }));

import {
    parseNumberEnv,
    parseFloatEnv,
    parseBooleanEnv,
    ensureTrailingSlash,
    parseApiBaseUrl,
    parseAuthEmailDomain,
    parseApiVersion,
    parseOptionalGitHubRepoUrl,
    parseOptionalFirebaseProjectId,
    parseOptionalString,
} from './env';

describe('parseNumberEnv', () => {
    it('parses a valid integer string', () => {
        expect(parseNumberEnv('42', 10)).toBe(42);
    });

    it('returns defaultValue for undefined', () => {
        expect(parseNumberEnv(undefined, 99)).toBe(99);
    });

    it('returns defaultValue for empty string', () => {
        expect(parseNumberEnv('', 99)).toBe(99);
    });

    it('clamps at min (default 0) — negative returns default', () => {
        expect(parseNumberEnv('-5', 10, 0)).toBe(10);
    });

    it('clamps at custom min', () => {
        expect(parseNumberEnv('2', 10, 5)).toBe(10);
        expect(parseNumberEnv('7', 10, 5)).toBe(7);
    });

    it('returns defaultValue for non-finite values like NaN strings', () => {
        expect(parseNumberEnv('abc', 10)).toBe(10);
    });
});

describe('parseFloatEnv', () => {
    it('parses a valid float string', () => {
        expect(parseFloatEnv('0.75', 0.5)).toBe(0.75);
    });

    it('returns defaultValue for undefined', () => {
        expect(parseFloatEnv(undefined, 0.25)).toBe(0.25);
    });

    it('returns defaultValue for empty string', () => {
        expect(parseFloatEnv('', 0.5)).toBe(0.5);
    });

    it('clamps below min (default 0)', () => {
        expect(parseFloatEnv('-0.1', 0.5, 0, 1)).toBe(0.5);
    });

    it('clamps above max (default 1)', () => {
        expect(parseFloatEnv('1.5', 0.5, 0, 1)).toBe(0.5);
    });

    it('returns defaultValue for non-finite strings', () => {
        expect(parseFloatEnv('not-a-number', 0.5)).toBe(0.5);
    });
});

describe('parseBooleanEnv', () => {
    it('returns true for "true"', () => {
        expect(parseBooleanEnv('true')).toBe(true);
    });

    it('returns true for "1"', () => {
        expect(parseBooleanEnv('1')).toBe(true);
    });

    it('returns true for "yes"', () => {
        expect(parseBooleanEnv('yes')).toBe(true);
    });

    it('returns false for "false"', () => {
        expect(parseBooleanEnv('false')).toBe(false);
    });

    it('returns false for "0"', () => {
        expect(parseBooleanEnv('0')).toBe(false);
    });

    it('returns false for "no"', () => {
        expect(parseBooleanEnv('no')).toBe(false);
    });

    it('returns defaultValue for undefined', () => {
        expect(parseBooleanEnv(undefined, true)).toBe(true);
    });

    it('returns defaultValue for empty string', () => {
        expect(parseBooleanEnv('', true)).toBe(true);
    });

    it('returns defaultValue for garbage input', () => {
        expect(parseBooleanEnv('maybe', false)).toBe(false);
    });

    it('is case-insensitive and trims whitespace', () => {
        expect(parseBooleanEnv(' TRUE ')).toBe(true);
        expect(parseBooleanEnv(' False ')).toBe(false);
    });
});

describe('ensureTrailingSlash', () => {
    it('appends slash when missing', () => {
        expect(ensureTrailingSlash('https://example.com')).toBe('https://example.com/');
    });

    it('does not double an existing trailing slash', () => {
        expect(ensureTrailingSlash('https://example.com/')).toBe('https://example.com/');
    });
});

describe('parseApiBaseUrl', () => {
    it('accepts http:// and appends trailing slash', () => {
        expect(parseApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000/');
    });

    it('accepts https:// and appends trailing slash', () => {
        expect(parseApiBaseUrl('https://api.example.com')).toBe('https://api.example.com/');
    });

    it('throws for URL without http/https protocol', () => {
        expect(() => parseApiBaseUrl('ftp://example.com')).toThrow('http:// or https://');
    });

    it('throws for bare hostname', () => {
        expect(() => parseApiBaseUrl('example.com')).toThrow('http:// or https://');
    });
});

describe('parseAuthEmailDomain', () => {
    it('accepts valid domain', () => {
        expect(parseAuthEmailDomain('purrivacy.example')).toBe('purrivacy.example');
    });

    it('lowercases the result', () => {
        expect(parseAuthEmailDomain('Purrivacy.Example')).toBe('purrivacy.example');
    });

    it('throws for invalid domain (no TLD)', () => {
        expect(() => parseAuthEmailDomain('localhost')).toThrow('valid domain');
    });
});

describe('parseApiVersion', () => {
    it('returns "v1" for valid input "v1"', () => {
        expect(parseApiVersion('v1')).toBe('v1');
    });

    it('prepends "v" to bare number', () => {
        expect(parseApiVersion('1')).toBe('v1');
    });

    it('prepends "v" to bare number 2', () => {
        expect(parseApiVersion('2')).toBe('v2');
    });

    it('strips leading and trailing slashes', () => {
        expect(parseApiVersion('/v3/')).toBe('v3');
    });

    it('uses default "v1" when undefined', () => {
        expect(parseApiVersion(undefined)).toBe('v1');
    });

    it('throws for "v0"', () => {
        expect(() => parseApiVersion('v0')).toThrow('v1, v2');
    });
});

describe('parseOptionalGitHubRepoUrl', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalGitHubRepoUrl(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseOptionalGitHubRepoUrl('')).toBeNull();
    });

    it('parses valid GitHub URL and strips .git suffix', () => {
        expect(parseOptionalGitHubRepoUrl('https://github.com/owner/repo.git')).toBe(
            'https://github.com/owner/repo',
        );
    });

    it('parses valid GitHub URL without .git', () => {
        expect(parseOptionalGitHubRepoUrl('https://github.com/owner/repo')).toBe(
            'https://github.com/owner/repo',
        );
    });

    it('throws for non-GitHub domain', () => {
        expect(() => parseOptionalGitHubRepoUrl('https://gitlab.com/owner/repo')).toThrow(
            'https://github.com/',
        );
    });

    it('throws for non-https protocol', () => {
        expect(() => parseOptionalGitHubRepoUrl('http://github.com/owner/repo')).toThrow(
            'https://github.com/',
        );
    });
});

describe('parseOptionalFirebaseProjectId', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalFirebaseProjectId(undefined, 'development')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseOptionalFirebaseProjectId('', 'development')).toBeNull();
    });

    it('accepts valid project id in development', () => {
        expect(parseOptionalFirebaseProjectId('my-project-123', 'development')).toBe('my-project-123');
    });

    it('throws when set in production', () => {
        expect(() => parseOptionalFirebaseProjectId('my-project', 'production')).toThrow(
            'cannot be set for production',
        );
    });

    it('throws for invalid project id (too short)', () => {
        expect(() => parseOptionalFirebaseProjectId('ab', 'development')).toThrow(
            'valid Firebase project id',
        );
    });
});

describe('parseOptionalString', () => {
    it('returns trimmed value for non-empty string', () => {
        expect(parseOptionalString('  hello  ')).toBe('hello');
    });

    it('returns null for undefined', () => {
        expect(parseOptionalString(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseOptionalString('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(parseOptionalString('   ')).toBeNull();
    });
});
