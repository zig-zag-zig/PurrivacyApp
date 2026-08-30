import { env } from '../../../config/env';
import { CryptoUtils } from '../../../utils/cryptoUtils';

/**
 * Server-side recovery verifier hash handling (API-SEC-010).
 *
 * The client derives a verifier from the BIP-39 mnemonic and salt and sends
 * `sha256(verifier)` as `recoveryVerifierHash` during user creation. Storing
 * that hash directly keeps it vulnerable to offline guessing if the database
 * leaks (the verifier is only as strong as the mnemonic). New writes therefore
 * store a peppered, versioned value:
 *
 *     v1:<HMAC-SHA256(RECOVERY_VERIFIER_PEPPER, clientHash)>
 *
 * Verification accepts both the v1 format and the legacy unpeppered hash so
 * existing users keep working during migration.
 */

const RECOVERY_VERIFIER_HASH_PREFIX = 'v1:';
const PREFIXED_LENGTH = RECOVERY_VERIFIER_HASH_PREFIX.length + 64;

export const pepperRecoveryVerifierHash = (clientHash: string): string => (
    `${RECOVERY_VERIFIER_HASH_PREFIX}${CryptoUtils.hmacSha256(env.recoveryVerifierPepper, clientHash)}`
);

const isPepperedRecoveryVerifierHash = (storedHash: string): boolean => (
    storedHash.startsWith(RECOVERY_VERIFIER_HASH_PREFIX) && storedHash.length === PREFIXED_LENGTH
);

/**
 * Verify an incoming client hash against a stored recovery verifier hash.
 * Accepts the current `v1:` peppered format and legacy unpeppered hashes.
 */
export const verifyRecoveryVerifierHash = (storedHash: unknown, incomingHash: string): boolean => {
    if (typeof storedHash !== 'string' || storedHash.length === 0) {
        return false;
    }

    if (isPepperedRecoveryVerifierHash(storedHash)) {
        const expected = `${RECOVERY_VERIFIER_HASH_PREFIX}${CryptoUtils.hmacSha256(env.recoveryVerifierPepper, incomingHash)}`;
        return CryptoUtils.timingSafeEqual(expected, storedHash);
    }

    return CryptoUtils.timingSafeEqual(incomingHash, storedHash);
};
