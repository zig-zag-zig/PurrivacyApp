import {
    clearLastActiveTime as clearStoredLastActiveTime,
    getLastActiveTime,
    setLastActiveTime as storeLastActiveTime,
} from '../../../utils/stores/activityMetadataStore';
import {
    getRemainingOperationLockGraceMs,
    OPERATION_LOCK_RECHECK_MS,
    shouldDeferInactivityLockForActiveOperations,
} from '../../../services/operationRuntimeState';

const timeoutInMinutes = 15
let timeoutId: NodeJS.Timeout | null = null;

const getInactiveDuration = async (userId: string) => {
    const lastActiveTime = await getLastActiveTime(userId);
    if (!lastActiveTime) return 0;

    return Date.now() - lastActiveTime;
};

export const inactiveTooLong = async (userId: string) => {
    if (shouldDeferInactivityLockForActiveOperations()) {
        return false;
    }

    const inactiveDuration = await getInactiveDuration(userId);
    return inactiveDuration >= timeoutInMinutes * 60 * 1000
};

const setLastActiveTime = (userId: string) => storeLastActiveTime(userId, Date.now());

export const clearLastActiveTime = (userId: string) => clearStoredLastActiveTime(userId);

const scheduleSessionExpiry = (onExpire: () => void, delayMs: number) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        if (shouldDeferInactivityLockForActiveOperations()) {
            const nextDelay = Math.min(getRemainingOperationLockGraceMs(), OPERATION_LOCK_RECHECK_MS);
            scheduleSessionExpiry(onExpire, nextDelay);
            return;
        }
        onExpire();
    }, delayMs);
};

export const resetSessionTimer = async (userId: string, onExpire: () => void, timeoutMinutes = timeoutInMinutes) => {
    if (timeoutId) clearTimeout(timeoutId);
    await setLastActiveTime(userId);
    scheduleSessionExpiry(onExpire, timeoutMinutes * 60 * 1000);
};

export const clearSessionTimer = () => {
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
};
