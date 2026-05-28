import { RefObject } from 'react';
import { User } from 'firebase/auth';
import { signOut as firebaseSignOut } from 'firebase/auth';

import { ApiClient } from '../../../api/client';
import { auth } from '../../../config/firebase';
import { LastSignedInUser, KeyPair } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { storage } from '../../../utils/storage';
import {
  clearLastActiveTime,
  clearSessionTimer,
} from '../../security/services/activityService';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { securityService } from '../../security/services/securityService';
import { getUser } from '../domain/authUtils';
import { isMfaRequiredAuthError, isRefreshTokenMissingAuthError } from '../domain/authErrorGuards';
import { getUsernameFromUser } from '../domain/usernameIdentity';

type Setter<T> = (value: T) => void;

export const clearStoredSessionAndPushToken = async (userId: string): Promise<void> => {
  await securityService.clearStoredSession(userId);

  const pushToken = await storage.getItem('expoPushToken');
  if (pushToken) {
    await ApiClient.deletePushToken(pushToken);
  }
};

export const clearSecureStorageForUser = async (
  userId: string,
  username: string,
  keys: KeyPair[],
): Promise<void> => {
  await securityService.clearSecureStorage(userId, username, keys);
};

type ClearPartialFirebaseAuthParams = {
  clearPendingBiometricPromptRetry: () => void;
  shouldPromptBiometricRef: RefObject<boolean>;
  localBiometricLockRef: RefObject<boolean>;
  setUser: Setter<User | null>;
  setFbUser: Setter<User | null>;
  setSessionAuthenticated: Setter<boolean>;
  setIsAuthLoading: Setter<boolean>;
};

export const clearPartialFirebaseAuth = async ({
  clearPendingBiometricPromptRetry,
  shouldPromptBiometricRef,
  localBiometricLockRef,
  setUser,
  setFbUser,
  setSessionAuthenticated,
  setIsAuthLoading,
}: ClearPartialFirebaseAuthParams): Promise<void> => {
  clearSessionTimer();
  clearPendingBiometricPromptRetry();
  shouldPromptBiometricRef.current = false;
  localBiometricLockRef.current = false;
  const currentUser = getUser();

  if (currentUser) {
    try {
      await securityService.setLocalSessionLocked(currentUser.uid, false);
      await clearLastActiveTime(currentUser.uid);
    } catch (error) {
      logger.warn('failed to clear last active time during partial auth cleanup', { error });
    }
  }

  await firebaseSignOut(auth);
  setUser(null);
  setFbUser(null);
  setSessionAuthenticated(false);
  setIsAuthLoading(false);
};

type LockLocalSessionParams = {
  currentUser: User;
  localBiometricLockRef: RefObject<boolean>;
  pendingPasswordRef: RefObject<string | null>;
  runLoadUserRef: RefObject<boolean>;
  setPendingPassword: Setter<string | null>;
  setUserDecrypted: Setter<null>;
  setLastSignedInUser: Setter<LastSignedInUser | null>;
  setSessionAuthenticated: Setter<boolean>;
  setUser: Setter<User | null>;
  setFbUser: Setter<User | null>;
  setIsCheckingInactivity: Setter<boolean>;
  setIsAuthLoading: Setter<boolean>;
  setAuthCompleted: Setter<boolean>;
  setLastUsedBiometricSignIn: Setter<boolean>;
};

export const lockLocalSession = async ({
  currentUser,
  localBiometricLockRef,
  pendingPasswordRef,
  runLoadUserRef,
  setPendingPassword,
  setUserDecrypted,
  setLastSignedInUser,
  setSessionAuthenticated,
  setUser,
  setFbUser,
  setIsCheckingInactivity,
  setIsAuthLoading,
  setAuthCompleted,
  setLastUsedBiometricSignIn,
}: LockLocalSessionParams): Promise<void> => {
  const lastSignedIn: LastSignedInUser = {
    uid: currentUser.uid,
    username: getUsernameFromUser(currentUser),
  };

  await securityService.lockLocalSecrets(currentUser.uid);
  try {
    await securityService.setLocalSessionLocked(currentUser.uid, true);
  } catch (error) {
    logger.warn('failed to persist local lock marker', { error });
  }
  try {
    await securityService.getOrSetLastSignedInUserInSecureStorage('SET', lastSignedIn);
  } catch (error) {
    logger.warn('failed to persist last signed-in user', { error });
  }
  try {
    await clearLastActiveTime(currentUser.uid);
  } catch (error) {
    logger.warn('failed to clear last active time while locking', { error });
  }
  ApiClient.clearInMemoryAccessToken();

  localBiometricLockRef.current = true;
  pendingPasswordRef.current = null;
  setPendingPassword(null);
  runLoadUserRef.current = false;
  setUserDecrypted(null);
  setLastSignedInUser(lastSignedIn);
  setSessionAuthenticated(false);
  setUser(null);
  setFbUser(null);
  setIsCheckingInactivity(false);
  setIsAuthLoading(false);
  setAuthCompleted(true);

  const username = getUsernameFromUser(currentUser);
  if (!username) {
    return;
  }

  try {
    const canUnlockWithBiometrics = await securityService.hasBiometricDek(currentUser.uid);
    await BiometricAuthService.setLastUsedBiometricSignIn(username, canUnlockWithBiometrics);
    setLastUsedBiometricSignIn(canUnlockWithBiometrics);
  } catch (error) {
    logger.warn('failed to persist biometric unlock preference', { error });
  }
};

type UnlockLocalBiometricSessionParams = {
  currentUser: User;
  username: string;
  localBiometricLockRef: RefObject<boolean>;
  shouldPromptBiometricRef: RefObject<boolean>;
  userInitAuthRef: RefObject<boolean>;
  runLoadUserRef: RefObject<boolean>;
  userRef: RefObject<User | null>;
  setLastUsedBiometricSignIn: Setter<boolean>;
  setFbUser: Setter<User | null>;
  setSessionAuthenticated: Setter<boolean>;
};

const createSessionAfterBiometricUnlock = async (): Promise<void> => {
  try {
    await ApiClient.createSession(false);
    return;
  } catch (error) {
    if (isRefreshTokenMissingAuthError(error)) {
      logger.warn('stored backend session missing during biometric unlock; creating fresh session from Firebase auth');
      await ApiClient.createSession(true, undefined, true);
      return;
    }

    if (isMfaRequiredAuthError(error)) {
      await ApiClient.createSession(true);
      return;
    }

    throw error;
  }
};

export const unlockLocalBiometricSession = async ({
  currentUser,
  username,
  localBiometricLockRef,
  shouldPromptBiometricRef,
  userInitAuthRef,
  runLoadUserRef,
  userRef,
  setLastUsedBiometricSignIn,
  setFbUser,
  setSessionAuthenticated,
}: UnlockLocalBiometricSessionParams): Promise<User> => {
  try {
    const dek = await securityService.unlockDekWithBiometric(currentUser.uid, 'Unlock vault');
    if (!dek) {
      throw new Error('Could not unlock local encryption key');
    }
    await createSessionAfterBiometricUnlock();
    await securityService.setLocalSessionLocked(currentUser.uid, false);
  } catch (error) {
    await securityService.lockLocalSecrets(currentUser.uid);
    throw error;
  }

  localBiometricLockRef.current = false;
  await BiometricAuthService.setLastUsedBiometricSignIn(username, true);
  setLastUsedBiometricSignIn(true);
  userInitAuthRef.current = false;
  shouldPromptBiometricRef.current = false;
  runLoadUserRef.current = true;
  userRef.current = currentUser;
  setFbUser(currentUser);
  setSessionAuthenticated(true);
  return currentUser;
};
