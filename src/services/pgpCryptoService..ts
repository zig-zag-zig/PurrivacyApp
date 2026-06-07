import { DecryptionResult, KeyGenerationOptions, KeyMetadata, PrivateKeyAndPassphrase, PublicAndPrivateKey } from "../types/types";
import { logger } from "../utils/logger";

export interface PGPExecutor {
    executePGPOperation: (operation: string, data: any) => Promise<any>;
}

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

        try {
            // Use a short timeout for health check
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Health check timeout')), 3000)
            );

            // Try a simple ping operation
            await Promise.race([
                this.executor.executePGPOperation('ping', {}),
                timeoutPromise
            ]);
            return true;
        } catch (error) {
            logger.warn('pgp executor health check failed', { error });
            return false;
        }
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
            // Add timeout to prevent infinite waiting
            const timeoutId = setTimeout(() => {
                const index = this.readyCallbacks.indexOf(resolve);
                if (index > -1) {
                    this.readyCallbacks.splice(index, 1);
                }
                reject(new Error('Service initialization timeout'));
            }, 10000); // 10 second timeout

            this.readyCallbacks.push(() => {
                clearTimeout(timeoutId);
                resolve();
            });
        });
    }

    private async executeOperation<T>(operation: string, data: any): Promise<T> {
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
