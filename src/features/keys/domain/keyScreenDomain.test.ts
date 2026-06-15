import { describe, expect, it } from 'vitest';

import {
    sortKeysForView,
    hasExistingDefaultKeyPair,
    getRouteKeyAction,
    isImportKeyValid,
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
