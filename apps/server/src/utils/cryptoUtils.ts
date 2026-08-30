import * as crypto from 'crypto';

/**
 * Cryptographic utility functions
 */
export class CryptoUtils {
    /**
     * Generate a random hex string of specified length
     */
    static randomHex(length: number): string {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    }

    /**
     * Generate a URL-safe random base64 string.
     */
    static randomBase64Url(byteLength: number): string {
        return crypto.randomBytes(byteLength).toString('base64url');
    }

    /**
     * Generate a random integer between min (inclusive) and max (inclusive)
     */
    static randomInt(min: number, max: number): number {
        return crypto.randomInt(min, max + 1);
    }

    /**
     * Hash data using SHA-256
     */
    static sha256(data: string): string {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Keyed HMAC-SHA256 hash
     */
    static hmacSha256(key: string, data: string): string {
        return crypto.createHmac('sha256', key).update(data).digest('hex');
    }

    /**
     * Compare two strings without leaking timing information.
     */
    static timingSafeEqual(a: string, b: string): boolean {
        const aBuffer = Buffer.from(a);
        const bBuffer = Buffer.from(b);

        if (aBuffer.length !== bBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(aBuffer, bBuffer);
    }

    /**
     * Generate recovery codes
     */
    static generateRecoveryCodes(count: number): string[] {
        const codes: string[] = [];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const CODE_LENGTH = 12;
        for (let i = 0; i < count; i++) {
            let code = '';
            for (let j = 0; j < CODE_LENGTH; j++) {
                const randomIndex = crypto.randomInt(0, chars.length);
                code += chars[randomIndex];
            }
            codes.push(code);
        }
        return codes;
    }

    /**
     * Encrypt a secret using AES-GCM with a key encryption key (KEK)
     * Returns an object containing encrypted data, IV, and tag
     */
    static encryptSecret(plaintext: string, kek: string): { encryptedData: string; iv: string; tag: string } {
        // Generate a random IV (12 bytes for GCM)
        const iv = crypto.randomBytes(12);

        // Derive a key from the KEK using SHA-256 (32 bytes for AES-256)
        const key = crypto.createHash('sha256').update(kek).digest();

        // Create cipher
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        // Encrypt the plaintext
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Get the authentication tag
        const tag = cipher.getAuthTag();

        return {
            encryptedData: encrypted,
            iv: iv.toString('base64'),
            tag: tag.toString('base64')
        };
    }

    /**
     * Decrypt a secret using AES-GCM with a key encryption key (KEK)
     */
    static decryptSecret(encryptedData: string, iv: string, tag: string, kek: string): string {
        // Convert from base64
        const encryptedBuffer = Buffer.from(encryptedData, 'base64');
        const ivBuffer = Buffer.from(iv, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');

        // Derive the same key from the KEK
        const key = crypto.createHash('sha256').update(kek).digest();

        // Create decipher
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        // Decrypt
        let decrypted = decipher.update(encryptedBuffer, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
