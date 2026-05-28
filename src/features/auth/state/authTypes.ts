import { User, UserCredential } from 'firebase/auth';

import { KeyPair, LastSignedInUser, UserDecrypted } from '../../../types/types';

export type AuthContextType = {
  user: User | null;
  userDecrypted: UserDecrypted | null;
  visibleKeys: KeyPair[];
  authCompleted: boolean;
  isCheckingInactivity: boolean;
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;
  isAuthLoading: boolean;
  canGoDirectlyToBiometricAuth: boolean;
  appStateIsBackground: boolean;
  lastSignedInUser: LastSignedInUser | null;
  signUp: (username: string, password: string, seed: string) => Promise<UserCredential>;
  signin: (username: string, password: string, isBiometricSignIn: boolean) => Promise<User | null>;
  signOut: () => Promise<void>;
  lock: () => Promise<void>;
  deleteCurrentAccount: (currentUser: User) => Promise<void>;
  setLoginWithReauthenticateWithCredential: (value: boolean) => void;
  clearSecureStore: () => Promise<void>;
  toggleBiometric: (enabled: boolean) => Promise<void>;
  setLastUsedBiometricSignIn: (value: boolean) => void;
  signInWithFirebaseCustomToken: (customToken: string, legitCustomTokenSignIn: boolean) => Promise<User>;
  initializeBiometricState: () => Promise<{ available: boolean; enabled: boolean; }>;
};
