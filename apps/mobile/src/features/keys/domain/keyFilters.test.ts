import { describe, expect, it } from 'vitest';

import type { KeyPair } from '../../../types/types';
import {
    filterVaultKeys,
    keyMatchesFilter,
    keyMatchesQuery,
} from './keyFilters';

const makeKey = (overrides: Partial<KeyPair> = {}): KeyPair => ({
    fingerprint: 'fp',
    publicKey: 'pk',
    privateKey: 'sk',
    isDefault: false,
    userId: 'Alice <alice@example.com>',
    algorithm: 'rsa',
    expiry: 'Never expires',
    ...overrides,
} as KeyPair);

describe('keyMatchesQuery', () => {
    const key = makeKey({ userId: 'Alice <alice@example.com>', fingerprint: 'ABCD1234' });

    it('matches display name, userId and fingerprint case-insensitively', () => {
        expect(keyMatchesQuery(key, 'alice')).toBe(true);
        expect(keyMatchesQuery(key, 'example.com')).toBe(true);
        expect(keyMatchesQuery(key, 'abcd')).toBe(true);
    });

    it('returns true for empty / whitespace query', () => {
        expect(keyMatchesQuery(key, '')).toBe(true);
        expect(keyMatchesQuery(key, '   ')).toBe(true);
    });

    it('returns false when nothing matches', () => {
        expect(keyMatchesQuery(key, 'bob')).toBe(false);
    });
});

describe('keyMatchesFilter', () => {
    it('pairs → only complete pairs', () => {
        expect(keyMatchesFilter(makeKey(), 'pairs')).toBe(true);
        expect(keyMatchesFilter(makeKey({ privateKey: null }), 'pairs')).toBe(false);
    });

    it('public → only keys with no private half', () => {
        expect(keyMatchesFilter(makeKey({ privateKey: null }), 'public')).toBe(true);
        expect(keyMatchesFilter(makeKey(), 'public')).toBe(false);
    });

    it('expiring → only keys expiring soon or expired', () => {
        expect(keyMatchesFilter(makeKey({ expiry: '24.09.2026 (expires in 5 days)' }), 'expiring')).toBe(true);
        expect(keyMatchesFilter(makeKey({ expiry: 'Never expires' }), 'expiring')).toBe(false);
    });

    it('all → everything', () => {
        expect(keyMatchesFilter(makeKey(), 'all')).toBe(true);
    });
});

describe('filterVaultKeys', () => {
    const keys = [
        makeKey({ fingerprint: 'a', userId: 'Alice <alice@x.com>' }),
        makeKey({ fingerprint: 'b', userId: 'Bob <bob@x.com>', privateKey: null }),
        makeKey({ fingerprint: 'c', userId: 'Carol <carol@x.com>', expiry: '01.01.2025 (expires in 3 days)' }),
    ];

    it('filters by query and kind together', () => {
        expect(filterVaultKeys(keys, '', 'all')).toHaveLength(3);
        expect(filterVaultKeys(keys, 'bob', 'all').map(k => k.fingerprint)).toEqual(['b']);
        expect(filterVaultKeys(keys, '', 'public').map(k => k.fingerprint)).toEqual(['b']);
        expect(filterVaultKeys(keys, '', 'expiring').map(k => k.fingerprint)).toEqual(['c']);
        expect(filterVaultKeys(keys, 'carol', 'expiring').map(k => k.fingerprint)).toEqual(['c']);
        expect(filterVaultKeys(keys, 'alice', 'public')).toHaveLength(0);
    });
});
