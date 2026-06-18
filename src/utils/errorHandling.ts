/**
 * Common error handling utilities
 */

import type { ToastType } from '../app/state/ToastContext';
import { logger } from './logger';

/**
 * Common error messages
 */
export const ERROR_MESSAGES = {
    // Authentication
    SIGN_IN_FAILED: 'Failed to sign in. Please try again.',
    SIGN_UP_FAILED: 'Could not create account. Please check your details and try again.',
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
    INVALID_SEED: 'Recovery phrase could not be verified. Please restart signup.',

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
    const MIN_SPINNER_DELAY_MS = 200;

    try {
        const startedAt = Date.now();
        setLoading(true);
        const result = await operation();
        if (successMessage) {
            showToast(successMessage, 'success');
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SPINNER_DELAY_MS) {
            await new Promise(resolve => setTimeout(resolve, MIN_SPINNER_DELAY_MS - elapsed));
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
    'auth/invalid-credential': 'Sign in failed. Check your username and password and try again.',
    'auth/invalid-email': 'Sign in failed. Check your username and password and try again.',
    'auth/user-not-found': 'Sign in failed. Check your username and password and try again.',
    'auth/wrong-password': 'Sign in failed. Check your username and password and try again.',
    'auth/user-disabled': 'Unable to sign in. Please try again later.',
    'auth/email-already-in-use': ERROR_MESSAGES.SIGN_UP_FAILED,
    'auth/weak-password': 'Password is too weak.',
    'auth/requires-recent-login': 'Please sign in again before continuing.',
    'auth/network-request-failed': ERROR_MESSAGES.NETWORK_ERROR,
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
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

const getErrorText = (error: any): string => {
    const rawMessage = typeof error?.message === 'string' ? error.message : '';
    const serverMessage = typeof error?.errorData?.error === 'string' ? error.errorData.error : '';
    return rawMessage || serverMessage;
};

const getAuthErrorCode = (error: any): string | null => {
    if (typeof error?.code === 'string') {
        return error.code.toLowerCase();
    }

    const match = getErrorText(error).match(/\b(auth\/[a-z0-9-]+)\b/i);
    return match?.[1]?.toLowerCase() ?? null;
};

const getRateLimitMessage = (error: any): string => {
    const retryAfterSeconds = Number(error?.retryAfterSeconds ?? error?.errorData?.retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return `Too many attempts. Please try again in ${Math.ceil(retryAfterSeconds)} seconds.`;
    }

    return 'Too many attempts. Please try again later.';
};

export const getUserFacingErrorMessage = (error: any, defaultMessage: string = ERROR_MESSAGES.GENERIC_ERROR): string => {
    if (!error) {
        return defaultMessage;
    }

    const authErrorCode = getAuthErrorCode(error);
    if (authErrorCode && AUTH_ERROR_MESSAGES[authErrorCode]) {
        return AUTH_ERROR_MESSAGES[authErrorCode];
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

    if (error.errorData?.rateLimited || error.rateLimited || error.status === 429 || error.retryAfter) {
        return getRateLimitMessage(error);
    }

    if (AUTH_ERROR_DATA_FLAGS.some(flag => error.errorData?.[flag] === true)) {
        return defaultMessage;
    }

    const message = getErrorText(error);

    if (/invalid recovery credentials/i.test(message)) {
        return ERROR_MESSAGES.RECOVERY_FAILED;
    }

    if (/mfa verification timed out/i.test(message)) {
        return 'MFA verification timed out. Please try again.';
    }

    if (/biometrics? (is )?disabled in phone settings/i.test(message)) {
        return 'Biometric unlock is disabled in your device settings.';
    }

    if (/biometric unlock is not set up/i.test(message)) {
        return 'Biometric unlock is not set up on this device. Sign in with your password.';
    }

    if (/incorrect passphrase/i.test(message)) {
        return 'Incorrect passphrase.';
    }

    if (/user (is )?not authenticated|user not signed in|not signed in/i.test(message)) {
        return defaultMessage;
    }

    return defaultMessage;
};
