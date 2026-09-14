import { DecryptionResult, KeyGenerationOptions, KeyMetadata, PrivateKeyAndPassphrase, PublicAndPrivateKey } from "../types/types";
import { logger } from "../utils/logger";
import type {
    PgpOperationName,
    PgpOperationResponse,
    PgpRequestMap,
    RevokedKeyResult,
} from "./pgpProtocol";

/**
 * The WebView-backed PGP executor. Operations and payloads are statically
 * correlated through `PgpRequestMap`/`PgpResponseMap`: calling
 * `executePGPOperation('encryptMessage', ...)` yields a `Promise<string>`,
 * and the response is runtime-validated before it is resolved.
 */
export interface PGPExecutor {
    executePGPOperation<T extends PgpOperationName>(
        operation: T,
        data: PgpRequestMap[T]['data'],
    ): Promise<PgpOperationResponse<T>>;
}

/**
 * File-session ops that run hundreds of times per operation (one per 256KB
 * chunk plus status polls). These skip the per-call health-check ping: the
 * session's opening ops (fileOpBegin/fileOpEncrypt/fileOpDecrypt) still
 * health-check, and if the executor dies mid-session the next bridge call
 * fails with a normal timeout — a surfaced error, not a silent hang. Without
 * this, every chunk pays an extra bridge roundtrip and large files crawl.
 */
const PING_FREE_OPS: ReadonlySet<PgpOperationName> = new Set([
    'fileOpChunk',
    'fileOpChunkBatch',
    'fileOpStatus',
    'fileOpResultChunk',
    'fileOpFinishInput',
    'fileOpEnd',
]);

class PgpCryptoService {
    private executor: PGPExecutor | null = null;
    private isReady = false;
    private readyCallbacks: (() => void)[] = [];

    // Set the executor (this will be called by React code)
    setExecutor(executor: PGPExecutor) {
        this.executor = executor;
        this.isReady = true;
        this.readyCallbacks.forEach(callback => {
            callback();
        });
        this.readyCallbacks = [];
    }

    clearExecutor() {
        this.executor = null;
        this.isReady = false;
    }

    // Health check to verify executor is still alive
    private async healthCheck(): Promise<boolean> {
        if (!this.executor) {
            return false;
        }

        // A single failed ping usually means the WebView is still loading its
        // bundle (handlePGPOperation not defined yet), not that it is dead —
        // so retry briefly before letting the caller reset the executor.
        const attempts = 4;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), 3000)
                );

                await Promise.race([
                    this.executor.executePGPOperation('ping', undefined),
                    timeoutPromise
                ]);
                return true;
            } catch (error) {
                if (attempt === attempts - 1) {
                    logger.warn('pgp executor health check failed', { error });
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return false;
    }

    // Add timeout protection
    private async ensureReady(): Promise<void> {
        // If we think we're ready, verify with health check
        if (this.isReady) {
            const healthy = await this.healthCheck();
            if (healthy) {
                return;
            } else {
                // Executor is dead, reset state
                logger.warn('pgp executor failed health check, resetting');
                this.isReady = false;
                this.executor = null;
            }
        }

        return new Promise((resolve, reject) => {
            // The WebView registers its executor on mount but only finishes
            // executing the (large) PGP bundle on load, so this wait must cover
            // the load — 10s was too tight on a busy emulator and surfaced as
            // "Service initialization timeout".
            const timeoutId = setTimeout(() => {
                const index = this.readyCallbacks.indexOf(resolve);
                if (index > -1) {
                    this.readyCallbacks.splice(index, 1);
                }
                reject(new Error('Service initialization timeout'));
            }, 30000); // 30 second timeout

            this.readyCallbacks.push(() => {
                clearTimeout(timeoutId);
                resolve();
            });
        });
    }

    /**
     * Public, low-level operation runner. The per-op convenience methods call
     * this; it is exposed for orchestrated ops (e.g. chunked file sessions in
     * fileCryptoService) that issue several calls against one operation set.
     */
    async execute<T extends PgpOperationName>(
        operation: T,
        data: PgpRequestMap[T]['data'],
    ): Promise<PgpOperationResponse<T>> {
        return this.executeOperation(operation, data);
    }

    private async executeOperation<T extends PgpOperationName>(
        operation: T,
        data: PgpRequestMap[T]['data'],
    ): Promise<PgpOperationResponse<T>> {
        // Hot path: session ops against an already-healthy executor skip the
        // per-call ping (see PING_FREE_OPS).
        if (this.isReady && this.executor && PING_FREE_OPS.has(operation)) {
            try {
                return await this.executor.executePGPOperation(operation, data);
            } catch (error) {
                logger.warn('pgp operation failed', { operation, error });
                throw error;
            }
        }

        await this.ensureReady();

        try {
            return await this.executor!.executePGPOperation(operation, data);
        } catch (error) {
            logger.warn('pgp operation failed', { operation, error });
            throw error;
        }
    }

    async generateKeyPair(options: KeyGenerationOptions): Promise<PublicAndPrivateKey> {
        return this.executeOperation('generateKeyPair', options);
    }

    async encryptMessage(
        publicKeys: string[],
        content: string,
        signOptions?: PrivateKeyAndPassphrase
    ): Promise<string> {
        return this.executeOperation('encryptMessage', {
            publicKeys,
            content,
            signOptions
        });
    }

    async decryptMessage(
        encryptedData: string,
        privateKey: string,
        passphrase: string,
        publicKeyForVerification?: string
    ): Promise<DecryptionResult> {
        return this.executeOperation('decryptMessage', {
            encryptedData,
            privateKey,
            passphrase,
            publicKeyForVerification
        });
    }

    async changePassphrase(
        armoredPrivateKey: string,
        oldPassphrase: string,
        newPassphrase: string
    ): Promise<string> {
        return this.executeOperation('changePassphrase', {
            armoredPrivateKey,
            oldPassphrase,
            newPassphrase
        });
    }

    async extractKeyMetadata(armoredKey: string): Promise<KeyMetadata> {
        return this.executeOperation('extractKeyMetadata', { armoredKey });
    }

    async changeExpiration(
        armoredPrivateKey: string,
        passphrase: string,
        days: string
    ): Promise<PublicAndPrivateKey> {
        return this.executeOperation('changeExpiration', {
            armoredPrivateKey,
            passphrase,
            days
        });
    }

    async createDetachedSignature(
        message: string,
        privateKey: string,
        passphrase: string
    ): Promise<string> {
        return this.executeOperation('createDetachedSignature', {
            message,
            privateKey,
            passphrase
        });
    }

    async verifyDetachedSignature(
        signature: string,
        message: string,
        publicKey: string
    ): Promise<boolean> {
        return this.executeOperation('verifyDetachedSignature', {
            signature,
            message,
            publicKey
        });
    }

    async validatePrivateKeyPassphrase(
        privateKey: string,
        passphrase: string
    ): Promise<boolean> {
        return this.executeOperation('validatePrivateKeyPassphrase', {
            privateKey,
            passphrase
        });
    }

    async extractPublicKeyFromPrivate(privateKey: string): Promise<string> {
        return this.executeOperation('extractPublicKeyFromPrivate', { privateKey });
    }

    /**
     * Revoke an own private key. Returns the revoked armored pair (with the
     * revocation signature embedded in the public key) and the standalone
     * revocation certificate for sharing.
     */
    async revokeKey(privateKey: string, passphrase: string): Promise<RevokedKeyResult> {
        return this.executeOperation('revokeKey', { privateKey, passphrase });
    }

    /**
     * Merge an imported revocation certificate into a stored armored public key
     * so the keyring marks it revoked.
     */
    async applyRevocation(publicKey: string, revocationCertificate: string): Promise<string> {
        return this.executeOperation('applyRevocation', { publicKey, revocationCertificate });
    }

    // Debug method to check service status
    getServiceStatus() {
        return {
            isReady: this.isReady,
            hasExecutor: !!this.executor,
            pendingCallbacks: this.readyCallbacks.length
        };
    }
}

export const pgpCryptoService = new PgpCryptoService();
