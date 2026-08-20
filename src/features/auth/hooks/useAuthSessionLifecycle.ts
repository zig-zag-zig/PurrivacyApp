import { useEffect } from 'react';
import type { User } from 'firebase/auth';

import { useRegisterForPushNotifications } from '../../../shared/hooks/useRegisterForPushNotifications';
import type { UserDecrypted } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { EventService } from '../../../services/eventService';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { getUser } from '../domain/authUtils';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import {
  finishAuthenticatedSession,
} from '../services/sessionAuthenticationFlow';
import type { AuthRuntimeRefs } from '../model/authRuntimeTypes';
import type { AuthDispatch } from '../state/authStateMachine';

const AUTH_MFA_HOME_HANDOFF_DELAY_MS = 75;

type AuthSessionLifecycleRefs = Pick<
  AuthRuntimeRefs,
  | 'pendingPasswordRef'
  | 'runLoadUserRef'
  | 'shouldPromptBiometricRef'
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
    setBiometricAvailability: (available: boolean) => void;
    setBiometricEnabled: (enabled: boolean) => void;
  };
  dispatch: AuthDispatch;
};

export function useAuthSessionLifecycle({
  sessionAuthenticated,
  fbUser,
  user,
  userDecrypted,
  isAuthLoading,
  refs,
  services,
  dispatch,
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
    setBiometricAvailability,
    setBiometricEnabled,
  } = services;
  const { registerForPushNotificationsAsync } = useRegisterForPushNotifications();

  useEffect(() => {
    if (sessionAuthenticated && fbUser) {
      const shouldPromptBiometric = shouldPromptBiometricRef.current;

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
        setIsBiometricAvailable: setBiometricAvailability,
        setIsBiometricEnabled: setBiometricEnabled,
        setIsAuthLoading: (value) => {
          dispatch(value ? { type: 'LOADING_STARTED' } : { type: 'LOADING_FINISHED' });
        },
        setIsCheckingInactivity: (checking) => {
          dispatch({ type: 'CHECKING_INACTIVITY', checking });
        },
        setAuthCompleted: () => {
          // The unlock UI (local session lock) must stay visible until the
          // backend session is fully established: UNLOCK_SUCCEEDED is
          // dispatched in the same tick as the UI-settled transition, so the
          // screen never flips to the regular sign-in form mid-flow. It is a
          // reducer-level no-op outside the unlocking phase.
          dispatch({ type: 'UNLOCK_SUCCEEDED' });
          dispatch({ type: 'AUTH_UI_SETTLED' });
        },
      })
        .then(() => {
          // Session setup finished (or locked internally): signal UI readiness.
          // The reducer only honours this from eligible phases, so a lock
          // taken inside finishAuthenticatedSession cannot be undone.
          dispatch({ type: 'AUTHENTICATED_UI_READY' });
        })
        .catch(async (error) => {
          logger.warn('failed to finish authenticated session setup', { error });
          // Ensure terminal transition so flags do not remain stuck.
          // finishAuthenticatedSession already handles expected load/nil/timeout
          // failures by calling lock(); this catch covers unexpected rejection paths.
          try {
            await lock();
          } catch {
            // If lock itself throws, settle flags directly to prevent infinite spinner.
            dispatch({ type: 'LOADING_FINISHED' });
            dispatch({ type: 'CHECKING_INACTIVITY', checking: false });
            dispatch({ type: 'AUTH_UI_SETTLED' });
          }
        });
    }
  }, [sessionAuthenticated, fbUser]);

  useEffect(() => {
    if (sessionAuthenticated && user && userDecrypted && isAuthLoading) {
      dispatch({ type: 'AUTHENTICATED_UI_READY' });
    }
  }, [sessionAuthenticated, user, userDecrypted, isAuthLoading, dispatch]);

  useEffect(() => {
    const sessionCreationAfterFirebaseAuth = async () => {
      if (fbUser) {
        if (getUser()?.uid !== fbUser.uid) {
          return;
        }

        try {
          dispatch({
            type: 'BIOMETRIC_SIGN_IN_MARKED',
            used: await BiometricAuthService.getLastUsedBiometricSignIn(getUsernameFromUser(fbUser) || ''),
          });
          await createSession();
        } catch (error) {
          dispatch({ type: 'CHECKING_INACTIVITY', checking: false });
          dispatch({ type: 'AUTH_UI_SETTLED' });
          logger.warn('failed to create session after firebase authentication', { error });
        }
      }
    };
    sessionCreationAfterFirebaseAuth();
  }, [fbUser, createSession, dispatch]);
}
