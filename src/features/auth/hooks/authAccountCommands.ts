/**
 * Account lifecycle commands (sign-out, deletion, secure-store clearing).
 *
 * Each command performs the effectful service work and dispatches state
 * machine events so the reducer owns every transition (APP-ARCH-001).
 */

import { useCallback } from 'react';
import type { User } from 'firebase/auth';
import { deleteUser as deleteFirebaseUser, signOut as firebaseSignOut } from 'firebase/auth';

import { ApiClient } from '../../../api/client';
import { auth } from '../../../config/firebase';
import type { LastSignedInUser } from '../../../types/types';
import { logger } from '../../../utils/logger';
import {
  clearLastActiveTime,
  clearSessionTimer,
} from '../../security/services/activityService';
import { securityService } from '../../security/services/securityService';
import { getUser, getUserId, getUsername } from '../domain/authUtils';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import {
  clearSecureStorageForUser,
  clearStoredSessionAndPushToken,
} from '../services/localAuthSession';
import type { AuthCommandDeps, AuthStateAdapters } from './authCommandAdapters';
import { createAuthStateAdapters } from './authCommandAdapters';

/**
 * Persist the last signed-in user (shared by sign-in, sign-up and
 * custom-token flows). Pure state change goes through the reducer.
 */
export const rememberLastSignedInUser = async (
  dispatch: AuthCommandDeps['dispatch'],
  firebaseUser: User,
): Promise<void> => {
  const lastSignedInUser: LastSignedInUser = {
    uid: firebaseUser.uid,
    username: getUsernameFromUser(firebaseUser),
  };
  dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: lastSignedInUser });
  try {
    await securityService.getOrSetLastSignedInUserInSecureStorage('SET', lastSignedInUser);
  } catch (error) {
    logger.warn('failed to remember last signed-in user', { error });
  }
};

export type AccountCommands = {
  signOut: () => Promise<void>;
  deleteCurrentAccount: (currentUser: User) => Promise<void>;
  clearSecureStore: () => Promise<void>;
};

export const useAccountCommands = (deps: AuthCommandDeps): AccountCommands => {
  const { dispatch, refs, services } = deps;
  const {
    localBiometricLockRef,
    shouldPromptBiometricRef,
    suppressLastSignedInUserPersistRef,
    userRef,
    pendingPasswordRef,
    runLoadUserRef,
    userInitAuthRef,
    forceNewSessionOnNextAuthRef,
    loginWithReauthenticateWithCredentialRef,
    legitCustomTokenSignInRef,
    registrationInProgressRef,
    isGettingSessionRef,
  } = refs;
  const { clearPendingBiometricPromptRetry } = services;

  const signOut = useCallback(async (): Promise<void> => {
    dispatch({ type: 'LOADING_STARTED' });
    clearSessionTimer();
    clearPendingBiometricPromptRetry();
    shouldPromptBiometricRef.current = false;
    localBiometricLockRef.current = false;
    suppressLastSignedInUserPersistRef.current = true;
    dispatch({ type: 'SIGN_OUT_STARTED' });

    const currentUser = getUser();
    if (!currentUser) {
      try {
        await securityService.clearLastSignedInUser();
        dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: null });
      } catch (error) {
        logger.warn('failed to clear last signed-in user while signing out', { error });
      }
      suppressLastSignedInUserPersistRef.current = false;
      dispatch({ type: 'LOCAL_LOCK_CLEARED' });
      dispatch({ type: 'LOADING_FINISHED' });
      dispatch({ type: 'SIGN_OUT_COMPLETED' });
      return;
    }

    try {
      await securityService.setLocalSessionLocked(currentUser.uid, false);
      await clearLastActiveTime(currentUser.uid);
      await clearSecureStorageForUser(
        currentUser.uid,
        getUsernameFromUser(currentUser) || '',
      );

      try {
        await ApiClient.signOut();
      } catch (error) {
        logger.warn('server sign-out failed, clearing local auth anyway', { error });
      }

      await clearStoredSessionAndPushToken(currentUser.uid);
      await securityService.clearLastSignedInUser();
      dispatch({ type: 'USER_DECRYPTED_CHANGED', userDecrypted: null });
      dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: null });
      dispatch({ type: 'LOCAL_LOCK_CLEARED' });
      await firebaseSignOut(auth);
      dispatch({ type: 'SIGN_OUT_COMPLETED' });
    } catch (error: any) {
      suppressLastSignedInUserPersistRef.current = false;
      dispatch({ type: 'SIGN_OUT_FAILED', error: error.message || 'Logout failed' });
      logger.error('sign-out failed', { error });
      throw new Error(error.message || 'Logout failed');
    }
  }, [dispatch, refs, clearPendingBiometricPromptRetry]);

  const clearDeletedAccountClientState = useCallback(async (
    userId: string,
    username: string,
  ): Promise<void> => {
    const adapters = createAuthStateAdapters(dispatch);
    const runCleanup = async (operation: string, cleanup: () => Promise<void>) => {
      try {
        await cleanup();
      } catch (error) {
        logger.warn(`failed to ${operation} during account deletion cleanup`, { error });
      }
    };

    clearSessionTimer();
    clearPendingBiometricPromptRetry();
    shouldPromptBiometricRef.current = false;
    localBiometricLockRef.current = false;
    pendingPasswordRef.current = null;
    runLoadUserRef.current = false;
    userInitAuthRef.current = false;
    forceNewSessionOnNextAuthRef.current = false;
    loginWithReauthenticateWithCredentialRef.current = false;
    legitCustomTokenSignInRef.current = false;
    registrationInProgressRef.current = false;
    isGettingSessionRef.current = false;
    ApiClient.clearInMemoryAccessToken();

    await runCleanup('clear local session lock', () => securityService.setLocalSessionLocked(userId, false));
    await runCleanup('clear last active time', () => clearLastActiveTime(userId));
    await runCleanup('clear stored session', () => securityService.clearStoredSession(userId));
    await runCleanup('clear secure storage', () => securityService.clearSecureStorage(userId, username));
    await runCleanup('clear last signed-in user', () => securityService.clearLastSignedInUser());
    await runCleanup('sign out from Firebase', () => firebaseSignOut(auth));

    userRef.current = null;
    adapters.setPendingPassword(null);
    adapters.setUserDecrypted(null);
    adapters.setLastSignedInUser(null);
    adapters.setSessionAuthenticated(false);
    adapters.setIsLocalSessionLocked(false);
    adapters.setUser(null);
    adapters.setFbUser(null);
    adapters.setIsCheckingInactivity(false);
    adapters.setLastUsedBiometricSignIn(false);
    adapters.setAuthCompleted();
    suppressLastSignedInUserPersistRef.current = false;
    adapters.setIsAuthLoading(false);
  }, [dispatch, refs, clearPendingBiometricPromptRetry]);

  const deleteCurrentAccount = useCallback(async (currentUser: User): Promise<void> => {
    const userId = currentUser.uid;
    const username = getUsernameFromUser(currentUser) || '';
    let firebaseDeleteError: any = null;

    dispatch({ type: 'DELETION_STARTED' });
    dispatch({ type: 'LOADING_STARTED' });
    suppressLastSignedInUserPersistRef.current = true;

    try {
      await deleteFirebaseUser(currentUser);
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') {
        firebaseDeleteError = error;
      }
    } finally {
      try {
        await clearDeletedAccountClientState(userId, username);
        dispatch({ type: 'DELETION_COMPLETED' });
      } catch (error: any) {
        logger.warn('failed to clear client state during account deletion', { error });
        dispatch({ type: 'DELETION_FAILED', error: error.message || 'Account deletion failed' });
      }
    }

    if (firebaseDeleteError) {
      throw firebaseDeleteError;
    }
  }, [dispatch, clearDeletedAccountClientState, suppressLastSignedInUserPersistRef]);

  const clearSecureStore = useCallback(async (): Promise<void> => {
    await securityService.clearSecureStorage(getUserId(), getUsername());
  }, []);

  return { signOut, deleteCurrentAccount, clearSecureStore };
};
