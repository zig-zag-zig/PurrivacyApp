import { RefObject, useEffect } from 'react';
import type { User } from 'firebase/auth';

import { useRegisterForPushNotifications } from '../../../hooks/useRegisterForPushNotifications';
import type { UserDecrypted } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { getUser } from '../domain/authUtils';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import {
  completeAuthenticatedUi,
  finishAuthenticatedSession,
} from '../services/sessionAuthenticationFlow';

type Setter<T> = (value: T) => void;

type UseAuthSessionLifecycleParams = {
  sessionAuthenticated: boolean;
  fbUser: User | null;
  user: User | null;
  userDecrypted: UserDecrypted | null;
  isAuthLoading: boolean;
  shouldPromptBiometricRef: RefObject<boolean>;
  runLoadUserRef: RefObject<boolean>;
  pendingPasswordRef: RefObject<string | null>;
  lock: () => Promise<void>;
  loadUser: () => Promise<UserDecrypted | null>;
  promptBiometricWhenDekIsReady: (currentUser: User) => Promise<void>;
  initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
  createSession: () => Promise<void>;
  setUser: Setter<User | null>;
  setIsLocalSessionLocked: Setter<boolean>;
  setIsBiometricAvailable: Setter<boolean>;
  setIsBiometricEnabled: Setter<boolean>;
  setIsAuthLoading: Setter<boolean>;
  setIsCheckingInactivity: Setter<boolean>;
  setAuthCompleted: Setter<boolean>;
  setLastUsedBiometricSignIn: Setter<boolean>;
};

export function useAuthSessionLifecycle({
  sessionAuthenticated,
  fbUser,
  user,
  userDecrypted,
  isAuthLoading,
  shouldPromptBiometricRef,
  runLoadUserRef,
  pendingPasswordRef,
  lock,
  loadUser,
  promptBiometricWhenDekIsReady,
  initializeBiometricState,
  createSession,
  setUser,
  setIsLocalSessionLocked,
  setIsBiometricAvailable,
  setIsBiometricEnabled,
  setIsAuthLoading,
  setIsCheckingInactivity,
  setAuthCompleted,
  setLastUsedBiometricSignIn,
}: UseAuthSessionLifecycleParams): void {
  const { registerForPushNotificationsAsync } = useRegisterForPushNotifications();

  useEffect(() => {
    if (sessionAuthenticated && fbUser) {
      const shouldPromptBiometric = shouldPromptBiometricRef.current;

      setIsLocalSessionLocked(false);
      setUser(fbUser);
      finishAuthenticatedSession({
        currentUser: fbUser,
        shouldPromptBiometric,
        lock,
        runLoadUserRef,
        pendingPasswordRef,
        loadUser,
        promptBiometricWhenDekIsReady,
        initializeBiometricState,
        registerForPushNotificationsAsync,
        setIsBiometricAvailable,
        setIsBiometricEnabled,
        setIsAuthLoading,
        setIsCheckingInactivity,
        setAuthCompleted,
      })
        .catch((error) => {
          logger.warn('failed to finish authenticated session setup', { error });
        })
    }
  }, [sessionAuthenticated, fbUser]);

  useEffect(() => {
    if (sessionAuthenticated && user && userDecrypted && isAuthLoading) {
      completeAuthenticatedUi({
        setIsAuthLoading,
        setIsCheckingInactivity,
        setAuthCompleted,
      });
    }
  }, [sessionAuthenticated, user, userDecrypted, isAuthLoading]);

  useEffect(() => {
    const sessionCreationAfterFirebaseAuth = async () => {
      if (fbUser) {
        if (getUser()?.uid !== fbUser.uid) {
          return;
        }

        try {
          setLastUsedBiometricSignIn(
            await BiometricAuthService.getLastUsedBiometricSignIn(getUsernameFromUser(fbUser) || ''),
          );
          await createSession();
        } catch (error) {
          setIsCheckingInactivity(false);
          setAuthCompleted(true);
          logger.warn('failed to create session after firebase authentication', { error });
        }
      }
    };
    sessionCreationAfterFirebaseAuth();
  }, [fbUser]);
}
