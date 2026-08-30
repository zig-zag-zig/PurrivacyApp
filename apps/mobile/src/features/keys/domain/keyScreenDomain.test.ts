import { describe, expect, it } from 'vitest';

import {
    sortKeysForView,
    hasExistingDefaultKeyPair,
    getRouteKeyAction,
    isImportKeyValid,
    mergeOptimisticKeys,
} from './keyScreenDomain';

describe('sortKeysForView', () => {
    it('places default key first, then complete pairs, then public-only', () => {
        const publicOnly = { fingerprint: 'fp3', publicKey: 'pk3', privateKey: null, isDefault: false, userId: 'c' } as any;
        const completePair = { fingerprint: 'fp2', publicKey: 'pk2', privateKey: 'pk2', isDefault: false, userId: 'b' } as any;
        const defaultKey = { fingerprint: 'fp1', publicKey: 'pk1', privateKey: 'pk1', isDefault: true, userId: 'a' } as any;

        const sorted = sortKeysForView([publicOnly, completePair, defaultKey]);
        expect(sorted[0]).toBe(defaultKey);
        expect(sorted[1]).toBe(completePair);
        expect(sorted[2]).toBe(publicOnly);
    });
});

describe('hasExistingDefaultKeyPair', () => {
    it('returns true when a default key with private key exists', () => {
        const keys = [{ isDefault: true, privateKey: 'pk' }] as any;
        expect(hasExistingDefaultKeyPair(keys)).toBe(true);
    });

    it('returns false when no default key', () => {
        const keys = [{ isDefault: false, privateKey: 'pk' }] as any;
        expect(hasExistingDefaultKeyPair(keys)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(hasExistingDefaultKeyPair(undefined)).toBe(false);
    });
});

describe('getRouteKeyAction', () => {
    it('returns create for create action', () => {
        expect(getRouteKeyAction('create')).toBe('create');
    });

    it('returns import for import action', () => {
        expect(getRouteKeyAction('import')).toBe('import');
    });

    it('returns view for undefined', () => {
        expect(getRouteKeyAction(undefined)).toBe('view');
    });
});

describe('isImportKeyValid', () => {
    it('returns true for valid public key armor', () => {
        const fakeArmor = `-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n${'A'.repeat(40)}\n-----END PGP PUBLIC KEY BLOCK-----`;
        expect(isImportKeyValid(fakeArmor)).toBe(true);
    });

    it('returns false for invalid content', () => {
        expect(isImportKeyValid('not a key')).toBe(false);
    });

    it('returns false for message armor', () => {
        const msg = `-----BEGIN PGP MESSAGE-----\n\n${'A'.repeat(40)}\n-----END PGP MESSAGE-----`;
        expect(isImportKeyValid(msg)).toBe(false);
    });
});

describe('mergeOptimisticKeys', () => {
    const makeKey = (fingerprint: string, userId = 'test'): any => ({
        fingerprint,
        publicKey: `pk-${fingerprint}`,
        privateKey: `sk-${fingerprint}`,
        isDefault: false,
        userId,
        algorithm: 'RSA',
        expiry: 'Never',
    });

    it('appends optimistic keys not yet in real list', () => {
        const real = [makeKey('fp1')];
        const optimistic = [makeKey('fp2')];

        const result = mergeOptimisticKeys(real, optimistic);
        expect(result).toHaveLength(2);
        expect(result[0].fingerprint).toBe('fp1');
        expect(result[1].fingerprint).toBe('fp2');
    });

    it('drops optimistic keys that already exist in real list', () => {
        const real = [makeKey('fp1'), makeKey('fp2')];
        const optimistic = [makeKey('fp2')];

        const result = mergeOptimisticKeys(real, optimistic);
        expect(result).toHaveLength(2);
        expect(result.map(k => k.fingerprint)).toEqual(['fp1', 'fp2']);
    });

    it('returns real keys unchanged when no optimistic keys', () => {
        const real = [makeKey('fp1')];
        const result = mergeOptimisticKeys(real, []);
        expect(result).toEqual(real);
    });

    it('returns optimistic keys when real list is empty', () => {
        const optimistic = [makeKey('fp1')];
        const result = mergeOptimisticKeys([], optimistic);
        expect(result).toEqual(optimistic);
    });

    it('returns empty array when both lists are empty', () => {
        expect(mergeOptimisticKeys([], [])).toEqual([]);
    });

    it('handles multiple optimistic keys, only keeping those not yet real', () => {
        const real = [makeKey('fp1')];
        const optimistic = [makeKey('fp1'), makeKey('fp2'), makeKey('fp3')];

        const result = mergeOptimisticKeys(real, optimistic);
        expect(result).toHaveLength(3);
        expect(result.map(k => k.fingerprint)).toEqual(['fp1', 'fp2', 'fp3']);
    });

    it('filters out keys matching optimisticRemovedFingerprints', () => {
        const real = [makeKey('fp1'), makeKey('fp2'), makeKey('fp3')];

        const result = mergeOptimisticKeys(real, [], ['fp2']);
        expect(result).toHaveLength(2);
        expect(result.map(k => k.fingerprint)).toEqual(['fp1', 'fp3']);
    });

    it('filters removed keys from both real and optimistic lists', () => {
        const real = [makeKey('fp1')];
        const optimistic = [makeKey('fp2'), makeKey('fp3')];

        const result = mergeOptimisticKeys(real, optimistic, ['fp1', 'fp3']);
        expect(result).toHaveLength(1);
        expect(result[0].fingerprint).toBe('fp2');
    });

    it('ignores removal fingerprints that do not match any key', () => {
        const real = [makeKey('fp1')];

        const result = mergeOptimisticKeys(real, [], ['nonexistent']);
        expect(result).toHaveLength(1);
        expect(result[0].fingerprint).toBe('fp1');
    });
});
