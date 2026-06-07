import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';

import {
    deleteEncryptedSqliteValue,
    getEncryptedSqliteValue,
    nonSensitiveValueStore,
    setEncryptedSqliteValue,
} from './encryptedSqliteValueStore';

type SecureStorageResponse = {
    success?: boolean;
    value?: string;
    code?: string;
    message?: string;
};

const SQLITE_POINTER_PREFIX = 'purrivacy:sqlite-encrypted:v1:';
const BIOMETRIC_MARKER_PREFIX = 'purrivacy:biometric-marker:';
const SECURE_STORE_KEY_PREFIX = 'purrivacy.secure.';
const SECURE_STORE_VALUE_SOFT_LIMIT = 1500;

const createSuccessResponse = (value?: string | null): SecureStorageResponse => ({
    success: true,
    ...(value !== undefined && value !== null ? { value } : {}),
});

const createErrorResponse = (code: string, message: string): SecureStorageResponse => ({
    success: false,
    code,
    message,
});

const invalidInputResponse = (message: string): SecureStorageResponse => (
    createErrorResponse('INVALID_INPUT', message)
);

const assertInput = (key: string, value?: string): SecureStorageResponse | null => {
    if (key.trim() === '') {
        return invalidInputResponse('Key cannot be empty');
    }
    if (value !== undefined && value.trim() === '') {
        return invalidInputResponse('Key and value cannot be empty');
    }
    return null;
};

const secureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} satisfies SecureStore.SecureStoreOptions;

export const toSecureStoreKey = (key: string): string => (
    `${SECURE_STORE_KEY_PREFIX}${Buffer.from(key, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')}`
);

const biometricMarkerKey = (keyAlias: string): string => `${BIOMETRIC_MARKER_PREFIX}${keyAlias}`;
const sqlitePointerForKey = (key: string): string => `${SQLITE_POINTER_PREFIX}${key}`;
const isSqlitePointer = (value: string | null): boolean => (
    typeof value === 'string' && value.startsWith(SQLITE_POINTER_PREFIX)
);

const localAuthenticationOptions = (promptMessage: string): LocalAuthentication.LocalAuthenticationOptions => ({
    promptMessage,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
});

const isSecureStoreAvailable = async (): Promise<boolean> => {
    try {
        return await SecureStore.isAvailableAsync();
    } catch {
        return false;
    }
};

const hasSecureStoreApi = (): boolean => Boolean(
    SecureStore
    && typeof SecureStore.setItemAsync === 'function'
    && typeof SecureStore.getItemAsync === 'function'
    && typeof SecureStore.deleteItemAsync === 'function',
);

export const isSecureStorageModuleAvailable = (): boolean => hasSecureStoreApi();

export const SecureStorageModule = {
    async setSensitiveValue(key: string, value: string): Promise<SecureStorageResponse> {
        const inputError = assertInput(key, value);
        if (inputError) {
            return inputError;
        }

        try {
            const secureStoreKey = toSecureStoreKey(key);
            const largeValue = value.length > SECURE_STORE_VALUE_SOFT_LIMIT;
            if (largeValue) {
                await setEncryptedSqliteValue(key, value);
                await SecureStore.setItemAsync(secureStoreKey, sqlitePointerForKey(key), secureStoreOptions);
            } else {
                await deleteEncryptedSqliteValue(key);
                await SecureStore.setItemAsync(secureStoreKey, value, secureStoreOptions);
            }

            return createSuccessResponse();
        } catch (error: any) {
            return createErrorResponse('SET_DATA_ERROR', error?.message || 'Failed to store data');
        }
    },

    async getSensitiveValue(key: string): Promise<SecureStorageResponse> {
        const inputError = assertInput(key);
        if (inputError) {
            return inputError;
        }

        try {
            const secureStoreKey = toSecureStoreKey(key);
            const value = await SecureStore.getItemAsync(secureStoreKey, secureStoreOptions);
            if (isSqlitePointer(value)) {
                const sqliteValue = await getEncryptedSqliteValue(key);
                if (sqliteValue === null) {
                    await SecureStore.deleteItemAsync(secureStoreKey, secureStoreOptions);
                }
                return createSuccessResponse(sqliteValue);
            }

            return createSuccessResponse(value);
        } catch (error: any) {
            return createErrorResponse('SECURE_STORAGE_ERROR', error?.message || 'Failed to get value');
        }
    },

    async deleteSensitiveValue(key: string): Promise<SecureStorageResponse> {
        const inputError = assertInput(key);
        if (inputError) {
            return inputError;
        }

        try {
            const secureStoreKey = toSecureStoreKey(key);
            await SecureStore.deleteItemAsync(secureStoreKey, secureStoreOptions);
            await deleteEncryptedSqliteValue(key);
            return createSuccessResponse();
        } catch (error: any) {
            return createErrorResponse('DELETE_DATA_ERROR', error?.message || 'Failed to delete data');
        }
    },

    async setValue(key: string, value: string): Promise<boolean> {
        if (key.trim() === '' || value.trim() === '') {
            throw new Error('Key and value cannot be empty');
        }

        await nonSensitiveValueStore.setItemAsync(key, value);
        return true;
    },

    async getValue(key: string): Promise<string | null> {
        if (key.trim() === '') {
            throw new Error('Key cannot be empty');
        }

        return nonSensitiveValueStore.getItemAsync(key);
    },

    async deleteValue(key: string): Promise<boolean> {
        if (key.trim() === '') {
            throw new Error('Key cannot be empty');
        }

        return nonSensitiveValueStore.removeItemAsync(key);
    },

    async deleteBiometricKey(key: string): Promise<boolean> {
        if (key.trim() === '') {
            throw new Error('Key cannot be empty');
        }

        await nonSensitiveValueStore.removeItemAsync(biometricMarkerKey(key));
        return true;
    },

    async authenticateBiometric(promptMessage: string): Promise<boolean> {
        if (promptMessage.trim() === '') {
            return false;
        }

        const result = await LocalAuthentication.authenticateAsync(localAuthenticationOptions(promptMessage));
        return result.success === true;
    },

    async isBiometricAvailable(): Promise<boolean> {
        const secureStoreAvailable = await isSecureStoreAvailable();
        if (!secureStoreAvailable) {
            return false;
        }

        const [hasHardware, isEnrolled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
        ]);
        const canUseBiometricAuthentication = SecureStore.canUseBiometricAuthentication();
        return hasHardware && isEnrolled && canUseBiometricAuthentication;
    },

    async isBiometricEnabledInApp(keyAlias: string): Promise<boolean> {
        if (keyAlias.trim() === '') {
            return false;
        }

        const marker = await nonSensitiveValueStore.getItemAsync(biometricMarkerKey(keyAlias));
        const enabled = marker === 'true';
        if (!enabled) return false;

        // Do not require auth here; just treat the marker as a hint.
        // The real check happens during getBiometricProtectedValue().
        return true;
    },

    async isBiometricEnabledOnPhone(): Promise<boolean> {
        const [hasHardware, isEnrolled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
        ]);
        return hasHardware && isEnrolled;
    },

    async setBiometricProtectedValue(
        keyAlias: string,
        storageKey: string,
        value: string,
        promptMessage: string,
    ): Promise<SecureStorageResponse> {
        const inputError = assertInput(storageKey, value);
        if (inputError) {
            return inputError;
        }
        if (keyAlias.trim() === '' || promptMessage.trim() === '') {
            return invalidInputResponse('Key alias and prompt message cannot be empty');
        }

        try {
            if (!await this.isBiometricAvailable()) {
                return createErrorResponse('BIOMETRIC_UNAVAILABLE', 'Biometric unlock is unavailable');
            }

            await SecureStore.setItemAsync(toSecureStoreKey(storageKey), value, {
                ...secureStoreOptions,
                keychainService: keyAlias,
                requireAuthentication: true,
                authenticationPrompt: promptMessage,
            });
            await nonSensitiveValueStore.setItemAsync(biometricMarkerKey(keyAlias), 'true');
            return createSuccessResponse();
        } catch (error: any) {
            return createErrorResponse('BIOMETRIC_STORAGE_ERROR', error?.message || 'Failed to store biometric value');
        }
    },

    async getBiometricProtectedValue(
        keyAlias: string,
        storageKey: string,
        promptMessage: string,
    ): Promise<SecureStorageResponse> {
        if (keyAlias.trim() === '' || storageKey.trim() === '' || promptMessage.trim() === '') {
            return invalidInputResponse('Key alias, storage key, and prompt message cannot be empty');
        }

        try {
            const value = await SecureStore.getItemAsync(toSecureStoreKey(storageKey), {
                ...secureStoreOptions,
                keychainService: keyAlias,
                requireAuthentication: true,
                authenticationPrompt: promptMessage,
            });

            if (typeof value !== 'string' || value.length === 0) {
                await nonSensitiveValueStore.removeItemAsync(biometricMarkerKey(keyAlias));

                return createErrorResponse(
                    'BIOMETRIC_VALUE_NOT_FOUND',
                    'Biometric unlock is not set up on this device.',
                );
            }

            return createSuccessResponse(value);
        } catch (error: any) {
            return createErrorResponse(
                'BIOMETRIC_STORAGE_ERROR',
                error?.message || 'Failed to get biometric value',
            );
        }
    },
};

export const isBiometricAuthCancelled = (error: any): boolean => {
    const code = String(error?.code ?? error?.userInfo?.code ?? '');
    const message = [
        error?.message,
        error?.userInfo?.message,
        String(error ?? ''),
    ].filter(Boolean).join(' ').toLowerCase();

    return code === 'AUTH_CANCELLED' ||
        code === 'ERROR_CANCELED' ||
        code === 'ERR_CANCELED' ||
        code === 'user_cancel' ||
        code === 'system_cancel' ||
        message.includes('cancel') ||
        message.includes('dismiss') ||
        message.includes('negative button');
};

export const hasBiometricProtectedStorage = (): boolean => Boolean(
    hasSecureStoreApi()
    && typeof SecureStore.canUseBiometricAuthentication === 'function',
);

export const hasStandaloneBiometricAuth = (): boolean => Boolean(
    LocalAuthentication
    && typeof LocalAuthentication.authenticateAsync === 'function',
);

export const authenticateBiometric = async (promptMessage: string): Promise<boolean> => (
    SecureStorageModule.authenticateBiometric(promptMessage)
);

export const biometricKeyExists = async (keyAlias: string): Promise<boolean> => {
    try {
        return Boolean(await SecureStorageModule.isBiometricEnabledInApp(keyAlias));
    } catch {
        return false;
    }
};

export const getNonSensitiveValue = async (key: string): Promise<string | null> => {
    try {
        return await SecureStorageModule.getValue(key);
    } catch {
        return null;
    }
};

export const setNonSensitiveValue = async (key: string, value: string): Promise<void> => {
    await SecureStorageModule.setValue(key, value);
};
