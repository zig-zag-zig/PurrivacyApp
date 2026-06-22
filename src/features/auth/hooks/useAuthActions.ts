import type { User, UserCredential } from 'firebase/auth';
import { deleteUser as deleteFirebaseUser, signOut as firebaseSignOut } from 'firebase/auth';

import { ApiClient } from '../../../api/client';
import { useToast } from '../../../app/state/ToastContext';
import { auth } from '../../../config/firebase';
import type { LastSignedInUser, UserDecrypted } from '../../../types/types';
import { logger } from '../../../utils/logger';
import {
  clearLastActiveTime,
  clearSessionTimer,
} from '../../security/services/activityService';
import { securityService } from '../../security/services/securityService';
import { getUser, getUserId, getUsername } from '../domain/authUtils';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import {
  clearPartialFirebaseAuth as clearPartialFirebaseAuthState,
  clearSecureStorageForUser,
  clearStoredSessionAndPushToken,
  lockLocalSession,
} from '../services/localAuthSession';
import {
  isLocalUnlockForCurrentUser,
  performBiometricSignIn,
  performPasswordSignIn,
} from '../services/signInFlow';
import { createBackendAuthSession } from '../services/sessionAuthenticationFlow';
import { UserAuthService } from '../services/userAuthService';
import type { AuthRuntimeRefs, AuthStateSetters } from '../model/authRuntimeTypes';

type UseAuthActionsParams = {
  userDecrypted: UserDecrypted | null;
  refs: AuthRuntimeRefs;
  services: {
    clearPendingBiometricPromptRetry: () => void;
    initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
  };
  setters: AuthStateSetters;
};

export function useAuthActions({
  userDecrypted,
  refs,
  services,
  setters,
}: UseAuthActionsParams) {
  const {
    localBiometricLockRef,
    pendingPasswordRef,
    runLoadUserRef,
    userInitAuthRef,
    forceNewSessionOnNextAuthRef,
    loginWithReauthenticateWithCredentialRef,
    suppressLastSignedInUserPersistRef,
    legitCustomTokenSignInRef,
    registrationInProgressRef,
    userRef,
    shouldPromptBiometricRef,
    isGettingSessionRef,
  } = refs;
  const {
    clearPendingBiometricPromptRetry,
    initializeBiometricState,
  } = services;
  const {
    setPendingPassword,
    setUserDecrypted,
    setLastSignedInUser,
    setSessionAuthenticated,
    setIsLocalSessionLocked,
    setUser,
    setFbUser,
    setIsCheckingInactivity,
    setIsAuthLoading,
    setAuthCompleted,
    setLastUsedBiometricSignIn,
  } = setters;
  const { showToast } = useToast();

  const rememberLastSignedInUser = async (firebaseUser: User): Promise<void> => {
    const lastSignedInUser: LastSignedInUser = {
      uid: firebaseUser.uid,
      username: getUsernameFromUser(firebaseUser),
    };
    setLastSignedInUser(lastSignedInUser);
    try {
      await securityService.getOrSetLastSignedInUserInSecureStorage('SET', lastSignedInUser);
    } catch (error) {
      logger.warn('failed to remember last signed-in user', { error });
    }
  };

  const signOut = async () => {
    setIsAuthLoading(true);
    clearSessionTimer();
    clearPendingBiometricPromptRetry();
    shouldPromptBiometricRef.current = false;
    localBiometricLockRef.current = false;
    suppressLastSignedInUserPersistRef.current = true;
    const currentUser = getUser();
    if (!currentUser) {
      try {
        await securityService.clearLastSignedInUser();
        setLastSignedInUser(null);
      } catch (error) {
        logger.warn('failed to clear last signed-in user while signing out', { error });
      }
      suppressLastSignedInUserPersistRef.current = false;
      setIsLocalSessionLocked(false);
      setIsAuthLoading(false);
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
      setUserDecrypted(null);
      setLastSignedInUser(null);
      setIsLocalSessionLocked(false);
      await firebaseSignOut(auth);
    } catch (error: any) {
      suppressLastSignedInUserPersistRef.current = false;
      setIsAuthLoading(false);
      logger.error('sign-out failed', { error });
      throw new Error(error.message || 'Logout failed');
    }
  };

  const clearDeletedAccountClientState = async (
    userId: string,
    username: string,
  ): Promise<void> => {
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
    setPendingPassword(null);
    setUserDecrypted(null);
    setLastSignedInUser(null);
    setSessionAuthenticated(false);
    setIsLocalSessionLocked(false);
    setUser(null);
    setFbUser(null);
    setIsCheckingInactivity(false);
    setLastUsedBiometricSignIn(false);
    setAuthCompleted(true);
    suppressLastSignedInUserPersistRef.current = false;
    setIsAuthLoading(false);
  };

  const deleteCurrentAccount = async (currentUser: User): Promise<void> => {
    const userId = currentUser.uid;
    const username = getUsernameFromUser(currentUser) || '';
    let firebaseDeleteError: any = null;

    setIsAuthLoading(true);
    suppressLastSignedInUserPersistRef.current = true;

    try {
      await deleteFirebaseUser(currentUser);
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') {
        firebaseDeleteError = error;
      }
    } finally {
      await clearDeletedAccountClientState(userId, username);
    }

    if (firebaseDeleteError) {
      throw firebaseDeleteError;
    }
  };

  const lock = async () => {
    setIsAuthLoading(true);
    clearSessionTimer();
    clearPendingBiometricPromptRetry();
    shouldPromptBiometricRef.current = false;

    const currentUser = getUser();
    if (!currentUser) {
      setIsAuthLoading(false);
      return;
    }

    try {
      await lockLocalSession({
        currentUser,
        localBiometricLockRef,
        pendingPasswordRef,
        runLoadUserRef,
        setPendingPassword,
        setUserDecrypted,
        setLastSignedInUser,
        setSessionAuthenticated,
        setIsLocalSessionLocked,
        setUser,
        setFbUser,
        setIsCheckingInactivity,
        setIsAuthLoading,
        setAuthCompleted,
        setLastUsedBiometricSignIn,
      });
    } catch (error: any) {
      setIsAuthLoading(false);
      logger.error('lock failed', { error });
      throw new Error(error.message || 'Lock failed');
    }
  };

  const clearPartialFirebaseAuth = async () => {
    await clearPartialFirebaseAuthState({
      clearPendingBiometricPromptRetry,
      shouldPromptBiometricRef,
      localBiometricLockRef,
      setUser,
      setFbUser,
      setSessionAuthenticated,
      setIsLocalSessionLocked,
      setIsAuthLoading,
    });
  };

  const createSession = async (): Promise<void> => {
    await createBackendAuthSession({
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
    });
  };

  const setLoginWithReauthenticateWithCredential = (value: boolean) => {
    loginWithReauthenticateWithCredentialRef.current = value;
  };

  const signInWithFirebaseCustomToken = async (
    customToken: string,
    legitCustomTokenSignIn: boolean,
  ): Promise<User> => {
    legitCustomTokenSignInRef.current = legitCustomTokenSignIn;
    runLoadUserRef.current = legitCustomTokenSignIn;
    const firebaseUser = await UserAuthService.signInWithCustomToken(customToken);
    userRef.current = firebaseUser;
    await rememberLastSignedInUser(firebaseUser);
    return firebaseUser;
  };

  const clearSecureStore = async () => {
    await securityService.clearSecureStorage(getUserId(), getUsername());
  };

  const signUp = async (
    username: string,
    password: string,
    seed: string,
  ): Promise<UserCredential> => {
    userInitAuthRef.current = true;
    forceNewSessionOnNextAuthRef.current = true;
    shouldPromptBiometricRef.current = true;
    registrationInProgressRef.current = true;
    try {
      runLoadUserRef.current = false;
      setIsAuthLoading(true);
      const result = await UserAuthService.signUp(username, password, seed);
      runLoadUserRef.current = true;
      registrationInProgressRef.current = false;
      userRef.current = result.user;
      await rememberLastSignedInUser(result.user);
      setFbUser(result.user);
      return result;
    } catch (error: any) {
      registrationInProgressRef.current = false;
      userInitAuthRef.current = false;
      forceNewSessionOnNextAuthRef.current = false;
      shouldPromptBiometricRef.current = false;
      setIsAuthLoading(false);
      throw error;
    }
  };

  const signin = async (
    username: string,
    password: string,
    isBiometricSignIn: boolean,
  ): Promise<User | null> => {
    const isLocalUnlock = await isLocalUnlockForCurrentUser(username, localBiometricLockRef);
    userInitAuthRef.current = true;
    forceNewSessionOnNextAuthRef.current = !isLocalUnlock;
    shouldPromptBiometricRef.current = !isBiometricSignIn;
    try {
      setIsAuthLoading(true);
      if (isBiometricSignIn) {
        return await performBiometricSignIn({
          username,
          initializeBiometricState,
          localBiometricLockRef,
          shouldPromptBiometricRef,
          userInitAuthRef,
          runLoadUserRef,
          userRef,
          setLastUsedBiometricSignIn,
          setFbUser,
          setSessionAuthenticated,
        });
      }

      const firebaseUser = await performPasswordSignIn({
        username,
        password,
        localBiometricLockRef,
        pendingPasswordRef,
        runLoadUserRef,
        shouldPromptBiometricRef,
        userRef,
        setPendingPassword,
        setLastUsedBiometricSignIn,
        setFbUser,
      });
      if (firebaseUser) {
        await rememberLastSignedInUser(firebaseUser);
      }
      return firebaseUser;
    } catch (error: any) {
      userInitAuthRef.current = false;
      forceNewSessionOnNextAuthRef.current = false;
      shouldPromptBiometricRef.current = false;
      setIsAuthLoading(false);
      throw error;
    }
  };

  return {
    signOut,
    lock,
    deleteCurrentAccount,
    clearPartialFirebaseAuth,
    createSession,
    setLoginWithReauthenticateWithCredential,
    signInWithFirebaseCustomToken,
    clearSecureStore,
    signUp,
    signin,
  };
}
