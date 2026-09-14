import { describe, expect, it } from 'vitest';

import {
    isKeyExpired,
    isKeyExpiringSoon,
    parseKeyExpiry,
} from './keyExpiry';

describe('parseKeyExpiry', () => {
    it('parses "Never expires"', () => {
        expect(parseKeyExpiry('Never expires')).toEqual({ kind: 'never' });
    });

    it('parses future expiry', () => {
        expect(parseKeyExpiry('24.09.2026 (expires in 365 days)')).toEqual({ kind: 'expiring', daysLeft: 365 });
        expect(parseKeyExpiry('01.01.2027 (expires in 1 day)')).toEqual({ kind: 'expiring', daysLeft: 1 });
    });

    it('parses past expiry', () => {
        expect(parseKeyExpiry('24.09.2024 (expired 5 days ago)')).toEqual({ kind: 'expired', daysAgo: 5 });
        expect(parseKeyExpiry('24.09.2024 (expired 1 day ago)')).toEqual({ kind: 'expired', daysAgo: 1 });
    });

    it('returns unknown for empty, null and unrecognised strings', () => {
        expect(parseKeyExpiry('')).toEqual({ kind: 'unknown' });
        expect(parseKeyExpiry(null)).toEqual({ kind: 'unknown' });
        expect(parseKeyExpiry(undefined)).toEqual({ kind: 'unknown' });
        expect(parseKeyExpiry('some other text')).toEqual({ kind: 'unknown' });
    });
});

describe('isKeyExpiringSoon', () => {
    const key = (expiry: string) => ({ expiry });

    it('is true for a key expiring within the window', () => {
        expect(isKeyExpiringSoon(key('24.09.2026 (expires in 10 days)'))).toBe(true);
        expect(isKeyExpiringSoon(key('24.09.2026 (expires in 30 days)'))).toBe(true);
    });

    it('is false for a key expiring beyond the window', () => {
        expect(isKeyExpiringSoon(key('24.09.2026 (expires in 90 days)'))).toBe(false);
    });

    it('is true for an already-expired key', () => {
        expect(isKeyExpiringSoon(key('24.09.2024 (expired 5 days ago)'))).toBe(true);
    });

    it('is false for a key that never expires', () => {
        expect(isKeyExpiringSoon(key('Never expires'))).toBe(false);
    });

    it('respects a custom window', () => {
        expect(isKeyExpiringSoon(key('24.09.2026 (expires in 60 days)'), 90)).toBe(true);
        expect(isKeyExpiringSoon(key('24.09.2026 (expires in 60 days)'), 30)).toBe(false);
    });
});

describe('isKeyExpired', () => {
    it('is true only for expired keys', () => {
        expect(isKeyExpired({ expiry: '24.09.2024 (expired 5 days ago)' })).toBe(true);
        expect(isKeyExpired({ expiry: '24.09.2026 (expires in 10 days)' })).toBe(false);
        expect(isKeyExpired({ expiry: 'Never expires' })).toBe(false);
    });
});
