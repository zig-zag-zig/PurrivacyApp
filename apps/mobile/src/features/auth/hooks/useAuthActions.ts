/**
 * Thin facade over the auth command modules (APP-ARCH-001).
 *
 * The hook's public API is unchanged; the implementation is delegated to
 * dedicated command modules that dispatch state-machine events and perform
 * effects. State transitions are owned by the authStateMachine reducer.
 */

import { useMemo } from 'react';

import { useToast } from '../../../app/state/ToastContext';
import type { AuthRuntimeRefs } from '../model/authRuntimeTypes';
import type { AuthDispatch } from '../state/authStateMachine';
import { useAccountCommands } from './authAccountCommands';
import type { AuthCommandDeps } from './authCommandAdapters';
import { useLockCommands } from './authLockCommands';
import { useSigninCommands } from './authSigninCommands';

type UseAuthActionsParams = {
  refs: AuthRuntimeRefs;
  services: AuthCommandDeps['services'];
  dispatch: AuthDispatch;
};

export function useAuthActions({
  refs,
  services,
  dispatch,
}: UseAuthActionsParams) {
  const { showToast } = useToast();
  const deps: AuthCommandDeps = useMemo(
    () => ({ dispatch, refs, services, showToast }),
    [dispatch, refs, services, showToast],
  );

  const lockCommands = useLockCommands(deps);
  const accountCommands = useAccountCommands(deps);
  const signinCommands = useSigninCommands(deps, {
    signOut: accountCommands.signOut,
    lock: lockCommands.lock,
  });

  return {
    signOut: accountCommands.signOut,
    lock: lockCommands.lock,
    deleteCurrentAccount: accountCommands.deleteCurrentAccount,
    clearPartialFirebaseAuth: signinCommands.clearPartialFirebaseAuth,
    createSession: signinCommands.createSession,
    setLoginWithReauthenticateWithCredential: signinCommands.setLoginWithReauthenticateWithCredential,
    signInWithFirebaseCustomToken: signinCommands.signInWithFirebaseCustomToken,
    clearSecureStore: accountCommands.clearSecureStore,
    signUp: signinCommands.signUp,
    signin: signinCommands.signin,
  };
}
