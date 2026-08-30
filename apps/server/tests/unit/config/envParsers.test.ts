import {
    assertDistinctSecrets,
    parseAuthEmailDomain,
    parseBodyLimitEnv,
    parseByteSizeToBytes,
    parseRateLimitStoreSelection,
    parseRecoveryPepperEnv,
    parseTrustProxy,
} from '../../../src/config/envParsers';

/**
 * Direct tests for the pure env parsers (envParsers.ts) — no module reloads,
 * no process.env mutation. The thin env.ts assembly is covered by env.test.ts.
 */

describe('envParsers: parseByteSizeToBytes', () => {
    it('parses b/kb/mb/gb with default b', () => {
        expect(parseByteSizeToBytes('512')).toBe(512);
        expect(parseByteSizeToBytes('512kb')).toBe(512 * 1024);
        expect(parseByteSizeToBytes('10mb')).toBe(10 * 1024 * 1024);
        expect(parseByteSizeToBytes('1gb')).toBe(1024 * 1024 * 1024);
        expect(parseByteSizeToBytes('1.5mb')).toBe(Math.round(1.5 * 1024 * 1024));
    });

    it('returns NaN for invalid input', () => {
        expect(parseByteSizeToBytes('ten mb')).toBeNaN();
        expect(parseByteSizeToBytes('')).toBeNaN();
    });
});

describe('envParsers: parseAuthEmailDomain', () => {
    it('normalizes and accepts valid domains', () => {
        expect(parseAuthEmailDomain('  Purr.ivacy ')).toBe('purr.ivacy');
    });

    it('rejects invalid domains', () => {
        expect(() => parseAuthEmailDomain('not-a-domain')).toThrow('AUTH_EMAIL_DOMAIN');
        expect(() => parseAuthEmailDomain('')).toThrow('AUTH_EMAIL_DOMAIN');
    });
});

describe('envParsers: parseTrustProxy', () => {
    it('handles booleans, loopback, hops, and subnets', () => {
        expect(parseTrustProxy('true')).toBe(true);
        expect(parseTrustProxy('false')).toBe(false);
        expect(parseTrustProxy('')).toBe(false);
        expect(parseTrustProxy('loopback')).toBe('loopback');
        // '1' is ambiguous: the boolean check wins (matches pre-existing semantics).
        expect(parseTrustProxy('1')).toBe(true);
        expect(parseTrustProxy('2')).toBe(2);
        expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toEqual(['10.0.0.0/8', '127.0.0.1']);
    });

    it('falls back to false for garbage', () => {
        expect(parseTrustProxy('banana')).toBe(false);
    });
});

describe('envParsers: parseRateLimitStoreSelection', () => {
    it('defaults to memory and selects redis with a URL', () => {
        expect(parseRateLimitStoreSelection(undefined, undefined)).toBe('memory');
        expect(parseRateLimitStoreSelection('redis', 'redis://cache:6379')).toBe('redis');
        expect(parseRateLimitStoreSelection('foo', undefined)).toBe('memory');
    });

    it('fails fast when redis is selected without REDIS_URL', () => {
        expect(() => parseRateLimitStoreSelection('redis', undefined)).toThrow('REDIS_URL');
        expect(() => parseRateLimitStoreSelection('redis', '  ')).toThrow('REDIS_URL');
    });
});

describe('envParsers: parseBodyLimitEnv', () => {
    const env = { isProduction: false, isTestEnv: true };
    const warn = jest.fn();
    const source = { REQUEST_JSON_LIMIT: '2mb' };

    it('parses an explicit valid limit', () => {
        expect(parseBodyLimitEnv('REQUEST_JSON_LIMIT', '10mb', 15 * 1024 * 1024, env, warn, source))
            .toEqual({ limit: '2mb', limitBytes: 2 * 1024 * 1024 });
    });

    it('falls back when unset', () => {
        expect(parseBodyLimitEnv('REQUEST_JSON_LIMIT', '10mb', 15 * 1024 * 1024, env, warn, {})).toEqual({
            limit: '10mb',
            limitBytes: 10 * 1024 * 1024,
        });
    });

    it('throws in production when the limit exceeds the maximum', () => {
        const prod = { isProduction: true, isTestEnv: false };
        expect(() => parseBodyLimitEnv('REQUEST_JSON_LIMIT', '10mb', 15 * 1024 * 1024, prod, warn, { REQUEST_JSON_LIMIT: '16mb' }))
            .toThrow('must not exceed');
    });
});

describe('envParsers: parseRecoveryPepperEnv', () => {
    const env = { isProduction: false, isTestEnv: true };
    const warn = jest.fn();

    it('returns a valid hex value as-is', () => {
        const hex = 'a'.repeat(64);
        expect(parseRecoveryPepperEnv('P', 'domain', hex, env, warn, { P: hex })).toBe(hex);
    });

    it('derives a stable dev value when unset outside production', () => {
        const a = parseRecoveryPepperEnv('P', 'domain', 'kek', env, warn, {});
        const b = parseRecoveryPepperEnv('P', 'domain', 'kek', env, warn, {});
        expect(a).toMatch(/^[0-9a-f]{64}$/i);
        expect(a).toBe(b); // stable per domain+kek
    });

    it('throws when required in production', () => {
        const prod = { isProduction: true, isTestEnv: false };
        expect(() => parseRecoveryPepperEnv('P', 'domain', 'kek', prod, warn, {})).toThrow('Missing required');
    });
});

describe('envParsers: assertDistinctSecrets', () => {
    it('throws when two secrets are equal', () => {
        expect(() => assertDistinctSecrets('same', 'A', 'same', 'B')).toThrow('A must be distinct from B');
        expect(() => assertDistinctSecrets('a', 'A', 'b', 'B')).not.toThrow();
    });
});
