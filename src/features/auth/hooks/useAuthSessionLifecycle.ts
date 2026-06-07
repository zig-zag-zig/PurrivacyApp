import { useEffect } from 'react';
import type { User } from 'firebase/auth';

import { useRegisterForPushNotifications } from '../../../hooks/useRegisterForPushNotifications';
import type { UserDecrypted } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { EventService } from '../../../services/eventService';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { getUser } from '../domain/authUtils';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import {
  completeAuthenticatedUi,
  finishAuthenticatedSession,
} from '../services/sessionAuthenticationFlow';
import type { AuthRuntimeRefs, AuthStateSetters } from '../model/authRuntimeTypes';

const AUTH_MFA_HOME_HANDOFF_DELAY_MS = 75;

type AuthSessionLifecycleRefs = Pick<
  AuthRuntimeRefs,
  | 'pendingPasswordRef'
  | 'runLoadUserRef'
  | 'shouldPromptBiometricRef'
>;

type AuthSessionLifecycleSetters = Pick<
  AuthStateSetters,
  | 'setAuthCompleted'
  | 'setIsAuthLoading'
  | 'setIsBiometricAvailable'
  | 'setIsBiometricEnabled'
  | 'setIsCheckingInactivity'
  | 'setIsLocalSessionLocked'
  | 'setLastUsedBiometricSignIn'
  | 'setUser'
>;

type UseAuthSessionLifecycleParams = {
  sessionAuthenticated: boolean;
  fbUser: User | null;
  user: User | null;
  userDecrypted: UserDecrypted | null;
  isAuthLoading: boolean;
  refs: AuthSessionLifecycleRefs;
  services: {
    createSession: () => Promise<void>;
    initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
    loadUser: () => Promise<UserDecrypted | null>;
    lock: () => Promise<void>;
    promptBiometricWhenDekIsReady: (currentUser: User) => Promise<void>;
  };
  setters: AuthSessionLifecycleSetters;
};

export function useAuthSessionLifecycle({
  sessionAuthenticated,
  fbUser,
  user,
  userDecrypted,
  isAuthLoading,
  refs,
  services,
  setters,
}: UseAuthSessionLifecycleParams): void {
  const {
  shouldPromptBiometricRef,
  runLoadUserRef,
  pendingPasswordRef,
  } = refs;
  const {
  lock,
  loadUser,
  promptBiometricWhenDekIsReady,
  initializeBiometricState,
  createSession,
  } = services;
  const {
  setUser,
  setIsLocalSessionLocked,
  setIsBiometricAvailable,
  setIsBiometricEnabled,
  setIsAuthLoading,
  setIsCheckingInactivity,
  setAuthCompleted,
  setLastUsedBiometricSignIn,
  } = setters;
  const { registerForPushNotificationsAsync } = useRegisterForPushNotifications();

  useEffect(() => {
    if (sessionAuthenticated && fbUser) {
      const shouldPromptBiometric = shouldPromptBiometricRef.current;

      setIsLocalSessionLocked(false);
      setUser(fbUser);
      EventService.addEvent('closeMfaModal', { delayMs: AUTH_MFA_HOME_HANDOFF_DELAY_MS });
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
