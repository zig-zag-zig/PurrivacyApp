import type {
    KeyGenerationOptions,
    KeyPair,
    UserCreatePayload,
    UserDecrypted,
    UserEncrypted,
} from '../../../types/types';
import {
    changeExpiration,
    changePassphrase,
    createKey,
    deleteKey,
    importKey,
    setDefaultKey,
} from './keyMutationService';
import {
    createEncryptedUser,
    getUserDecrypted,
    getUserEncrypted,
    updateEncryptedKeys,
} from './keyRepository';

export class PgPKeyService {
    static async createKey(
        userId: string,
        keyGenerationOptions: KeyGenerationOptions,
        setAsDefault?: boolean
    ): Promise<KeyPair | null> {
        return createKey(userId, keyGenerationOptions, setAsDefault);
    }

    static async importKey(
        userId: string,
        armoredKey: string,
        linkedArmoredKey: string | null = null,
        setAsDefault?: boolean
    ): Promise<KeyPair | null> {
        return importKey(userId, armoredKey, linkedArmoredKey, setAsDefault);
    }

    static async encryptAndCreate(userId: string, userDecrypted: UserCreatePayload, dek: string) {
        return createEncryptedUser(userId, userDecrypted, dek);
    }

    static async encryptAndUpdateKeys(userId: string, keys: KeyPair[]) {
        return updateEncryptedKeys(userId, keys);
    }

    static async getUserEncrypted(): Promise<UserEncrypted | null> {
        return getUserEncrypted();
    }

    static async getUserDecrypted(userId: string): Promise<UserDecrypted | null> {
        return getUserDecrypted(userId);
    }

    static async deleteKey(
        userId: string,
        key: KeyPair,
    ): Promise<void> {
        return deleteKey(userId, key);
    }

    static async changePassphrase(userId: string, fingerprint: string, oldPassphrase: string, newPassphrase: string, newPassphraseConfirm: string) {
        return changePassphrase(userId, fingerprint, oldPassphrase, newPassphrase, newPassphraseConfirm);
    }

    static async changeExpiration(userId: string, fingerprint: string, passphrase: string, days: string) {
        return changeExpiration(userId, fingerprint, passphrase, days);
    }

    static async setDefaultKey(userId: string, fingerprint: string): Promise<void> {
        return setDefaultKey(userId, fingerprint);
    }
}
