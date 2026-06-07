import { logger } from '../../../utils/logger';
import { SecureStorageModule } from '../services/biometricSecureStorage';

// Prefix constants
export const FIRST_TIME_PROMPT_PREFIX = 'first_time_biometric_prompt_';
export const LAST_USED_AUTH_WAS_BIOMETRIC_PREFIX = 'last_used_auth_was_biometric_';
export const PASSPHRASE_PREFIX = 'passphrase_';
export const PASSPHRASE_EXISTS_PREFIX = 'passphrase_exists_';
export const PASSPHRASE_INDEX_PREFIX = 'passphrase_index_';
export const PASSPHRASE_STORAGE_ENABLED_PREFIX = 'passphrase_storage_enabled_';
export const PASSPHRASE_STORAGE_PROMPTED_PREFIX = 'passphrase_storage_prompted_';
export const PASSPHRASE_GENERATOR_SETTINGS_KEY = 'passphrase_generator_settings';
export const DEK_PREFIX = 'dek_';
export const DEK_EXISTS_PREFIX = 'dek_exists_';
export const BIOMETRIC_DEK_PREFIX = 'biometric_dek_';
export const BIOMETRIC_DEK_KEY_PREFIX = 'biometric_dek_key_';
const BIOMETRIC_KEYPAIR_PREFIX = 'biometric_keypair_';
export const SESSION_PREFIX = 'user_session_';
export const LOCAL_LOCK_PREFIX = 'local_lock_';
const PUBLIC_PREFIX = 'public_key_';

// Utility functions for handling secure storage responses
type SecureStorageResponse = {
    success?: boolean;
    value?: string;
    code?: string;
    message?: string;
    logs?: string[];
    info?: Record<string, any>;
};

/**
 * Log secure storage response details
 */
const logSecureStorageResponse = (response: SecureStorageResponse, operation: string): void => {
    if (response?.success === false && response?.code) {
        logger.warn('secure storage operation failed', { operation, code: response.code });
    }
};

/**
 * Handle secure storage response with success/error handlers
 */
export const handleSecureStorageResponse = async <T>(
    response: SecureStorageResponse,
    operation: string,
    successHandler?: (value: string) => T | Promise<T>,
    errorHandler?: (code: string, message: string) => T | Promise<T>
): Promise<T | null> => {
    // Check if we got a value
    if (response?.success === true && response.value !== undefined && successHandler) {
        const result = await successHandler(response.value);
        return result ?? null;
    }

    // Check if it was an error response
    if (response?.success === false && response?.code && errorHandler) {
        logSecureStorageResponse(response, operation);
        const result = await errorHandler(response.code, response.message || 'Unknown error');
        return result ?? null;
    }

    return null;
};

/**
 * Delete an item from secure storage
 */
export const deleteSecureStoreItem = async (type: 'non-sensitive' | 'sensitive' | 'pgp', key: string) => {
    if (key.trim() === '') throw new Error("key is required when deleting values from secure storage");

    try {
        if (type === 'non-sensitive') {
            await SecureStorageModule.deleteValue(key);
        } else if (type === 'sensitive') {
            const response = await SecureStorageModule.deleteSensitiveValue(key);
            handleSecureStorageResponse(response, 'delete sensitive value').catch(() =>
                logger.warn('failed to handle secure storage delete response')
            );
        } else {
            await SecureStorageModule.deleteBiometricKey(key);
        }
    } catch (error: any) {
        logger.warn('failed to delete secure store item', { error });
        throw error;
    }
};

/**
 * Clear biometric configuration for a user
 */
export const clearBiometricsConfig = async (username: string, clearFirstTimePrompt = true): Promise<void> => {
    if (username.trim() === '') return;
    await deleteSecureStoreItem('sensitive', `${PUBLIC_PREFIX}${username}`);
    await deleteSecureStoreItem('pgp', `${BIOMETRIC_KEYPAIR_PREFIX}${username}`);
    if (clearFirstTimePrompt) await deleteSecureStoreItem('non-sensitive', `${FIRST_TIME_PROMPT_PREFIX}${username}`);
    await deleteSecureStoreItem('non-sensitive', `${LAST_USED_AUTH_WAS_BIOMETRIC_PREFIX}${username}`);
};

/**
 * Set has been prompted for biometric flag
 */
export const setHasBeenPromptedForBiometric = async (username: string, prompted: boolean) => {
    if (username.trim() === '') return;
    await SecureStorageModule.setValue(`${FIRST_TIME_PROMPT_PREFIX}${username}`, String(prompted));
};
