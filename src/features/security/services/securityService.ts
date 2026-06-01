import { KeyPair } from '../../../types/types';
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
    clearIndexedBiometricPassphrases,
    hasAnsweredPassphraseStoragePrompt,
    clearPassphrase,
    isPassphraseStorageEnabled,
    clearPassphraseCacheForUser,
    getPassphrase,
    getPassphraseIndex,
    hasStoredPassphrase,
    setPassphraseStorageEnabled,
    setPassphraseStoragePrompted,
    subscribePassphraseStoreChanges,
    storePassphrase,
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

    storePassphrase,
    hasStoredPassphrase,
    isPassphraseStorageEnabled,
    hasAnsweredPassphraseStoragePrompt,
    setPassphraseStorageEnabled,
    setPassphraseStoragePrompted,
    subscribePassphraseStoreChanges,
    getOrSetLastSignedInUserInSecureStorage,
    setDek,
    persistCachedDekWithBiometric,
    hasDek,
    hasBiometricDek,
    unlockDekWithBiometric,
    getDek,
    getPassphrase,
    getPassphraseGeneratorSettings,
    setPassphraseGeneratorSettings,
    generatePassphrase,
    clearPassphrase,
    hasStandaloneBiometricAuth,
    authenticateBiometric,
    clearLastSignedInUser: async (): Promise<void> => {
        await getOrSetLastSignedInUserInSecureStorage('CLEAR');
    },

    /**
     * Clear secure storage for a user
     */
    clearSecureStorage: async (userId: string, username: string, keys: KeyPair[]): Promise<void> => {
        if (userId.trim() === '') return;
        const fingerprints = new Set<string>(await getPassphraseIndex(userId));
        keys.forEach(key => {
            if (key.privateKey) fingerprints.add(key.fingerprint);
        });

        for (const fingerprint of fingerprints) {
            await clearPassphrase(userId, fingerprint);
        }

        await clearBiometricsConfig(username);
        await clearDek(userId);
    },

    clearDek,

    clearBiometricUnlock: async (userId: string): Promise<void> => {
        if (userId.trim() === '') return;
        await clearBiometricDek(userId);
        await clearIndexedBiometricPassphrases(userId);
    },

    lockLocalSecrets: async (userId: string): Promise<void> => {
        if (userId.trim() === '') return;
        clearDekCache(userId);
        clearPassphraseCacheForUser(userId);
    },

    setLocalSessionLocked,
    isLocalSessionLocked,
    isBiometricAuthCancelled,
    clearIndexedBiometricPassphrases,
    storeSession,
    clearStoredSession,
    updateStoredSessionMfaTrust,
    updateStoredSessionMfaState,
    getStoredSession,
};
