import { Encryption, EncryptionBase, UserDecrypted, UserEncrypted } from '../../../types/types';
import { securityService } from '../../security/services/securityService';

import { ApiClient } from '../../../api/client';
import {
    decryptData,
    encryptData,
    encryptDek,
    generateEncryptionKeys,
} from './authCrypto';
import {
    deriveRecoveryVerifier,
    generateRecoveryVerifier,
    generateSeed,
    getThreeUniqueRandomIndices,
    normalizeSeedPhrase,
    verifySeed,
} from './recoverySeedService';
import { logger } from '../../../utils/logger';

export class AuthService {
    static generateSeed(): string {
        return generateSeed();
    }

    static normalizeSeedPhrase(seedPhrase: string): string {
        return normalizeSeedPhrase(seedPhrase);
    }

    static getThreeUniqueRandomIndices(seed: string): number[] {
        return getThreeUniqueRandomIndices(seed);
    }

    static verifySeed(
        seed: string,
        answers: Record<number, string>,
        positions: number[]
    ): boolean {
        return verifySeed(seed, answers, positions);
    }

    static async generateEncryptionKeys(
        password: string,
        recoverySeed: string
    ): Promise<{
        passwordEncrypted: Encryption;
        seedEncrypted: Encryption;
        dek: string;
    }> {
        return generateEncryptionKeys(password, recoverySeed);
    }

    static async generateRecoveryVerifier(seedPhrase: string): Promise<{ recoveryVerifierSalt: string; recoveryVerifierHash: string }> {
        return generateRecoveryVerifier(seedPhrase);
    }

    static async deriveRecoveryVerifier(seedPhrase: string, recoveryVerifierSalt: string): Promise<string> {
        return deriveRecoveryVerifier(seedPhrase, recoveryVerifierSalt);
    }

    static async encrypt(
        data: object | string,
        key: string, // hex string
    ): Promise<EncryptionBase> {
        return encryptData(data, key);
    }

    static async decrypt(
        userId: string,
        encryptedData: string,
        keyMaterial: string,
        iv: string,
        keyIsPasswordOrSeed: boolean,
        tag: string,
        salt?: string,
    ): Promise<string> {
        return decryptData({
            userId,
            encryptedData,
            keyMaterial,
            iv,
            keyIsPasswordOrSeed,
            tag,
            salt,
        });
    }

    static async resetPasswordWithSeed(
        userId: string,
        userEncrypted: UserEncrypted,
        newPassword: string,
        seedPhrase: string,
    ): Promise<void> {
        try {
            const dek = await AuthService.decrypt(
                userId,
                userEncrypted.dekSeed.encryptedData,
                AuthService.normalizeSeedPhrase(seedPhrase),
                userEncrypted.dekSeed.iv,
                true,
                userEncrypted.dekSeed.tag,
                userEncrypted.dekSeed.salt,
            );

            const passwordEncrypted = await encryptDek(dek, newPassword);

            await ApiClient.changeDekPassword(passwordEncrypted);

            await securityService.setDek(userId, dek);

        } catch (error) {
            logger.warn('password reset with seed failed', { error });
            throw new Error('Failed to reset password');
        }
    }

    static async changePassword(
        userId: string,
        userDecrypted: UserDecrypted,
        currentPassword: string,
        newPassword: string,
    ): Promise<void> {
        try {
            const dek = await AuthService.decrypt(
                userId,
                userDecrypted.dekPassword.encryptedData,
                currentPassword,
                userDecrypted.dekPassword.iv,
                true,
                userDecrypted.dekPassword.tag,
                userDecrypted.dekPassword.salt
            );

            const passwordEncrypted = await encryptDek(dek, newPassword);

            await ApiClient.changeDekPassword(passwordEncrypted);
        } catch (error) {
            logger.warn('password change failed', { error });
            throw new Error('Failed to change password');
        }
    }
}
