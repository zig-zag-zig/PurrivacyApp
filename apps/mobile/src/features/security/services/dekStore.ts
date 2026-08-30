import {
    BIOMETRIC_DEK_KEY_PREFIX,
    BIOMETRIC_DEK_PREFIX,
    DEK_EXISTS_PREFIX,
    DEK_PREFIX,
    deleteSecureStoreItem,
    handleSecureStorageResponse,
} from '../domain/secureStorageUtils';
import { logger } from '../../../utils/logger';
import {
    biometricKeyExists,
    getNonSensitiveValue,
    hasBiometricProtectedStorage,
    isBiometricAuthCancelled,
    SecureStorageModule,
    setNonSensitiveValue,
} from './biometricSecureStorage';

const dekCache = new Map<string, string>();

const biometricDekStorageKey = (userId: string) => `${BIOMETRIC_DEK_PREFIX}${userId}`;
const biometricDekKeyAlias = (userId: string) => `${BIOMETRIC_DEK_KEY_PREFIX}${userId}`;
const dekExistsKey = (userId: string) => `${DEK_EXISTS_PREFIX}${userId}`;

export const setDek = async (userId: string, value: string): Promise<void> => {
    if (value.trim() === '' || userId.trim() === '') return;
    dekCache.set(userId, value);
};

export const persistCachedDekWithBiometric = async (
    userId: string,
    promptMessage = 'Authenticate to enable biometric unlock',
): Promise<boolean> => {
    const hasStorage = hasBiometricProtectedStorage();

    if (userId.trim() === '' || !hasStorage) {
        return false;
    }
    const dek = dekCache.get(userId);
    if (!dek) {
        return false;
    }

    try {
        const response = await SecureStorageModule.setBiometricProtectedValue!(
            biometricDekKeyAlias(userId),
            biometricDekStorageKey(userId),
            dek,
            promptMessage,
        );
        const error = await handleSecureStorageResponse(
            response,
            'store biometric DEK',
            undefined,
            (code, message) => ({ code, message }),
        );
        if (error) {
            if (isBiometricAuthCancelled(error)) {
                throw error;
            }
            return false;
        }

        await setNonSensitiveValue(dekExistsKey(userId), 'true');
        await deleteSecureStoreItem('sensitive', `${DEK_PREFIX}${userId}`);
        return true;
    } catch (error: any) {
        if (isBiometricAuthCancelled(error)) {
            throw error;
        }
        logger.warn('failed to store biometric DEK', { error });
        return false;
    }
};

export const hasDek = async (userId: string): Promise<boolean> => {
    if (userId.trim() === '') return false;
    if (dekCache.has(userId)) {
        return true;
    }
    const markerExists = await getNonSensitiveValue(dekExistsKey(userId)) === 'true';
    const hasStorage = hasBiometricProtectedStorage();
    const keyExists = hasStorage && await biometricKeyExists(biometricDekKeyAlias(userId));
    return markerExists && hasStorage && keyExists;
};

export const hasBiometricDek = async (userId: string): Promise<boolean> => {
    if (userId.trim() === '') return false;
    const markerExists = await getNonSensitiveValue(dekExistsKey(userId)) === 'true';
    const hasStorage = hasBiometricProtectedStorage();
    const keyExists = hasStorage && await biometricKeyExists(biometricDekKeyAlias(userId));
    return markerExists && hasStorage && keyExists;
};

export const unlockDekWithBiometric = async (
    userId: string,
    promptMessage: string,
): Promise<string | null> => {
    if (userId.trim() === '' || promptMessage.trim() === '') return null;
    const cached = dekCache.get(userId);
    if (cached) {
        return cached;
    }

    const markerExists = await getNonSensitiveValue(dekExistsKey(userId)) === 'true';
    const hasStorage = hasBiometricProtectedStorage();
    const keyExists = hasStorage && await biometricKeyExists(biometricDekKeyAlias(userId));

    if (markerExists && hasStorage && keyExists) {
        try {
            const response = await SecureStorageModule.getBiometricProtectedValue!(
                biometricDekKeyAlias(userId),
                biometricDekStorageKey(userId),
                promptMessage,
            );
            const error = await handleSecureStorageResponse(
                response,
                'get biometric DEK',
                undefined,
                (code, message) => ({ code, message }),
            );
            if (error) {
                if (isBiometricAuthCancelled(error)) {
                    throw error;
                }
                return null;
            }

            const result = await handleSecureStorageResponse(response, 'get biometric DEK', value => value);
            if (result) {
                dekCache.set(userId, result);
                return result;
            }
        } catch (error: any) {
            if (isBiometricAuthCancelled(error)) {
                throw error;
            }
            logger.warn('failed to unlock biometric DEK', { error });
            return null;
        }
    }
    return null;
};

export const getDek = async (userId: string): Promise<string | null> => {
    if (userId.trim() === '') return null;
    return dekCache.get(userId) ?? null;
};

export const clearDek = async (userId: string): Promise<void> => {
    if (userId.trim() === '') return;
    dekCache.delete(userId);
    await deleteSecureStoreItem('sensitive', `${DEK_PREFIX}${userId}`);
    await deleteSecureStoreItem('sensitive', biometricDekStorageKey(userId));
    await deleteSecureStoreItem('pgp', biometricDekKeyAlias(userId));
    await deleteSecureStoreItem('non-sensitive', dekExistsKey(userId));
};

export const clearBiometricDek = async (userId: string): Promise<void> => {
    if (userId.trim() === '') return;
    await deleteSecureStoreItem('sensitive', biometricDekStorageKey(userId));
    await deleteSecureStoreItem('pgp', biometricDekKeyAlias(userId));
    await deleteSecureStoreItem('non-sensitive', dekExistsKey(userId));
};

export const clearDekCache = (userId: string): void => {
    dekCache.delete(userId);
};
