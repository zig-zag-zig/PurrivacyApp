import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { AccessTokenStore } from './accessTokenStore';

const makeStoredSession = (overrides: Partial<{
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    mfaTrusted: boolean;
    mfaEnabled: boolean;
}> = {}) => ({
    refreshToken: 'refresh-token-abc',
    refreshTokenExpiresAt: new Date('2099-12-31T00:00:00Z'),
    mfaTrusted: false,
    mfaEnabled: true,
    ...overrides,
});

describe('AccessTokenStore', () => {
    let store: AccessTokenStore;

    beforeEach(() => {
        store = new AccessTokenStore();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('store and getToken', () => {
        it('stores access token from session response', () => {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            store.store({
                accessToken: 'at-123',
                accessTokenExpiresAt: '2026-01-01T01:00:00Z',
                refreshToken: 'rt',
                refreshTokenExpiresAt: '2026-02-01T00:00:00Z',
                mfaTrusted: false,
                mfaEnabled: true,
            });

            expect(store.getToken()).toBe('at-123');
        });
    });

    describe('getUsableToken', () => {
        it('returns token when not expired (outside buffer)', () => {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            store.store({
                accessToken: 'at-usable',
                accessTokenExpiresAt: '2026-01-01T02:00:00Z',
                refreshToken: 'rt',
                refreshTokenExpiresAt: '2026-02-01T00:00:00Z',
                mfaTrusted: false,
                mfaEnabled: true,
            });

            expect(store.getUsableToken()).toBe('at-usable');
        });

        it('returns null when within 30s refresh buffer', () => {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            store.store({
                accessToken: 'at-expiring',
                accessTokenExpiresAt: '2026-01-01T00:00:20Z',
                refreshToken: 'rt',
                refreshTokenExpiresAt: '2026-02-01T00:00:00Z',
                mfaTrusted: false,
                mfaEnabled: true,
            });

            expect(store.getUsableToken()).toBeNull();
        });

        it('returns null when token is expired', () => {
            vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
            store.store({
                accessToken: 'at-old',
                accessTokenExpiresAt: '2026-01-01T00:00:00Z',
                refreshToken: 'rt',
                refreshTokenExpiresAt: '2026-02-01T00:00:00Z',
                mfaTrusted: false,
                mfaEnabled: true,
            });

            expect(store.getUsableToken()).toBeNull();
        });

        it('returns null before any token is stored', () => {
            expect(store.getUsableToken()).toBeNull();
        });
    });

    describe('clear', () => {
        it('resets token and expiry', () => {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            store.store({
                accessToken: 'at-clear',
                accessTokenExpiresAt: '2026-01-01T01:00:00Z',
                refreshToken: 'rt',
                refreshTokenExpiresAt: '2026-02-01T00:00:00Z',
                mfaTrusted: false,
                mfaEnabled: true,
            });

            store.clear();
            expect(store.getToken()).toBeNull();
            expect(store.getUsableToken()).toBeNull();
        });
    });

    describe('responseFromStoredSession', () => {
        it('returns full SessionResponse when token is usable', () => {
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
            const expiresAt = new Date('2026-01-01T02:00:00Z');
            store.store({
                accessToken: 'at-resp',
                accessTokenExpiresAt: expiresAt.toISOString(),
                refreshToken: 'rt',
                refreshTokenExpiresAt: '2026-02-01T00:00:00Z',
                mfaTrusted: true,
                mfaEnabled: true,
            });

            const stored = makeStoredSession();
            const response = store.responseFromStoredSession(stored);

            expect(response).not.toBeNull();
            expect(response!.accessToken).toBe('at-resp');
            expect(response!.refreshToken).toBe('refresh-token-abc');
            expect(response!.mfaTrusted).toBe(false);
            expect(response!.mfaEnabled).toBe(true);
        });

        it('returns null when no usable token', () => {
            const stored = makeStoredSession();
            expect(store.responseFromStoredSession(stored)).toBeNull();
        });
    });
});
