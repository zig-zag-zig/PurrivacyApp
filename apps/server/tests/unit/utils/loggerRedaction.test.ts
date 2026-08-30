import { env } from '../../../src/config/env';

// The logger module exports `createLogger` but `redact`, `shouldLog`, and `safeStringify`
// are module-internal. We test them indirectly through the public logger API by capturing
// console output, and we re-import the internals via a controlled require cycle.

// We need to test the `redact` and `safeStringify` internals. Since they are not exported,
// we use a trick: import the module and test the logger's output behavior which exercises
// these functions.

describe('logger redaction', () => {
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('redacts keys matching secret patterns in meta', () => {
        // Force log level to debug so all messages appear
        jest.resetModules();
        process.env.LOG_LEVEL = 'debug';
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        logger.info('test message', {
            authorization: 'Bearer secret',
            token: 'abc123',
            password: 'hunter2',
            safeField: 'visible',
        });

        const output = JSON.parse(logSpy.mock.calls[0][0]);
        expect(output.authorization).toBe('[redacted]');
        expect(output.token).toBe('[redacted]');
        expect(output.password).toBe('[redacted]');
        expect(output.safeField).toBe('visible');
    });

    it('recursively redacts nested objects', () => {
        jest.resetModules();
        process.env.LOG_LEVEL = 'debug';
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        logger.info('nested', {
            outer: {
                secret: 'hidden',
                inner: {
                    email: 'user@example.com',
                    safe: 'ok',
                },
            },
        });

        const output = JSON.parse(logSpy.mock.calls[0][0]);
        expect(output.outer.secret).toBe('[redacted]');
        expect(output.outer.inner.email).toBe('[redacted]');
        expect(output.outer.inner.safe).toBe('ok');
    });

    it('redacts array elements recursively', () => {
        jest.resetModules();
        process.env.LOG_LEVEL = 'debug';
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        logger.info('array', {
            items: [
                { accessToken: 'token1', name: 'ok' },
                { accessToken: 'token2', name: 'ok2' },
            ],
        });

        const output = JSON.parse(logSpy.mock.calls[0][0]);
        expect(output.items[0].accessToken).toBe('[redacted]');
        expect(output.items[0].name).toBe('ok');
        expect(output.items[1].accessToken).toBe('[redacted]');
    });

    it('includes Error name, message but hides stack in production', () => {
        jest.resetModules();
        const originalNodeEnv = process.env.NODE_ENV;
        // env.ts validates strictly in production; provide a valid production
        // configuration so the module reload succeeds.
        process.env.MFA_KEK = 'a'.repeat(64);
        process.env.RECOVERY_ENUMERATION_PEPPER = 'b'.repeat(64);
        process.env.RECOVERY_VERIFIER_PEPPER = 'c'.repeat(64);
        process.env.TRUST_PROXY = 'loopback';
        process.env.FIREBASE_DATABASE_URL = 'https://demo-purrivacy-default-rtdb.firebaseio.com';
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
            type: 'service_account',
            project_id: 'demo-purrivacy',
            private_key: '-----BEGIN PRIVATE KEY-----\nk\n-----END PRIVATE KEY-----\n',
            client_email: 'demo@demo-purrivacy.iam.gserviceaccount.com',
        });
        process.env.SENTRY_ENABLED = 'false';
        process.env.SENTRY_DSN = 'https://public-key@sentry.example.com/1';
        process.env.NODE_ENV = 'production';
        process.env.LOG_LEVEL = 'debug';
        try {
            const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
            const logger = createLogger('test');

            logger.error('error test', {
                err: new Error('something broke'),
            });

            const output = JSON.parse(errorSpy.mock.calls[0][0]);
            expect(output.err.name).toBe('Error');
            expect(output.err.message).toBe('something broke');
            expect(output.err.stack).toBeUndefined();
        } finally {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    it('includes Error stack in non-production', () => {
        jest.resetModules();
        process.env.LOG_LEVEL = 'debug';
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        logger.error('error test', {
            err: new Error('something broke'),
        });

        const output = JSON.parse(errorSpy.mock.calls[0][0]);
        expect(output.err.stack).toBeDefined();
        expect(output.err.stack).toContain('Error: something broke');
    });

    it('does not log messages below the active log level', () => {
        jest.resetModules();
        process.env.LOG_LEVEL = 'warn';
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        logger.debug('should not appear');
        logger.info('should not appear');
        logger.warn('should appear');

        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});

describe('safeStringify', () => {
    it('handles bigint values by converting them to strings', () => {
        jest.resetModules();
        process.env.LOG_LEVEL = 'debug';
        const localLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        // Use BigInt from string to avoid number precision loss
        const big = BigInt('9007199254740993');
        expect(() => {
            logger.info('bigint test', { bigValue: big as unknown });
        }).not.toThrow();

        expect(localLogSpy).toHaveBeenCalledTimes(1);
        const output = JSON.parse(localLogSpy.mock.calls[0][0]);
        expect(output.bigValue).toBe('9007199254740993');
        localLogSpy.mockRestore();
    });

    it('handles circular references safely by returning [circular]', () => {
        jest.resetModules();
        process.env.LOG_LEVEL = 'debug';
        const localLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        const { createLogger } = require('../../../src/utils/logger') as typeof import('../../../src/utils/logger');
        const logger = createLogger('test');

        const circular: Record<string, unknown> = { a: 1 };
        circular.self = circular;

        // Should not throw — cycle detection returns '[circular]' for repeated references
        expect(() => {
            logger.info('circular test', circular);
        }).not.toThrow();

        const output = JSON.parse(localLogSpy.mock.calls[0][0]);
        expect(output.a).toBe(1);
        expect(output.self).toBe('[circular]');

        localLogSpy.mockRestore();
    });
});
