import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { User } from 'firebase/auth';

import { securityService } from '../../security/services/securityService';
import { KeyPair, LastSignedInUser } from '../../../types/types';
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

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authCompleted, setAuthCompleted] = useState(false);
  const [isCheckingInactivity, setIsCheckingInactivity] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const userInitAuthRef = useRef(false);
  const [lastSignedInUser, setLastSignedInUser] = useState<LastSignedInUser | null>(null);
  const [lastUsedBiometricSignIn, setLastUsedBiometricSignIn] = useState(false);
  const [appStateIsBackground, setAppStateIsBackground] = useState<boolean>(false);
  const [sessionAuthenticated, setSessionAuthenticated] = useState<boolean>(false);
  const [devTempKeys, setDevTempKeys] = useState<KeyPair[]>([]);
  const isGettingSessionRef = useRef<boolean>(false);
  const localBiometricLockRef = useRef(false);
  const forceNewSessionOnNextAuthRef = useRef(false);
  const loginWithReauthenticateWithCredentialRef = useRef(false);
  const suppressLastSignedInUserPersistRef = useRef(false);
  const legitCustomTokenSignInRef = useRef<boolean>(false);
  const registrationInProgressRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const runLoadUserRef = useRef(true);

  // Load last signed-in user
  useEffect(() => {
    let cancelled = false;

    const setLastSignedIn = async () => {
      try {
        const lastCached = await securityService.getOrSetLastSignedInUserInSecureStorage("GET");
        if (!cancelled) {
          setLastSignedInUser(lastCached);
        }
      } catch (error) {
        if (!cancelled) {
          setLastSignedInUser(null);
        }
      }
    };

    void setLastSignedIn();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    userDecrypted,
    isAuthLoading,
    pendingPassword,
    setPendingPassword,
    loadUser,
    setUserDecrypted,
    setIsAuthLoading,
  } = useUserLoading(user, userRef, runLoadUserRef);
  const pendingPasswordRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!userDecrypted) {
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
  }, [userDecrypted]);

  const visibleKeys = useMemo(
    () => userDecrypted ? appendDevTempKeys(userDecrypted.keys, devTempKeys) : [],
    [userDecrypted, devTempKeys],
  );

  useEffect(() => {
    pendingPasswordRef.current = pendingPassword;
  }, [pendingPassword]);

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
    user ? { username: getUsernameFromUser(user) || '' } : null,
    authCompleted,
    appStateIsBackground,
    fbUser ? { username: getUsernameFromUser(fbUser) || '' } : null,
    lastUsedBiometricSignIn
  );

  const {
    shouldPromptBiometricRef,
    clearPendingBiometricPromptRetry,
    promptBiometricWhenDekIsReady,
  } = useBiometricSetupPrompt(promptBiometric);

  const {
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
  } = useAuthActions({
    userDecrypted,
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
    clearPendingBiometricPromptRetry,
    initializeBiometricState,
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
  });

  useAppInactivityLock({
    user,
    lock,
    setAppStateIsBackground,
    setIsCheckingInactivity,
  });

  // Firebase auth listener
  useFirebaseAuth(
    userRef,
    setFbUser,
    setLastSignedInUser,
    userInitAuthRef,
    loginWithReauthenticateWithCredentialRef,
    suppressLastSignedInUserPersistRef,
    legitCustomTokenSignInRef,
    registrationInProgressRef,
    lock,
    setAuthCompleted,
    setSessionAuthenticated,
    setIsCheckingInactivity,
    setUser,
    setIsAuthLoading,
    runLoadUserRef,
    localBiometricLockRef,
    forceNewSessionOnNextAuthRef
  );

  // Event handling
  useAuthEvents(user, signOut, () => loadUser().then(() => { }));

  useAuthSessionLifecycle({
    sessionAuthenticated,
    fbUser,
    user,
    userDecrypted,
    isAuthLoading,
    shouldPromptBiometricRef,
    runLoadUserRef,
    pendingPasswordRef,
    lock,
    loadUser,
    promptBiometricWhenDekIsReady,
    initializeBiometricState,
    createSession,
    setUser,
    setIsBiometricAvailable,
    setIsBiometricEnabled,
    setIsAuthLoading,
    setIsCheckingInactivity,
    setAuthCompleted,
    setLastUsedBiometricSignIn,
  });

  return (
    <AuthContext.Provider value={{
      user,
      isAuthLoading,
      authCompleted,
      isCheckingInactivity,
      userDecrypted,
      visibleKeys,
      isBiometricAvailable,
      isBiometricEnabled,
      canGoDirectlyToBiometricAuth,
      appStateIsBackground,
      lastSignedInUser,
      signInWithFirebaseCustomToken,
      setLastUsedBiometricSignIn: (value: boolean) => setLastUsedBiometricSignIn(value),
      toggleBiometric,
      signUp,
      signin,
      signOut,
      lock,
      deleteCurrentAccount,
      setLoginWithReauthenticateWithCredential,
      clearSecureStore,
      initializeBiometricState,
    }}>
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
