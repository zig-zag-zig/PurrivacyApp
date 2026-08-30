import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';
import {
    pepperRecoveryVerifierHash,
    verifyRecoveryVerifierHash,
} from '../../../../../src/features/auth/recovery/recoveryVerifierHash';

describe('recoveryVerifierHash', () => {
    const clientHash = 'ab'.repeat(32);

    const getEnv = () => require('../../../../../src/config/env').env;

    describe('pepperRecoveryVerifierHash', () => {
        it('returns a v1-prefixed HMAC-SHA256 of the client hash', () => {
            const env = getEnv();
            const peppered = pepperRecoveryVerifierHash(clientHash);

            expect(peppered).toBe(`v1:${CryptoUtils.hmacSha256(env.recoveryVerifierPepper, clientHash)}`);
            expect(peppered).toMatch(/^v1:[0-9a-f]{64}$/i);
        });

        it('is deterministic for the same input', () => {
            expect(pepperRecoveryVerifierHash(clientHash)).toBe(pepperRecoveryVerifierHash(clientHash));
        });
    });

    describe('verifyRecoveryVerifierHash', () => {
        it('accepts a matching v1 peppered hash', () => {
            const env = getEnv();
            const stored = `v1:${CryptoUtils.hmacSha256(env.recoveryVerifierPepper, clientHash)}`;

            expect(verifyRecoveryVerifierHash(stored, clientHash)).toBe(true);
        });

        it('accepts a legacy unpeppered hash', () => {
            expect(verifyRecoveryVerifierHash(clientHash, clientHash)).toBe(true);
        });

        it('rejects mismatches in both formats', () => {
            expect(verifyRecoveryVerifierHash('0'.repeat(64), clientHash)).toBe(false);
            expect(verifyRecoveryVerifierHash(`v1:${'0'.repeat(64)}`, clientHash)).toBe(false);
            expect(verifyRecoveryVerifierHash(`v1:${CryptoUtils.hmacSha256('0'.repeat(64), clientHash)}`, clientHash)).toBe(false);
        });

        it('rejects non-string or empty stored values', () => {
            expect(verifyRecoveryVerifierHash(undefined, clientHash)).toBe(false);
            expect(verifyRecoveryVerifierHash(null, clientHash)).toBe(false);
            expect(verifyRecoveryVerifierHash(12345, clientHash)).toBe(false);
            expect(verifyRecoveryVerifierHash('', clientHash)).toBe(false);
        });
    });
});
