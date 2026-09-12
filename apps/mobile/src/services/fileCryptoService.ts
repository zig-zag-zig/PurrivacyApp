import { Buffer } from 'buffer';
import { File, FileMode, Paths } from 'expo-file-system';

import { pgpCryptoService } from './pgpCryptoService';
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

const bytesToBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, 'base64'));

const newSessionId = (): string =>
    `fileop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Stream a source file into the WebView session as base64 chunks, then signal
 * end-of-input. The session must already exist (`fileOpBegin` done by caller).
 */
async function feedFileToSession(fileUri: string, sessionId: string): Promise<void> {
    const source = new File(fileUri);
    const reader = source.stream().getReader();
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
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            // Feed in CHUNK_BYTES slices regardless of the stream's chunking.
            for (let off = 0; off < value.length; off += CHUNK_BYTES) {
                const slice = value.subarray(off, Math.min(off + CHUNK_BYTES, value.length));
                await waitForCapacity();
                await pgpCryptoService.execute('fileOpChunk', {
                    sessionId,
                    base64: bytesToBase64(slice),
                });
            }
        }
    } finally {
        reader.releaseLock();
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
 ): Promise<{ totalBytes: number; verified?: boolean | null }> {
    const handle = outFile.open(FileMode.WriteOnly) as FileHandleLike;
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
    return { totalBytes: written, verified };
}

export interface FileEncryptResult {
    /** file:// URI of the written .pgp output. */
    fileUri: string;
    fileName: string;
    totalBytes: number;
}

export interface FileDecryptResult {
    fileUri: string;
    /** The original filename recovered from the PGP literal packet. */
    fileName: string;
    totalBytes: number;
    verified: boolean | null;
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

            const outName = `${sourceFileName.replace(/\.[^.]*$/, '') || 'encrypted'}.pgp`;
            const outFile = new File(Paths.cache, `purrivacy-${Date.now()}-${outName}`);
            outFile.create({ intermediates: true, overwrite: true });

            // Feed plaintext in while pulling ciphertext out. The WebView
            // handles each bridge call async, so a pending output pull doesn't
            // block incoming input chunks — the two interleave naturally.
            const feed = feedFileToSession(sourceFileUri, sessionId);
            const { totalBytes } = await pullSessionToFile(sessionId, outFile);
            await feed;
            await pgpCryptoService.execute('fileOpEnd', { sessionId });

            return { fileUri: outFile.uri, fileName: outName, totalBytes };
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
            const { filename, verified } = await pgpCryptoService.execute('fileOpDecrypt', {
                sessionId,
                privateKey,
                passphrase,
                publicKeyForVerification,
            });

            const outName = filename || `decrypted-${Date.now()}.bin`;
            const outFile = new File(Paths.cache, `purrivacy-${outName}`);
            outFile.create({ intermediates: true, overwrite: true });

            const pulled = await pullSessionToFile(sessionId, outFile);
            await feed;
            await pgpCryptoService.execute('fileOpEnd', { sessionId });

            return { fileUri: outFile.uri, fileName: outName, totalBytes: pulled.totalBytes, verified: pulled.verified ?? verified };
        } catch (error) {
            await pgpCryptoService.execute('fileOpEnd', { sessionId }).catch(() => {});
            throw error;
        }
    },
};
