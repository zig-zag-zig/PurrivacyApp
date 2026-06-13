import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
    digestStringAsync: vi.fn(),
}));

vi.mock('./authCrypto', () => ({
    deriveKey: vi.fn(),
    randomHex: vi.fn(),
    AUTH_SALT_LENGTH: 32,
}));

import { normalizeSeedPhrase, getThreeUniqueRandomIndices, verifySeed } from './recoverySeedService';

describe('normalizeSeedPhrase', () => {
    it('trims and lowercases', () => {
        expect(normalizeSeedPhrase('  Abc Def  ')).toBe('abc def');
    });

    it('collapses multiple whitespace', () => {
        expect(normalizeSeedPhrase('abc   def\tghi')).toBe('abc def ghi');
    });
});

describe('getThreeUniqueRandomIndices', () => {
    it('returns 3 unique indices within range', () => {
        const seed = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
        const indices = getThreeUniqueRandomIndices(seed);

        expect(indices).toHaveLength(3);
        expect(new Set(indices).size).toBe(3);
        indices.forEach(i => {
            expect(i).toBeGreaterThanOrEqual(1);
            expect(i).toBeLessThanOrEqual(12);
        });
    });

    it('throws for seed with fewer than 3 words', () => {
        expect(() => getThreeUniqueRandomIndices('one two')).toThrow(/at least 3 words/);
    });
});

describe('verifySeed', () => {
    it('returns true for correct answers', () => {
        const seed = 'alpha bravo charlie delta';
        const positions = [1, 3];
        const answers = { 1: 'alpha', 3: 'charlie' };
        expect(verifySeed(seed, answers, positions)).toBe(true);
    });

    it('returns false for wrong answers', () => {
        const seed = 'alpha bravo charlie delta';
        const positions = [1, 3];
        const answers = { 1: 'wrong', 3: 'charlie' };
        expect(verifySeed(seed, answers, positions)).toBe(false);
    });

    it('handles edge positions', () => {
        const seed = 'first second third';
        expect(verifySeed(seed, { 1: 'first', 3: 'third' }, [1, 3])).toBe(true);
    });
});
