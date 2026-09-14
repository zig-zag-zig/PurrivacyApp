import { Buffer } from 'buffer';
import { File, FileMode, Paths } from 'expo-file-system';

import { pgpCryptoService } from './pgpCryptoService';
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

// ~256KB of binary per chunk ≈ 341KB base64 — comfortably inside the
// injectJavaScript string limit while keeping call count low.
const CHUNK_BYTES = 256 * 1024;
// Cap queued input chunks in the WebView so feeding a large file can't grow
// the session buffer unboundedly — apply backpressure once this many are
// pending consumption by the crypto stream.
const MAX_QUEUED_CHUNKS = 4;
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
async function feedFileToSession(fileUri: string, sessionId: string): Promise<string> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const hasher = createSha256Hasher();
    const waitForCapacity = async () => {
        // Apply backpressure: hold off pushing while the WebView already has
        // MAX_QUEUED_CHUNKS buffered, so a large file can't fill its heap.
        for (;;) {
            const { queueDepth } = await pgpCryptoService.execute('fileOpStatus', { sessionId });
            if (queueDepth < MAX_QUEUED_CHUNKS) return;
            await new Promise(r => setTimeout(r, 8));
        }
    };
    try {
        const source = new File(fileUri);
        const info = source.info();
        if (info.size !== undefined && info.size > MAX_FILE_BYTES) {
            throw new Error('File is larger than the 100 MB limit');
        }
        reader = source.stream().getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            // Feed in CHUNK_BYTES slices regardless of the stream's chunking.
            for (let off = 0; off < value.length; off += CHUNK_BYTES) {
                const slice = value.subarray(off, Math.min(off + CHUNK_BYTES, value.length));
                hasher.update(slice);
                await waitForCapacity();
                await pgpCryptoService.execute('fileOpChunk', {
                    sessionId,
                    base64: bytesToBase64(slice),
                });
            }
        }
        return hasher.digestHex();
    } finally {
        // Always close the input side — otherwise the crypto stream waits for
        // more input forever and the output pull deadlocks.
        if (reader) {
            try { reader.releaseLock(); } catch { /* ignore */ }
        }
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
    /** file:// URI of the written .pgp output. */
    fileUri: string;
    fileName: string;
    totalBytes: number;
    /** SHA-256 of the produced ciphertext (hex). */
    sha256: string;
    /** SHA-256 of the plaintext that was encrypted (hex). */
    sourceSha256: string;
}

export interface FileDecryptResult {
    fileUri: string;
    /** The original filename recovered from the PGP literal packet. */
    fileName: string;
    totalBytes: number;
    verified: boolean | null;
    /** SHA-256 of the decrypted bytes (hex) — compare against the source. */
    sha256: string;
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
            const feed = feedFileToSession(sourceFileUri, sessionId);
            const pull = pullSessionToFile(sessionId, outFile);
            // Observe both so a feed failure surfaces instead of hiding behind
            // the pull's timeout, and so neither rejects unhandled.
            feed.catch(() => {});
            pull.catch(() => {});
            const [sourceSha256, { totalBytes, sha256 }] = await Promise.all([feed, pull]);
            await pgpCryptoService.execute('fileOpEnd', { sessionId });

            lastEncryptedFile = { uri: outFile.uri, name: outName, sourceSha256 };
            return { fileUri: outFile.uri, fileName: outName, totalBytes, sha256, sourceSha256 };
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
    ): Promise<FileDecryptResult> {
        const sessionId = newSessionId();
        try {
            await pgpCryptoService.execute('fileOpBegin', { sessionId });
            // Start feeding before parsing the streaming message.
            const feed = feedFileToSession(sourceFileUri, sessionId);
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

            return { fileUri: outFile.uri, fileName: outName, totalBytes: pulled.totalBytes, verified: pulled.verified ?? verified, sha256: pulled.sha256 };
        } catch (error) {
            await pgpCryptoService.execute('fileOpEnd', { sessionId }).catch(() => {});
            throw error;
        }
    },
};
