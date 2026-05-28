import {
    BIOMETRIC_PASSPHRASE_KEY_PREFIX,
    BIOMETRIC_PASSPHRASE_PREFIX,
    deleteSecureStoreItem,
    handleSecureStorageResponse,
    PASSPHRASE_EXISTS_PREFIX,
    PASSPHRASE_INDEX_PREFIX,
    PASSPHRASE_PREFIX,
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

type StorePassphraseOptions = {
    force?: boolean;
};

const passphraseCache = new Map<string, string>();

const passphraseStorageKey = (userId: string, fingerprint: string) => `${BIOMETRIC_PASSPHRASE_PREFIX}${userId}_${fingerprint}`;
const passphraseKeyAlias = (userId: string, fingerprint: string) => `${BIOMETRIC_PASSPHRASE_KEY_PREFIX}${userId}_${fingerprint}`;
const passphraseExistsKey = (userId: string, fingerprint: string) => `${PASSPHRASE_EXISTS_PREFIX}${userId}_${fingerprint}`;
const passphraseIndexKey = (userId: string) => `${PASSPHRASE_INDEX_PREFIX}${userId}`;
const passphraseCacheKey = (userId: string, fingerprint: string) => `${userId}_${fingerprint}`;

export const getPassphraseIndex = async (userId: string): Promise<string[]> => {
    const raw = await getNonSensitiveValue(passphraseIndexKey(userId));
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
        return [];
    }
};

const addPassphraseIndexEntry = async (userId: string, fingerprint: string): Promise<void> => {
    const entries = new Set(await getPassphraseIndex(userId));
    entries.add(fingerprint);
    await setNonSensitiveValue(passphraseIndexKey(userId), JSON.stringify(Array.from(entries)));
};

const removePassphraseIndexEntry = async (userId: string, fingerprint: string): Promise<void> => {
    const entries = (await getPassphraseIndex(userId)).filter(entry => entry !== fingerprint);
    if (entries.length === 0) {
        await deleteSecureStoreItem('non-sensitive', passphraseIndexKey(userId));
        return;
    }
    await setNonSensitiveValue(passphraseIndexKey(userId), JSON.stringify(entries));
};

export const hasStoredPassphrase = async (userId: string, fingerprint: string): Promise<boolean> => {
    if (userId.trim() === '' || fingerprint.trim() === '') return false;
    if (passphraseCache.has(passphraseCacheKey(userId, fingerprint))) return true;
    return await getNonSensitiveValue(passphraseExistsKey(userId, fingerprint)) === 'true' &&
        hasBiometricProtectedStorage() &&
        await biometricKeyExists(passphraseKeyAlias(userId, fingerprint));
};

export const clearPassphrase = async (userId: string, fingerprint: string): Promise<void> => {
    if (userId.trim() === '' || fingerprint.trim() === '') return;
    passphraseCache.delete(passphraseCacheKey(userId, fingerprint));
    await deleteSecureStoreItem('sensitive', `${PASSPHRASE_PREFIX}${userId}_${fingerprint}`);
    await deleteSecureStoreItem('sensitive', passphraseStorageKey(userId, fingerprint));
    await deleteSecureStoreItem('pgp', passphraseKeyAlias(userId, fingerprint));
    await deleteSecureStoreItem('non-sensitive', passphraseExistsKey(userId, fingerprint));
    await removePassphraseIndexEntry(userId, fingerprint);
};

export const storePassphrase = async (
    userId: string,
    privateKeyPassphrases: { [fingerprint: string]: string; },
    selectedPrivateKeyFingerprint: string,
    options: StorePassphraseOptions = {},
): Promise<void> => {
    if (userId.trim() === '' || selectedPrivateKeyFingerprint.trim() === '') return;
    const passphrase = privateKeyPassphrases[selectedPrivateKeyFingerprint] ?? '';
    const cacheKey = passphraseCacheKey(userId, selectedPrivateKeyFingerprint);

    if (!passphrase) {
        await clearPassphrase(userId, selectedPrivateKeyFingerprint);
        return;
    }

    const cached = passphraseCache.get(cacheKey);
    if (cached === passphrase && !options.force) return;

    const hasStored = await hasStoredPassphrase(userId, selectedPrivateKeyFingerprint);
    if (hasStored && !options.force && cached === undefined) {
        return;
    }

    if (!hasBiometricProtectedStorage()) {
        passphraseCache.set(cacheKey, passphrase);
        return;
    }

    try {
        const response = await SecureStorageModule.setBiometricProtectedValue!(
            passphraseKeyAlias(userId, selectedPrivateKeyFingerprint),
            passphraseStorageKey(userId, selectedPrivateKeyFingerprint),
            passphrase,
            'Authenticate to save passphrase',
        );
        const error = await handleSecureStorageResponse(
            response,
            'store biometric passphrase',
            undefined,
            (code, message) => ({ code, message }),
        );
        if (error) return;

        passphraseCache.set(cacheKey, passphrase);
        await setNonSensitiveValue(passphraseExistsKey(userId, selectedPrivateKeyFingerprint), 'true');
        await addPassphraseIndexEntry(userId, selectedPrivateKeyFingerprint);
        await deleteSecureStoreItem('sensitive', `${PASSPHRASE_PREFIX}${userId}_${selectedPrivateKeyFingerprint}`);
    } catch (error) {
        logger.warn('failed to store biometric passphrase', { error });
    }
};

export const getPassphrase = async (userId: string, fingerprint: string): Promise<string | null> => {
    if (userId.trim() === '' || fingerprint.trim() === '') return null;
    const cacheKey = passphraseCacheKey(userId, fingerprint);
    const cached = passphraseCache.get(cacheKey);
    if (cached) return cached;

    if (await getNonSensitiveValue(passphraseExistsKey(userId, fingerprint)) === 'true' &&
        hasBiometricProtectedStorage() &&
        await biometricKeyExists(passphraseKeyAlias(userId, fingerprint))) {
        try {
            const response = await SecureStorageModule.getBiometricProtectedValue!(
                passphraseKeyAlias(userId, fingerprint),
                passphraseStorageKey(userId, fingerprint),
                'Use saved passphrase',
            );
            const error = await handleSecureStorageResponse(
                response,
                'get biometric passphrase',
                undefined,
                (code, message) => ({ code, message }),
            );
            if (error) {
                if (isBiometricAuthCancelled(error)) {
                    throw error;
                }
                return null;
            }

            const result = await handleSecureStorageResponse(response, 'get biometric passphrase', value => value);
            if (result) {
                passphraseCache.set(cacheKey, result);
                return result;
            }
        } catch (error: any) {
            if (isBiometricAuthCancelled(error)) {
                throw error;
            }
            logger.warn('failed to get biometric passphrase', { error });
            return null;
        }
    }

    return null;
};

export const clearIndexedBiometricPassphrases = async (userId: string): Promise<void> => {
    const entries = await getPassphraseIndex(userId);
    for (const fingerprint of entries) {
        await clearPassphrase(userId, fingerprint);
    }
};

export const clearPassphraseCacheForUser = (userId: string): void => {
    Array.from(passphraseCache.keys())
        .filter(key => key.startsWith(`${userId}_`))
        .forEach(key => passphraseCache.delete(key));
};
