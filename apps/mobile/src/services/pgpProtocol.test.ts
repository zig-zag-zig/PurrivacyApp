import { describe, expect, it } from 'vitest';

import {
    isPgpOperationResultValid,
    parsePgpEnvelope,
} from './pgpProtocol';

describe('parsePgpEnvelope', () => {
    it('parses a valid success envelope', () => {
        expect(parsePgpEnvelope({ success: true, result: { pong: true, timestamp: 1 }, id: 3 }))
            .toEqual({ success: true, result: { pong: true, timestamp: 1 }, id: 3 });
    });

    it('parses a valid failure envelope', () => {
        expect(parsePgpEnvelope({ success: false, error: 'boom', id: 7 }))
            .toEqual({ success: false, error: 'boom', id: 7 });
    });

    it('rejects non-object payloads', () => {
        expect(parsePgpEnvelope('nope')).toBeNull();
        expect(parsePgpEnvelope(null)).toBeNull();
        expect(parsePgpEnvelope(undefined)).toBeNull();
        expect(parsePgpEnvelope([1, 2])).toBeNull();
    });

    it('rejects envelopes without a numeric id', () => {
        expect(parsePgpEnvelope({ success: true, result: 1 })).toBeNull();
        expect(parsePgpEnvelope({ success: true, result: 1, id: '3' })).toBeNull();
    });

    it('rejects tampered success values (non-boolean)', () => {
        expect(parsePgpEnvelope({ success: 'yes', result: 1, id: 1 })).toBeNull();
        expect(parsePgpEnvelope({ success: 1, result: 1, id: 1 })).toBeNull();
    });

    it('rejects failure envelopes without a string error', () => {
        expect(parsePgpEnvelope({ success: false, id: 1 })).toBeNull();
        expect(parsePgpEnvelope({ success: false, error: 42, id: 1 })).toBeNull();
        expect(parsePgpEnvelope({ success: false, error: null, id: 1 })).toBeNull();
    });
});

describe('isPgpOperationResultValid', () => {
    it('accepts a valid ping result', () => {
        expect(isPgpOperationResultValid('ping', { pong: true, timestamp: 123 })).toBe(true);
    });

    it('rejects a tampered ping result', () => {
        expect(isPgpOperationResultValid('ping', { pong: false, timestamp: 123 })).toBe(false);
        expect(isPgpOperationResultValid('ping', { pong: true })).toBe(false);
        expect(isPgpOperationResultValid('ping', true)).toBe(false);
    });

    it('accepts armored key pair results for generateKeyPair/changeExpiration', () => {
        const pair = { publicKey: 'PUB', privateKey: 'PRIV' };
        expect(isPgpOperationResultValid('generateKeyPair', pair)).toBe(true);
        expect(isPgpOperationResultValid('changeExpiration', pair)).toBe(true);
    });

    it('rejects tampered key pair results', () => {
        expect(isPgpOperationResultValid('generateKeyPair', { publicKey: 'PUB' })).toBe(false);
        expect(isPgpOperationResultValid('generateKeyPair', { publicKey: 'PUB', privateKey: 5 })).toBe(false);
        expect(isPgpOperationResultValid('generateKeyPair', 'armor')).toBe(false);
    });

    it('accepts string results for armor-producing operations', () => {
        expect(isPgpOperationResultValid('encryptMessage', 'armored')).toBe(true);
        expect(isPgpOperationResultValid('changePassphrase', 'armored')).toBe(true);
        expect(isPgpOperationResultValid('createDetachedSignature', 'armored')).toBe(true);
        expect(isPgpOperationResultValid('extractPublicKeyFromPrivate', 'armored')).toBe(true);
    });

    it('rejects tampered string-result operations', () => {
        expect(isPgpOperationResultValid('encryptMessage', { ciphertext: 'x' })).toBe(false);
        expect(isPgpOperationResultValid('encryptMessage', null)).toBe(false);
        expect(isPgpOperationResultValid('extractPublicKeyFromPrivate', 42)).toBe(false);
    });

    it('accepts a valid decryptMessage result with optional verified', () => {
        expect(isPgpOperationResultValid('decryptMessage', { decrypted: 'hello' })).toBe(true);
        expect(isPgpOperationResultValid('decryptMessage', { decrypted: 'hello', verified: true })).toBe(true);
        expect(isPgpOperationResultValid('decryptMessage', { decrypted: 'hello', verified: null })).toBe(true);
    });

    it('rejects a tampered decryptMessage result', () => {
        expect(isPgpOperationResultValid('decryptMessage', {})).toBe(false);
        expect(isPgpOperationResultValid('decryptMessage', { decrypted: 5 })).toBe(false);
        expect(isPgpOperationResultValid('decryptMessage', { decrypted: 'x', verified: 'yes' })).toBe(false);
    });

    it('accepts a valid key metadata result', () => {
        expect(isPgpOperationResultValid('extractKeyMetadata', {
            fingerprint: 'fp',
            userId: 'user',
            algorithm: 'rsa',
            expiry: 'Never expires',
        })).toBe(true);
        expect(isPgpOperationResultValid('extractKeyMetadata', {
            fingerprint: 'fp',
            userId: 'user',
            algorithm: 'ecc',
            bitStrength: null,
            curve: 'p256',
            expiry: '01.01.2030 (expires in 100 days)',
            privateKeyIsUnlocked: false,
        })).toBe(true);
    });

    it('rejects a tampered key metadata result', () => {
        expect(isPgpOperationResultValid('extractKeyMetadata', {
            fingerprint: 'fp',
            userId: 'user',
            algorithm: 'rsa',
        })).toBe(false);
        expect(isPgpOperationResultValid('extractKeyMetadata', {
            fingerprint: 5,
            userId: 'user',
            algorithm: 'rsa',
            expiry: 'x',
        })).toBe(false);
        expect(isPgpOperationResultValid('extractKeyMetadata', null)).toBe(false);
    });

    it('accepts boolean results for verification operations', () => {
        expect(isPgpOperationResultValid('verifyDetachedSignature', true)).toBe(true);
        expect(isPgpOperationResultValid('verifyDetachedSignature', false)).toBe(true);
        expect(isPgpOperationResultValid('validatePrivateKeyPassphrase', true)).toBe(true);
    });

    it('rejects tampered boolean results', () => {
        expect(isPgpOperationResultValid('verifyDetachedSignature', 'true')).toBe(false);
        expect(isPgpOperationResultValid('verifyDetachedSignature', 1)).toBe(false);
        expect(isPgpOperationResultValid('validatePrivateKeyPassphrase', undefined)).toBe(false);
    });
});
