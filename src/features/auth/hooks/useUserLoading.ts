import { useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { UserAuthService } from '../services/userAuthService';
import { UserDecrypted } from '../../../types/types';
import { AuthService } from '../services/authService';
import { logger } from '../../../utils/logger';
import type { AuthDispatch } from '../state/authStateMachine';

/**
 * Decrypted-user loading with lock/generation invalidation.
 *
 * `user`, `pendingPassword` and the committed `userDecrypted` value are owned
 * by the auth state machine; this hook performs the async load work and
 * dispatches `USER_DECRYPTED_CHANGED` / `PENDING_PASSWORD_CHANGED` events.
 */
export const useUserLoading = (
    user: User | null,
    pendingPassword: string | null,
    userRef: React.RefObject<User | null>,
    runLoadUserRef: React.RefObject<boolean>,
    dispatch: AuthDispatch,
) => {
    /** Bumps on lock / invalidation so late loadUser results never commit decrypted state. */
    const loadGenerationRef = useRef(0);

    const invalidateLoads = useCallback(() => {
        loadGenerationRef.current += 1;
        runLoadUserRef.current = false;
    }, [runLoadUserRef]);

    const loadUser = useCallback(async (): Promise<UserDecrypted | null> => {
        const generation = loadGenerationRef.current;
        let decryptedUser: UserDecrypted | null = null;
        try {
            if (!userRef.current || !runLoadUserRef.current) {
                return null;
            }
            decryptedUser = await UserAuthService.loadUserDecrypted(userRef.current);
            // Stale: locked / superseded while awaiting.
            if (
                generation !== loadGenerationRef.current
                || !runLoadUserRef.current
                || !userRef.current
            ) {
                return null;
            }
            return decryptedUser;
        } catch (error) {
            logger.warn('failed to load user', { error });
            return null;
        } finally {
            const stillValid =
                generation === loadGenerationRef.current
                && runLoadUserRef.current
                && Boolean(userRef.current);
            if (stillValid) {
                dispatch({ type: 'USER_DECRYPTED_CHANGED', userDecrypted: decryptedUser });
            }
        }
    }, [runLoadUserRef, userRef, dispatch]);

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
                    dispatch({ type: 'PENDING_PASSWORD_CHANGED', password: null });
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
    }, [user, pendingPassword, dispatch, loadUser, runLoadUserRef]);

    return {
        loadUser,
        invalidateLoads,
    };
};
