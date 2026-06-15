import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../../../utils/storage', () => ({
    storage: { getItem: vi.fn(), setItem: vi.fn(), getItemsByPrefix: vi.fn() },
}));

import { sortKeysByPopularity, sortKeysAlphabetically } from './popularityStorage';

const makeKey = (fingerprint: string, userId: string) => ({
    fingerprint,
    userId,
    publicKey: 'pk',
    privateKey: null,
    isDefault: false,
    algorithm: 'rsa',
    expiry: null,
} as any);

describe('sortKeysByPopularity', () => {
    it('sorts by popularity descending', () => {
        const keys = [makeKey('fp1', 'Alice <a@test.com>'), makeKey('fp2', 'Bob <b@test.com>')];
        const popularityMap = { fp1: 5, fp2: 10 };

        const sorted = sortKeysByPopularity(keys, popularityMap);
        expect(sorted[0].fingerprint).toBe('fp2');
        expect(sorted[1].fingerprint).toBe('fp1');
    });

    it('tiebreaks alphabetically by display name', () => {
        const keys = [makeKey('fp1', 'Charlie <c@test.com>'), makeKey('fp2', 'Alice <a@test.com>')];
        const popularityMap = { fp1: 5, fp2: 5 };

        const sorted = sortKeysByPopularity(keys, popularityMap);
        expect(sorted[0].fingerprint).toBe('fp2');
        expect(sorted[1].fingerprint).toBe('fp1');
    });

    it('treats missing popularity as 0', () => {
        const keys = [makeKey('fp1', 'Alice <a@test.com>'), makeKey('fp2', 'Bob <b@test.com>')];
        const popularityMap = { fp1: 3 };

        const sorted = sortKeysByPopularity(keys, popularityMap);
        expect(sorted[0].fingerprint).toBe('fp1');
    });

    it('returns original array unchanged (creates copy)', () => {
        const keys = [makeKey('fp1', 'Bob'), makeKey('fp2', 'Alice')];
        const popularityMap = { fp1: 1, fp2: 2 };
        const original = [...keys];

        sortKeysByPopularity(keys, popularityMap);
        expect(keys).toEqual(original);
    });
});

describe('sortKeysAlphabetically', () => {
    it('sorts ascending by default', () => {
        const keys = [makeKey('fp1', 'Charlie'), makeKey('fp2', 'Alice'), makeKey('fp3', 'Bob')];
        const sorted = sortKeysAlphabetically(keys);
        expect(sorted.map(k => k.userId)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts descending when direction is desc', () => {
        const keys = [makeKey('fp1', 'Charlie'), makeKey('fp2', 'Alice'), makeKey('fp3', 'Bob')];
        const sorted = sortKeysAlphabetically(keys, 'desc');
        expect(sorted.map(k => k.userId)).toEqual(['Charlie', 'Bob', 'Alice']);
    });
});
