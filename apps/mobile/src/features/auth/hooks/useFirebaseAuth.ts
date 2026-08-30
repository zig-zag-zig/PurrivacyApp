import { useEffect } from 'react';
import { User, onIdTokenChanged } from 'firebase/auth';
import { auth } from '../../../config/firebase';
import { securityService } from '../../security/services/securityService';
import { inactiveTooLong } from '../../security/services/activityService';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import { logger } from '../../../utils/logger';
import type { AuthRuntimeRefs } from '../model/authRuntimeTypes';
import type { AuthDispatch } from '../state/authStateMachine';

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

type FirebaseAuthRefs = Pick<
    AuthRuntimeRefs,
    | 'forceNewSessionOnNextAuthRef'
    | 'legitCustomTokenSignInRef'
    | 'localBiometricLockRef'
    | 'loginWithReauthenticateWithCredentialRef'
    | 'registrationInProgressRef'
    | 'runLoadUserRef'
    | 'suppressLastSignedInUserPersistRef'
    | 'userInitAuthRef'
    | 'userRef'
>;

type UseFirebaseAuthParams = {
    lock: () => Promise<void>;
    refs: FirebaseAuthRefs;
    dispatch: AuthDispatch;
};

export const useFirebaseAuth = ({
    lock,
    refs,
    dispatch,
}: UseFirebaseAuthParams) => {
    const {
        forceNewSessionOnNextAuthRef,
        legitCustomTokenSignInRef,
        localBiometricLockRef,
        loginWithReauthenticateWithCredentialRef,
        registrationInProgressRef,
        runLoadUserRef,
        suppressLastSignedInUserPersistRef,
        userInitAuthRef,
        userRef,
    } = refs;

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
                        dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: lastSignedInUser });
                        await securityService.getOrSetLastSignedInUserInSecureStorage("SET", lastSignedInUser);
                    }
                } else if (!currentUser && suppressLastSignedInUserPersistRef.current) {
                    dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: null });
                    await securityService.clearLastSignedInUser();
                    suppressLastSignedInUserPersistRef.current = false;
                }
            } catch (error) {
                logger.warn('id token change handler failed', { error });
            } finally {
                userRef.current = currentUser;

                if (!currentUser) {
                    localBiometricLockRef.current = false;
                    runLoadUserRef.current = false;
                    dispatch({ type: 'FIREBASE_USER_LOST' });
                    return;
                } else if (localBiometricLockRef.current) {
                    runLoadUserRef.current = false;
                    dispatch({
                        type: 'LOCAL_LOCK_DETECTED',
                        lastSignedInUser: {
                            uid: currentUser.uid,
                            username: getUsernameFromUser(currentUser),
                        },
                    });
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
                            dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: lastSignedInUser });
                            await securityService.getOrSetLastSignedInUserInSecureStorage("SET", lastSignedInUser);
                            runLoadUserRef.current = false;
                            dispatch({
                                type: 'LOCAL_LOCK_DETECTED',
                                lastSignedInUser,
                            });
                            return;
                        }

                        if (await inactiveTooLong(currentUser.uid)) {
                            await lock();
                            return;
                        }
                    }
                }

                dispatch({ type: 'FIREBASE_USER_ESTABLISHED', user: currentUser });
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
                runLoadUserRef.current = false;
                dispatch({ type: 'FIREBASE_USER_LOST' });
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
