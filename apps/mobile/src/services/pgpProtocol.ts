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

/** Request payloads for `revokeKey`. */
export interface RevokeKeyRequest {
    privateKey: string;
    passphrase: string;
}

/** Request payloads for `applyRevocation`. */
export interface ApplyRevocationRequest {
    publicKey: string;
    revocationCertificate: string;
}

/** Result of `revokeKey`: the revoked pair plus the standalone cert. */
export interface RevokedKeyResult {
    privateKey: string;
    publicKey: string;
    revocationCertificate: string;
}

// ---- Chunked file ops ----
// Binary payloads can't cross injectJavaScript in one shot; bytes move in
// base64 chunks into a per-session WebView buffer, the op runs, and output is
// read back in chunks. `sessionId` is caller-chosen.

export interface FileOpBeginRequest { sessionId: string; }
export interface FileOpChunkRequest { sessionId: string; base64: string; }
/** Pipelined chunk-batch push: the WebView acks the batch after its queue
 * drains to `drainBelow`, so the host can keep a bounded number of chunks in
 * flight instead of blocking on a round-trip per chunk. */
export interface FileOpChunkBatchRequest { sessionId: string; chunks: string[]; drainBelow?: number; }
/**
 * Pure in-WebView benchmark: generates `bytes` deterministic bytes inside the
 * WebView, encrypts them locally, consumes the output stream, and reports
 * elapsed time. No bridge traffic — used to separate WebView crypto speed
 * from bridge round-trip cost when diagnosing file-op performance.
 */
export interface FileOpSelfTestRequest { bytes: number; publicKey: string; }
export interface FileOpSelfTestResult { elapsedMs: number; inBytes: number; outBytes: number; }
export interface FileOpEncryptRequest {
    sessionId: string;
    publicKeys: string[];
    filename: string;
    signOptions?: PrivateKeyAndPassphrase;
}
export interface FileOpDecryptRequest {
    sessionId: string;
    privateKey: string;
    passphrase: string;
    publicKeyForVerification?: string;
}
// Result streaming is pull-based: the caller asks for the next chunk and the
// WebView reads one buffer off the output stream — it never buffers the whole
// file. `maxLength` bounds each pull.
export interface FileOpResultChunkRequest { sessionId: string; maxLength: number; }
export interface FileOpFinishInputRequest { sessionId: string; }
export interface FileOpEndRequest { sessionId: string; }
export interface FileOpStatusRequest { sessionId: string; }

export interface FileOpEncryptResult { ok: true; }
export interface FileOpDecryptResult {
    ok: true;
    filename: string;
    verified: boolean | null;
}
export interface FileOpChunkAck { received: number; }
export interface FileOpOk { ok: true; }
export interface FileOpResultChunk {
    base64: string;
    /** True when the output stream is exhausted — no more chunks follow. */
    done: boolean;
    verified?: boolean | null;
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
    revokeKey: { operation: 'revokeKey'; data: RevokeKeyRequest };
    applyRevocation: { operation: 'applyRevocation'; data: ApplyRevocationRequest };
    fileOpBegin: { operation: 'fileOpBegin'; data: FileOpBeginRequest };
    fileOpChunkBatch: { operation: 'fileOpChunkBatch'; data: FileOpChunkBatchRequest };
    fileOpSelfTest: { operation: 'fileOpSelfTest'; data: FileOpSelfTestRequest };
    fileOpChunk: { operation: 'fileOpChunk'; data: FileOpChunkRequest };
    fileOpEncrypt: { operation: 'fileOpEncrypt'; data: FileOpEncryptRequest };
    fileOpDecrypt: { operation: 'fileOpDecrypt'; data: FileOpDecryptRequest };
    fileOpResultChunk: { operation: 'fileOpResultChunk'; data: FileOpResultChunkRequest };
    fileOpFinishInput: { operation: 'fileOpFinishInput'; data: FileOpFinishInputRequest };
    fileOpStatus: { operation: 'fileOpStatus'; data: FileOpStatusRequest };
    fileOpEnd: { operation: 'fileOpEnd'; data: FileOpEndRequest };
}

export type PgpOperationName = keyof PgpRequestMap;

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
    revokeKey: RevokedKeyResult;
    applyRevocation: string;
    fileOpBegin: FileOpOk;
    fileOpChunkBatch: FileOpChunkAck;
    fileOpSelfTest: FileOpSelfTestResult;
    fileOpChunk: FileOpChunkAck;
    fileOpEncrypt: FileOpEncryptResult;
    fileOpDecrypt: FileOpDecryptResult;
    fileOpResultChunk: FileOpResultChunk;
    fileOpFinishInput: FileOpOk;
    fileOpStatus: { queueDepth: number; inputDone: boolean };
    fileOpEnd: FileOpOk;
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
        case 'revokeKey':
            return isArmoredKeyPair(result)
                && typeof (result as { revocationCertificate?: unknown }).revocationCertificate === 'string';
        case 'applyRevocation':
            return typeof result === 'string';
        case 'fileOpBegin':
        case 'fileOpFinishInput':
        case 'fileOpEnd':
            return isRecord(result) && result.ok === true;
        case 'fileOpSelfTest':
            return isRecord(result)
                && typeof result.elapsedMs === 'number'
                && typeof result.inBytes === 'number'
                && typeof result.outBytes === 'number';
        case 'fileOpStatus':
            return isRecord(result)
                && typeof result.queueDepth === 'number'
                && typeof result.inputDone === 'boolean';
        case 'fileOpChunk':
        case 'fileOpChunkBatch':
            return isRecord(result) && typeof result.received === 'number';
        case 'fileOpEncrypt':
            return isRecord(result) && result.ok === true;
        case 'fileOpDecrypt':
            return isRecord(result)
                && result.ok === true
                && typeof result.filename === 'string'
                && (result.verified == null || typeof result.verified === 'boolean');
        case 'fileOpResultChunk':
            return isRecord(result)
                && typeof result.base64 === 'string'
                && typeof result.done === 'boolean'
                && (result.verified == null || typeof result.verified === 'boolean');
        case 'verifyDetachedSignature':
        case 'validatePrivateKeyPassphrase':
            return typeof result === 'boolean';
    }
};
