import {
    deleteSecureStoreItem,
    handleSecureStorageResponse,
    LOCAL_LOCK_PREFIX,
} from '../domain/secureStorageUtils';
import { SecureStorageModule } from './biometricSecureStorage';

export const setLocalSessionLocked = async (userId: string, locked: boolean): Promise<void> => {
    if (userId.trim() === '') return;

    const key = `${LOCAL_LOCK_PREFIX}${userId}`;
    if (!locked) {
        await deleteSecureStoreItem('sensitive', key);
        return;
    }

    const response = await SecureStorageModule.setSensitiveValue(key, 'true');
    const error = await handleSecureStorageResponse(
        response,
        'set local session lock',
        undefined,
        (code, message) => ({ code, message }),
    );
    if (error) {
        throw new Error(error.message);
    }
};

export const isLocalSessionLocked = async (userId: string): Promise<boolean> => {
    if (userId.trim() === '') return false;

    try {
        const response = await SecureStorageModule.getSensitiveValue(`${LOCAL_LOCK_PREFIX}${userId}`);
        if (response?.success === false) {
            return true;
        }

        return response?.value === 'true';
    } catch {
        return true;
    }
};

