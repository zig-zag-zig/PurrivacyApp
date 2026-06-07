import { RefObject } from 'react';
import { User } from 'firebase/auth';

import { ApiClient } from '../../../api/client';
import { EventService } from '../../../services/eventService';
import { UserDecrypted } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { resetSessionTimer } from '../../security/services/activityService';
import {
  isMfaRequiredAuthError,
  isRateLimitError,
  shouldEndPartialBackendAuth,
} from '../domain/authErrorGuards';

type Setter<T> = (value: T) => void;

type CompleteAuthenticatedUiParams = {
  setIsAuthLoading: Setter<boolean>;
  setIsCheckingInactivity: Setter<boolean>;
  setAuthCompleted: Setter<boolean>;
};

export const completeAuthenticatedUi = ({
  setIsAuthLoading,
  setIsCheckingInactivity,
  setAuthCompleted,
}: CompleteAuthenticatedUiParams): void => {
  setIsAuthLoading(false);
  setIsCheckingInactivity(false);
  setAuthCompleted(true);
};

type FinishAuthenticatedSessionParams = CompleteAuthenticatedUiParams & {
  currentUser: User | null;
  shouldPromptBiometric: boolean;
  lock: () => Promise<void>;
  runLoadUserRef: RefObject<boolean>;
  pendingPasswordRef: RefObject<string | null>;
  loadUser: () => Promise<UserDecrypted | null>;
  promptBiometricWhenDekIsReady: (currentUser: User) => Promise<void>;
  initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
  registerForPushNotificationsAsync: (savePushToken: (token: string) => Promise<void>) => Promise<void>;
  setIsBiometricAvailable: Setter<boolean>;
  setIsBiometricEnabled: Setter<boolean>;
};

export const finishAuthenticatedSession = async ({
  currentUser,
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
}: FinishAuthenticatedSessionParams): Promise<void> => {
  if (!currentUser) {
    setIsBiometricAvailable(false);
    setIsBiometricEnabled(false);
    return;
  }

  try {
    await resetSessionTimer(currentUser.uid, lock);
  } catch (error) {
    logger.warn('failed to reset session timer', { error });
  }

  const shouldWaitForUserData = runLoadUserRef.current || Boolean(pendingPasswordRef.current);

  const loadedUser = runLoadUserRef.current ? await loadUser() : null;
  if (runLoadUserRef.current && !loadedUser) {
    EventService.addEvent('closeMfaModal', { force: true });
    await lock();
    return;
  }
  if (!shouldWaitForUserData || loadedUser) {
    completeAuthenticatedUi({ setIsAuthLoading, setIsCheckingInactivity, setAuthCompleted });
  }

  if (shouldPromptBiometric) {
    promptBiometricWhenDekIsReady(currentUser).catch((error) => {
      logger.warn('failed to prompt biometric setup', { error });
    });
  }

  try {
    await initializeBiometricState();
  } catch (error) {
    logger.warn('failed to initialize biometric state', { error });
  }

  try {
    await registerForPushNotificationsAsync(ApiClient.savePushToken);
  } catch (error) {
    logger.warn('push registration failed', { error });
  }
};

type CreateBackendAuthSessionParams = {
  isGettingSessionRef: RefObject<boolean>;
  userInitAuthRef: RefObject<boolean>;
  forceNewSessionOnNextAuthRef: RefObject<boolean>;
  shouldPromptBiometricRef: RefObject<boolean>;
  setSessionAuthenticated: Setter<boolean>;
  setIsAuthLoading: Setter<boolean>;
  setAuthCompleted: Setter<boolean>;
  showToast: (message: string, type: 'error') => void;
  clearPartialFirebaseAuth: () => Promise<void>;
  signOut: () => Promise<void>;
  lock: () => Promise<void>;
};

const resetSessionIntentRefs = (
  userInitAuthRef: RefObject<boolean>,
  forceNewSessionOnNextAuthRef: RefObject<boolean>,
  shouldPromptBiometricRef: RefObject<boolean>,
): void => {
  userInitAuthRef.current = false;
  forceNewSessionOnNextAuthRef.current = false;
  shouldPromptBiometricRef.current = false;
};

export const createBackendAuthSession = async ({
  isGettingSessionRef,
  userInitAuthRef,
  forceNewSessionOnNextAuthRef,
  shouldPromptBiometricRef,
  setSessionAuthenticated,
  setIsAuthLoading,
  setAuthCompleted,
  showToast,
  clearPartialFirebaseAuth,
  signOut,
  lock,
}: CreateBackendAuthSessionParams): Promise<void> => {
  if (isGettingSessionRef.current) {
    return;
  }

  isGettingSessionRef.current = true;
  const isUserInitiatedAuth = userInitAuthRef.current;
  const forceNewSession = forceNewSessionOnNextAuthRef.current;

  try {
    await ApiClient.createSession(isUserInitiatedAuth, undefined, forceNewSession);
    userInitAuthRef.current = false;
    forceNewSessionOnNextAuthRef.current = false;
    setSessionAuthenticated(true);
  } catch (error: any) {
    setIsAuthLoading(false);
    if (error.retryAfter) {
      showToast(getUserFacingErrorMessage(error, 'Too many attempts. Please try again later.'), 'error');
    }

    if (isRateLimitError(error)) {
      setSessionAuthenticated(false);
      resetSessionIntentRefs(userInitAuthRef, forceNewSessionOnNextAuthRef, shouldPromptBiometricRef);

      if (isUserInitiatedAuth) {
        try {
          await clearPartialFirebaseAuth();
        } catch (cleanupError) {
          logger.warn('failed to clear partial auth after rate limit', { error: cleanupError });
          setAuthCompleted(true);
        }
        return;
      }

      setAuthCompleted(true);
      return;
    }

    if (shouldEndPartialBackendAuth(error)) {
      setSessionAuthenticated(false);
      resetSessionIntentRefs(userInitAuthRef, forceNewSessionOnNextAuthRef, shouldPromptBiometricRef);

      try {
        await signOut();
      } catch (cleanupError) {
        logger.warn('failed to clear partial auth after session failure', { error: cleanupError });
        setAuthCompleted(true);
      }
      return;
    }

    if (isUserInitiatedAuth && !isMfaRequiredAuthError(error)) {
      showToast(getUserFacingErrorMessage(error, 'Failed to sign in. Please try again.'), 'error');
      setSessionAuthenticated(false);
      resetSessionIntentRefs(userInitAuthRef, forceNewSessionOnNextAuthRef, shouldPromptBiometricRef);

      try {
        await clearPartialFirebaseAuth();
      } catch (cleanupError) {
        logger.warn('failed to clear partial auth after session failure', { error: cleanupError });
        setAuthCompleted(true);
      }
      return;
    }

    if (isMfaRequiredAuthError(error)) {
      setSessionAuthenticated(false);
      resetSessionIntentRefs(userInitAuthRef, forceNewSessionOnNextAuthRef, shouldPromptBiometricRef);

      if (!isUserInitiatedAuth) {
        try {
          await lock();
        } catch {
          setAuthCompleted(true);
        }
        return;
      }
    }

    if (!(error.mfaRequired || error.mfaRequiredSensitive)) {
      setSessionAuthenticated(false);
    }

    resetSessionIntentRefs(userInitAuthRef, forceNewSessionOnNextAuthRef, shouldPromptBiometricRef);
    throw error;
  } finally {
    isGettingSessionRef.current = false;
  }
};
