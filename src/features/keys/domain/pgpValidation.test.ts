import { describe, expect, it } from 'vitest';

import { validateArmor, identifyKeyType, normalizeArmor } from './pgpValidation';

const makeValidArmor = (type: string, minLength = 24) => {
    const base64Data = 'A'.repeat(minLength);
    return `-----BEGIN PGP ${type}-----\n\n${base64Data}\n-----END PGP ${type}-----`;
};

const makeArmorWithChecksum = (type: string) => `-----BEGIN PGP ${type}-----\n\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n=eWzB\n-----END PGP ${type}-----`;

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

    it('accepts collapsed single-line armor with a fused CRC checksum', () => {
        // The paste path (and some mail clients) strips newlines, fusing the
        // base64 body, its '==' padding and the '=eWzB' checksum into one line.
        const collapsed = makeArmorWithChecksum('MESSAGE').replace(/\n/g, '');
        expect(collapsed.includes('===eWzB')).toBe(true);
        expect(validateArmor(collapsed, 'MESSAGE')).toBe(true);
    });

    it('accepts collapsed armor without a checksum line', () => {
        const collapsed = makeValidArmor('MESSAGE').replace(/\n/g, '');
        expect(validateArmor(collapsed, 'MESSAGE')).toBe(true);
    });

    it('normalizeArmor rebuilds canonical multi-line armor from collapsed input', () => {
        const collapsed = makeArmorWithChecksum('MESSAGE').replace(/\n/g, '');
        const normalized = normalizeArmor(collapsed, 'MESSAGE');
        expect(normalized).not.toBeNull();
        expect(normalized!.startsWith('-----BEGIN PGP MESSAGE-----\n\n')).toBe(true);
        expect(normalized!.endsWith('\n=eWzB\n-----END PGP MESSAGE-----')).toBe(true);
        // Body is wrapped at 64 columns.
        const bodyLine = normalized!.split('\n')[2];
        expect(bodyLine.length).toBe(64);
    });

    it('normalizeArmor returns null for non-matching block types', () => {
        expect(normalizeArmor(makeValidArmor('MESSAGE'), 'PUBLIC KEY BLOCK')).toBeNull();
    });

    it('normalizeArmor preserves the decoded body on canonical armor', () => {
        const canonical = makeArmorWithChecksum('MESSAGE');
        const normalized = normalizeArmor(canonical, 'MESSAGE');
        expect(normalized).not.toBeNull();
        // Base64 padding is redundant: stripping it preserves the decoded bytes.
        const decodeBody = (armor: string) =>
            Buffer.from(armor.split('\n').slice(2, -2).join(''), 'base64');
        expect(decodeBody(normalized!).toString('hex')).toBe(decodeBody(canonical).toString('hex'));
        // Checksum line is preserved.
        const checksumLine = normalized!.split('\n').filter(l => l.startsWith('='))[0];
        expect(checksumLine).toBe('=eWzB');
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
