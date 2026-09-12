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

const bytesToBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, 'base64'));

const newSessionId = (): string =>
    `fileop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Stream a source file into the WebView session as base64 chunks. */
async function pushFileToSession(fileUri: string, sessionId: string): Promise<void> {
    await pgpCryptoService.execute('fileOpBegin', { sessionId });
    const source = new File(fileUri);
    const reader = source.stream().getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            // Feed in CHUNK_BYTES slices regardless of the stream's chunking.
            for (let off = 0; off < value.length; off += CHUNK_BYTES) {
                const slice = value.subarray(off, Math.min(off + CHUNK_BYTES, value.length));
                await pgpCryptoService.execute('fileOpChunk', {
                    sessionId,
                    base64: bytesToBase64(slice),
                });
            }
        }
    } finally {
        reader.releaseLock();
    }
}

interface FileHandleLike {
    writeBytes: (bytes: Uint8Array) => void;
    close: () => void;
}

/** Read the WebView session output buffer back and write it to a file. */
async function writeSessionToFile(
    sessionId: string,
    totalBytes: number,
    outFile: File,
): Promise<void> {
    outFile.create({ intermediates: true, overwrite: true });
    const handle = outFile.open(FileMode.WriteOnly) as FileHandleLike;
    try {
        for (let offset = 0; offset < totalBytes; offset += CHUNK_BYTES) {
            const length = Math.min(CHUNK_BYTES, totalBytes - offset);
            const { base64 } = await pgpCryptoService.execute('fileOpResultChunk', {
                sessionId,
                offset,
                length,
            });
            handle.writeBytes(base64ToBytes(base64));
        }
    } finally {
        handle.close();
        await pgpCryptoService.execute('fileOpEnd', { sessionId });
    }
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
     * Encrypt a file to `.pgp` for the given recipients. Reads the source file
     * in chunks, encrypts `format:'binary'`, and writes
     * `<name>.pgp` to the cache dir.
     */
    async encryptFile(
        sourceFileUri: string,
        sourceFileName: string,
        publicKeys: string[],
        signOptions?: PrivateKeyAndPassphrase,
    ): Promise<FileEncryptResult> {
        const sessionId = newSessionId();
        try {
            await pushFileToSession(sourceFileUri, sessionId);
            const { totalBytes } = await pgpCryptoService.execute('fileOpEncrypt', {
                sessionId,
                publicKeys,
                filename: sourceFileName,
                signOptions,
            });

            const outName = `${sourceFileName.replace(/\.[^.]*$/, '') || 'encrypted'}.pgp`;
            const outFile = new File(Paths.cache, `purrivacy-${Date.now()}-${outName}`);
            await writeSessionToFile(sessionId, totalBytes, outFile);
            return { fileUri: outFile.uri, fileName: outName, totalBytes };
        } catch (error) {
            await pgpCryptoService.execute('fileOpEnd', { sessionId }).catch(() => {});
            throw error;
        }
    },

    /**
     * Decrypt a `.pgp` file back to its original bytes. Recovers the original
     * filename from the literal packet and writes it to the cache dir.
     */
    async decryptFile(
        sourceFileUri: string,
        privateKey: string,
        passphrase: string,
        publicKeyForVerification?: string,
    ): Promise<FileDecryptResult> {
        const sessionId = newSessionId();
        try {
            await pushFileToSession(sourceFileUri, sessionId);
            const { totalBytes, filename, verified } = await pgpCryptoService.execute('fileOpDecrypt', {
                sessionId,
                privateKey,
                passphrase,
                publicKeyForVerification,
            });

            const outName = filename || `decrypted-${Date.now()}.bin`;
            const outFile = new File(Paths.cache, `purrivacy-${outName}`);
            await writeSessionToFile(sessionId, totalBytes, outFile);
            return { fileUri: outFile.uri, fileName: outName, totalBytes, verified };
        } catch (error) {
            await pgpCryptoService.execute('fileOpEnd', { sessionId }).catch(() => {});
            throw error;
        }
    },
};
