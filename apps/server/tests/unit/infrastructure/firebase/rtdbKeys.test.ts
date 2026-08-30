import {
    assertRtdbKey,
    encodeRtdbKeySegment,
    decodeRtdbKeySegment,
} from '../../../../src/infrastructure/firebase/rtdbKeys';
import { BadRequestError } from '../../../../src/utils/errors';

describe('assertRtdbKey', () => {
    it('passes for a valid alphanumeric key', () => {
        expect(() => assertRtdbKey('test', 'validKey123')).not.toThrow();
    });

    it('passes for a key with hyphens and underscores', () => {
        expect(() => assertRtdbKey('test', 'my-key_name')).not.toThrow();
    });

    it('throws for a key containing a dot', () => {
        expect(() => assertRtdbKey('test', 'bad.key')).toThrow(/not a valid Realtime Database key/);
    });

    it('throws for a key containing a dollar sign', () => {
        expect(() => assertRtdbKey('test', 'bad$key')).toThrow(/not a valid Realtime Database key/);
    });

    it('throws for a key containing a hash', () => {
        expect(() => assertRtdbKey('test', 'bad#key')).toThrow(/not a valid Realtime Database key/);
    });

    it('throws for a key containing square brackets', () => {
        expect(() => assertRtdbKey('test', 'bad[key]')).toThrow(/not a valid Realtime Database key/);
    });

    it('throws for a key containing a forward slash', () => {
        expect(() => assertRtdbKey('test', 'bad/key')).toThrow(/not a valid Realtime Database key/);
    });

    it('throws for an empty string', () => {
        expect(() => assertRtdbKey('test', '')).toThrow(/not a valid Realtime Database key/);
    });

    it('throws for a whitespace-only string', () => {
        expect(() => assertRtdbKey('test', '   ')).toThrow(/not a valid Realtime Database key/);
    });

    it('includes the field name in the error message', () => {
        expect(() => assertRtdbKey('userId', 'bad.key')).toThrow(BadRequestError);
    });
});

describe('encodeRtdbKeySegment / decodeRtdbKeySegment', () => {
    it('round-trips a simple string', () => {
        const original = 'hello-world';
        const encoded = encodeRtdbKeySegment(original);
        expect(decodeRtdbKeySegment(encoded)).toBe(original);
    });

    it('round-trips a string with RTDB-unsafe characters', () => {
        const original = 'user.name$with#special/chars';
        const encoded = encodeRtdbKeySegment(original);
        // Encoded value should not contain the original unsafe chars
        expect(encoded).not.toContain('$');
        expect(encoded).not.toContain('#');
        expect(encoded).not.toContain('/');
        expect(decodeRtdbKeySegment(encoded)).toBe(original);
    });

    it('round-trips unicode strings', () => {
        const original = 'café-日本語';
        const encoded = encodeRtdbKeySegment(original);
        expect(decodeRtdbKeySegment(encoded)).toBe(original);
    });

    it('returns null for non-base64url input', () => {
        // base64url uses only A-Z, a-z, 0-9, -, _
        // A string like 'not valid!!' would decode but re-encoding wouldn't match
        expect(decodeRtdbKeySegment('!!!invalid')).toBeNull();
    });

    it('returns null for a tampered encoded value', () => {
        const encoded = encodeRtdbKeySegment('test');
        const tampered = encoded.slice(0, -1) + (encoded.endsWith('A') ? 'B' : 'A');
        expect(decodeRtdbKeySegment(tampered)).toBeNull();
    });
});
