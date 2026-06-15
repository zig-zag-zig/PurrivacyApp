import { describe, expect, it, vi, afterEach } from 'vitest';

vi.hoisted(() => {
    (globalThis as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com/';
    process.env.EXPO_PUBLIC_AUTH_EMAIL_DOMAIN = 'purrivacy.example';
});

vi.mock('expo-constants', () => ({
    default: {
        nativeAppVersion: '2.3.0',
        nativeBuildVersion: '42',
        expoConfig: { version: '2.3.0' },
        extra: {},
    },
}));

vi.mock('./firebaseEmulator', () => ({
    getFirebaseAuthEmulatorUrl: () => null,
}));

import {
    parseNumberEnv,
    parseFloatEnv,
    parseBooleanEnv,
    ensureTrailingSlash,
    parseApiBaseUrl,
    parseAuthEmailDomain,
    parseOptionalFirebaseProjectId,
    parseApiVersion,
    parseOptionalGitHubRepoUrl,
    parseOptionalUrl,
} from './env';


describe('parseNumberEnv', () => {
    it('returns default for undefined', () => {
        expect(parseNumberEnv(undefined, 42)).toBe(42);
    });

    it('parses valid number', () => {
        expect(parseNumberEnv('10', 0)).toBe(10);
    });

    it('returns default for negative below min', () => {
        expect(parseNumberEnv('-5', 0, 0)).toBe(0);
    });

    it('returns default for non-finite', () => {
        expect(parseNumberEnv('abc', 7)).toBe(7);
    });

    it('returns default for NaN input', () => {
        expect(parseNumberEnv('NaN', 3)).toBe(3);
    });
});

describe('parseFloatEnv', () => {
    it('returns default for undefined', () => {
        expect(parseFloatEnv(undefined, 0.5)).toBe(0.5);
    });

    it('parses valid float within range', () => {
        expect(parseFloatEnv('0.75', 0, 0, 1)).toBe(0.75);
    });

    it('returns default for value above max', () => {
        expect(parseFloatEnv('1.5', 0, 0, 1)).toBe(0);
    });

    it('returns default for value below min', () => {
        expect(parseFloatEnv('-0.1', 0, 0, 1)).toBe(0);
    });
});

describe('parseBooleanEnv', () => {
    it('returns default for undefined', () => {
        expect(parseBooleanEnv(undefined)).toBe(false);
    });

    it('parses true/1/yes', () => {
        expect(parseBooleanEnv('true')).toBe(true);
        expect(parseBooleanEnv('1')).toBe(true);
        expect(parseBooleanEnv('yes')).toBe(true);
    });

    it('parses false/0/no', () => {
        expect(parseBooleanEnv('false')).toBe(false);
        expect(parseBooleanEnv('0')).toBe(false);
        expect(parseBooleanEnv('no')).toBe(false);
    });

    it('returns default for unrecognized value', () => {
        expect(parseBooleanEnv('maybe', true)).toBe(true);
    });
});

describe('ensureTrailingSlash', () => {
    it('adds slash if missing', () => {
        expect(ensureTrailingSlash('https://api.example.com')).toBe('https://api.example.com/');
    });

    it('does not double slash', () => {
        expect(ensureTrailingSlash('https://api.example.com/')).toBe('https://api.example.com/');
    });
});

describe('parseApiBaseUrl', () => {
    it('accepts https URL', () => {
        expect(parseApiBaseUrl('https://api.example.com')).toBe('https://api.example.com/');
    });

    it('accepts http URL', () => {
        expect(parseApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000/');
    });

    it('throws for missing protocol', () => {
        expect(() => parseApiBaseUrl('api.example.com')).toThrow(/http/);
    });
});

describe('parseAuthEmailDomain', () => {
    it('accepts valid domain', () => {
        expect(parseAuthEmailDomain('example.com')).toBe('example.com');
    });

    it('lowercases domain', () => {
        expect(parseAuthEmailDomain('EXAMPLE.COM')).toBe('example.com');
    });

    it('rejects invalid domain', () => {
        expect(() => parseAuthEmailDomain('not-a-domain')).toThrow(/valid domain/);
    });
});

describe('parseOptionalFirebaseProjectId', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalFirebaseProjectId(undefined, 'development')).toBeNull();
    });

    it('returns trimmed id for non-production', () => {
        expect(parseOptionalFirebaseProjectId('my-project-123', 'development')).toBe('my-project-123');
    });

    it('throws for production builds', () => {
        expect(() => parseOptionalFirebaseProjectId('my-project', 'production')).toThrow(/production/);
    });

    it('rejects invalid project id format', () => {
        expect(() => parseOptionalFirebaseProjectId('123-bad', 'development')).toThrow(/valid Firebase project id/);
    });
});

describe('parseApiVersion', () => {
    it('returns default for undefined', () => {
        expect(parseApiVersion(undefined)).toBe('v1');
    });

    it('parses version number', () => {
        expect(parseApiVersion('2')).toBe('v2');
    });

    it('normalizes v prefix', () => {
        expect(parseApiVersion('v3')).toBe('v3');
    });

    it('rejects invalid version', () => {
        expect(() => parseApiVersion('abc')).toThrow(/v1, v2/);
    });

    it('rejects v0', () => {
        expect(() => parseApiVersion('v0')).toThrow(/v1, v2/);
    });
});

describe('parseOptionalGitHubRepoUrl', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalGitHubRepoUrl(undefined)).toBeNull();
    });

    it('parses valid GitHub URL', () => {
        expect(parseOptionalGitHubRepoUrl('https://github.com/owner/repo')).toBe(
            'https://github.com/owner/repo',
        );
    });

    it('strips .git suffix', () => {
        expect(parseOptionalGitHubRepoUrl('https://github.com/owner/repo.git')).toBe(
            'https://github.com/owner/repo',
        );
    });

    it('rejects non-GitHub URL', () => {
        expect(() => parseOptionalGitHubRepoUrl('https://gitlab.com/owner/repo')).toThrow(/github/);
    });

    it('rejects http URL', () => {
        expect(() => parseOptionalGitHubRepoUrl('http://github.com/owner/repo')).toThrow(/github/);
    });
});

describe('parseOptionalUrl', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalUrl(undefined, 'TEST_URL')).toBeNull();
    });

    it('accepts valid https URL', () => {
        expect(parseOptionalUrl('https://example.com', 'TEST_URL')).toBe('https://example.com/');
    });

    it('rejects http URL', () => {
        expect(() => parseOptionalUrl('http://example.com', 'TEST_URL')).toThrow(/https/);
    });
});
