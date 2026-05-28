import { useEffect } from 'react';
import { User, onIdTokenChanged } from 'firebase/auth';
import { auth } from '../../../config/firebase';
import { securityService } from '../../security/services/securityService';
import { inactiveTooLong } from '../../security/services/activityService';
import { LastSignedInUser } from '../../../types/types';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import { logger } from '../../../utils/logger';

const AUTH_STATE_READY_TIMEOUT_MS = 5000;

const waitWithTimeout = async (promise: Promise<void>, timeoutMs: number): Promise<boolean> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            promise.then(() => true),
            new Promise<false>((resolve) => {
                timeoutId = setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

export const useFirebaseAuth = (
    userRef: React.RefObject<User | null>,
    setFbUser: (user: User | null) => void,
    setLastSignedInUser: (user: LastSignedInUser | null) => void,
    userInitAuthRef: React.RefObject<boolean>,
    loginWithReauthenticateWithCredentialRef: React.RefObject<boolean>,
    suppressLastSignedInUserPersistRef: React.RefObject<boolean>,
    legitCustomTokenSignInRef: React.RefObject<boolean>,
    registrationInProgressRef: React.RefObject<boolean>,
    lock: () => Promise<void>,
    setAuthCompleted: (completed: boolean) => void,
    setSessionAuthenticated: (authenticated: boolean) => void,
    setIsCheckingInactivity: (isCheckingInactivity: boolean) => void,
    setUser: (user: User | null) => void,
    setIsAuthLoading: (isLoading: boolean) => void,
    runLoadUserRef: React.RefObject<boolean>,
    localBiometricLockRef: React.RefObject<boolean>,
    forceNewSessionOnNextAuthRef: React.RefObject<boolean>
) => {
    useEffect(() => {
        let customToken = false;
        let cancelled = false;
        let unsubscribeAuth: (() => void) | undefined;
        let handledInitialAuthState = false;
        let initialAuthFallbackTimeout: ReturnType<typeof setTimeout> | undefined;

        const handleAuthState = async (currentUser: User | null) => {
            handledInitialAuthState = true;
            if (initialAuthFallbackTimeout) {
                clearTimeout(initialAuthFallbackTimeout);
                initialAuthFallbackTimeout = undefined;
            }

            try {
                const tokenResult = await currentUser?.getIdTokenResult();
                customToken = tokenResult?.claims.signInMethod === 'customToken';
                const shouldPersistLastSignedInUser = (
                    !suppressLastSignedInUserPersistRef.current &&
                    (!customToken || legitCustomTokenSignInRef.current) &&
                    !loginWithReauthenticateWithCredentialRef.current
                );
                if (shouldPersistLastSignedInUser) {
                    if (!currentUser && userRef.current) {
                        const lastSignedInUser = {
                            uid: userRef.current.uid,
                            username: getUsernameFromUser(userRef.current),
                        };
                        setLastSignedInUser(lastSignedInUser);
                        await securityService.getOrSetLastSignedInUserInSecureStorage("SET", lastSignedInUser);
                    }
                } else if (!currentUser && suppressLastSignedInUserPersistRef.current) {
                    setLastSignedInUser(null);
                    await securityService.clearLastSignedInUser();
                }
            } catch (error) {
                logger.warn('id token change handler failed', { error });
            } finally {
                userRef.current = currentUser;

                if (!currentUser) {
                    localBiometricLockRef.current = false;
                    setIsAuthLoading(false);
                    setAuthCompleted(true);
                    runLoadUserRef.current = false;
                    setSessionAuthenticated(false);
                    setUser(null);
                    setIsCheckingInactivity(false);
                } else if (localBiometricLockRef.current) {
                    setIsAuthLoading(false);
                    setAuthCompleted(true);
                    runLoadUserRef.current = false;
                    setSessionAuthenticated(false);
                    setUser(null);
                    setIsCheckingInactivity(false);
                    setFbUser(null);
                    return;
                } else {
                    if (registrationInProgressRef.current) {
                        return;
                    }

                    if (userInitAuthRef.current && !forceNewSessionOnNextAuthRef.current) {
                        return;
                    }

                    if (!userInitAuthRef.current) {
                        const isLocallyLocked = await securityService.isLocalSessionLocked(currentUser.uid);
                        const hasActiveDek = Boolean(await securityService.getDek(currentUser.uid));
                        if (isLocallyLocked || !hasActiveDek) {
                            const lastSignedInUser = {
                                uid: currentUser.uid,
                                username: getUsernameFromUser(currentUser),
                            };
                            localBiometricLockRef.current = true;
                            await securityService.setLocalSessionLocked(currentUser.uid, true);
                            setLastSignedInUser(lastSignedInUser);
                            await securityService.getOrSetLastSignedInUserInSecureStorage("SET", lastSignedInUser);
                            setIsAuthLoading(false);
                            setAuthCompleted(true);
                            runLoadUserRef.current = false;
                            setSessionAuthenticated(false);
                            setUser(null);
                            setIsCheckingInactivity(false);
                            setFbUser(null);
                            return;
                        }

                        if (await inactiveTooLong(currentUser.uid)) {
                            await lock();
                            return;
                        }
                    }
                }

                setFbUser(currentUser);
            }
        };

        const subscribeAfterInitialAuthReady = async () => {
            const authStateReady = (auth as unknown as { authStateReady?: () => Promise<void> }).authStateReady;
            if (authStateReady) {
                const completed = await waitWithTimeout(
                    authStateReady.call(auth),
                    AUTH_STATE_READY_TIMEOUT_MS,
                );

                if (!completed) {
                    logger.warn('firebase auth state readiness timed out; subscribing anyway');
                }
            }

            if (cancelled) {
                return;
            }

            unsubscribeAuth = onIdTokenChanged(auth, handleAuthState);
            initialAuthFallbackTimeout = setTimeout(() => {
                if (cancelled || handledInitialAuthState) {
                    return;
                }

                logger.warn('firebase auth listener did not emit initial state; showing signed-out UI');
                setIsAuthLoading(false);
                setAuthCompleted(true);
                runLoadUserRef.current = false;
                setSessionAuthenticated(false);
                setUser(null);
                setIsCheckingInactivity(false);
                setFbUser(null);
            }, AUTH_STATE_READY_TIMEOUT_MS);
        };

        subscribeAfterInitialAuthReady().catch((error) => {
            logger.warn('failed to wait for firebase auth state', { error });
            if (!cancelled) {
                unsubscribeAuth = onIdTokenChanged(auth, handleAuthState);
            }
        });

        return () => {
            cancelled = true;
            if (initialAuthFallbackTimeout) {
                clearTimeout(initialAuthFallbackTimeout);
            }
            unsubscribeAuth?.();
        };
    }, []);
};
