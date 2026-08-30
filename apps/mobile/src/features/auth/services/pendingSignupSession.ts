import type { PendingSignupPayload } from '../../../native/autofillCommit';

/**
 * Ephemeral, in-process coordinator for the signup secret handoff
 * (APP-SEC-007).
 *
 * Signup secrets (recovery seed, account password) must never travel through
 * navigation state, route params, or any persistent storage. This module
 * keeps them in a single module-scoped object with a short TTL, cleared on
 * consume/cancel and on read after expiry. Nothing here is serialized.
 */

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PendingSignupSession {
    payload: PendingSignupPayload;
    createdAt: number;
}

let session: PendingSignupSession | null = null;

const isExpired = (entry: PendingSignupSession): boolean =>
    Date.now() - entry.createdAt >= SESSION_TTL_MS;

export const pendingSignupSession = {
    /** Stores the pending signup secrets in memory. */
    set(payload: PendingSignupPayload): void {
        session = { payload: { ...payload }, createdAt: Date.now() };
    },

    /**
     * Returns the pending signup and clears it (single read). Returns null
     * when absent or expired; expired sessions are discarded.
     */
    consume(): PendingSignupPayload | null {
        if (!session) {
            return null;
        }
        const current = session;
        session = null;
        if (isExpired(current)) {
            return null;
        }
        return current.payload;
    },

    /** Discards any pending signup (cancel/background/failure paths). */
    clear(): void {
        session = null;
    },

    /** True when a non-expired pending signup exists. */
    has(): boolean {
        if (!session) {
            return false;
        }
        if (isExpired(session)) {
            session = null;
            return false;
        }
        return true;
    },
};
