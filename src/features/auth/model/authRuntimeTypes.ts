import type { RefObject } from 'react';
import type { User } from 'firebase/auth';

import type { LastSignedInUser, UserDecrypted } from '../../../types/types';

type AuthStateSetter<T> = (value: T) => void;

export type AuthRuntimeRefs = {
  forceNewSessionOnNextAuthRef: RefObject<boolean>;
  isGettingSessionRef: RefObject<boolean>;
  legitCustomTokenSignInRef: RefObject<boolean>;
  localBiometricLockRef: RefObject<boolean>;
  loginWithReauthenticateWithCredentialRef: RefObject<boolean>;
  pendingPasswordRef: RefObject<string | null>;
  registrationInProgressRef: RefObject<boolean>;
  runLoadUserRef: RefObject<boolean>;
  shouldPromptBiometricRef: RefObject<boolean>;
  suppressLastSignedInUserPersistRef: RefObject<boolean>;
  userInitAuthRef: RefObject<boolean>;
  userRef: RefObject<User | null>;
};

export type AuthStateSetters = {
  setAuthCompleted: AuthStateSetter<boolean>;
  setFbUser: AuthStateSetter<User | null>;
  setIsAuthLoading: AuthStateSetter<boolean>;
  setIsBiometricAvailable: AuthStateSetter<boolean>;
  setIsBiometricEnabled: AuthStateSetter<boolean>;
  setIsCheckingInactivity: AuthStateSetter<boolean>;
  setIsLocalSessionLocked: AuthStateSetter<boolean>;
  setLastSignedInUser: AuthStateSetter<LastSignedInUser | null>;
  setLastUsedBiometricSignIn: AuthStateSetter<boolean>;
  setPendingPassword: AuthStateSetter<string | null>;
  setSessionAuthenticated: AuthStateSetter<boolean>;
  setUser: AuthStateSetter<User | null>;
  setUserDecrypted: AuthStateSetter<UserDecrypted | null>;
};
