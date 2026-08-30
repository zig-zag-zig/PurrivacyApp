import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDeriveKey = vi.hoisted(() => vi.fn(async (password: string, salt: string) => `${password}:${salt}:derived`));
const mockRandomHex = vi.hoisted(() => vi.fn(async (bytes: number) => 'aa'.repeat(bytes)));
const mockGenerateMnemonic = vi.hoisted(() => vi.fn(() => 'abandon '.repeat(23).trim() + ' art'));

vi.mock('bip39', () => ({
    generateMnemonic: mockGenerateMnemonic,
}));

vi.mock('./authCrypto', () => ({
    AUTH_SALT_LENGTH: 16,
    deriveKey: mockDeriveKey,
    randomHex: mockRandomHex,
}));

vi.mock('expo-crypto', () => ({
    getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(7)),
    digestStringAsync: vi.fn(async () => 'mock-sha256-digest'),
    CryptoDigestAlgorithm: { SHA256: 1 },
}));

import {
    generateSeed,
    normalizeSeedPhrase,
    getThreeUniqueRandomIndices,
    verifySeed,
    deriveRecoveryVerifier,
    generateRecoveryVerifier,
} from './recoverySeedService';

beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateMnemonic.mockReturnValue('abandon '.repeat(23).trim() + ' art');
});

describe('generateSeed', () => {
    it('returns mocked BIP39 mnemonic', () => {
        const seed = generateSeed();
        expect(seed).toBe('abandon '.repeat(23).trim() + ' art');
    });
});

describe('normalizeSeedPhrase', () => {
    it('trims and lowercases', () => {
        expect(normalizeSeedPhrase('  Hello World  ')).toBe('hello world');
    });

    it('collapses multiple spaces', () => {
        expect(normalizeSeedPhrase('one   two    three')).toBe('one two three');
    });

    it('handles mixed case and trailing space', () => {
        expect(normalizeSeedPhrase('ABC def GHI ')).toBe('abc def ghi');
    });
});

describe('getThreeUniqueRandomIndices', () => {
    it('returns 3 unique 1-based indices', () => {
        const seed = 'word '.repeat(24).trim();
        const indices = getThreeUniqueRandomIndices(seed);
        expect(indices).toHaveLength(3);
        expect(new Set(indices).size).toBe(3);
        expect(indices.every(i => i >= 1 && i <= 24)).toBe(true);
    });

    it('throws when seed has fewer than 3 words', () => {
        expect(() => getThreeUniqueRandomIndices('one two')).toThrow('at least 3 words');
    });
});

describe('verifySeed', () => {
    const seed = 'one two three four five';

    it('returns true when all answers match', () => {
        expect(verifySeed(seed, { 1: 'one', 3: 'three' }, [1, 3])).toBe(true);
    });

    it('returns false when an answer does not match', () => {
        expect(verifySeed(seed, { 1: 'one', 3: 'wrong' }, [1, 3])).toBe(false);
    });

    it('returns false when a position has no answer', () => {
        expect(verifySeed(seed, { 1: 'one' }, [1, 5])).toBe(false);
    });
});

describe('deriveRecoveryVerifier', () => {
    it('delegates to deriveKey with normalized seed and salt', async () => {
        const result = await deriveRecoveryVerifier(' My Seed Phrase ', 'salt-hex');

        expect(mockDeriveKey).toHaveBeenCalledWith('my seed phrase', 'salt-hex');
        expect(result).toBe('my seed phrase:salt-hex:derived');
    });
});

describe('generateRecoveryVerifier', () => {
    it('returns salt and hashed verifier', async () => {
        const result = await generateRecoveryVerifier('my seed');

        expect(mockRandomHex).toHaveBeenCalledWith(16);
        expect(result.recoveryVerifierSalt).toBe('aa'.repeat(16));
        expect(result.recoveryVerifierHash).toBe('mock-sha256-digest');
    });
});
