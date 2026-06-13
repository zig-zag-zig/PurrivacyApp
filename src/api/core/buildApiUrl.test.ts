import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { (globalThis as any).__DEV__ = true; });

vi.mock('../../config/env', () => ({
    ENV: {
        apiBaseUrl: 'https://api.example.com/',
        apiVersion: 'v1',
    },
}));

vi.mock('../../config/firebaseEmulator', () => ({
    getFirebaseAuthEmulatorUrl: () => null,
}));

import { buildApiUrl } from './buildApiUrl';

describe('buildApiUrl', () => {
    it('strips trailing slashes from base and leading slashes from endpoint', () => {
        expect(buildApiUrl('/user')).toBe('https://api.example.com/v1/user');
    });

    it('handles endpoint without leading slash', () => {
        expect(buildApiUrl('user')).toBe('https://api.example.com/v1/user');
    });

    it('handles nested endpoints', () => {
        expect(buildApiUrl('/user/key-records')).toBe('https://api.example.com/v1/user/key-records');
    });
});
