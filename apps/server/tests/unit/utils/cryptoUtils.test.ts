import { CryptoUtils } from '../../../src/utils/cryptoUtils';

describe('CryptoUtils', () => {
    describe('encryptSecret / decryptSecret', () => {
        it('round-trips plaintext through encryption and decryption', () => {
            const plaintext = 'my-mfa-secret-12345';
            const kek = 'test-kek-value';
            const { encryptedData, iv, tag } = CryptoUtils.encryptSecret(plaintext, kek);

            expect(encryptedData).toBeDefined();
            expect(iv).toBeDefined();
            expect(tag).toBeDefined();

            const decrypted = CryptoUtils.decryptSecret(encryptedData, iv, tag, kek);
            expect(decrypted).toBe(plaintext);
        });

        it('throws when decrypting with tampered ciphertext', () => {
            const plaintext = 'secret-data';
            const kek = 'test-kek';
            const { encryptedData, iv, tag } = CryptoUtils.encryptSecret(plaintext, kek);

            const tampered = Buffer.from(encryptedData, 'base64');
            tampered[0] ^= 0xff;
            const tamperedBase64 = tampered.toString('base64');

            expect(() => CryptoUtils.decryptSecret(tamperedBase64, iv, tag, kek)).toThrow();
        });

        it('throws when decrypting with wrong key', () => {
            const plaintext = 'secret-data';
            const kek = 'correct-key';
            const { encryptedData, iv, tag } = CryptoUtils.encryptSecret(plaintext, kek);

            expect(() => CryptoUtils.decryptSecret(encryptedData, iv, tag, 'wrong-key')).toThrow();
        });

        it('throws when decrypting with tampered auth tag', () => {
            const plaintext = 'secret-data';
            const kek = 'test-kek';
            const { encryptedData, iv, tag } = CryptoUtils.encryptSecret(plaintext, kek);

            const tamperedTag = Buffer.from(tag, 'base64');
            tamperedTag[0] ^= 0xff;

            expect(() => CryptoUtils.decryptSecret(encryptedData, iv, tamperedTag.toString('base64'), kek)).toThrow();
        });

        it('produces different ciphertexts for the same plaintext (random IV)', () => {
            const plaintext = 'same-secret';
            const kek = 'test-kek';
            const first = CryptoUtils.encryptSecret(plaintext, kek);
            const second = CryptoUtils.encryptSecret(plaintext, kek);

            expect(first.encryptedData).not.toBe(second.encryptedData);
            expect(first.iv).not.toBe(second.iv);
        });
    });

    describe('sha256', () => {
        it('produces deterministic hex output', () => {
            const hash1 = CryptoUtils.sha256('test-input');
            const hash2 = CryptoUtils.sha256('test-input');
            expect(hash1).toBe(hash2);
        });

        it('produces 64-character hex string', () => {
            const hash = CryptoUtils.sha256('anything');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('produces different hashes for different inputs', () => {
            expect(CryptoUtils.sha256('input-a')).not.toBe(CryptoUtils.sha256('input-b'));
        });
    });

    describe('timingSafeEqual', () => {
        it('returns true for identical strings', () => {
            expect(CryptoUtils.timingSafeEqual('abc', 'abc')).toBe(true);
        });

        it('returns false for different strings of the same length', () => {
            expect(CryptoUtils.timingSafeEqual('abc', 'abd')).toBe(false);
        });

        it('returns false for strings of different lengths', () => {
            expect(CryptoUtils.timingSafeEqual('short', 'longer')).toBe(false);
        });

        it('returns false for empty vs non-empty', () => {
            expect(CryptoUtils.timingSafeEqual('', 'a')).toBe(false);
        });

        it('returns true for two empty strings', () => {
            expect(CryptoUtils.timingSafeEqual('', '')).toBe(true);
        });
    });

    describe('generateRecoveryCodes', () => {
        it('produces the requested number of codes', () => {
            const codes = CryptoUtils.generateRecoveryCodes(5);
            expect(codes).toHaveLength(5);
        });

        it('produces 12-character uppercase alphanumeric codes', () => {
            const codes = CryptoUtils.generateRecoveryCodes(10);
            for (const code of codes) {
                expect(code).toHaveLength(12);
                expect(code).toMatch(/^[A-Z0-9]{12}$/);
            }
        });

        it('produces unique codes (statistically)', () => {
            const codes = CryptoUtils.generateRecoveryCodes(100);
            const unique = new Set(codes);
            expect(unique.size).toBe(100);
        });
    });

    describe('randomHex', () => {
        it('produces a hex string of the requested length', () => {
            expect(CryptoUtils.randomHex(32)).toHaveLength(32);
            expect(CryptoUtils.randomHex(64)).toHaveLength(64);
        });

        it('contains only hex characters', () => {
            const hex = CryptoUtils.randomHex(100);
            expect(hex).toMatch(/^[0-9a-f]+$/);
        });
    });

    describe('randomBase64Url', () => {
        it('produces URL-safe base64 characters', () => {
            const result = CryptoUtils.randomBase64Url(32);
            expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
        });

        it('produces correct byte-length encoded output', () => {
            // base64url encodes 3 bytes → 4 chars, so 32 bytes → 43-44 chars
            const result = CryptoUtils.randomBase64Url(32);
            const decoded = Buffer.from(result, 'base64url');
            expect(decoded.length).toBe(32);
        });
    });

    describe('randomInt', () => {
        it('returns an integer within the specified range (inclusive)', () => {
            for (let i = 0; i < 50; i++) {
                const value = CryptoUtils.randomInt(1, 10);
                expect(value).toBeGreaterThanOrEqual(1);
                expect(value).toBeLessThanOrEqual(10);
                expect(Number.isInteger(value)).toBe(true);
            }
        });
    });
});
