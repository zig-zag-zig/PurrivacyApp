import { AuthService } from './authService';
import { PgPKeyService } from '../../keys/services/pgpKeyService';
import { UserCreatePayload } from '../../../types/types';
import { logger } from '../../../utils/logger';

export class UserRegistrationService {
    /**
     * Register a new user by generating encryption keys and storing them.
     */
    static async registerUser(
        userId: string,
        password: string,
        recoverySeed: string,
    ): Promise<void> {
        try {
            const { passwordEncrypted, seedEncrypted, dek } =
                await AuthService.generateEncryptionKeys(password, recoverySeed);
            const { recoveryVerifierSalt, recoveryVerifierHash } =
                await AuthService.generateRecoveryVerifier(recoverySeed);

            const user: UserCreatePayload = {
                dekPassword: passwordEncrypted,
                dekSeed: seedEncrypted,
                keys: [],
                recoveryVerifierSalt,
                recoveryVerifierHash,
            };

            await PgPKeyService.encryptAndCreate(userId, user, dek);
        } catch (error) {
            logger.warn('registration failed', { error });
            throw new Error('Failed to register user');
        }
    }
}
