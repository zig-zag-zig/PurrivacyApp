/**
 * Sign-in commands (password / biometric sign-in, sign-up, custom token,
 * backend session creation, partial-auth cleanup) (APP-ARCH-001).
 *
 * Each command performs the effectful service work and dispatches state
 * machine events so the reducer owns every transition. The services'
 * setter-style callbacks are routed through `createAuthStateAdapters`.
 */

import { useCallback, useMemo } from 'react';
import type { User, UserCredential } from 'firebase/auth';

import { logger } from '../../../utils/logger';
import { isMfaRequiredAuthError } from '../domain/authErrorGuards';
import { isLocalUnlockForCurrentUser, performBiometricSignIn, performPasswordSignIn } from '../services/signInFlow';
import { createBackendAuthSession } from '../services/sessionAuthenticationFlow';
import {
  clearPartialFirebaseAuth as clearPartialFirebaseAuthState,
} from '../services/localAuthSession';
import { UserAuthService } from '../services/userAuthService';
import type { AuthCommandDeps } from './authCommandAdapters';
import { createAuthStateAdapters } from './authCommandAdapters';
import { rememberLastSignedInUser } from './authAccountCommands';

/** True when the MFA modal was dismissed without a code (AuthFlowError). */
const isMfaCancelledAuthError = (error: any): boolean => Boolean(error?.mfaCancelled);

export type SigninCommands = {
  signin: (username: string, password: string, isBiometricSignIn: boolean) => Promise<User | null>;
  signUp: (username: string, password: string, seed: string) => Promise<UserCredential>;
  signInWithFirebaseCustomToken: (customToken: string, legitCustomTokenSignIn: boolean) => Promise<User>;
  createSession: () => Promise<void>;
  clearPartialFirebaseAuth: () => Promise<void>;
  setLoginWithReauthenticateWithCredential: (value: boolean) => void;
};

type SigninFlowDeps = {
  signOut: () => Promise<void>;
  lock: () => Promise<void>;
};

export const useSigninCommands = (
  deps: AuthCommandDeps,
  flows: SigninFlowDeps,
): SigninCommands => {
  const { dispatch, refs, services, showToast } = deps;
  const {
    localBiometricLockRef,
    pendingPasswordRef,
    runLoadUserRef,
    userInitAuthRef,
    forceNewSessionOnNextAuthRef,
    shouldPromptBiometricRef,
    loginWithReauthenticateWithCredentialRef,
    legitCustomTokenSignInRef,
    registrationInProgressRef,
    userRef,
    isGettingSessionRef,
  } = refs;
  const { clearPendingBiometricPromptRetry, initializeBiometricState } = services;

  const adapters = useMemo(() => createAuthStateAdapters(dispatch), [dispatch]);

  const clearPartialFirebaseAuth = useCallback(async (): Promise<void> => {
    await clearPartialFirebaseAuthState({
      clearPendingBiometricPromptRetry,
      shouldPromptBiometricRef,
      localBiometricLockRef,
      setUser: adapters.setUser,
      setFbUser: adapters.setFbUser,
      setSessionAuthenticated: adapters.setSessionAuthenticated,
      setIsLocalSessionLocked: adapters.setIsLocalSessionLocked,
      setIsAuthLoading: adapters.setIsAuthLoading,
    });
    dispatch({ type: 'PARTIAL_AUTH_CLEARED' });
  }, [adapters, dispatch, refs, clearPendingBiometricPromptRetry]);

  const createSession = useCallback(async (): Promise<void> => {
    try {
      await createBackendAuthSession({
        isGettingSessionRef,
        userInitAuthRef,
        forceNewSessionOnNextAuthRef,
        shouldPromptBiometricRef,
        setSessionAuthenticated: adapters.setSessionAuthenticated,
        setIsAuthLoading: adapters.setIsAuthLoading,
        setAuthCompleted: adapters.setAuthCompleted,
        showToast,
        clearPartialFirebaseAuth,
        signOut: flows.signOut,
        lock: flows.lock,
      });
    } catch (error: any) {
      if (isMfaRequiredAuthError(error)) {
        dispatch({ type: 'MFA_CHALLENGE_RAISED' });
      } else if (isMfaCancelledAuthError(error)) {
        dispatch({ type: 'MFA_CHALLENGE_CANCELLED' });
      }
      throw error;
    }
  }, [adapters, dispatch, refs, showToast, clearPartialFirebaseAuth, flows.signOut, flows.lock]);

  const setLoginWithReauthenticateWithCredential = useCallback((value: boolean) => {
    loginWithReauthenticateWithCredentialRef.current = value;
  }, [loginWithReauthenticateWithCredentialRef]);

  const signInWithFirebaseCustomToken = useCallback(async (
    customToken: string,
    legitCustomTokenSignIn: boolean,
  ): Promise<User> => {
    legitCustomTokenSignInRef.current = legitCustomTokenSignIn;
    runLoadUserRef.current = legitCustomTokenSignIn;
    const firebaseUser = await UserAuthService.signInWithCustomToken(customToken);
    userRef.current = firebaseUser;
    await rememberLastSignedInUser(dispatch, firebaseUser);
    return firebaseUser;
  }, [dispatch, refs]);

  const signUp = useCallback(async (
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
      dispatch({ type: 'LOADING_STARTED' });
      const result = await UserAuthService.signUp(username, password, seed);
      runLoadUserRef.current = true;
      registrationInProgressRef.current = false;
      userRef.current = result.user;
      await rememberLastSignedInUser(dispatch, result.user);
      adapters.setFbUser(result.user);
      return result;
    } catch (error: any) {
      registrationInProgressRef.current = false;
      userInitAuthRef.current = false;
      forceNewSessionOnNextAuthRef.current = false;
      shouldPromptBiometricRef.current = false;
      dispatch({ type: 'LOADING_FINISHED' });
      dispatch({ type: 'AUTH_ERROR', error: error.message || 'Sign-up failed' });
      throw error;
    }
  }, [adapters, dispatch, refs, rememberLastSignedInUser]);

  const signin = useCallback(async (
    username: string,
    password: string,
    isBiometricSignIn: boolean,
  ): Promise<User | null> => {
    const isLocalUnlock = await isLocalUnlockForCurrentUser(username, localBiometricLockRef);
    userInitAuthRef.current = true;
    forceNewSessionOnNextAuthRef.current = !isLocalUnlock;
    shouldPromptBiometricRef.current = !isBiometricSignIn;
    if (isLocalUnlock) {
      dispatch({ type: 'UNLOCK_REQUESTED' });
    }
    try {
      dispatch({ type: 'LOADING_STARTED' });
      if (isBiometricSignIn) {
        return await performBiometricSignIn({
          username,
          initializeBiometricState,
          localBiometricLockRef,
          shouldPromptBiometricRef,
          userInitAuthRef,
          runLoadUserRef,
          userRef,
          setLastUsedBiometricSignIn: adapters.setLastUsedBiometricSignIn,
          setFbUser: adapters.setFbUser,
          setSessionAuthenticated: adapters.setSessionAuthenticated,
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
        setPendingPassword: adapters.setPendingPassword,
        setLastUsedBiometricSignIn: adapters.setLastUsedBiometricSignIn,
        setFbUser: adapters.setFbUser,
      });
      if (firebaseUser) {
        await rememberLastSignedInUser(dispatch, firebaseUser);
      }
      if (isLocalUnlock) {
        dispatch({ type: 'UNLOCK_SUCCEEDED' });
      }
      return firebaseUser;
    } catch (error: any) {
      userInitAuthRef.current = false;
      forceNewSessionOnNextAuthRef.current = false;
      shouldPromptBiometricRef.current = false;
      dispatch({ type: 'LOADING_FINISHED' });
      if (isLocalUnlock) {
        dispatch({ type: 'UNLOCK_FAILED', error: error.message || 'Unlock failed' });
      } else {
        dispatch({ type: 'AUTH_ERROR', error: error.message || 'Sign in failed' });
      }
      throw error;
    }
  }, [adapters, dispatch, refs, initializeBiometricState, rememberLastSignedInUser]);

  return {
    signin,
    signUp,
    signInWithFirebaseCustomToken,
    createSession,
    clearPartialFirebaseAuth,
    setLoginWithReauthenticateWithCredential,
  };
};
