import { env } from '../../../config/env';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { createLogger } from '../../../utils/logger';
import { TransitionProgress, TransitionStore } from '../../../core/transitions/transitionRunner';
import { getMfaTransitionCollection } from './mfaRefs';

const logger = createLogger('features.mfa.transition');

/**
 * How long a failed transition may be resumed before it is treated as a
 * fresh attempt. Must comfortably cover client-side retry behavior.
 */
export const MFA_TRANSITION_TTL_MS = 15 * 60 * 1000;

interface EncryptedTransitionResult {
    encryptedData: string;
    iv: string;
    tag: string;
}

interface StoredTransitionDoc {
    transitionKey: string;
    userId: string;
    createdAt: number;
    expiresAt: number;
    steps: Record<string, { completedAt: string; result?: EncryptedTransitionResult }>;
}

const encryptResult = (result: unknown): EncryptedTransitionResult =>
    CryptoUtils.encryptSecret(JSON.stringify(result), env.mfaKek);

const decryptResult = (encrypted: EncryptedTransitionResult): unknown => {
    const plaintext = CryptoUtils.decryptSecret(
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        env.mfaKek,
    );
    return JSON.parse(plaintext);
};

/**
 * Firestore-backed progress store for MFA state transitions (API-SEC-008).
 *
 * The document is keyed by a hash of the transition key (following the
 * mfaSetupNonce hash-keying pattern), so the transition identity is not
 * stored in plaintext. Step results are encrypted with the MFA KEK before
 * being written — the persisted result of an MFA transition is the raw
 * session response and must never be stored in plaintext. The document is
 * deleted when the transition completes and expires (TTL) otherwise.
 */
export class MfaTransitionStore implements TransitionStore {
    constructor(
        private readonly transitionKey: string,
        private readonly userId: string,
    ) {}

    private get ref(): FirebaseFirestore.DocumentReference {
        return getMfaTransitionCollection().doc(CryptoUtils.sha256(this.transitionKey));
    }

    async read(): Promise<TransitionProgress | null> {
        const doc = await this.ref.get();
        if (!doc.exists) {
            return null;
        }

        const data = doc.data() as StoredTransitionDoc | undefined;
        if (!data || data.userId !== this.userId) {
            return null;
        }

        if (typeof data.expiresAt !== 'number' || data.expiresAt <= Date.now()) {
            return null;
        }

        const steps: Record<string, { completedAt: string; result?: unknown }> = {};
        for (const [name, stored] of Object.entries(data.steps ?? {})) {
            if (!stored) {
                continue;
            }

            let result: unknown;
            if (stored.result) {
                try {
                    result = decryptResult(stored.result);
                } catch (error) {
                    // Undecryptable result (e.g. the KEK changed between
                    // attempts): treat the whole transition as fresh so a
                    // stale document can never be resumed.
                    logger.warn('failed to decrypt stored transition result; discarding progress', {
                        userId: this.userId,
                        error,
                    });
                    return null;
                }
            }

            steps[name] = {
                completedAt: stored.completedAt,
                ...(result !== undefined ? { result } : {}),
            };
        }

        return { steps, expiresAt: data.expiresAt };
    }

    async complete(stepName: string, result?: unknown): Promise<void> {
        const doc = await this.ref.get();
        const existing = doc.exists ? (doc.data() as StoredTransitionDoc | undefined) : undefined;
        const now = Date.now();
        const steps: StoredTransitionDoc['steps'] = { ...(existing?.steps ?? {}) };
        steps[stepName] = {
            completedAt: new Date().toISOString(),
            ...(result !== undefined ? { result: encryptResult(result) } : {}),
        };

        await this.ref.set({
            transitionKey: this.transitionKey,
            userId: this.userId,
            createdAt: existing?.createdAt ?? now,
            expiresAt: existing?.expiresAt ?? now + MFA_TRANSITION_TTL_MS,
            steps,
        } satisfies StoredTransitionDoc);
    }

    async clear(): Promise<void> {
        await this.ref.delete();
    }
}
