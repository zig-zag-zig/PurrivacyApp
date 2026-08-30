import { User, UserEncryptedData } from '../../../core/types';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';
import { readUserEncryptedKeys } from '../infrastructure/UserKeyRepository';
import { getUserDoc, getUserWithFieldMask } from '../infrastructure/UserRepository';

export const getUser = async (userId: string): Promise<User> => {
    const doc = await getUserDoc(userId);
    const data = doc.data();
    const keys = await readUserEncryptedKeys(userId);
    return { ...data, keys } as User;
};

export const getUserMfaState = async (userId: string): Promise<{ mfaEnabled: boolean }> => {
    const doc = await getUserWithFieldMask(userId, ['mfaEnabled']);
    return { mfaEnabled: doc.get('mfaEnabled') === true };
};

export const getEncryptedUser = async (userId: string): Promise<UserEncryptedData> => {
    const doc = await getUserWithFieldMask(userId, ['dekPassword', 'dekSeed', 'passphraseStorageEnabled']);
    const keys = await readUserEncryptedKeys(userId);
    const data = { ...doc.data(), keys };
    const sanitized = EncryptedUserDataValidator.sanitizeUserEncryptedData(data);
    // Thread through the passphrase storage setting so the client can auto-sync on login
    const passphraseStorageEnabled = doc.get('passphraseStorageEnabled');
    if (typeof passphraseStorageEnabled === 'boolean') {
        (sanitized as unknown as Record<string, unknown>).passphraseStorageEnabled = passphraseStorageEnabled;
    }
    return sanitized;
};

