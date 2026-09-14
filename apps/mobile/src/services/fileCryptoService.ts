import { Buffer } from 'buffer';
import { File, FileMode, Paths } from 'expo-file-system';

import { pgpCryptoService } from './pgpCryptoService';
import { saveToDownloads } from './downloadsSaver';
import type { FileOpSelfTestResult } from './pgpProtocol';
import { createSha256Hasher } from '../features/updates/services/updateSigning';
import type { PrivateKeyAndPassphrase } from '../types/types';

/**
 * Chunked binary encryption/decryption across the WebView bridge.
 *
 * A single `injectJavaScript` payload can't carry megabytes, so bytes move as
 * ~256KB base64 chunks into a WebView session buffer, the op runs, and the
 * output is read back in chunks and written to a file. Both directions stream;
 * the bridge only ever carries base64 strings.
 */

// ~512KB of binary per chunk ≈ 683KB base64 — a 2x throughput win over the
// previous 256KB while staying comfortably under the ~1MB Binder transaction
// budget that injectJavaScript payloads must fit in.
const CHUNK_BYTES = 512 * 1024;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const sanitizeFileName = (name: string, fallback: string): string => {
    const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\.\./g, '').trim();
    return (base || fallback).slice(0, 180);
};

const bytesToBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, 'base64'));

const newSessionId = (): string =>
    `fileop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Stream a source file into the WebView session as base64 chunks, then signal
 * end-of-input. The session must already exist (`fileOpBegin` done by caller).
 */
/**
 * Feed a source file into the WebView session as base64 chunks, then signal
 * end-of-input. The session must already exist (`fileOpBegin` done by caller).
 *
 * Throughput design: chunks are pushed with a bounded concurrency window
 * rather than awaiting a full bridge round-trip per chunk (the previous
 * approach serialized every 512KB behind a request/response pair, which is
 * what made large files crawl). Backpressure is applied server-side — the
 * WebView only acks a batch once its queue drains — so memory stays bounded
 * without any status polling.
 */
async function feedFileToSession(
    fileUri: string,
    sessionId: string,
    onProgress?: (doneBytes: number, totalBytes?: number) => void,
): Promise<string> {
    const source = new File(fileUri);
    const info = source.info();
    if (info.size !== undefined && info.size > MAX_FILE_BYTES) {
        throw new Error('File is larger than the 100 MB limit');
    }

    const hasher = createSha256Hasher();
    // In-flight chunk pushes. The window bounds memory; the WebView's own
    // queue (drainBelow) applies backpressure so we never over-buffer.
    const MAX_IN_FLIGHT = 4;
    const DRAIN_BELOW = 2;
    const inFlight = new Set<Promise<unknown>>();
    const track = (p: Promise<unknown>) => {
        inFlight.add(p);
        const settle = () => inFlight.delete(p);
        // Detached handler both frees the slot and marks the promise handled,
        // so an early rejection elsewhere can't surface as unhandled.
        p.then(settle, settle);
    };
    const awaitSlot = async () => {
        if (inFlight.size >= MAX_IN_FLIGHT) {
            await Promise.race(inFlight);
        }
    };

    try {
        // Read the file once (bounded by MAX_FILE_BYTES). Slicing an
        // ArrayBuffer is cheap; the bridge — not the read — is the bottleneck.
        const buffer = await source.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const total = bytes.length;
        hasher.update(bytes);

        for (let off = 0; off < total; off += CHUNK_BYTES) {
            const slice = bytes.subarray(off, Math.min(off + CHUNK_BYTES, total));
            onProgress?.(Math.min(off + slice.length, total), info.size);
            await awaitSlot();
            track(pgpCryptoService.execute('fileOpChunkBatch', {
                sessionId,
                chunks: [bytesToBase64(slice)],
                drainBelow: DRAIN_BELOW,
            }));
        }
        // Wait for the tail so a late WebView rejection surfaces here.
        await Promise.all(Array.from(inFlight));
        return hasher.digestHex();
    } finally {
        // Always close the input side — otherwise the crypto stream waits for
        // more input forever and the output pull deadlocks.
        await pgpCryptoService.execute('fileOpFinishInput', { sessionId }).catch(() => {});
    }
}

interface FileHandleLike {
    writeBytes: (bytes: Uint8Array) => void;
    close: () => void;
}

/**
 * Pull the WebView session's output stream to disk, chunk by chunk. The
 * WebView never buffers the file — it produces one chunk per pull, and we
 * write each before requesting the next. Total bytes are unknown up front for
 * a stream; we accumulate until `done`. Does NOT end the session (caller does
 * so the feeder can finish first).
 */
async function pullSessionToFile(
    sessionId: string,
    outFile: File,
 ): Promise<{ totalBytes: number; verified?: boolean | null; sha256: string }> {
    const handle = outFile.open(FileMode.WriteOnly) as FileHandleLike;
    const hasher = createSha256Hasher();
    let written = 0;
    let verified: boolean | null | undefined;
    try {
        for (;;) {
            const result = await pgpCryptoService.execute('fileOpResultChunk', {
                sessionId,
                maxLength: CHUNK_BYTES,
            });
            const { base64, done } = result;
            if (base64.length) {
                const bytes = base64ToBytes(base64);
                handle.writeBytes(bytes);
                hasher.update(bytes);
                written += bytes.length;
            }
            if (done) {
                verified = result.verified;
                break;
            }
        }
    } finally {
        handle.close();
    }
    return { totalBytes: written, verified, sha256: hasher.digestHex() };
}

export interface FileEncryptResult {
    /** file:// URI of the written .pgp output (app cache — used for sharing). */
    fileUri: string;
    fileName: string;
    totalBytes: number;
    /** SHA-256 of the produced ciphertext (hex). */
    sha256: string;
    /** SHA-256 of the plaintext that was encrypted (hex). */
    sourceSha256: string;
    /**
     * content:// URI of the copy saved to Downloads/Purrivacy, when the
     * device/build supports it. Null means the result only exists in the app
     * cache and must be exported via share.
     */
    savedUri?: string | null;
}

export interface FileDecryptResult {
    /** file:// URI of the decrypted output in the app cache (for sharing). */
    fileUri: string;
    /** The original filename recovered from the PGP literal packet. */
    fileName: string;
    totalBytes: number;
    verified: boolean | null;
    /** SHA-256 of the decrypted bytes (hex) — compare against the source. */
    sha256: string;
    /** content:// URI of the copy saved to Downloads/Purrivacy, when supported. */
    savedUri?: string | null;
}

/**
 * E2E helper: write a deterministic file of `sizeBytes` to the app cache.
 * Content is byte[i] = (i * 31 + 7) & 0xff, so the host can compute the
 * expected SHA-256 independently and verify the roundtrip byte-for-byte
 * without needing to read a file from outside the app sandbox.
 */
export function writeDeterministicTestFile(sizeBytes: number): { uri: string; name: string; size: number; sha256: string } {
    const bytes = new Uint8Array(sizeBytes);
    for (let i = 0; i < sizeBytes; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
    const hasher = createSha256Hasher();
    hasher.update(bytes);
    const sha256 = hasher.digestHex();
    const file = new File(Paths.cache, `e2e-test-${sizeBytes}.bin`);
    file.create({ intermediates: true, overwrite: true });
    const handle = file.open(FileMode.WriteOnly) as FileHandleLike;
    try {
        handle.writeBytes(bytes);
    } finally {
        handle.close();
    }
    return { uri: file.uri, name: `e2e-test-${sizeBytes}.bin`, size: sizeBytes, sha256 };
}

/**
 * The most recent encrypt output, for the e2e decrypt step (which cannot open
 * the system picker). Carries the plaintext SHA-256 so the decrypt result can
 * be verified in-app, without any host/env round-trip.
 */
let lastEncryptedFile: { uri: string; name: string; sourceSha256: string } | null = null;

export function getLastEncryptedFile(): { uri: string; name: string; sourceSha256: string } | null {
    return lastEncryptedFile;
}

export const fileCryptoService = {
    /**
     * Pure in-WebView crypto benchmark (no bridge traffic): generates `bytes`
     * deterministic bytes inside the WebView, encrypts them, and reports
     * elapsed time. e2e/dev diagnostic for file-op performance — separates
     * WebView crypto speed from bridge round-trip cost.
     */
    async selfTestFileCrypto(bytes: number, publicKey: string): Promise<FileOpSelfTestResult> {
        return pgpCryptoService.execute('fileOpSelfTest', { bytes, publicKey });
    },

    /**
     * Encrypt a file to `.pgp` for the given recipients. Streams the source
     * file in chunks through the WebView (`format:'binary'`), pulling
     * ciphertext back as it's produced — the WebView never buffers the file.
     * Writes `<name>.pgp` to the cache dir.
     */
    async encryptFile(
        sourceFileUri: string,
        sourceFileName: string,
        publicKeys: string[],
        signOptions?: PrivateKeyAndPassphrase,
        onProgress?: (doneBytes: number, totalBytes?: number) => void,
    ): Promise<FileEncryptResult> {
        const sessionId = newSessionId();
        try {
            // Open the session + start the op (sets up the output stream reader).
            await pgpCryptoService.execute('fileOpBegin', { sessionId });
            await pgpCryptoService.execute('fileOpEncrypt', {
                sessionId,
                publicKeys,
                filename: sourceFileName,
                signOptions,
            });

            const safeName = sanitizeFileName(sourceFileName, 'file');
            const outName = `${safeName.replace(/\.[^.]*$/, '') || 'encrypted'}.pgp`;
            const outFile = new File(Paths.cache, `purrivacy-${Date.now()}-${outName}`);
            outFile.create({ intermediates: true, overwrite: true });

            // Feed plaintext in while pulling ciphertext out. The WebView
            // handles each bridge call async, so a pending output pull doesn't
            // block incoming input chunks — the two interleave naturally.
            const feed = feedFileToSession(sourceFileUri, sessionId, onProgress);
            const pull = pullSessionToFile(sessionId, outFile);
            // Observe both so a feed failure surfaces instead of hiding behind
            // the pull's timeout, and so neither rejects unhandled.
            feed.catch(() => {});
            pull.catch(() => {});
            const [sourceSha256, { totalBytes, sha256 }] = await Promise.all([feed, pull]);
            await pgpCryptoService.execute('fileOpEnd', { sessionId });

            lastEncryptedFile = { uri: outFile.uri, name: outName, sourceSha256 };
            // Publish a findable copy into Downloads/Purrivacy (best effort:
            // the cache file remains shareable if this is unsupported).
            const savedUri = await saveToDownloads(outName, outFile.uri);
            return { fileUri: outFile.uri, fileName: outName, totalBytes, sha256, sourceSha256, savedUri };
        } catch (error) {
            await pgpCryptoService.execute('fileOpEnd', { sessionId }).catch(() => {});
            throw error;
        }
    },

    /**
     * Decrypt a `.pgp` file back to its original bytes. Recovers the original
     * filename from the literal packet; writes to the cache dir.
     */
    async decryptFile(
        sourceFileUri: string,
        privateKey: string,
        passphrase: string,
        publicKeyForVerification?: string,
        onProgress?: (doneBytes: number, totalBytes?: number) => void,
    ): Promise<FileDecryptResult> {
        const sessionId = newSessionId();
        try {
            await pgpCryptoService.execute('fileOpBegin', { sessionId });
            // Start feeding before parsing the streaming message.
            const feed = feedFileToSession(sourceFileUri, sessionId, onProgress);
            feed.catch(() => {});
            const { filename, verified } = await pgpCryptoService.execute('fileOpDecrypt', {
                sessionId,
                privateKey,
                passphrase,
                publicKeyForVerification,
            });

            const outName = sanitizeFileName(filename, `decrypted-${Date.now()}.bin`);
            const outFile = new File(Paths.cache, `purrivacy-${outName}`);
            outFile.create({ intermediates: true, overwrite: true });

            const pull = pullSessionToFile(sessionId, outFile);
            pull.catch(() => {});
            const [, pulled] = await Promise.all([feed, pull]);
            await pgpCryptoService.execute('fileOpEnd', { sessionId });

            const savedUri = await saveToDownloads(outName, outFile.uri);
            return { fileUri: outFile.uri, fileName: outName, totalBytes: pulled.totalBytes, verified: pulled.verified ?? verified, sha256: pulled.sha256, savedUri };
        } catch (error) {
            await pgpCryptoService.execute('fileOpEnd', { sessionId }).catch(() => {});
            throw error;
        }
    },
};
