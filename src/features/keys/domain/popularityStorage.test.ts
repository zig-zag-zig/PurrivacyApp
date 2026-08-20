import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const storeMock = vi.hoisted(() => ({
    read: vi.fn(),
    write: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
}));

vi.mock('../../../utils/stores/popularityStore', () => ({
    popularityStore: storeMock,
}));

import {
    getAllPopularities,
    incrementPopularity,
    sortKeysAlphabetically,
    sortKeysByPopularity,
} from './popularityStorage';

const makeKey = (fingerprint: string, userId: string) => ({
    fingerprint,
    userId,
    publicKey: 'pk',
    privateKey: null,
    isDefault: false,
    algorithm: 'rsa',
    expiry: null,
} as any);

beforeEach(() => {
    storeMock.read.mockReset();
    storeMock.write.mockReset();
    storeMock.update.mockReset();
    storeMock.clear.mockReset();

    let current: Record<string, Record<string, number>> = {};
    storeMock.read.mockImplementation(async () => current);
    storeMock.update.mockImplementation(async (updater: (value: Record<string, Record<string, number>>) => Record<string, Record<string, number>>) => {
        current = updater(current);
        return current;
    });
});

describe('incrementPopularity', () => {
    it('increments existing counts and initializes missing ones per user', async () => {
        await incrementPopularity('user1', 'fp1');
        await incrementPopularity('user1', 'fp1');
        await incrementPopularity('user1', 'fp2');

        expect(storeMock.update).toHaveBeenCalledTimes(3);
        expect(await getAllPopularities('user1')).toEqual({ fp1: 2, fp2: 1 });
        expect(await getAllPopularities('user2')).toEqual({});
    });
});

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
