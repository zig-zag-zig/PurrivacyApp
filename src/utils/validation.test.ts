import { describe, expect, it } from 'vitest';
import {
    validatePassphrase,
    validateKeyCreationForm,
    validateEncryptionForm,
    validateDecryptionForm,
} from '../utils/validation';

describe('validatePassphrase', () => {
    it('returns valid for an empty passphrase', () => {
        expect(validatePassphrase('')).toEqual({ isValid: true });
    });

    it('returns an error when passphrase is too short', () => {
        const result = validatePassphrase('ab', 4, 100);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Minimum 4 characters');
    });

    it('returns an error when passphrase is too long', () => {
        const result = validatePassphrase('a'.repeat(101), 1, 100);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Maximum 100 characters');
    });

    it('returns valid for a passphrase within bounds', () => {
        expect(validatePassphrase('valid-pass', 4, 100)).toEqual({ isValid: true });
    });

    it('uses default min/max when not provided', () => {
        // Default from inputLimits: min 8, max 128
        expect(validatePassphrase('short', 8, 128).isValid).toBe(false);
        expect(validatePassphrase('valid-passphrase', 8, 128).isValid).toBe(true);
    });
});

describe('validateKeyCreationForm', () => {
    it('requires at least one of name, email, or comment', () => {
        const errors = validateKeyCreationForm('', '', '', 'passphrase', 'passphrase', 'ECDSA', 0);
        expect(errors.userId).toBe('Name, email, or comment is required');
    });

    it('validates passphrase match', () => {
        const errors = validateKeyCreationForm('Alice', '', '', 'pass1', 'pass2', 'ECDSA', 0);
        expect(errors.confirmPassphrase).toBe('Passphrases must match');
    });

    it('requires algorithm selection', () => {
        const errors = validateKeyCreationForm('Alice', '', '', 'pass', 'pass', '' as any, 0);
        expect(errors.algorithm).toBe('Algorithm is required');
    });

    it('validates email format when email is provided', () => {
        const errors = validateKeyCreationForm('Alice', 'bad-email', '', 'pass', 'pass', 'ECDSA', 0);
        expect(errors.email).toBe('Please enter a valid email');
    });

    it('validates max lengths for name, comment, and email', () => {
        const errors = validateKeyCreationForm(
            'A'.repeat(200),
            'test@example.com',
            'C'.repeat(200),
            'pass',
            'pass',
            'ECDSA',
            0,
        );
        expect(errors.userId).toContain('must be');
    });

    it('requires RSA bits when algorithm is RSA', () => {
        const errors = validateKeyCreationForm('Alice', '', '', 'pass', 'pass', 'RSA', 0);
        expect(errors.rsaBits).toBe('RSA key size is required');
    });

    it('returns no errors for a fully valid ECDSA form', () => {
        const errors = validateKeyCreationForm('Alice', 'alice@example.com', '', 'valid-passphrase', 'valid-passphrase', 'ECDSA', 0);
        expect(Object.keys(errors)).toHaveLength(0);
    });

    it('returns no errors for a valid RSA form with bits', () => {
        const errors = validateKeyCreationForm('Alice', '', '', 'valid-passphrase', 'valid-passphrase', 'RSA', 4096);
        expect(Object.keys(errors)).toHaveLength(0);
    });
});

describe('validateEncryptionForm', () => {
    it('requires content', () => {
        const errors = validateEncryptionForm('', { 'fp1': 'key1' }, {}, false);
        expect(errors.content).toBe('Please enter text to encrypt is required');
    });

    it('requires at least one public key', () => {
        const errors = validateEncryptionForm('hello', {}, {}, false);
        expect(errors.publicKeys).toBe('Please select at least one public key');
    });

    it('requires a private key when signing is enabled', () => {
        const errors = validateEncryptionForm('hello', { 'fp1': 'key1' }, {}, true);
        expect(errors.privateKeys).toBe('Please select a private key when signing');
    });

    it('returns no errors for valid encryption without signing', () => {
        const errors = validateEncryptionForm('hello', { 'fp1': 'key1' }, {}, false);
        expect(Object.keys(errors)).toHaveLength(0);
    });

    it('returns no errors for valid encryption with signing', () => {
        const errors = validateEncryptionForm('hello', { 'fp1': 'key1' }, { 'fp2': 'key2' }, true);
        expect(Object.keys(errors)).toHaveLength(0);
    });
});

describe('validateDecryptionForm', () => {
    it('requires encrypted content', () => {
        const errors = validateDecryptionForm('', { 'fp1': 'key1' });
        expect(errors.encryptedContent).toBe('Please enter encrypted content is required');
    });

    it('requires a private key', () => {
        const errors = validateDecryptionForm('-----BEGIN PGP MESSAGE-----', {});
        expect(errors.privateKeys).toBe('Please select a private key');
    });

    it('returns no errors for a valid decryption form', () => {
        const errors = validateDecryptionForm('-----BEGIN PGP MESSAGE-----', { 'fp1': 'key1' });
        expect(Object.keys(errors)).toHaveLength(0);
    });
});
