import { describe, expect, it } from 'vitest';

import { isPassphraseRequired, normalizeSelectedPublicKeys } from './encryptDomain';

describe('isPassphraseRequired', () => {
    it('returns true when key is locked, signing, and has selected private keys', () => {
        const keyPair = { privateKeyIsUnlocked: false } as any;
        expect(isPassphraseRequired(keyPair, true, { fp: 'key' })).toBe(true);
    });

    it('returns false when key is unlocked', () => {
        const keyPair = { privateKeyIsUnlocked: true } as any;
        expect(isPassphraseRequired(keyPair, true, { fp: 'key' })).toBe(false);
    });

    it('returns false when not signing', () => {
        const keyPair = { privateKeyIsUnlocked: false } as any;
        expect(isPassphraseRequired(keyPair, false, { fp: 'key' })).toBe(false);
    });

    it('returns false when no selected private keys', () => {
        const keyPair = { privateKeyIsUnlocked: false } as any;
        expect(isPassphraseRequired(keyPair, true, {})).toBe(false);
    });

    it('returns false for undefined keyPair', () => {
        expect(isPassphraseRequired(undefined, true, { fp: 'key' })).toBe(false);
    });
});

describe('normalizeSelectedPublicKeys', () => {
    it('prevents deselecting the last key', () => {
        const current = { fp1: 'key1' };
        const next = {};
        expect(normalizeSelectedPublicKeys(current, next)).toBe(current);
    });

    it('allows selecting a different set when more than one existed', () => {
        const current = { fp1: 'key1', fp2: 'key2' };
        const next = { fp1: 'key1' };
        expect(normalizeSelectedPublicKeys(current, next)).toBe(next);
    });

    it('allows selection from empty to new', () => {
        const current = {};
        const next = { fp1: 'key1' };
        expect(normalizeSelectedPublicKeys(current, next)).toBe(next);
    });
});
