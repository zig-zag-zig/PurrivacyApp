/**
 * Typed PGP operation protocol shared by the WebView executor, the PGP
 * service, and the hidden WebView itself.
 *
 * Every operation has a discriminated request type (the payload injected into
 * the WebView) and a matching response type. Because messages cross a WebView
 * boundary, responses are validated at runtime with `parsePgpEnvelope` and
 * `isPgpOperationResultValid` before being resolved to callers.
 */

import type {
    DecryptionResult,
    KeyGenerationOptions,
    KeyMetadata,
    PrivateKeyAndPassphrase,
    PublicAndPrivateKey,
} from '../types/types';

/** Request payloads for `generateKeyPair`. */
export interface EncryptMessageRequest {
    publicKeys: string[];
    content: string;
    signOptions?: PrivateKeyAndPassphrase;
}

/** Request payloads for `decryptMessage`. */
export interface DecryptMessageRequest {
    encryptedData: string;
    privateKey: string;
    passphrase: string;
    publicKeyForVerification?: string;
}

/** Request payloads for `changePassphrase`. */
export interface ChangePassphraseRequest {
    armoredPrivateKey: string;
    oldPassphrase: string;
    newPassphrase: string;
}

/** Request payloads for `changeExpiration`. */
export interface ChangeExpirationRequest {
    armoredPrivateKey: string;
    passphrase: string;
    days: string;
}

/** Request payloads for `createDetachedSignature`. */
export interface SignMessageRequest {
    message: string;
    privateKey: string;
    passphrase: string;
}

/** Request payloads for `verifyDetachedSignature`. */
export interface VerifySignatureRequest {
    signature: string;
    message: string;
    publicKey: string;
}

/** Request payloads for `extractKeyMetadata`. */
export interface ExtractKeyMetadataRequest {
    armoredKey: string;
}

/** Request payloads for `validatePrivateKeyPassphrase`. */
export interface ValidatePassphraseRequest {
    privateKey: string;
    passphrase: string;
}

/** Request payloads for `extractPublicKeyFromPrivate`. */
export interface ExtractPublicKeyRequest {
    privateKey: string;
}

/**
 * Discriminated union of every PGP operation request sent to the WebView.
 * `operation` names the handler branch; `data` is the per-operation payload.
 */
export interface PgpRequestMap {
    ping: { operation: 'ping'; data?: undefined };
    generateKeyPair: { operation: 'generateKeyPair'; data: KeyGenerationOptions };
    encryptMessage: { operation: 'encryptMessage'; data: EncryptMessageRequest };
    decryptMessage: { operation: 'decryptMessage'; data: DecryptMessageRequest };
    changePassphrase: { operation: 'changePassphrase'; data: ChangePassphraseRequest };
    extractKeyMetadata: { operation: 'extractKeyMetadata'; data: ExtractKeyMetadataRequest };
    changeExpiration: { operation: 'changeExpiration'; data: ChangeExpirationRequest };
    createDetachedSignature: { operation: 'createDetachedSignature'; data: SignMessageRequest };
    verifyDetachedSignature: { operation: 'verifyDetachedSignature'; data: VerifySignatureRequest };
    validatePrivateKeyPassphrase: { operation: 'validatePrivateKeyPassphrase'; data: ValidatePassphraseRequest };
    extractPublicKeyFromPrivate: { operation: 'extractPublicKeyFromPrivate'; data: ExtractPublicKeyRequest };
}

export type PgpOperationName = keyof PgpRequestMap;

export type PgpOperationRequest = PgpRequestMap[PgpOperationName];

/** Per-operation response types. */
export interface PgpResponseMap {
    ping: { pong: true; timestamp: number };
    generateKeyPair: PublicAndPrivateKey;
    encryptMessage: string;
    decryptMessage: DecryptionResult;
    changePassphrase: string;
    extractKeyMetadata: KeyMetadata;
    changeExpiration: PublicAndPrivateKey;
    createDetachedSignature: string;
    verifyDetachedSignature: boolean;
    validatePrivateKeyPassphrase: boolean;
    extractPublicKeyFromPrivate: string;
}

export type PgpOperationResponse<T extends PgpOperationName> = PgpResponseMap[T];

/**
 * The wire envelope posted back from the WebView:
 * `{ success: true, result, id }` or `{ success: false, error, id }`.
 */
export type PgpEnvelope =
    | { success: true; result: unknown; id: number }
    | { success: false; error: string; id: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Runtime guard for WebView responses. Rejects anything that is not an
 * object with a numeric `id` and an exactly-boolean `success` (with a string
 * `error` on failure).
 */
export const parsePgpEnvelope = (raw: unknown): PgpEnvelope | null => {
    if (!isRecord(raw)) {
        return null;
    }
    const { success, result, error, id } = raw;
    if (typeof id !== 'number') {
        return null;
    }
    if (success === true) {
        return { success: true, result, id };
    }
    if (success === false && typeof error === 'string') {
        return { success: false, error, id };
    }
    return null;
};

const isArmoredKeyPair = (value: unknown): value is PublicAndPrivateKey => {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.publicKey === 'string' && typeof value.privateKey === 'string';
};

/**
 * Runtime guard for per-operation results. The WebView is a high-value
 * boundary (private keys and passphrases pass through it), so results are
 * checked against each operation's contract before being resolved.
 */
export const isPgpOperationResultValid = (
    operation: PgpOperationName,
    result: unknown,
): boolean => {
    switch (operation) {
        case 'ping':
            return isRecord(result) && result.pong === true && typeof result.timestamp === 'number';
        case 'generateKeyPair':
        case 'changeExpiration':
            return isArmoredKeyPair(result);
        case 'encryptMessage':
        case 'changePassphrase':
        case 'createDetachedSignature':
        case 'extractPublicKeyFromPrivate':
            return typeof result === 'string';
        case 'decryptMessage':
            if (!isRecord(result)) {
                return false;
            }
            return (
                typeof result.decrypted === 'string' &&
                (result.verified == null || typeof result.verified === 'boolean')
            );
        case 'extractKeyMetadata':
            if (!isRecord(result)) {
                return false;
            }
            return (
                typeof result.fingerprint === 'string' &&
                typeof result.userId === 'string' &&
                typeof result.algorithm === 'string' &&
                typeof result.expiry === 'string'
            );
        case 'verifyDetachedSignature':
        case 'validatePrivateKeyPassphrase':
            return typeof result === 'boolean';
    }
};
