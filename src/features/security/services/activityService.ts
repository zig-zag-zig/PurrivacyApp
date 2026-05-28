import { storage } from '../../../utils/storage';

const timeoutInMinutes = 15
let timeoutId: NodeJS.Timeout | null = null;

const getInactiveDuration = async (userId: string) => {
    const lastActiveTime = await storage.getItem(`last_active_time${userId}`);
    if (!lastActiveTime) return 0;

    const parsed = Number(lastActiveTime);
    if (!Number.isFinite(parsed)) return 0;

    return Date.now() - parsed;
};

export const inactiveTooLong = async (userId: string) => {
    const inactiveDuration = await getInactiveDuration(userId);
    return inactiveDuration >= timeoutInMinutes * 60 * 1000
};

const setLastActiveTime = async (userId: string) => {
    await storage.setItem(`last_active_time${userId}`, Date.now().toString());
};

export const clearLastActiveTime = async (userId: string) => {
    await storage.removeItem(`last_active_time${userId}`);
};

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
