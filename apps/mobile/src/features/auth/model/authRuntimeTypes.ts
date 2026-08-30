import type { RefObject } from 'react';
import type { User } from 'firebase/auth';

/**
 * Runtime intent/latch refs used by async auth flows.
 *
 * These are *not* UI state: they gate in-flight operations and persist across
 * renders (sign-in intent, session-creation guards, last-signed-in
 * persistence suppression). UI state is owned by the auth state machine
 * (src/features/auth/state/authStateMachine.ts).
 */
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
