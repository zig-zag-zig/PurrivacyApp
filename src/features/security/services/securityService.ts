import { clearBiometricsConfig } from '../domain/secureStorageUtils';
import {
    clearBiometricDek,
    clearDek,
    clearDekCache,
    getDek,
    hasBiometricDek,
    hasDek,
    persistCachedDekWithBiometric,
    setDek,
    unlockDekWithBiometric,
} from './dekStore';
import { getOrSetLastSignedInUserInSecureStorage } from './lastSignedInUserStore';
import {
    isLocalSessionLocked,
    setLocalSessionLocked,
} from './localSessionLockStore';
import {
    hasAnsweredPassphraseStoragePrompt,
    isPassphraseStorageEnabled,
    setPassphraseStorageEnabled,
    setPassphraseStoragePrompted,
} from './passphraseStore';
import {
    clearStoredSession,
    getStoredSession,
    storeSession,
    updateStoredSessionMfaState,
    updateStoredSessionMfaTrust,
} from './storedSessionService';
import {
    authenticateBiometric,
    hasStandaloneBiometricAuth,
    isBiometricAuthCancelled,
    SecureStorageModule,
} from './biometricSecureStorage';
import {
    generatePassphrase,
    getPassphraseGeneratorSettings,
    setPassphraseGeneratorSettings,
} from './passphraseGeneratorSettings';

export const securityService = {
    /**
     * Check if biometric unlock is available
     */
    isBiometricAvailable: async (): Promise<boolean> => {
        return await SecureStorageModule.isBiometricAvailable();
    },

    isPassphraseStorageEnabled,
    hasAnsweredPassphraseStoragePrompt,
    setPassphraseStorageEnabled,
    setPassphraseStoragePrompted,
    getOrSetLastSignedInUserInSecureStorage,
    setDek,
    persistCachedDekWithBiometric,
    hasDek,
    hasBiometricDek,
    unlockDekWithBiometric,
    getDek,
    getPassphraseGeneratorSettings,
    setPassphraseGeneratorSettings,
    generatePassphrase,
    hasStandaloneBiometricAuth,
    authenticateBiometric,
    clearLastSignedInUser: async (): Promise<void> => {
        await getOrSetLastSignedInUserInSecureStorage('CLEAR');
    },

    /**
     * Clear secure storage for a user
     */
    clearSecureStorage: async (userId: string, username: string): Promise<void> => {
        if (userId.trim() === '') return;
        await clearBiometricsConfig(username);
        await clearDek(userId);
    },

    clearDek,

    clearBiometricUnlock: async (userId: string): Promise<void> => {
        if (userId.trim() === '') return;
        await clearBiometricDek(userId);
    },

    lockLocalSecrets: async (userId: string): Promise<void> => {
        if (userId.trim() === '') return;
        clearDekCache(userId);
    },

    setLocalSessionLocked,
    isLocalSessionLocked,
    isBiometricAuthCancelled,
    storeSession,
    clearStoredSession,
    updateStoredSessionMfaTrust,
    updateStoredSessionMfaState,
    getStoredSession,
};
