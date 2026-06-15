import { describe, expect, it } from 'vitest';

import {
    isCompletePair,
    isKeySelected,
    findDefaultKey,
    getCompleteKeyPairs,
    getDefaultSelectedPrivateKey,
    getKeyTypeDescription,
} from './keyUtils';

const makeKey = (overrides: Record<string, unknown> = {}) => ({
    fingerprint: 'fp1',
    publicKey: 'pk',
    privateKey: 'sk',
    isDefault: false,
    userId: 'user',
    algorithm: 'rsa',
    expiry: null,
    ...overrides,
}) as any;

describe('isCompletePair', () => {
    it('returns true when both public and private key exist', () => {
        expect(isCompletePair(makeKey())).toBe(true);
    });

    it('returns false when private key is null', () => {
        expect(isCompletePair(makeKey({ privateKey: null }))).toBe(false);
    });
});

describe('getKeyTypeDescription', () => {
    it('returns "Public + Private" for complete pair', () => {
        expect(getKeyTypeDescription(makeKey())).toBe('Public + Private');
    });

    it('returns "Public" for public-only', () => {
        expect(getKeyTypeDescription(makeKey({ privateKey: null }))).toBe('Public');
    });
});

describe('isKeySelected', () => {
    it('returns true when fingerprint is in object', () => {
        expect(isKeySelected('fp1', { fp1: 'key' })).toBe(true);
    });

    it('returns true when fingerprint is in array of objects', () => {
        expect(isKeySelected('fp1', [{ fp1: 'key' }] as any)).toBe(true);
    });

    it('returns false when fingerprint is not found', () => {
        expect(isKeySelected('fp2', { fp1: 'key' })).toBe(false);
    });
});

describe('findDefaultKey', () => {
    it('returns default key with private key', () => {
        const keys = [makeKey({ isDefault: true })];
        expect(findDefaultKey(keys)).toBe(keys[0]);
    });

    it('returns null when no default key', () => {
        expect(findDefaultKey([makeKey({ isDefault: false })])).toBeNull();
    });

    it('returns null when default has no private key', () => {
        expect(findDefaultKey([makeKey({ isDefault: true, privateKey: null })])).toBeNull();
    });
});

describe('getCompleteKeyPairs', () => {
    it('filters to only complete pairs', () => {
        const complete = makeKey({ fingerprint: 'fp1' });
        const publicOnly = makeKey({ fingerprint: 'fp2', privateKey: null });
        expect(getCompleteKeyPairs([complete, publicOnly])).toEqual([complete]);
    });
});

describe('getDefaultSelectedPrivateKey', () => {
    it('returns default key selection', () => {
        const keys = [makeKey({ isDefault: true, fingerprint: 'fp1', privateKey: 'sk' })];
        expect(getDefaultSelectedPrivateKey(keys)).toEqual({ fp1: 'sk' });
    });

    it('falls back to first private key when no default', () => {
        const keys = [makeKey({ isDefault: false, fingerprint: 'fp1', privateKey: 'sk' })];
        expect(getDefaultSelectedPrivateKey(keys)).toEqual({ fp1: 'sk' });
    });

    it('returns undefined for undefined keys', () => {
        expect(getDefaultSelectedPrivateKey(undefined)).toBeUndefined();
    });

    it('returns undefined when no private keys', () => {
        const keys = [makeKey({ privateKey: null })];
        expect(getDefaultSelectedPrivateKey(keys)).toBeUndefined();
    });
});
