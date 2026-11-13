/**
 * Shared runtime tracker for active long-running operations and the bounded
 * inactivity-lock grace window.
 *
 * Backgrounding alone never cancels an operation or locks the vault: the app
 * locks when the inactivity timeout elapses (or on return, if it elapsed while
 * backgrounded). The grace window only matters when that timeout fires while a
 * user-started operation is still running — it defers the lock for a few
 * minutes so a long key generation or file operation is not cut off at the
 * boundary. The window is deliberately capped: a hung operation must not keep
 * decrypted session state alive indefinitely.
 */

export const OPERATION_LOCK_GRACE_MS = 5 * 60 * 1000;
export const OPERATION_LOCK_RECHECK_MS = 30 * 1000;

let activeOperations = 0;
let graceStartedAt: number | null = null;

/** Track how many long-running operations are currently registered. */
export function setActiveOperationCount(count: number): void {
    activeOperations = Math.max(0, Math.floor(count));
    if (activeOperations === 0) {
        graceStartedAt = null;
    }
}

/** Start the bounded lock-deferral window (app moved to background with work). */
export function armOperationLockGrace(now = Date.now()): void {
    if (activeOperations > 0 && graceStartedAt === null) {
        graceStartedAt = now;
    }
}

/** Cancel any deferral (app returned to foreground, or no operations remain). */
export function clearOperationLockGrace(): void {
    graceStartedAt = null;
}

/**
 * True while at least one operation is active and the bounded deferral window
 * armed on backgrounding has not elapsed.
 */
export function shouldDeferInactivityLockForActiveOperations(now = Date.now()): boolean {
    if (activeOperations <= 0 || graceStartedAt === null) {
        return false;
    }

    return now - graceStartedAt < OPERATION_LOCK_GRACE_MS;
}

export function getRemainingOperationLockGraceMs(now = Date.now()): number {
    if (!shouldDeferInactivityLockForActiveOperations(now) || graceStartedAt === null) {
        return 0;
    }

    return Math.max(1000, OPERATION_LOCK_GRACE_MS - (now - graceStartedAt));
}