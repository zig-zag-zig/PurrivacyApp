import {
    PASSPHRASE_STORAGE_ENABLED_PREFIX,
    PASSPHRASE_STORAGE_PROMPTED_PREFIX,
} from '../domain/secureStorageUtils';
import { logger } from '../../../utils/logger';
import {
    getNonSensitiveValue,
    setNonSensitiveValue,
} from './biometricSecureStorage';

/**
 * Simplified backend sync interface — only toggles the storage flag.
 * Injected at app init to break the circular dependency:
 *   securityService → passphraseStore → ApiClient → ... → securityService
 */
export interface PassphraseBackendSync {
    setPassphraseStorage(enabled: boolean): Promise<void>;
}

let backendSync: PassphraseBackendSync | null = null;

export const setPassphraseBackendSync = (adapter: PassphraseBackendSync): void => {
    backendSync = adapter;
};

const passphraseStorageEnabledKey = (userId: string) => `${PASSPHRASE_STORAGE_ENABLED_PREFIX}${userId}`;
const passphraseStoragePromptedKey = (userId: string) => `${PASSPHRASE_STORAGE_PROMPTED_PREFIX}${userId}`;

export const isPassphraseStorageEnabled = async (userId: string): Promise<boolean> => {
    if (userId.trim() === '') return false;
    return await getNonSensitiveValue(passphraseStorageEnabledKey(userId)) === 'true';
};

export const hasAnsweredPassphraseStoragePrompt = async (userId: string): Promise<boolean> => {
    if (userId.trim() === '') return false;
    return await getNonSensitiveValue(passphraseStoragePromptedKey(userId)) === 'true';
};

export const setPassphraseStoragePrompted = async (
    userId: string,
    prompted: boolean,
): Promise<void> => {
    if (userId.trim() === '') return;
    await setNonSensitiveValue(passphraseStoragePromptedKey(userId), String(prompted));
};

export const setPassphraseStorageEnabled = async (
    userId: string,
    enabled: boolean,
    options?: { skipRemoteSync?: boolean },
): Promise<void> => {
    if (userId.trim() === '') return;
    await setNonSensitiveValue(passphraseStorageEnabledKey(userId), String(enabled));
    await setPassphraseStoragePrompted(userId, true);

    if (!options?.skipRemoteSync && backendSync) {
        try {
            await backendSync.setPassphraseStorage(enabled);
        } catch (error) {
            logger.warn('failed to sync passphrase storage setting', { error });
        }
    }
};
