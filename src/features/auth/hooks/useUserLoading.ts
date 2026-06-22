import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserAuthService } from '../services/userAuthService';
import { UserDecrypted } from '../../../types/types';
import { AuthService } from '../services/authService';
import { logger } from '../../../utils/logger';
export const useUserLoading = (
    user: User | null,
    userRef: React.RefObject<User | null>,
    runLoadUserRef: React.RefObject<boolean>
) => {
    const [userDecrypted, setUserDecrypted] = useState<UserDecrypted | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [pendingPassword, setPendingPassword] = useState<string | null>(null);

    const loadUser = async (): Promise<UserDecrypted | null> => {
        let decryptedUser: UserDecrypted | null = null;
        try {
            if (!userRef.current || !runLoadUserRef.current) {
                setUserDecrypted(null);
                return null;
            }
            decryptedUser = await UserAuthService.loadUserDecrypted(userRef.current);
            return decryptedUser;
        } catch (error) {
            logger.warn('failed to load user', { error });
            return null;
        } finally {
            setUserDecrypted(decryptedUser);
        }
    };

    // Handle pending password effect
    useEffect(() => {
        let cancelled = false;
        let retryCount = 0;
        const MAX_RETRIES = 5;
        const RETRY_DELAY_MS = 500;
        const retryTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

        const tryUnlock = async () => {
            if (cancelled || !user || !pendingPassword) return;

            let success = false;
            try {
                const encryptedUser = await UserAuthService.loadUserEncrypted(user);
                if (!encryptedUser) {
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        retryTimerRef.current = setTimeout(tryUnlock, RETRY_DELAY_MS);
                        return;
                    }
                    return;
                }

                await AuthService.decrypt(
                    user.uid,
                    encryptedUser.dekPassword.encryptedData,
                    pendingPassword,
                    encryptedUser.dekPassword.iv,
                    true,
                    encryptedUser.dekPassword.tag,
                    encryptedUser.dekPassword.salt
                );
                success = true;
            } catch (error: any) {
                logger.warn('failed to unlock user after sign-in', { error });
            } finally {
                if (success || retryCount >= MAX_RETRIES) {
                    setPendingPassword(null);
                    if (success) {
                        runLoadUserRef.current = true;
                        await loadUser();
                    }
                }
            }
        };

        tryUnlock();
        return () => {
            cancelled = true;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        };
    }, [user, pendingPassword]);

    return {
        userDecrypted,
        isAuthLoading,
        pendingPassword,
        setUserDecrypted,
        setIsAuthLoading,
        setPendingPassword,
        loadUser,
    };
};
