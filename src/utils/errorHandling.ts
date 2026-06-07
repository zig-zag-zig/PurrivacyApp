/**
 * Common error handling utilities
 */

import { ToastType } from '../app/state/ToastContext';
import { logger } from './logger';

/**
 * Common error messages
 */
export const ERROR_MESSAGES = {
    // Authentication
    SIGN_IN_FAILED: 'Failed to sign in. Please try again.',
    SIGN_UP_FAILED: 'Failed to sign up',
    SESSION_EXPIRED: 'Session expired. Please sign in again to continue.',

    // Key operations
    KEY_CREATE_FAILED: 'Failed to create key',
    KEY_IMPORT_FAILED: 'Failed to import key',
    KEY_DELETE_FAILED: 'Failed to delete key',
    SET_DEFAULT_FAILED: 'Failed to set default key',
    INVALID_KEY_FORMAT: 'Invalid key format. Must be a valid PGP public or private key.',
    CANNOT_IMPORT_MESSAGE: 'Cannot import encrypted messages as keys.',
    ENTER_KEY_TO_IMPORT: 'Please enter a key to import',

    // Encryption/Decryption
    ENCRYPT_FAILED: 'Failed to encrypt message',
    DECRYPT_FAILED: 'Failed to decrypt message',
    SIGN_FAILED: 'Failed to sign message',
    VERIFY_FAILED: 'Failed to verify signature',

    // Navigation
    UPLOAD_PUBLIC_KEYS: 'Please upload public keys first to encrypt messages',
    UPLOAD_PRIVATE_KEYS: 'Please upload private keys first to decrypt messages',

    // File operations
    FILE_OPERATION_FAILED: 'File operation failed',

    // Biometric
    BIOMETRIC_FAILED: 'Failed to toggle biometric unlock',

    // Security
    SECURITY_ACTION_FAILED: 'Security action failed',
    RECOVERY_FAILED: 'Could not recover account. Check your username and recovery phrase.',
    INVALID_SEED: 'System Error: Please contact support. Error code: INVALID_SEED',

    // General
    GENERIC_ERROR: 'An unexpected error occurred',
    NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
    KEY_CREATED: 'Key pair created successfully',
    KEY_IMPORTED: 'Key imported successfully',
    KEY_DELETED: 'Key deleted successfully',
    DEFAULT_KEY_SET: 'Default key set successfully',
    CONTENT_COPIED: 'Content copied to clipboard',
    PUBLIC_KEY_COPIED: 'Public key copied!',
    ENCRYPTED_COPIED: 'Encrypted content copied to clipboard',
    DECRYPTED_COPIED: 'Decrypted content copied to clipboard',
    SIGNATURE_COPIED: 'Signature copied to clipboard',
} as const;

/**
 * Standardized async operation wrapper with loading state
 */
export const executeWithLoading = async <T>(
    operation: () => Promise<T>,
    setLoading: (loading: boolean) => void,
    showToast: (message: string, type: ToastType) => void,
    successMessage?: string,
    errorMessage?: string
): Promise<T | null> => {
    try {
        setLoading(true);
        const result = await operation();
        if (successMessage) {
            showToast(successMessage, 'success');
        }
        return result;
    } catch (error: any) {
        logger.warn('operation failed', { error });
        showToast(errorMessage || getUserFacingErrorMessage(error), 'error');
        return null;
    } finally {
        setLoading(false);
    }
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
    'auth/invalid-credential': 'Username or password is incorrect.',
    'auth/user-disabled': 'This account is disabled.',
    'auth/email-already-in-use': 'Username is already taken.',
    'auth/weak-password': 'Password is too weak.',
    'auth/requires-recent-login': 'Please sign in again before continuing.',
    'auth/network-request-failed': ERROR_MESSAGES.NETWORK_ERROR,
};

const AUTH_ERROR_DATA_FLAGS = [
    'bearerHeaderMissing',
    'bearerTokenInvalid',
    'sessionHeaderMissing',
    'sessionInvalid',
    'sessionExpired',
    'accessTokenInvalid',
    'accessTokenExpired',
    'refreshTokenMissing',
    'refreshTokenInvalid',
    'refreshTokenExpired',
    'refreshTokenReuse',
];

export const getUserFacingErrorMessage = (error: any, defaultMessage: string = ERROR_MESSAGES.GENERIC_ERROR): string => {
    if (!error) {
        return defaultMessage;
    }

    if (typeof error.retryAfter === 'string') {
        return error.retryAfter;
    }

    if (typeof error.code === 'string' && AUTH_ERROR_MESSAGES[error.code]) {
        return AUTH_ERROR_MESSAGES[error.code];
    }

    if (error.isNetworkError || error.errorData?.networkUnavailable) {
        return ERROR_MESSAGES.NETWORK_ERROR;
    }

    if (error.sessionError?.refreshTokenMissing || error.sessionError?.refreshTokenInvalid || error.sessionError?.refreshTokenExpired) {
        return ERROR_MESSAGES.SESSION_EXPIRED;
    }

    if (error.errorData?.wrongMfaCode || error.wrongMfaCode) {
        return 'The MFA code was incorrect. Please try again.';
    }

    if (error.errorData?.rateLimited || error.rateLimited) {
        return error.message || 'Too many attempts. Please try again later.';
    }

    if (AUTH_ERROR_DATA_FLAGS.some(flag => error.errorData?.[flag] === true)) {
        return defaultMessage;
    }

    const rawMessage = typeof error.message === 'string' ? error.message : '';
    const serverMessage = typeof error.errorData?.error === 'string' ? error.errorData.error : '';
    const message = rawMessage || serverMessage;

    if (/invalid recovery credentials/i.test(message)) {
        return ERROR_MESSAGES.RECOVERY_FAILED;
    }

    if (/user (is )?not authenticated|user not signed in|not signed in/i.test(message)) {
        return defaultMessage;
    }

    if (/internal server error|backend access token missing|bearer authentication|authorization header|jwt/i.test(message)) {
        return defaultMessage;
    }

    return message || defaultMessage;
};
