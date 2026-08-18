import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback, useState } from 'react';
import { User } from 'firebase/auth';

import { securityService } from '../../security/services/securityService';
import { KeyPair } from '../../../types/types';
import { useAuthEvents } from '../hooks/useAuthEvents';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useBiometricState } from '../hooks/useBiometricState';
import { useUserLoading } from '../hooks/useUserLoading';
import { useAppInactivityLock } from '../hooks/useAppInactivityLock';
import { useBiometricSetupPrompt } from '../hooks/useBiometricSetupPrompt';
import { getUsernameFromUser } from '../domain/usernameIdentity';
import { AuthContextType } from './authTypes';
import { useAuthActions } from '../hooks/useAuthActions';
import { useAuthSessionLifecycle } from '../hooks/useAuthSessionLifecycle';
import { appendDevTempKeys, loadDevTempKeys } from '../../keys/domain/tempKeyFixtures';
import { EventService } from '../../../services/eventService';
import { logger } from '../../../utils/logger';
import { authReducer, createInitialAuthState } from './authStateMachine';
import type { AuthRuntimeRefs } from '../model/authRuntimeTypes';

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(authReducer, undefined, createInitialAuthState);
  const userInitAuthRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const runLoadUserRef = useRef(true);
  const [devTempKeys, setDevTempKeys] = useState<KeyPair[]>([]);
  const isGettingSessionRef = useRef<boolean>(false);
  const localBiometricLockRef = useRef(false);
  const forceNewSessionOnNextAuthRef = useRef(false);
  const loginWithReauthenticateWithCredentialRef = useRef(false);
  const suppressLastSignedInUserPersistRef = useRef(false);
  const legitCustomTokenSignInRef = useRef<boolean>(false);
  const registrationInProgressRef = useRef(false);
  const pendingPasswordRef = useRef<string | null>(null);

  // Load last signed-in user
  useEffect(() => {
    let cancelled = false;

    const setLastSignedIn = async () => {
      try {
        const lastCached = await securityService.getOrSetLastSignedInUserInSecureStorage("GET");
        if (!cancelled) {
          dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: lastCached });
        }
      } catch (error) {
        if (!cancelled) {
          logger.warn('auth provider failed to load last signed-in user', { error });
          dispatch({ type: 'LAST_SIGNED_IN_USER_CHANGED', user: null });
        }
      }
    };

    void setLastSignedIn();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    loadUser,
    invalidateLoads,
  } = useUserLoading(state.user, state.pendingPassword, userRef, runLoadUserRef, dispatch);

  useEffect(() => {
    pendingPasswordRef.current = state.pendingPassword;
  }, [state.pendingPassword]);

  useEffect(() => {
    let cancelled = false;

    if (!state.userDecrypted) {
      setDevTempKeys([]);
      return;
    }

    const refreshDevTempKeys = () => loadDevTempKeys().then(keys => {
      if (!cancelled) setDevTempKeys(keys);
    });

    void refreshDevTempKeys();
    const unsubscribe = EventService.addListener(eventName => {
      if (eventName === 'devTempKeys') {
        EventService.consumeEvent(eventName);
        void refreshDevTempKeys();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [state.userDecrypted]);

  const visibleKeys = useMemo(
    () => state.userDecrypted ? appendDevTempKeys(state.userDecrypted.keys, devTempKeys) : [],
    [state.userDecrypted, devTempKeys],
  );

  const {
    isBiometricAvailable,
    isBiometricEnabled,
    canGoDirectlyToBiometricAuth,
    initializeBiometricState,
    toggleBiometric,
    promptBiometric,
    setIsBiometricAvailable,
    setIsBiometricEnabled,
  } = useBiometricState(
    state.user ? { username: getUsernameFromUser(state.user) || '' } : null,
    state.authCompleted,
    state.appStateIsBackground,
    state.fbUser ? { username: getUsernameFromUser(state.fbUser) || '' } : null,
    state.lastUsedBiometricSignIn,
    state.isLocalSessionLocked,
  );

  const {
    shouldPromptBiometricRef,
    clearPendingBiometricPromptRetry,
    promptBiometricWhenDekIsReady,
  } = useBiometricSetupPrompt(promptBiometric);

  const authRefs = useMemo<AuthRuntimeRefs>(() => ({
    forceNewSessionOnNextAuthRef,
    isGettingSessionRef,
    legitCustomTokenSignInRef,
    localBiometricLockRef,
    loginWithReauthenticateWithCredentialRef,
    pendingPasswordRef,
    registrationInProgressRef,
    runLoadUserRef,
    shouldPromptBiometricRef,
    suppressLastSignedInUserPersistRef,
    userInitAuthRef,
    userRef,
  }), [
    forceNewSessionOnNextAuthRef,
    isGettingSessionRef,
    legitCustomTokenSignInRef,
    localBiometricLockRef,
    loginWithReauthenticateWithCredentialRef,
    pendingPasswordRef,
    registrationInProgressRef,
    runLoadUserRef,
    shouldPromptBiometricRef,
    suppressLastSignedInUserPersistRef,
    userInitAuthRef,
    userRef,
  ]);

  const authServices = useMemo(() => ({
    clearPendingBiometricPromptRetry,
    initializeBiometricState,
  }), [clearPendingBiometricPromptRetry, initializeBiometricState]);

  const {
    signOut,
    lock: lockSession,
    deleteCurrentAccount,
    clearPartialFirebaseAuth,
    createSession,
    setLoginWithReauthenticateWithCredential,
    signInWithFirebaseCustomToken,
    clearSecureStore,
    signUp,
    signin,
  } = useAuthActions({
    refs: authRefs,
    services: authServices,
    dispatch,
  });

  // Invalidate in-flight loadUser before/with every lock so late resolves cannot
  // re-hydrate decrypted state after the lock boundary.
  const lock = React.useCallback(async () => {
    invalidateLoads();
    await lockSession();
  }, [invalidateLoads, lockSession]);

  useAppInactivityLock({
    user: state.user,
    lock,
    dispatch,
  });

  // Firebase auth listener
  useFirebaseAuth({
    lock,
    refs: authRefs,
    dispatch,
  });

  // Event handling
  useAuthEvents(state.user, signOut, () => loadUser().then(() => { }));

  useAuthSessionLifecycle({
    sessionAuthenticated: state.sessionAuthenticated,
    fbUser: state.fbUser,
    user: state.user,
    userDecrypted: state.userDecrypted,
    isAuthLoading: state.isAuthLoading,
    refs: authRefs,
    services: {
      createSession,
      initializeBiometricState,
      loadUser,
      lock,
      promptBiometricWhenDekIsReady,
      setBiometricAvailability: setIsBiometricAvailable,
      setBiometricEnabled: setIsBiometricEnabled,
    },
    dispatch,
  });

  const setLastUsedBiometricSignIn = useCallback((value: boolean) => {
    dispatch({ type: 'BIOMETRIC_SIGN_IN_MARKED', used: value });
  }, [dispatch]);

  const value = useMemo<AuthContextType>(() => ({
    user: state.user,
    isAuthLoading: state.isAuthLoading,
    isLocalSessionLocked: state.isLocalSessionLocked,
    authCompleted: state.authCompleted,
    isCheckingInactivity: state.isCheckingInactivity,
    userDecrypted: state.userDecrypted,
    visibleKeys,
    isBiometricAvailable,
    isBiometricEnabled,
    canGoDirectlyToBiometricAuth,
    appStateIsBackground: state.appStateIsBackground,
    lastSignedInUser: state.lastSignedInUser,
    signInWithFirebaseCustomToken,
    setLastUsedBiometricSignIn,
    toggleBiometric,
    signUp,
    signin,
    signOut,
    lock,
    deleteCurrentAccount,
    setLoginWithReauthenticateWithCredential,
    clearSecureStore,
    initializeBiometricState,
  }), [
    state.user,
    state.isAuthLoading,
    state.isLocalSessionLocked,
    state.authCompleted,
    state.isCheckingInactivity,
    state.userDecrypted,
    state.appStateIsBackground,
    state.lastSignedInUser,
    visibleKeys,
    isBiometricAvailable,
    isBiometricEnabled,
    canGoDirectlyToBiometricAuth,
    signInWithFirebaseCustomToken,
    setLastUsedBiometricSignIn,
    toggleBiometric,
    signUp,
    signin,
    signOut,
    lock,
    deleteCurrentAccount,
    setLoginWithReauthenticateWithCredential,
    clearSecureStore,
    initializeBiometricState,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
