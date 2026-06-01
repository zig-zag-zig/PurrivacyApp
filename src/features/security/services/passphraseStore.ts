import {
    BIOMETRIC_PASSPHRASE_KEY_PREFIX,
    BIOMETRIC_PASSPHRASE_PREFIX,
    deleteSecureStoreItem,
    handleSecureStorageResponse,
    PASSPHRASE_EXISTS_PREFIX,
    PASSPHRASE_STORAGE_ENABLED_PREFIX,
    PASSPHRASE_STORAGE_PROMPTED_PREFIX,
    PASSPHRASE_INDEX_PREFIX,
    PASSPHRASE_PREFIX,
} from '../domain/secureStorageUtils';
import { logger } from '../../../utils/logger';
import {
    getNonSensitiveValue,
    SecureStorageModule,
    setNonSensitiveValue,
} from './biometricSecureStorage';

type StorePassphraseOptions = {
    force?: boolean;
};

const passphraseCache = new Map<string, string>();
type PassphraseStoreChange = {
    userId: string;
    fingerprint?: string;
    passphrase: string | null;
    storageEnabled?: boolean;
};
type PassphraseStoreListener = (change: PassphraseStoreChange) => void;
const passphraseStoreListeners = new Set<PassphraseStoreListener>();

const passphraseStorageKey = (userId: string, fingerprint: string) => `${PASSPHRASE_PREFIX}${userId}_${fingerprint}`;
const legacyBiometricPassphraseStorageKey = (userId: string, fingerprint: string) => `${BIOMETRIC_PASSPHRASE_PREFIX}${userId}_${fingerprint}`;
const legacyBiometricPassphraseKeyAlias = (userId: string, fingerprint: string) => `${BIOMETRIC_PASSPHRASE_KEY_PREFIX}${userId}_${fingerprint}`;
const passphraseExistsKey = (userId: string, fingerprint: string) => `${PASSPHRASE_EXISTS_PREFIX}${userId}_${fingerprint}`;
const passphraseIndexKey = (userId: string) => `${PASSPHRASE_INDEX_PREFIX}${userId}`;
const passphraseCacheKey = (userId: string, fingerprint: string) => `${userId}_${fingerprint}`;
const passphraseStorageEnabledKey = (userId: string) => `${PASSPHRASE_STORAGE_ENABLED_PREFIX}${userId}`;
const passphraseStoragePromptedKey = (userId: string) => `${PASSPHRASE_STORAGE_PROMPTED_PREFIX}${userId}`;

const emitPassphraseStoreChange = (change: PassphraseStoreChange): void => {
    passphraseStoreListeners.forEach(listener => listener(change));
};

export const subscribePassphraseStoreChanges = (
    listener: PassphraseStoreListener,
): (() => void) => {
    passphraseStoreListeners.add(listener);
    return () => passphraseStoreListeners.delete(listener);
};

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
): Promise<void> => {
    if (userId.trim() === '') return;
    await setNonSensitiveValue(passphraseStorageEnabledKey(userId), String(enabled));
    await setPassphraseStoragePrompted(userId, true);

    if (!enabled) {
        await clearIndexedPassphrases(userId);
        emitPassphraseStoreChange({ userId, passphrase: null, storageEnabled: false });
    } else {
        emitPassphraseStoreChange({ userId, passphrase: null, storageEnabled: true });
    }
};

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
    if (!await isPassphraseStorageEnabled(userId)) return false;
    if (passphraseCache.has(passphraseCacheKey(userId, fingerprint))) return true;
    return await getNonSensitiveValue(passphraseExistsKey(userId, fingerprint)) === 'true';
};

export const clearPassphrase = async (userId: string, fingerprint: string): Promise<void> => {
    if (userId.trim() === '' || fingerprint.trim() === '') return;
    passphraseCache.delete(passphraseCacheKey(userId, fingerprint));
    await deleteSecureStoreItem('sensitive', passphraseStorageKey(userId, fingerprint));
    await deleteSecureStoreItem('sensitive', legacyBiometricPassphraseStorageKey(userId, fingerprint));
    await deleteSecureStoreItem('pgp', legacyBiometricPassphraseKeyAlias(userId, fingerprint));
    await deleteSecureStoreItem('non-sensitive', passphraseExistsKey(userId, fingerprint));
    await removePassphraseIndexEntry(userId, fingerprint);
    emitPassphraseStoreChange({ userId, fingerprint, passphrase: null });
};

export const clearIndexedPassphrases = async (userId: string): Promise<void> => {
    const entries = await getPassphraseIndex(userId);
    for (const fingerprint of entries) {
        await clearPassphrase(userId, fingerprint);
    }
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

    if (!await isPassphraseStorageEnabled(userId)) return;

    const cached = passphraseCache.get(cacheKey);
    if (cached === passphrase && !options.force) {
        emitPassphraseStoreChange({
            userId,
            fingerprint: selectedPrivateKeyFingerprint,
            passphrase,
            storageEnabled: true,
        });
        return;
    }

    try {
        const response = await SecureStorageModule.setSensitiveValue(
            passphraseStorageKey(userId, selectedPrivateKeyFingerprint),
            passphrase,
        );
        const error = await handleSecureStorageResponse(
            response,
            'store passphrase',
            undefined,
            (code, message) => ({ code, message }),
        );
        if (error) return;

        passphraseCache.set(cacheKey, passphrase);
        await setNonSensitiveValue(passphraseExistsKey(userId, selectedPrivateKeyFingerprint), 'true');
        await addPassphraseIndexEntry(userId, selectedPrivateKeyFingerprint);
        emitPassphraseStoreChange({
            userId,
            fingerprint: selectedPrivateKeyFingerprint,
            passphrase,
            storageEnabled: true,
        });
    } catch (error) {
        logger.warn('failed to store passphrase', { error });
    }
};

export const getPassphrase = async (userId: string, fingerprint: string): Promise<string | null> => {
    if (userId.trim() === '' || fingerprint.trim() === '') return null;
    if (!await isPassphraseStorageEnabled(userId)) return null;
    const cacheKey = passphraseCacheKey(userId, fingerprint);
    const cached = passphraseCache.get(cacheKey);
    if (cached) return cached;

    if (await getNonSensitiveValue(passphraseExistsKey(userId, fingerprint)) === 'true') {
        try {
            const response = await SecureStorageModule.getSensitiveValue(
                passphraseStorageKey(userId, fingerprint),
            );

            const result = await handleSecureStorageResponse(response, 'get passphrase', value => value);
            if (result) {
                passphraseCache.set(cacheKey, result);
                return result;
            }
        } catch (error: any) {
            logger.warn('failed to get passphrase', { error });
            return null;
        }
    }

    return null;
};

export const clearIndexedBiometricPassphrases = async (userId: string): Promise<void> => {
    await clearIndexedPassphrases(userId);
};

export const clearPassphraseCacheForUser = (userId: string): void => {
    Array.from(passphraseCache.keys())
        .filter(key => key.startsWith(`${userId}_`))
        .forEach(key => passphraseCache.delete(key));
};
