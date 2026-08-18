/**
 * Shared command plumbing for the auth state machine (APP-ARCH-001).
 *
 * `createAuthStateAdapters` maps the setter-style callbacks still used by the
 * effectful services (src/features/auth/services/**) onto machine events, so
 * the reducer remains the single owner of state transitions while the
 * services keep performing their side effects unchanged.
 */

import type { User } from 'firebase/auth';

import type { LastSignedInUser, UserDecrypted } from '../../../types/types';
import type { AuthRuntimeRefs } from '../model/authRuntimeTypes';
import type { AuthDispatch } from '../state/authStateMachine';

export type AuthCommandServices = {
  clearPendingBiometricPromptRetry: () => void;
  initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
};

export type AuthCommandDeps = {
  dispatch: AuthDispatch;
  refs: AuthRuntimeRefs;
  services: AuthCommandServices;
  showToast: (message: unknown, type: 'error') => void;
};

export type AuthStateAdapters = {
  setUser: (user: User | null) => void;
  setFbUser: (user: User | null) => void;
  setSessionAuthenticated: (value: boolean) => void;
  setIsLocalSessionLocked: (value: boolean) => void;
  setIsAuthLoading: (value: boolean) => void;
  setAuthCompleted: () => void;
  setIsCheckingInactivity: (checking: boolean) => void;
  setLastUsedBiometricSignIn: (used: boolean) => void;
  setPendingPassword: (password: string | null) => void;
  setUserDecrypted: (userDecrypted: UserDecrypted | null) => void;
  setLastSignedInUser: (user: LastSignedInUser | null) => void;
};

export const createAuthStateAdapters = (dispatch: AuthDispatch): AuthStateAdapters => ({
  setUser: (user) => {
    if (user) {
      dispatch({ type: 'USER_CHANGED', user });
    } else {
      dispatch({ type: 'USER_CLEARED' });
    }
  },
  setFbUser: (user) => {
    if (user) {
      dispatch({ type: 'FIREBASE_USER_ESTABLISHED', user });
    } else {
      dispatch({ type: 'FIREBASE_USER_CLEARED' });
    }
  },
  setSessionAuthenticated: (value) => {
    dispatch(value ? { type: 'SESSION_CREATED' } : { type: 'SESSION_AUTH_LOST' });
  },
  setIsLocalSessionLocked: (value) => {
    dispatch(value ? { type: 'LOCK_COMPLETED' } : { type: 'LOCAL_LOCK_CLEARED' });
  },
  setIsAuthLoading: (value) => {
    dispatch(value ? { type: 'LOADING_STARTED' } : { type: 'LOADING_FINISHED' });
  },
  setAuthCompleted: () => {
    dispatch({ type: 'AUTH_UI_SETTLED' });
  },
  setIsCheckingInactivity: (checking) => {
    dispatch({ type: 'CHECKING_INACTIVITY', checking });
  },
  setLastUsedBiometricSignIn: (used) => {
    dispatch({ type: 'BIOMETRIC_SIGN_IN_MARKED', used });
  },
  setPendingPassword: (password) => {
    dispatch({ type: 'PENDING_PASSWORD_CHANGED', password });
  },
  setUserDecrypted: (userDecrypted) => {
    dispatch({ type: 'USER_DECRYPTED_CHANGED', userDecrypted });
  },
  setLastSignedInUser: (user) => {
    dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user });
  },
});
