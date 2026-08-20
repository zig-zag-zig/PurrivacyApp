import {
    clearLastActiveTime as clearStoredLastActiveTime,
    getLastActiveTime,
    setLastActiveTime as storeLastActiveTime,
} from '../../../utils/stores/activityMetadataStore';

const timeoutInMinutes = 15
let timeoutId: NodeJS.Timeout | null = null;

const getInactiveDuration = async (userId: string) => {
    const lastActiveTime = await getLastActiveTime(userId);
    if (!lastActiveTime) return 0;

    return Date.now() - lastActiveTime;
};

export const inactiveTooLong = async (userId: string) => {
    const inactiveDuration = await getInactiveDuration(userId);
    return inactiveDuration >= timeoutInMinutes * 60 * 1000
};

const setLastActiveTime = (userId: string) => storeLastActiveTime(userId, Date.now());

export const clearLastActiveTime = (userId: string) => clearStoredLastActiveTime(userId);

export const resetSessionTimer = async (userId: string, onExpire: () => void, timeoutMinutes = timeoutInMinutes) => {
    if (timeoutId) clearTimeout(timeoutId);
    await setLastActiveTime(userId);
    timeoutId = setTimeout(onExpire, timeoutMinutes * 60 * 1000);
};

export const clearSessionTimer = () => {
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
};
