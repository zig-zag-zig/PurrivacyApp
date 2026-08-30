import { describe, expect, it, vi, afterEach } from 'vitest';

import { redact, logger } from './logger';

describe('redact', () => {
    it('redacts keys matching SECRET_KEY_RE pattern', () => {
        const result = redact({
            accessToken: 'secret-123',
            refreshToken: 'rt-456',
            password: 'pw',
            authorization: 'Bearer xyz',
        }) as Record<string, unknown>;

        expect(result.accessToken).toBe('[redacted]');
        expect(result.refreshToken).toBe('[redacted]');
        expect(result.password).toBe('[redacted]');
        expect(result.authorization).toBe('[redacted]');
    });

    it('passes through non-secret values', () => {
        const result = redact({
            name: 'test',
            status: 200,
            ok: true,
        }) as Record<string, unknown>;

        expect(result.name).toBe('test');
        expect(result.status).toBe(200);
        expect(result.ok).toBe(true);
    });

    it('recursively redacts nested objects', () => {
        const result = redact({
            data: { token: 'abc', safe: 'yes' },
        }) as Record<string, Record<string, unknown>>;

        expect(result.data.token).toBe('[redacted]');
        expect(result.data.safe).toBe('yes');
    });

    it('redacts items in arrays', () => {
        const result = redact([{ token: 'x', value: 'y' }]) as Record<string, unknown>[];

        expect(result[0].token).toBe('[redacted]');
        expect(result[0].value).toBe('y');
    });

    it('handles Error instances with custom properties', () => {
        const error = new Error('test error');
        (error as any).accessToken = 'secret';
        (error as any).status = 401;

        const result = redact(error) as Record<string, unknown>;

        expect(result.name).toBe('Error');
        expect(result.message).toBe('test error');
        expect(result.accessToken).toBe('[redacted]');
        expect(result.status).toBe(401);
    });

    it('redacts Expo launch manifests', () => {
        const result = redact({
            id: 'abc',
            createdAt: '2026-01-01',
            runtimeVersion: '1.0.0',
            launchAsset: {},
        });

        expect(result).toBe('[expo launch manifest redacted]');
    });

    it('passes through primitives unchanged', () => {
        expect(redact('hello')).toBe('hello');
        expect(redact(42)).toBe(42);
        expect(redact(null)).toBeNull();
        expect(redact(undefined)).toBeUndefined();
    });

    it('redacts mfaCode, seed, and private keys', () => {
        const result = redact({
            mfaCode: '123456',
            seed: 'abandon abandon abandon',
            privateKey: '-----BEGIN PGP PRIVATE KEY-----',
        }) as Record<string, unknown>;

        expect(result.mfaCode).toBe('[redacted]');
        expect(result.seed).toBe('[redacted]');
        expect(result.privateKey).toBe('[redacted]');
    });
});

describe('logger output', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logger.info writes to console.log', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        logger.info('test info message');
        expect(spy).toHaveBeenCalledWith('test info message');
    });

    it('logger.warn writes to console.warn', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        logger.warn('test warn message');
        expect(spy).toHaveBeenCalledWith('test warn message');
    });

    it('logger.error writes to console.error', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        logger.error('test error message');
        expect(spy).toHaveBeenCalledWith('test error message');
    });

    it('logger writes metadata as redacted JSON', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        logger.info('msg', { accessToken: 'secret', safe: 'ok' });
        expect(spy).toHaveBeenCalledWith(
            'msg',
            expect.stringContaining('"accessToken": "[redacted]"'),
        );
    });
});
