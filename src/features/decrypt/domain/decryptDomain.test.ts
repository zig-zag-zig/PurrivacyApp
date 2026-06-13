import { describe, expect, it } from 'vitest';

import { isPassphraseRequired } from './decryptDomain';

describe('decryptDomain isPassphraseRequired', () => {
    it('returns true when selected private key is locked', () => {
        const keys = [
            { fingerprint: 'fp1', privateKey: 'pk', privateKeyIsUnlocked: false } as any,
        ];
        expect(isPassphraseRequired(keys, { fp1: 'pk' })).toBe(true);
    });

    it('returns false when selected private key is unlocked', () => {
        const keys = [
            { fingerprint: 'fp1', privateKey: 'pk', privateKeyIsUnlocked: true } as any,
        ];
        expect(isPassphraseRequired(keys, { fp1: 'pk' })).toBe(false);
    });

    it('returns false when no key is selected', () => {
        const keys = [{ fingerprint: 'fp1', privateKey: 'pk' } as any];
        expect(isPassphraseRequired(keys, {})).toBe(false);
    });

    it('returns false when keys is undefined', () => {
        expect(isPassphraseRequired(undefined, { fp1: 'pk' })).toBe(false);
    });
});
