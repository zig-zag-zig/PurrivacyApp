import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { (globalThis as any).__DEV__ = true; });

import { redact } from './logger';

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
});
