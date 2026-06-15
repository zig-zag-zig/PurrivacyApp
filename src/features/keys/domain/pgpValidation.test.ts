import { describe, expect, it } from 'vitest';

import { validateArmor, identifyKeyType } from './pgpValidation';

const makeValidArmor = (type: string, minLength = 24) => {
    const base64Data = 'A'.repeat(minLength);
    return `-----BEGIN PGP ${type}-----\n\n${base64Data}\n-----END PGP ${type}-----`;
};

describe('validateArmor', () => {
    it('returns true for valid public key', () => {
        expect(validateArmor(makeValidArmor('PUBLIC KEY BLOCK'), 'PUBLIC KEY BLOCK')).toBe(true);
    });

    it('returns true for valid private key', () => {
        expect(validateArmor(makeValidArmor('PRIVATE KEY BLOCK'), 'PRIVATE KEY BLOCK')).toBe(true);
    });

    it('returns false for empty string', () => {
        expect(validateArmor('', 'PUBLIC KEY BLOCK')).toBe(false);
    });

    it('returns false for content without markers', () => {
        expect(validateArmor('not a key', 'PUBLIC KEY BLOCK')).toBe(false);
    });

    it('returns false for wrong markers', () => {
        expect(validateArmor(makeValidArmor('MESSAGE'), 'PUBLIC KEY BLOCK')).toBe(false);
    });
});

describe('identifyKeyType', () => {
    it('identifies public key', () => {
        expect(identifyKeyType(makeValidArmor('PUBLIC KEY BLOCK'))).toBe('public');
    });

    it('identifies private key', () => {
        expect(identifyKeyType(makeValidArmor('PRIVATE KEY BLOCK'))).toBe('private');
    });

    it('identifies message', () => {
        expect(identifyKeyType(makeValidArmor('MESSAGE'))).toBe('message');
    });

    it('returns unknown for unrecognized content', () => {
        expect(identifyKeyType('random text')).toBe('unknown');
    });
});
