import { describe, expect, it } from 'vitest';

import { validateArmor, identifyKeyType, normalizeArmor } from './pgpValidation';

const makeValidArmor = (type: string, minLength = 24) => {
    const base64Data = 'A'.repeat(minLength);
    return `-----BEGIN PGP ${type}-----\n\n${base64Data}\n-----END PGP ${type}-----`;
};

const makeArmorWithChecksum = (type: string) => `-----BEGIN PGP ${type}-----\n\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n=eWzB\n-----END PGP ${type}-----`;

const makeArmorWithHeaders = (type: string) => `-----BEGIN PGP ${type}-----
Comment: Vendor: xxx (1B0E0E2EED71...)
Version: 2026-03-23 - Last update 2026-03-23

${'A'.repeat(64)}
-----END PGP ${type}-----`;

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

    it('ignores optional armor headers such as Comment and Version', () => {
        expect(validateArmor(makeArmorWithHeaders('PUBLIC KEY BLOCK'), 'PUBLIC KEY BLOCK')).toBe(true);
        expect(validateArmor(makeArmorWithHeaders('PRIVATE KEY BLOCK'), 'PRIVATE KEY BLOCK')).toBe(true);
    });

    it('accepts header lines followed directly by the body without a blank separator', () => {
        const armor = makeArmorWithHeaders('PUBLIC KEY BLOCK').replace(
            'Version: 2026-03-23 - Last update 2026-03-23\n\n',
            'Version: 2026-03-23 - Last update 2026-03-23\n',
        );
        expect(validateArmor(armor, 'PUBLIC KEY BLOCK')).toBe(true);
    });

    it('accepts fully collapsed armor with headers and a checksum', () => {
        const withChecksum = makeArmorWithHeaders('PUBLIC KEY BLOCK').replace(
            '\n-----END',
            '\n=eWzB\n-----END',
        );
        const collapsed = withChecksum.replace(/\n/g, '');
        expect(validateArmor(collapsed, 'PUBLIC KEY BLOCK')).toBe(true);
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

    it('normalizeArmor drops optional headers and keeps the body parseable', () => {
        const normalized = normalizeArmor(makeArmorWithHeaders('PUBLIC KEY BLOCK'), 'PUBLIC KEY BLOCK');
        expect(normalized).not.toBeNull();
        expect(normalized).not.toContain('Comment:');
        expect(normalized).not.toContain('Version:');
        expect(normalized!.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n')).toBe(true);
        expect(normalized!.endsWith('\n-----END PGP PUBLIC KEY BLOCK-----')).toBe(true);
        expect(validateArmor(normalized!, 'PUBLIC KEY BLOCK')).toBe(true);
    });

    it('normalizeArmor preserves the checksum when headers are present', () => {
        const withChecksum = makeArmorWithHeaders('PUBLIC KEY BLOCK').replace(
            '\n-----END',
            '\n=eWzB\n-----END',
        );
        const normalized = normalizeArmor(withChecksum, 'PUBLIC KEY BLOCK');
        expect(normalized).not.toBeNull();
        expect(normalized!.endsWith('\n=eWzB\n-----END PGP PUBLIC KEY BLOCK-----')).toBe(true);
    });

    it('normalizeArmor handles fully collapsed armor with headers', () => {
        const collapsed = makeArmorWithHeaders('PUBLIC KEY BLOCK').replace(/\n/g, '');
        const normalized = normalizeArmor(collapsed, 'PUBLIC KEY BLOCK');
        expect(normalized).not.toBeNull();
        expect(validateArmor(normalized!, 'PUBLIC KEY BLOCK')).toBe(true);
    });

    it('normalizeArmor canonicalizes markers with irregular internal whitespace', () => {
        const irregular = makeArmorWithChecksum('MESSAGE').replace(
            /-----BEGIN\s+PGP\s+MESSAGE\s*-----/i,
            '-----BEGIN   PGP    MESSAGE-----',
        );
        const normalized = normalizeArmor(irregular, 'MESSAGE');
        expect(normalized).not.toBeNull();
        expect(normalized!.startsWith('-----BEGIN PGP MESSAGE-----\n\n')).toBe(true);
        expect(normalized!.endsWith('\n-----END PGP MESSAGE-----')).toBe(true);
        // The canonicalized armor passes strict validation.
        expect(validateArmor(normalized!, 'MESSAGE')).toBe(true);
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

    it('identifies keys that carry optional armor headers', () => {
        expect(identifyKeyType(makeArmorWithHeaders('PUBLIC KEY BLOCK'))).toBe('public');
        expect(identifyKeyType(makeArmorWithHeaders('PRIVATE KEY BLOCK'))).toBe('private');
    });

    it('returns unknown for unrecognized content', () => {
        expect(identifyKeyType('random text')).toBe('unknown');
    });
});
