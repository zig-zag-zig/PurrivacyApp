import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/stores/activityMetadataStore', () => ({
    getLastActiveTime: vi.fn(),
    setLastActiveTime: vi.fn(),
    clearLastActiveTime: vi.fn(),
}));

import { getLastActiveTime } from '../../../utils/stores/activityMetadataStore';
import {
    armOperationLockGrace,
    clearOperationLockGrace,
    OPERATION_LOCK_GRACE_MS,
    setActiveOperationCount,
} from '../../../services/operationRuntimeState';
import {
    clearSessionTimer,
    inactiveTooLong,
    resetSessionTimer,
} from './activityService';

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

describe('activityService operation lock grace', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        vi.mocked(getLastActiveTime).mockResolvedValue(Date.now() - INACTIVITY_TIMEOUT_MS - 60_000);
        setActiveOperationCount(0);
        clearOperationLockGrace();
        clearSessionTimer();
    });

    afterEach(() => {
        clearSessionTimer();
        setActiveOperationCount(0);
        clearOperationLockGrace();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('reports inactivity normally when no operation grace is armed', async () => {
        await expect(inactiveTooLong('user')).resolves.toBe(true);
    });

    it('suppresses lock while an operation is active inside the grace window', async () => {
        setActiveOperationCount(1);
        armOperationLockGrace();

        await expect(inactiveTooLong('user')).resolves.toBe(false);
    });

    it('resumes normal locking once the bounded grace window expires', async () => {
        setActiveOperationCount(1);
        armOperationLockGrace();

        vi.advanceTimersByTime(OPERATION_LOCK_GRACE_MS);

        await expect(inactiveTooLong('user')).resolves.toBe(true);
    });

    it('defers a due session-expiry timer and fires it when the grace window ends', async () => {
        const onExpire = vi.fn();
        setActiveOperationCount(1);
        armOperationLockGrace();

        // A 1-minute timer fires while the 5-minute grace window is active.
        await resetSessionTimer('user', onExpire, 1);
        vi.advanceTimersByTime(60_000);
        expect(onExpire).not.toHaveBeenCalled();

        // Re-checks are scheduled in <=30s slices until the window ends.
        vi.advanceTimersByTime(OPERATION_LOCK_GRACE_MS);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });
});