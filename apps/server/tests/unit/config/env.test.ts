// The env parsing functions are module-private. We test them indirectly by
// manipulating process.env and re-importing the module with jest.resetModules().
// The parsers are: parseNumberEnv, parseCsvEnv, parseBooleanEnv, parseFloatEnv, parseAuthEmailDomain.

const HEX_64 = (char: string): string => char.repeat(64);

/**
 * A fully valid production configuration. Production-mode tests start from
 * this and break a single invariant per case.
 */
const setValidProductionEnv = (): void => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_DOMAIN = 'purr.ivacy';
    process.env.MFA_KEK = HEX_64('a');
    process.env.RECOVERY_ENUMERATION_PEPPER = HEX_64('b');
    process.env.RECOVERY_VERIFIER_PEPPER = HEX_64('c');
    process.env.TRUST_PROXY = 'loopback';
    process.env.FIREBASE_DATABASE_URL = 'https://purrivacy-prod-default-rtdb.firebaseio.com';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: 'purrivacy-prod',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n',
        client_email: 'purrivacy-prod@appspot.gserviceaccount.com',
    });
    process.env.SENTRY_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://public-key@sentry.example.com/1';
    process.env.REQUEST_JSON_LIMIT = '10mb';
    process.env.REQUEST_FORM_LIMIT = '1mb';
};

describe('env parsing functions', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('parseNumberEnv', () => {
        it('returns fallback when env is not set', () => {
            jest.resetModules();
            delete process.env.PORT;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(5000);
        });

        it('parses a valid number', () => {
            jest.resetModules();
            process.env.PORT = '3000';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(3000);
        });

        it('returns fallback for non-numeric value', () => {
            jest.resetModules();
            process.env.PORT = 'abc';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(5000);
        });

        it('returns fallback for value below min', () => {
            jest.resetModules();
            process.env.PORT = '0';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(5000);
        });
    });

    describe('parseBooleanEnv', () => {
        it('parses "true" as true', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'true';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(true);
        });

        it('parses "1" as true', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = '1';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(true);
        });

        it('parses "yes" as true', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'yes';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(true);
        });

        it('parses "false" as false', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'false';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(false);
        });

        it('returns fallback when not set', () => {
            jest.resetModules();
            delete process.env.TRUST_PROXY;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(false);
        });
    });

    describe('parseCsvEnv', () => {
        it('parses comma-separated values', () => {
            jest.resetModules();
            process.env.ALLOWED_ORIGINS = 'https://a.com, https://b.com';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
        });

        it('returns empty array when not set', () => {
            jest.resetModules();
            delete process.env.ALLOWED_ORIGINS;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.allowedOrigins).toEqual([]);
        });

        it('filters empty segments', () => {
            jest.resetModules();
            process.env.ALLOWED_ORIGINS = 'https://a.com,,https://b.com,';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
        });
    });

    describe('parseFloatEnv', () => {
        it('parses a valid float', () => {
            jest.resetModules();
            process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.sentryTracesSampleRate).toBe(0.5);
        });

        it('returns fallback for out-of-range value', () => {
            jest.resetModules();
            process.env.SENTRY_TRACES_SAMPLE_RATE = '1.5';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.sentryTracesSampleRate).toBe(0);
        });

        it('returns fallback for non-finite value', () => {
            jest.resetModules();
            process.env.SENTRY_TRACES_SAMPLE_RATE = 'Infinity';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.sentryTracesSampleRate).toBe(0);
        });
    });

    describe('parseAuthEmailDomain', () => {
        it('accepts a valid domain', () => {
            jest.resetModules();
            process.env.AUTH_EMAIL_DOMAIN = 'example.com';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.authEmailDomain).toBe('example.com');
        });

        it('rejects an invalid domain format', () => {
            jest.resetModules();
            process.env.AUTH_EMAIL_DOMAIN = 'not-a-domain';
            expect(() => require('../../../src/config/env')).toThrow(/AUTH_EMAIL_DOMAIN must be a valid domain/);
        });

        it('normalizes to lowercase', () => {
            jest.resetModules();
            process.env.AUTH_EMAIL_DOMAIN = 'Example.COM';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.authEmailDomain).toBe('example.com');
        });
    });

    describe('parseTrustProxy', () => {
        it('accepts legacy boolean values', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'true';
            expect(require('../../../src/config/env').env.trustProxy).toBe(true);

            jest.resetModules();
            process.env.TRUST_PROXY = 'false';
            expect(require('../../../src/config/env').env.trustProxy).toBe(false);
        });

        it('accepts loopback', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'loopback';
            expect(require('../../../src/config/env').env.trustProxy).toBe('loopback');
        });

        it('accepts a hop count', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = '2';
            expect(require('../../../src/config/env').env.trustProxy).toBe(2);
        });

        it('accepts a comma-separated list of trusted subnets', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = '10.0.0.0/8, 127.0.0.1';
            expect(require('../../../src/config/env').env.trustProxy).toEqual(['10.0.0.0/8', '127.0.0.1']);
        });

        it('falls back to false for unrecognized values', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'garbage-value';
            expect(require('../../../src/config/env').env.trustProxy).toBe(false);
        });
    });

    describe('userMaxKeyRecords', () => {
        it('defaults to 1000 when unset', () => {
            jest.resetModules();
            delete process.env.USER_MAX_KEY_RECORDS;
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(1000);
        });

        it('parses a valid configured value', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = '250';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(250);
        });

        it('clamps values above the hard ceiling of 5000', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = '99999';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(5000);
        });

        it('returns the fallback for values below 1', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = '0';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(1000);
        });

        it('returns the fallback for non-numeric values', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = 'many';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(1000);
        });
    });

    describe('rate limit store configuration', () => {
        it('defaults to the memory store', () => {
            jest.resetModules();
            delete process.env.RATE_LIMIT_STORE;
            expect(require('../../../src/config/env').env.rateLimitStore).toBe('memory');
        });

        it('selects the redis store', () => {
            jest.resetModules();
            process.env.RATE_LIMIT_STORE = 'redis';
            process.env.REDIS_URL = 'redis://cache:6379';
            expect(require('../../../src/config/env').env.rateLimitStore).toBe('redis');
        });

        it('refuses to select the redis store without REDIS_URL (no silent localhost default)', () => {
            jest.resetModules();
            process.env.RATE_LIMIT_STORE = 'redis';
            delete process.env.REDIS_URL;
            expect(() => require('../../../src/config/env')).toThrow(
                'RATE_LIMIT_STORE=redis requires REDIS_URL',
            );
        });

        it('parses REDIS_URL', () => {
            jest.resetModules();
            process.env.REDIS_URL = 'redis://cache:6379';
            expect(require('../../../src/config/env').env.redisUrl).toBe('redis://cache:6379');
        });

        it('defaults RATE_LIMIT_FAIL_CLOSED to true in production', () => {
            jest.resetModules();
            setValidProductionEnv();
            delete process.env.RATE_LIMIT_FAIL_CLOSED;
            expect(require('../../../src/config/env').env.rateLimitFailClosed).toBe(true);
        });

        it('defaults RATE_LIMIT_FAIL_CLOSED to false outside production', () => {
            jest.resetModules();
            process.env.NODE_ENV = 'test';
            delete process.env.RATE_LIMIT_FAIL_CLOSED;
            expect(require('../../../src/config/env').env.rateLimitFailClosed).toBe(false);
        });

        it('honors an explicit RATE_LIMIT_FAIL_CLOSED value', () => {
            jest.resetModules();
            process.env.NODE_ENV = 'test';
            process.env.RATE_LIMIT_FAIL_CLOSED = 'true';
            expect(require('../../../src/config/env').env.rateLimitFailClosed).toBe(true);
        });
    });

    describe('body size limits', () => {
        it('parses byte-size strings', () => {
            jest.resetModules();
            process.env.REQUEST_JSON_LIMIT = '10mb';
            process.env.REQUEST_FORM_LIMIT = '512kb';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.requestJsonLimit).toBe('10mb');
            expect(env.requestJsonLimitBytes).toBe(10 * 1024 * 1024);
            expect(env.requestFormLimit).toBe('512kb');
            expect(env.requestFormLimitBytes).toBe(512 * 1024);
        });

        it('defaults when unset', () => {
            jest.resetModules();
            delete process.env.REQUEST_JSON_LIMIT;
            delete process.env.REQUEST_FORM_LIMIT;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.requestJsonLimit).toBe('10mb');
            expect(env.requestJsonLimitBytes).toBe(10 * 1024 * 1024);
            expect(env.requestFormLimit).toBe('1mb');
            expect(env.requestFormLimitBytes).toBe(1024 * 1024);
        });

        it('falls back to the default for invalid values outside production', () => {
            jest.resetModules();
            process.env.REQUEST_JSON_LIMIT = 'huge';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.requestJsonLimit).toBe('10mb');
            expect(env.requestJsonLimitBytes).toBe(10 * 1024 * 1024);
        });

        it('falls back to the default for oversized values outside production', () => {
            jest.resetModules();
            process.env.REQUEST_FORM_LIMIT = '100mb';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.requestFormLimit).toBe('1mb');
        });
    });

    describe('recovery peppers', () => {
        it('derives stable 64-hex development defaults when unset', () => {
            jest.resetModules();
            delete process.env.RECOVERY_ENUMERATION_PEPPER;
            delete process.env.RECOVERY_VERIFIER_PEPPER;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.recoveryEnumerationPepper).toMatch(/^[0-9a-f]{64}$/i);
            expect(env.recoveryVerifierPepper).toMatch(/^[0-9a-f]{64}$/i);
            expect(env.recoveryEnumerationPepper).not.toBe(env.recoveryVerifierPepper);
            expect(env.recoveryEnumerationPepper).not.toBe(env.mfaKek);
        });

        it('uses explicit values when provided', () => {
            jest.resetModules();
            process.env.RECOVERY_ENUMERATION_PEPPER = HEX_64('d');
            process.env.RECOVERY_VERIFIER_PEPPER = HEX_64('e');
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.recoveryEnumerationPepper).toBe(HEX_64('d'));
            expect(env.recoveryVerifierPepper).toBe(HEX_64('e'));
        });

        it('rejects a pepper equal to MFA_KEK', () => {
            jest.resetModules();
            process.env.MFA_KEK = HEX_64('a');
            process.env.RECOVERY_ENUMERATION_PEPPER = HEX_64('a');
            expect(() => require('../../../src/config/env')).toThrow(/RECOVERY_ENUMERATION_PEPPER must be distinct from MFA_KEK/);
        });

        it('rejects equal peppers', () => {
            jest.resetModules();
            process.env.RECOVERY_ENUMERATION_PEPPER = HEX_64('d');
            process.env.RECOVERY_VERIFIER_PEPPER = HEX_64('d');
            expect(() => require('../../../src/config/env')).toThrow(/RECOVERY_VERIFIER_PEPPER must be distinct from RECOVERY_ENUMERATION_PEPPER/);
        });
    });

    describe('MFA_KEK leniency outside production', () => {
        it('accepts a non-64-hex MFA_KEK outside production', () => {
            jest.resetModules();
            process.env.NODE_ENV = 'test';
            process.env.MFA_KEK = 'short-kek';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.mfaKek).toBe('short-kek');
        });
    });

    describe('production environment validation', () => {
        it('loads with a fully valid production configuration', () => {
            jest.resetModules();
            setValidProductionEnv();
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.nodeEnv).toBe('production');
            expect(env.mfaKek).toBe(HEX_64('a'));
            expect(env.recoveryEnumerationPepper).toBe(HEX_64('b'));
            expect(env.recoveryVerifierPepper).toBe(HEX_64('c'));
            expect(env.requestJsonLimitBytes).toBe(10 * 1024 * 1024);
        });

        it('accepts GOOGLE_APPLICATION_CREDENTIALS pointing at an existing file', () => {
            jest.resetModules();
            setValidProductionEnv();
            delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
            process.env.GOOGLE_APPLICATION_CREDENTIALS = `${process.cwd()}/jest.config.cjs`;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.firebaseCredentialsPath).toBe(`${process.cwd()}/jest.config.cjs`);
        });

        const productionViolationCases: Array<[string, () => void, RegExp]> = [
            [
                'rejects MFA_KEK that is not 64 hex',
                () => { setValidProductionEnv(); process.env.MFA_KEK = 'short-kek'; },
                /MFA_KEK must be exactly 64 hex characters/,
            ],
            [
                'rejects a missing RECOVERY_ENUMERATION_PEPPER',
                () => { setValidProductionEnv(); delete process.env.RECOVERY_ENUMERATION_PEPPER; },
                /Missing required environment variable: RECOVERY_ENUMERATION_PEPPER/,
            ],
            [
                'rejects a non-hex RECOVERY_ENUMERATION_PEPPER',
                () => { setValidProductionEnv(); process.env.RECOVERY_ENUMERATION_PEPPER = 'not-hex'; },
                /RECOVERY_ENUMERATION_PEPPER must be exactly 64 hex characters/,
            ],
            [
                'rejects RECOVERY_ENUMERATION_PEPPER equal to MFA_KEK',
                () => { setValidProductionEnv(); process.env.RECOVERY_ENUMERATION_PEPPER = HEX_64('a'); },
                /RECOVERY_ENUMERATION_PEPPER must be distinct from MFA_KEK/,
            ],
            [
                'rejects RECOVERY_VERIFIER_PEPPER equal to RECOVERY_ENUMERATION_PEPPER',
                () => { setValidProductionEnv(); process.env.RECOVERY_VERIFIER_PEPPER = HEX_64('b'); },
                /RECOVERY_VERIFIER_PEPPER must be distinct from RECOVERY_ENUMERATION_PEPPER/,
            ],
            [
                'rejects FIREBASE_USE_EMULATOR enabled',
                () => { setValidProductionEnv(); process.env.FIREBASE_USE_EMULATOR = 'true'; },
                /FIREBASE_USE_EMULATOR must be disabled in production/,
            ],
            [
                'rejects missing Firebase credentials',
                () => {
                    setValidProductionEnv();
                    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
                    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
                },
                /FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is required in production/,
            ],
            [
                'rejects invalid FIREBASE_SERVICE_ACCOUNT_JSON',
                () => { setValidProductionEnv(); process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{not-json'; },
                /FIREBASE_SERVICE_ACCOUNT_JSON must be valid Firebase service-account JSON in production/,
            ],
            [
                'rejects a non-existent GOOGLE_APPLICATION_CREDENTIALS path',
                () => {
                    setValidProductionEnv();
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/service-account.json';
                },
                /GOOGLE_APPLICATION_CREDENTIALS file does not exist/,
            ],
            [
                'rejects a missing FIREBASE_DATABASE_URL',
                () => { setValidProductionEnv(); delete process.env.FIREBASE_DATABASE_URL; },
                /FIREBASE_DATABASE_URL is required in production/,
            ],
            [
                'rejects an unset TRUST_PROXY',
                () => { setValidProductionEnv(); delete process.env.TRUST_PROXY; },
                /TRUST_PROXY must be explicitly configured in production/,
            ],
            [
                'rejects an oversized REQUEST_JSON_LIMIT',
                () => { setValidProductionEnv(); process.env.REQUEST_JSON_LIMIT = '16mb'; },
                /REQUEST_JSON_LIMIT must not exceed 15mb in production/,
            ],
            [
                'rejects an oversized REQUEST_FORM_LIMIT',
                () => { setValidProductionEnv(); process.env.REQUEST_FORM_LIMIT = '3mb'; },
                /REQUEST_FORM_LIMIT must not exceed 2mb in production/,
            ],
            [
                'rejects an invalid REQUEST_JSON_LIMIT format',
                () => { setValidProductionEnv(); process.env.REQUEST_JSON_LIMIT = 'large'; },
                /REQUEST_JSON_LIMIT must be a byte size/,
            ],
            [
                'rejects SENTRY_ENABLED without SENTRY_DSN',
                () => { setValidProductionEnv(); delete process.env.SENTRY_DSN; },
                /SENTRY_DSN is required when SENTRY_ENABLED is true in production/,
            ],
        ];

        it.each(productionViolationCases)('%s', (_name, setup, expected) => {
            jest.resetModules();
            setup();
            expect(() => require('../../../src/config/env')).toThrow(expected);
        });
    });
});
