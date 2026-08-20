/**
 * Local-session lock commands (APP-ARCH-001).
 *
 * The lock command performs the service-side secret clearing (DEK cache,
 * persisted lock marker, last-signed-in bookkeeping) and dispatches the
 * machine events that own the locally-locked transition.
 */

import { useCallback } from 'react';

import { logger } from '../../../utils/logger';
import {
  clearSessionTimer,
} from '../../security/services/activityService';
import { getUser } from '../domain/authUtils';
import { lockLocalSession } from '../services/localAuthSession';
import type { AuthCommandDeps } from './authCommandAdapters';
import { createAuthStateAdapters } from './authCommandAdapters';

export type LockCommands = {
  lock: () => Promise<void>;
};

export const useLockCommands = (deps: AuthCommandDeps): LockCommands => {
  const { dispatch, refs, services } = deps;
  const {
    localBiometricLockRef,
    pendingPasswordRef,
    runLoadUserRef,
    shouldPromptBiometricRef,
  } = refs;
  const { clearPendingBiometricPromptRetry } = services;

  const lock = useCallback(async (): Promise<void> => {
    dispatch({ type: 'LOCK_REQUESTED' });
    clearSessionTimer();
    clearPendingBiometricPromptRetry();
    shouldPromptBiometricRef.current = false;

    const currentUser = getUser();
    if (!currentUser) {
      dispatch({ type: 'LOADING_FINISHED' });
      dispatch({ type: 'CHECKING_INACTIVITY', checking: false });
      dispatch({ type: 'AUTH_UI_SETTLED' });
      return;
    }

    try {
      const adapters = createAuthStateAdapters(dispatch);
      await lockLocalSession({
        currentUser,
        localBiometricLockRef,
        pendingPasswordRef,
        runLoadUserRef,
        setPendingPassword: adapters.setPendingPassword,
        setUserDecrypted: adapters.setUserDecrypted,
        setLastSignedInUser: adapters.setLastSignedInUser,
        setSessionAuthenticated: adapters.setSessionAuthenticated,
        setIsLocalSessionLocked: adapters.setIsLocalSessionLocked,
        setUser: adapters.setUser,
        setFbUser: adapters.setFbUser,
        setIsCheckingInactivity: adapters.setIsCheckingInactivity,
        setIsAuthLoading: adapters.setIsAuthLoading,
        setAuthCompleted: adapters.setAuthCompleted,
        setLastUsedBiometricSignIn: adapters.setLastUsedBiometricSignIn,
      });
    } catch (error: any) {
      dispatch({ type: 'LOADING_FINISHED' });
      logger.error('lock failed', { error });
      throw new Error(error.message || 'Lock failed');
    }
  }, [dispatch, refs, clearPendingBiometricPromptRetry]);

  return { lock };
};
