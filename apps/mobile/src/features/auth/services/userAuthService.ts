import { User, UserCredential } from 'firebase/auth';
import { createUserWithEmailAndPassword, deleteUser, fetchSignInMethodsForEmail, signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../../config/firebase';
import { AuthService } from './authService';
import { PgpKeyService } from '../../keys/services/pgpKeyService';
import { UserRegistrationService } from './userRegistrationService';
import { securityService } from '../../security/services/securityService';
import { UserDecrypted, UserEncrypted } from '../../../types/types';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { normalizeUsername, usernameToAuthEmail } from '../domain/usernameIdentity';
import { logger } from '../../../utils/logger';
/**
 * Service for user authentication and user data operations
 */
export class UserAuthService {
    /**
     * Register a new user
     */
    static async signUp(username: string, password: string, seed: string): Promise<UserCredential> {
        try {
            const result = await createUserWithEmailAndPassword(auth, usernameToAuthEmail(username), password);

            try {
                await UserRegistrationService.registerUser(result.user.uid, password, seed);
            } catch (registrationError) {
                await deleteUser(result.user).catch((cleanupError) => {
                    logger.warn('failed to clean up firebase user after registration failure', { error: cleanupError });
                });
                throw registrationError;
            }

            return result;
        } catch (error: any) {
            throw error;
        }
    }

    /**
     * Check whether a username is already registered.
     * Uses Firebase's read-only fetchSignInMethodsForEmail — no auth required.
     */
    static async isUsernameTaken(username: string): Promise<boolean> {
        try {
            const methods = await fetchSignInMethodsForEmail(auth, usernameToAuthEmail(username));
            return methods.length > 0;
        } catch (error) {
            logger.warn('isUsernameTaken check failed', { error });
            return false;
        }
    }

    /**
     * Sign in with username and password through Firebase's synthetic email identity.
     */
    static async signInWithUsernamePassword(username: string, password: string): Promise<User> {
        if (normalizeUsername(username).length === 0 || !password) {
            throw new Error('Username and password are required');
        }
        const credential = await signInWithEmailAndPassword(auth, usernameToAuthEmail(username), password);
        const dekLocal = await securityService.hasDek(credential.user.uid);

        if (dekLocal) {
            await BiometricAuthService.setLastUsedAuthWasBiometricSignIn(normalizeUsername(username), false);
        }

        return credential.user;
    }

    /**
     * Sign in with Firebase custom token
     */
    static async signInWithCustomToken(customToken: string): Promise<User> {
        if (!customToken || customToken.trim() === '') {
            throw new Error('Custom token is empty');
        }

        const userCredential = await signInWithCustomToken(auth, customToken);
        // Force refresh the ID token to ensure we have a valid token for session creation
        await userCredential.user.getIdToken(true);
        return userCredential.user;
    }

    /**
     * Load encrypted user data
     */
    static async loadUserEncrypted(user: User): Promise<UserEncrypted | null> {
        if (!user) return null;

        try {
            const session = await securityService.getStoredSession(user.uid);
            if (!session) {
                return null;
            }

            // Check if the stored refresh token is expired or about to expire.
            const expiresAt = new Date(session.refreshTokenExpiresAt);
            const now = new Date();
            const timeUntilExpiry = expiresAt.getTime() - now.getTime();
            const TEN_MINUTES_MS = 10 * 60 * 1000;

            if (timeUntilExpiry < TEN_MINUTES_MS) {
                return null;
            }

            return await PgpKeyService.getUserEncrypted();
        } catch (error) {
            logger.warn('failed to load encrypted user data', { error });
            return null;
        }
    }

    /**
     * Load decrypted user data
     */
    static async loadUserDecrypted(user: User): Promise<UserDecrypted | null> {
        let decryptedUser: UserDecrypted | null = null;
        try {
            if (!user) {
                return null;
            }
            decryptedUser = await PgpKeyService.getUserDecrypted(user.uid);
            return decryptedUser;
        } catch (error) {
            logger.warn('failed to load decrypted user data', { error });
            return null;
        }
    }

    /**
     * Handle user session authentication (post-signin setup)
     */
    static async handlePostSignIn(
        user: User,
        registerPushToken: (token: string) => Promise<void>
    ): Promise<void> {
        if (user) {
            try {
                // Load user data (if needed)
                // Note: This function can be extended to do more post-signin setup
                await registerPushToken;
            } catch (error) {
                logger.warn('post-sign-in setup failed', { error });
            }
        }
    }

    /**
     * Clear user data from secure storage
     */
    static async clearUserSecureData(userId: string, username: string): Promise<void> {
        await securityService.clearSecureStorage(userId, username);
    }
}
