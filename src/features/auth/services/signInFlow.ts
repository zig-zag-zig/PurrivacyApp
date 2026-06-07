import { RefObject } from 'react';
import { User } from 'firebase/auth';

import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { securityService } from '../../security/services/securityService';
import { logger } from '../../../utils/logger';
import { getUser } from '../domain/authUtils';
import { getUsernameFromUser, normalizeUsername } from '../domain/usernameIdentity';
import { UserAuthService } from './userAuthService';
import { unlockLocalBiometricSession } from './localAuthSession';

type Setter<T> = (value: T) => void;

export const isLocalUnlockForCurrentUser = async (
  username: string,
  localBiometricLockRef: RefObject<boolean>,
): Promise<boolean> => {
  const currentUser = getUser();
  const currentUsername = getUsernameFromUser(currentUser);
  if (!currentUser || currentUsername !== normalizeUsername(username)) {
    return false;
  }

  const isLocallyLocked = await securityService.isLocalSessionLocked(currentUser.uid);
  const hasActiveDek = Boolean(await securityService.getDek(currentUser.uid));
  const isLocalUnlock = localBiometricLockRef.current || isLocallyLocked || !hasActiveDek;
  return isLocalUnlock;
};

type PerformPasswordSignInParams = {
  username: string;
  password: string;
  localBiometricLockRef: RefObject<boolean>;
  pendingPasswordRef: RefObject<string | null>;
  runLoadUserRef: RefObject<boolean>;
  shouldPromptBiometricRef: RefObject<boolean>;
  userRef: RefObject<User | null>;
  setPendingPassword: Setter<string | null>;
  setLastUsedBiometricSignIn: Setter<boolean>;
  setFbUser: Setter<User | null>;
};

export const performPasswordSignIn = async ({
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
}: PerformPasswordSignInParams): Promise<User | null> => {
  if (username.trim().length === 0 || !password) return null;
  const wasLocalBiometricLock = localBiometricLockRef.current;
  if (wasLocalBiometricLock) {
    localBiometricLockRef.current = false;
  }

  runLoadUserRef.current = false;
  pendingPasswordRef.current = password;
  try {
    const firebaseUser = await UserAuthService.signInWithUsernamePassword(username, password);
    await firebaseUser.getIdToken(true);
    await securityService.setLocalSessionLocked(firebaseUser.uid, false);
    pendingPasswordRef.current = password;
    setPendingPassword(password);
    const firebaseUsername = getUsernameFromUser(firebaseUser);
    if (firebaseUsername) {
      await BiometricAuthService.setLastUsedBiometricSignIn(firebaseUsername, false);
      setLastUsedBiometricSignIn(false);
    }
    const hasBiometricDek = await securityService.hasBiometricDek(firebaseUser.uid);
    const hasBeenPromptedForBiometric = firebaseUsername
      ? await BiometricAuthService.hasBeenPromptedForBiometric(firebaseUsername)
      : true;
    shouldPromptBiometricRef.current = !hasBiometricDek && !hasBeenPromptedForBiometric;
    userRef.current = firebaseUser;
    setFbUser(firebaseUser);
    return firebaseUser;
  } catch (error) {
    if (wasLocalBiometricLock) {
      localBiometricLockRef.current = true;
    }
    pendingPasswordRef.current = null;
    logger.warn('password sign-in failed in sign-in flow', { error });
    throw error;
  }
};

type PerformBiometricSignInParams = {
  username: string;
  initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
  localBiometricLockRef: RefObject<boolean>;
  shouldPromptBiometricRef: RefObject<boolean>;
  userInitAuthRef: RefObject<boolean>;
  runLoadUserRef: RefObject<boolean>;
  userRef: RefObject<User | null>;
  setLastUsedBiometricSignIn: Setter<boolean>;
  setFbUser: Setter<User | null>;
  setSessionAuthenticated: Setter<boolean>;
};

export const performBiometricSignIn = async ({
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
}: PerformBiometricSignInParams): Promise<User> => {
  if (await BiometricAuthService.isBiometricDisabledInPhoneSettings(username)) {
    await initializeBiometricState();
    throw new Error('Biometrics is disabled in phone settings');
  }

  const currentUser = getUser();
  const currentUsername = getUsernameFromUser(currentUser);
  const currentUserMatchesUsername = Boolean(currentUser && currentUsername === normalizeUsername(username));
  const currentUserBiometricEnabled = currentUserMatchesUsername
    ? await BiometricAuthService.isBiometricEnabled(currentUsername!)
    : false;
  const currentUserHasBiometricDek = currentUser
    ? await securityService.hasBiometricDek(currentUser.uid)
    : false;

  if (
    currentUser &&
    currentUserMatchesUsername &&
    currentUserBiometricEnabled &&
    currentUserHasBiometricDek
  ) {
    return await unlockLocalBiometricSession({
      currentUser,
      username: currentUsername!,
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

  throw new Error('Biometric unlock is not set up on this device. Sign in with your password, then disable and re-enable biometrics.');
};
