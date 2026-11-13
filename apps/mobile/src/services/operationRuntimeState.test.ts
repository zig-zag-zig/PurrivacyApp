import { afterEach, describe, expect, it } from 'vitest';

import {
    armOperationLockGrace,
    clearOperationLockGrace,
    getRemainingOperationLockGraceMs,
    OPERATION_LOCK_GRACE_MS,
    setActiveOperationCount,
    shouldDeferInactivityLockForActiveOperations,
} from './operationRuntimeState';

describe('operationRuntimeState', () => {
    afterEach(() => {
        setActiveOperationCount(0);
        clearOperationLockGrace();
    });

    it('never defers when no operation is active', () => {
        armOperationLockGrace(1000);
        expect(shouldDeferInactivityLockForActiveOperations(1000)).toBe(false);
    });

    it('defers only after backgrounding armed the window, and only for the bounded window', () => {
        setActiveOperationCount(1);
        expect(shouldDeferInactivityLockForActiveOperations(1000)).toBe(false);

        armOperationLockGrace(1000);
        expect(shouldDeferInactivityLockForActiveOperations(1000)).toBe(true);
        expect(shouldDeferInactivityLockForActiveOperations(1000 + OPERATION_LOCK_GRACE_MS - 1)).toBe(true);
        expect(getRemainingOperationLockGraceMs(1000 + 60_000)).toBe(OPERATION_LOCK_GRACE_MS - 60_000);

        // Once the grace cap is reached, the normal lock posture wins even if
        // an operation is still marked active.
        expect(shouldDeferInactivityLockForActiveOperations(1000 + OPERATION_LOCK_GRACE_MS)).toBe(false);
        expect(getRemainingOperationLockGraceMs(1000 + OPERATION_LOCK_GRACE_MS)).toBe(0);
    });

    it('clears the window on foreground return or when operations finish', () => {
        setActiveOperationCount(2);
        armOperationLockGrace(5000);
        expect(shouldDeferInactivityLockForActiveOperations(6000)).toBe(true);

        clearOperationLockGrace();
        expect(shouldDeferInactivityLockForActiveOperations(6000)).toBe(false);

        armOperationLockGrace(6000);
        expect(shouldDeferInactivityLockForActiveOperations(7000)).toBe(true);

        setActiveOperationCount(0);
        expect(shouldDeferInactivityLockForActiveOperations(7000)).toBe(false);
    });

    it('arms only once per background transition', () => {
        setActiveOperationCount(1);
        armOperationLockGrace(1000);
        armOperationLockGrace(2000);
        expect(getRemainingOperationLockGraceMs(1000 + 60_000)).toBe(OPERATION_LOCK_GRACE_MS - 60_000);
    });
});