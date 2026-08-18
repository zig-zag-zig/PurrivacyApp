import { describe, expect, it } from 'vitest';
import type { User } from 'firebase/auth';

import type { LastSignedInUser, UserDecrypted } from '../../../types/types';
import {
  AUTH_PHASES,
  authReducer,
  createInitialAuthState,
  type AuthEvent,
  type AuthMachineState,
} from './authStateMachine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (uid = 'user-1', username = 'alice'): User =>
  ({ uid, email: `${username}@example.com` } as unknown as User);

const makeLastSignedIn = (uid = 'user-1', username = 'alice'): LastSignedInUser => ({
  uid,
  username,
});

const makeDecrypted = (): UserDecrypted => ({
  dekPassword: { encryptedData: 'pw' },
  dekSeed: { encryptedData: 'seed' },
  keys: [],
} as unknown as UserDecrypted);

/** Reduce a sequence of events from a starting state. */
const run = (events: AuthEvent[], from: AuthMachineState = createInitialAuthState()): AuthMachineState =>
  events.reduce(authReducer, from);

const uid = (state: AuthMachineState): string | null => state.user?.uid ?? null;
const fbUid = (state: AuthMachineState): string | null => state.fbUser?.uid ?? null;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts in bootstrapping with no user, no session, no secrets', () => {
    const s = createInitialAuthState();
    expect(s.phase).toBe('bootstrapping');
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.isLocalSessionLocked).toBe(false);
    expect(s.authCompleted).toBe(false);
    expect(s.isAuthLoading).toBe(false);
    expect(s.isCheckingInactivity).toBe(false);
    expect(s.appStateIsBackground).toBe(false);
    expect(s.lastSignedInUser).toBeNull();
    expect(s.lastUsedBiometricSignIn).toBe(false);
    expect(s.pendingPassword).toBeNull();
    expect(s.userDecrypted).toBeNull();
    expect(s.priorPhase).toBeNull();
    expect(s.error).toBeNull();
  });

  it('exposes the full documented phase set', () => {
    expect(AUTH_PHASES).toHaveLength(9);
    expect(AUTH_PHASES).toEqual([
      'bootstrapping',
      'signed-out',
      'firebase-authenticated',
      'mfa-pending',
      'unlocking',
      'authenticated',
      'locally-locked',
      'signing-out',
      'deleting',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Bootstrap / firebase session transitions
// ---------------------------------------------------------------------------

describe('BOOTSTRAP_COMPLETED / FIREBASE_USER_LOST', () => {
  it('settles bootstrapping to signed-out with all flags cleared', () => {
    const s = run([
      { type: 'LOADING_STARTED' },
      { type: 'CHECKING_INACTIVITY', checking: true },
      { type: 'FIREBASE_USER_LOST' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.authCompleted).toBe(true);
    expect(s.isAuthLoading).toBe(false);
    expect(s.isCheckingInactivity).toBe(false);
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.isLocalSessionLocked).toBe(false);
  });

  it('sign-out path always returns to signed-out with secrets flags cleared', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'hunter2' },
      { type: 'SIGN_OUT_STARTED' },
      { type: 'SIGN_OUT_COMPLETED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.isLocalSessionLocked).toBe(false);
    expect(s.pendingPassword).toBeNull();
    expect(s.userDecrypted).toBeNull();
    expect(s.isAuthLoading).toBe(false);
    expect(s.authCompleted).toBe(true);
  });

  it('clears decrypted state and pending password even when previously set', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'hunter2' },
      { type: 'FIREBASE_USER_LOST' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.pendingPassword).toBeNull();
    expect(s.userDecrypted).toBeNull();
  });

  it('keeps lastSignedInUser when the listener reports no firebase user (cold start)', () => {
    const s = run([
      { type: 'LAST_SIGNED_IN_USER_CHANGED', user: makeLastSignedIn() },
      { type: 'FIREBASE_USER_LOST' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.lastSignedInUser).toEqual(makeLastSignedIn());
  });

  it('keeps lastUsedBiometricSignIn across sign-out (drives biometric button)', () => {
    const s = run([
      { type: 'BIOMETRIC_SIGN_IN_MARKED', used: true },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'SIGN_OUT_STARTED' },
      { type: 'SIGN_OUT_COMPLETED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.lastUsedBiometricSignIn).toBe(true);
  });

  it('is a re-entrant no-op once signed-out', () => {
    const s1 = run([{ type: 'FIREBASE_USER_LOST' }]);
    const s2 = authReducer(s1, { type: 'FIREBASE_USER_LOST' });
    expect(s2).toBe(s1);
    const s3 = authReducer(s2, { type: 'BOOTSTRAP_COMPLETED' });
    expect(s3).toBe(s2);
  });
});

describe('FIREBASE_USER_ESTABLISHED', () => {
  it('moves bootstrapping to firebase-authenticated and sets fbUser only', () => {
    const s = authReducer(createInitialAuthState(), { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() });
    expect(s.phase).toBe('firebase-authenticated');
    expect(fbUid(s)).toBe('user-1');
    expect(s.user).toBeNull();
    expect(s.authCompleted).toBe(false);
  });

  it('moves signed-out to firebase-authenticated', () => {
    const s = run([
      { type: 'FIREBASE_USER_LOST' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
    expect(fbUid(s)).toBe('user-1');
  });

  it('reflects refreshed firebase users into user when session is authenticated', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser('user-1') },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser('user-1', 'alice-renamed') },
    ]);
    expect(s.phase).toBe('authenticated');
    expect(s.fbUser?.email).toBe('alice-renamed@example.com');
    expect(s.user?.email).toBe('alice-renamed@example.com');
  });

  it('keeps locally-locked from being superseded into authenticated by a stale signal', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'LOCK_COMPLETED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
    ]);
    // The listener would only emit ESTABLISHED after a successful unlock;
    // the machine converges to firebase-authenticated, never authenticated.
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.isLocalSessionLocked).toBe(false);
    expect(s.userDecrypted).toBeNull();
  });
});

describe('LOCAL_LOCK_DETECTED', () => {
  it('moves any phase to locally-locked with a last-signed-in user', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'LOCAL_LOCK_DETECTED', user: makeUser(), lastSignedInUser: makeLastSignedIn() },
    ]);
    expect(s.phase).toBe('locally-locked');
    expect(s.isLocalSessionLocked).toBe(true);
    expect(s.authCompleted).toBe(true);
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.lastSignedInUser).toEqual(makeLastSignedIn());
  });

  it('forcefully locks even from authenticated and clears decrypted state', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'LOCAL_LOCK_DETECTED', user: makeUser(), lastSignedInUser: makeLastSignedIn() },
    ]);
    expect(s.phase).toBe('locally-locked');
    expect(s.userDecrypted).toBeNull();
    expect(s.pendingPassword).toBeNull();
    expect(uid(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session / MFA transitions
// ---------------------------------------------------------------------------

describe('SESSION_CREATED', () => {
  it('establishes the session and surfaces the firebase user to the UI', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
    ]);
    expect(s.sessionAuthenticated).toBe(true);
    expect(uid(s)).toBe('user-1');
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.isLocalSessionLocked).toBe(false);
  });

  it('resolves mfa-pending back to firebase-authenticated', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
      { type: 'SESSION_CREATED' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.sessionAuthenticated).toBe(true);
    expect(s.priorPhase).toBeNull();
  });

  it('resolves unlocking to firebase-authenticated (biometric unlock path)', () => {
    const s = run([
      { type: 'LOCAL_LOCK_DETECTED', user: makeUser(), lastSignedInUser: makeLastSignedIn() },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.sessionAuthenticated).toBe(true);
  });

  it('is a re-entrant no-op when the session is already established', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
    ]);
    const s2 = authReducer(s1, { type: 'SESSION_CREATED' });
    expect(s2).toBe(s1);
  });
});

describe('SESSION_AUTH_LOST', () => {
  it('drops the session flag without changing the phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'SESSION_AUTH_LOST' },
    ]);
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.phase).toBe('firebase-authenticated');
  });

  it('is a re-entrant no-op when no session is authenticated', () => {
    const s1 = run([{ type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() }]);
    const s2 = authReducer(s1, { type: 'SESSION_AUTH_LOST' });
    expect(s2).toBe(s1);
  });
});

describe('MFA_CHALLENGE_RAISED', () => {
  it('enters mfa-pending from firebase-authenticated and records the prior phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
    ]);
    expect(s.phase).toBe('mfa-pending');
    expect(s.priorPhase).toBe('firebase-authenticated');
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.isAuthLoading).toBe(false);
    expect(s.user).toBeNull();
    expect(s.fbUser).not.toBeNull();
  });

  it('is a re-entrant no-op while already mfa-pending', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
    ]);
    const s2 = authReducer(s1, { type: 'MFA_CHALLENGE_RAISED' });
    expect(s2).toBe(s1);
  });
});

describe('MFA_CHALLENGE_CANCELLED / RESOLVED', () => {
  it('cancel returns to the prior phase (firebase-authenticated)', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
      { type: 'MFA_CHALLENGE_CANCELLED' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.priorPhase).toBeNull();
  });

  it('resolve returns to the prior phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
      { type: 'MFA_CHALLENGE_RESOLVED' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
  });

  it('cancel from an unlocking-sourced challenge returns to unlocking', () => {
    const s = run([
      { type: 'LOCAL_LOCK_DETECTED', user: makeUser(), lastSignedInUser: makeLastSignedIn() },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'MFA_CHALLENGE_RAISED' },
      { type: 'MFA_CHALLENGE_CANCELLED' },
    ]);
    expect(s.phase).toBe('unlocking');
  });

  it('is a no-op outside mfa-pending', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ]);
    const s2 = authReducer(s1, { type: 'MFA_CHALLENGE_CANCELLED' });
    expect(s2).toBe(s1);
  });

  it('full MFA cycle: challenge, cancellation cleanup path ends signed-out', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
      // cancel for a user-initiated sign-in: session lost, then partial auth cleared
      { type: 'SESSION_AUTH_LOST' },
      { type: 'PARTIAL_AUTH_CLEARED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.pendingPassword).toBeNull();
    expect(s.userDecrypted).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unlock transitions
// ---------------------------------------------------------------------------

const lockedState = (): AuthMachineState => run([
  { type: 'LOCAL_LOCK_DETECTED', user: makeUser(), lastSignedInUser: makeLastSignedIn() },
]);

describe('UNLOCK_REQUESTED', () => {
  it('moves locally-locked to unlocking', () => {
    const s = authReducer(lockedState(), { type: 'UNLOCK_REQUESTED' });
    expect(s.phase).toBe('unlocking');
    expect(s.isLocalSessionLocked).toBe(true);
  });

  it('is a re-entrant no-op while unlocking', () => {
    const s1 = authReducer(lockedState(), { type: 'UNLOCK_REQUESTED' });
    const s2 = authReducer(s1, { type: 'UNLOCK_REQUESTED' });
    expect(s2).toBe(s1);
  });

  it('is a well-defined no-op from any other phase (fresh sign-in)', () => {
    const s1 = run([{ type: 'FIREBASE_USER_LOST' }]);
    const s2 = authReducer(s1, { type: 'UNLOCK_REQUESTED' });
    expect(s2).toBe(s1);
  });
});

describe('UNLOCK_SUCCEEDED', () => {
  it('moves unlocking to firebase-authenticated when the firebase user is known', () => {
    const s = run([
      { type: 'UNLOCK_REQUESTED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'UNLOCK_SUCCEEDED' },
    ], lockedState());
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.isLocalSessionLocked).toBe(false);
  });

  it('is a re-entrant no-op once the session already progressed', () => {
    const s1 = run([
      { type: 'UNLOCK_REQUESTED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'UNLOCK_SUCCEEDED' },
    ], lockedState());
    expect(s1.phase).toBe('firebase-authenticated');
  });
});

describe('UNLOCK_FAILED', () => {
  it('returns unlocking to a clean locally-locked state with an error', () => {
    const s = run([
      { type: 'UNLOCK_REQUESTED' },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'wrong' },
      { type: 'UNLOCK_FAILED', error: 'Wrong password' },
    ], lockedState());
    expect(s.phase).toBe('locally-locked');
    expect(s.isLocalSessionLocked).toBe(true);
    expect(s.pendingPassword).toBeNull();
    expect(s.userDecrypted).toBeNull();
    expect(s.isAuthLoading).toBe(false);
    expect(s.error).toBe('Wrong password');
  });

  it('is a well-defined no-op outside unlocking', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
    ]);
    const s2 = authReducer(s1, { type: 'UNLOCK_FAILED', error: 'nope' });
    expect(s2).toBe(s1);
  });
});

// ---------------------------------------------------------------------------
// Lock transitions
// ---------------------------------------------------------------------------

describe('LOCK_REQUESTED / LOCK_COMPLETED / LOCAL_LOCK_CLEARED', () => {
  it('lock from authenticated clears every secrets flag', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'hunter2' },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'LOCK_REQUESTED' },
      { type: 'LOCK_COMPLETED' },
    ]);
    expect(s.phase).toBe('locally-locked');
    expect(s.isLocalSessionLocked).toBe(true);
    expect(s.authCompleted).toBe(true);
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.userDecrypted).toBeNull();
    expect(s.pendingPassword).toBeNull();
    expect(s.isAuthLoading).toBe(false);
    expect(s.isCheckingInactivity).toBe(false);
    expect(uid(s)).toBeNull();
  });

  it('lock from firebase-authenticated (inactivity) also locks', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'LOCK_COMPLETED' },
    ]);
    expect(s.phase).toBe('locally-locked');
  });

  it('is a re-entrant no-op once locally-locked', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'LOCK_COMPLETED' },
    ]);
    const s2 = authReducer(s1, { type: 'LOCK_COMPLETED' });
    expect(s2).toBe(s1);
  });

  it('LOCAL_LOCK_CLEARED only clears the marker flag', () => {
    const s = run([{ type: 'LOCAL_LOCK_CLEARED' }], lockedState());
    expect(s.isLocalSessionLocked).toBe(false);
    expect(s.phase).toBe('locally-locked');
  });

  it('LOCK_REQUESTED sets loading and clears prior errors', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'AUTH_ERROR', error: 'boom' },
      { type: 'LOCK_REQUESTED' },
    ]);
    expect(s.isAuthLoading).toBe(true);
    expect(s.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sign-out transitions
// ---------------------------------------------------------------------------

describe('SIGN_OUT_STARTED / COMPLETED / FAILED', () => {
  it('sign-out started records the prior phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'SIGN_OUT_STARTED' },
    ]);
    expect(s.phase).toBe('signing-out');
    expect(s.priorPhase).toBe('authenticated');
    expect(s.isAuthLoading).toBe(true);
  });

  it('sign-out failed returns to the prior phase with loading cleared', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'SIGN_OUT_STARTED' },
      { type: 'SIGN_OUT_FAILED', error: 'network down' },
    ]);
    expect(s.phase).toBe('authenticated');
    expect(s.isAuthLoading).toBe(false);
    expect(s.error).toBe('network down');
    expect(uid(s)).toBe('user-1');
  });

  it('sign-out failed from the lock screen returns to locally-locked', () => {
    const s = run([
      { type: 'SIGN_OUT_STARTED' },
      { type: 'SIGN_OUT_FAILED', error: 'network down' },
    ], lockedState());
    expect(s.phase).toBe('locally-locked');
    expect(s.isLocalSessionLocked).toBe(true);
  });

  it('is a re-entrant no-op while signing out', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'SIGN_OUT_STARTED' },
    ]);
    const s2 = authReducer(s1, { type: 'SIGN_OUT_STARTED' });
    expect(s2).toBe(s1);
  });
});

// ---------------------------------------------------------------------------
// Deletion transitions
// ---------------------------------------------------------------------------

describe('DELETION_STARTED / COMPLETED / FAILED', () => {
  it('deletion completes to signed-out with everything cleared', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'LAST_SIGNED_IN_USER_CHANGED', user: makeLastSignedIn() },
      { type: 'DELETION_STARTED' },
      { type: 'DELETION_COMPLETED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
    expect(s.userDecrypted).toBeNull();
    expect(s.pendingPassword).toBeNull();
    expect(s.authCompleted).toBe(true);
  });

  it('deletion failure returns to the prior phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'DELETION_STARTED' },
      { type: 'DELETION_FAILED', error: 'firebase error' },
    ]);
    expect(s.phase).toBe('authenticated');
    expect(s.error).toBe('firebase error');
    expect(s.isAuthLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error / cleanup transitions
// ---------------------------------------------------------------------------

describe('PARTIAL_AUTH_CLEARED', () => {
  it('returns to signed-out while preserving authCompleted (bootstrap may not be done)', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_AUTH_LOST' },
      { type: 'PARTIAL_AUTH_CLEARED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.authCompleted).toBe(false);
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
    expect(s.sessionAuthenticated).toBe(false);
  });

  it('keeps lastSignedInUser for the sign-in screen', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'LAST_SIGNED_IN_USER_CHANGED', user: makeLastSignedIn() },
      { type: 'SESSION_AUTH_LOST' },
      { type: 'PARTIAL_AUTH_CLEARED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.lastSignedInUser).toEqual(makeLastSignedIn());
  });

  it('does not interrupt an in-progress sign-out or deletion', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
      { type: 'SIGN_OUT_STARTED' },
      { type: 'PARTIAL_AUTH_CLEARED' },
    ]);
    expect(s.phase).toBe('signing-out');
  });
});

describe('AUTH_ERROR / AUTH_UI_SETTLED', () => {
  it('AUTH_ERROR records the failure without changing the phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'AUTH_ERROR', error: 'invalid credentials' },
    ]);
    expect(s.error).toBe('invalid credentials');
    expect(s.phase).toBe('firebase-authenticated');
  });

  it('AUTH_UI_SETTLED settles flags without changing the phase', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'LOADING_STARTED' },
      { type: 'CHECKING_INACTIVITY', checking: true },
      { type: 'AUTH_UI_SETTLED' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
    expect(s.authCompleted).toBe(true);
    expect(s.isAuthLoading).toBe(false);
    expect(s.isCheckingInactivity).toBe(false);
  });

  it('AUTH_UI_SETTLED from bootstrapping settles to signed-out', () => {
    const s = run([
      { type: 'CHECKING_INACTIVITY', checking: true },
      { type: 'AUTH_UI_SETTLED' },
    ]);
    expect(s.phase).toBe('signed-out');
    expect(s.authCompleted).toBe(true);
    expect(s.isCheckingInactivity).toBe(false);
  });

  it('AUTH_UI_SETTLED is a re-entrant no-op once settled', () => {
    const s1 = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'AUTH_UI_SETTLED' },
    ]);
    const s2 = authReducer(s1, { type: 'AUTH_UI_SETTLED' });
    expect(s2).toBe(s1);
  });
});

describe('AUTHENTICATED_UI_READY', () => {
  const authenticatedRun = () => run([
    { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
    { type: 'SESSION_CREATED' },
    { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
    { type: 'AUTHENTICATED_UI_READY' },
  ]);

  it('enters authenticated once firebase user, session, UI user and decrypted data exist', () => {
    const s = authenticatedRun();
    expect(s.phase).toBe('authenticated');
    expect(s.authCompleted).toBe(true);
    expect(s.isAuthLoading).toBe(false);
    expect(s.isCheckingInactivity).toBe(false);
    expect(s.pendingPassword).toBeNull();
  });

  it('is a re-entrant no-op once authenticated', () => {
    const s1 = authenticatedRun();
    const s2 = authReducer(s1, { type: 'AUTHENTICATED_UI_READY' });
    expect(s2).toBe(s1);
  });

  it('is a no-op before the session is created', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
  });

  it('is a no-op before decrypted data is available', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'AUTHENTICATED_UI_READY' },
    ]);
    expect(s.phase).toBe('firebase-authenticated');
  });

  it('is a no-op while unlocking (decrypted data alone is not enough)', () => {
    const s = run([
      { type: 'UNLOCK_REQUESTED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ], lockedState());
    expect(s.phase).toBe('unlocking');
  });
});

// ---------------------------------------------------------------------------
// Flag-level events
// ---------------------------------------------------------------------------

describe('flag-level events', () => {
  it('LOADING_STARTED / LOADING_FINISHED toggle the loading flag', () => {
    const s = run([
      { type: 'LOADING_STARTED' },
      { type: 'LOADING_STARTED' }, // re-entrant
      { type: 'LOADING_FINISHED' },
    ]);
    expect(s.isAuthLoading).toBe(false);
  });

  it('CHECKING_INACTIVITY / APP_STATE_CHANGED update their flags', () => {
    const s = run([
      { type: 'CHECKING_INACTIVITY', checking: true },
      { type: 'APP_STATE_CHANGED', isBackground: true },
    ]);
    expect(s.isCheckingInactivity).toBe(true);
    expect(s.appStateIsBackground).toBe(true);
  });

  it('LAST_SIGNED_IN_USER_CHANGED updates the last signed-in user', () => {
    const s = run([
      { type: 'LAST_SIGNED_IN_USER_CHANGED', user: makeLastSignedIn('user-2', 'bob') },
      { type: 'LAST_SIGNED_IN_USER_CHANGED', user: null },
    ]);
    expect(s.lastSignedInUser).toBeNull();
  });

  it('BIOMETRIC_SIGN_IN_MARKED updates the biometric flag', () => {
    const s = run([
      { type: 'BIOMETRIC_SIGN_IN_MARKED', used: true },
      { type: 'BIOMETRIC_SIGN_IN_MARKED', used: true }, // re-entrant
    ]);
    expect(s.lastUsedBiometricSignIn).toBe(true);
  });

  it('PENDING_PASSWORD_CHANGED sets the pending password during sign-in flows', () => {
    const set = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'hunter2' },
    ]);
    expect(set.pendingPassword).toBe('hunter2');
    const cleared = authReducer(set, { type: 'PENDING_PASSWORD_CHANGED', password: null });
    expect(cleared.pendingPassword).toBeNull();
  });

  it('USER_DECRYPTED_CHANGED sets and clears decrypted data', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: null },
    ]);
    expect(s.userDecrypted).toBeNull();
  });

  it('USER_CHANGED / USER_CLEARED and FIREBASE_USER_CLEARED update their fields', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'USER_CHANGED', user: makeUser() },
      { type: 'USER_CLEARED' },
      { type: 'FIREBASE_USER_CLEARED' },
    ]);
    expect(s.user).toBeNull();
    expect(s.fbUser).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Secrets invariants
// ---------------------------------------------------------------------------

describe('secrets invariants', () => {
  it('drops a stale pending password dispatched after a lock', () => {
    const s = run([{ type: 'PENDING_PASSWORD_CHANGED', password: 'leaked' }], lockedState());
    expect(s.pendingPassword).toBeNull();
  });

  it('drops a stale pending password dispatched during sign-out and deletion', () => {
    const signingOut = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'SIGN_OUT_STARTED' },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'leaked' },
      { type: 'SIGN_OUT_COMPLETED' },
    ]);
    expect(signingOut.pendingPassword).toBeNull();

    const deleting = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'DELETION_STARTED' },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'leaked' },
      { type: 'DELETION_COMPLETED' },
    ]);
    expect(deleting.pendingPassword).toBeNull();
  });

  it('drops a stale decrypted-user commit after lock, sign-out and deletion', () => {
    const locked = run([{ type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() }], lockedState());
    expect(locked.userDecrypted).toBeNull();

    const signedOut = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'SIGN_OUT_STARTED' },
      { type: 'SIGN_OUT_COMPLETED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
    ]);
    expect(signedOut.userDecrypted).toBeNull();

    const deleted = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'DELETION_STARTED' },
      { type: 'DELETION_COMPLETED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
    ]);
    expect(deleted.userDecrypted).toBeNull();
  });

  it('never reaches authenticated from locally-locked', () => {
    const s = run([
      { type: 'UNLOCK_REQUESTED' },
      // A delayed AUTHENTICATED_UI_READY from a previous session arrives late
      { type: 'AUTHENTICATED_UI_READY' },
    ], lockedState());
    expect(s.phase).toBe('unlocking');
    expect(s.phase).not.toBe('authenticated');
  });

  it('authenticated implies session + firebase user + UI user + decrypted data', () => {
    const s = authenticatedJourney();
    expect(s.phase).toBe('authenticated');
    expect(s.sessionAuthenticated).toBe(true);
    expect(s.fbUser).not.toBeNull();
    expect(s.user).not.toBeNull();
    expect(s.userDecrypted).not.toBeNull();
    expect(s.isLocalSessionLocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end journeys
// ---------------------------------------------------------------------------

const authenticatedJourney = (): AuthMachineState => run([
  { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
  { type: 'SESSION_CREATED' },
  { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
  { type: 'AUTHENTICATED_UI_READY' },
]);

describe('end-to-end journeys', () => {
  it('cold start with stored session: bootstrapping -> firebase-authenticated -> authenticated', () => {
    const s = run([
      { type: 'LAST_SIGNED_IN_USER_CHANGED', user: makeLastSignedIn() },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ]);
    expect(s.phase).toBe('authenticated');
    expect(s.lastSignedInUser).toEqual(makeLastSignedIn());
  });

  it('cold start with lock marker: bootstrapping -> locally-locked', () => {
    const s = run([
      { type: 'LOCAL_LOCK_DETECTED', user: makeUser(), lastSignedInUser: makeLastSignedIn() },
    ]);
    expect(s.phase).toBe('locally-locked');
    expect(s.authCompleted).toBe(true);
  });

  it('authenticated -> lock -> password unlock -> authenticated', () => {
    const s = run([
      { type: 'LOCK_REQUESTED' },
      { type: 'LOCK_COMPLETED' },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'PENDING_PASSWORD_CHANGED', password: 'hunter2' },
      { type: 'UNLOCK_SUCCEEDED' },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'PENDING_PASSWORD_CHANGED', password: null },
      { type: 'AUTHENTICATED_UI_READY' },
    ], authenticatedJourney());
    expect(s.phase).toBe('authenticated');
    expect(s.pendingPassword).toBeNull();
    expect(s.isLocalSessionLocked).toBe(false);
  });

  it('authenticated -> lock -> biometric unlock -> authenticated', () => {
    const s = run([
      { type: 'LOCK_COMPLETED' },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'UNLOCK_SUCCEEDED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ], authenticatedJourney());
    expect(s.phase).toBe('authenticated');
  });

  it('failed unlock returns to locally-locked and a second unlock can succeed', () => {
    const s = run([
      { type: 'LOCK_COMPLETED' },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'UNLOCK_FAILED', error: 'biometrics cancelled' },
      { type: 'UNLOCK_REQUESTED' },
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'SESSION_CREATED' },
      { type: 'UNLOCK_SUCCEEDED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ], authenticatedJourney());
    expect(s.phase).toBe('authenticated');
  });

  it('authenticated -> sign-out -> signed-out; late decrypted commit is dropped', () => {
    const s = run([
      { type: 'SIGN_OUT_STARTED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() }, // late resolve
      { type: 'SIGN_OUT_COMPLETED' },
    ], authenticatedJourney());
    expect(s.phase).toBe('signed-out');
    expect(s.userDecrypted).toBeNull();
  });

  it('authenticated -> delete -> signed-out', () => {
    const s = run([
      { type: 'DELETION_STARTED' },
      { type: 'DELETION_COMPLETED' },
    ], authenticatedJourney());
    expect(s.phase).toBe('signed-out');
    expect(s.authCompleted).toBe(true);
  });

  it('session resume with MFA: firebase-authenticated -> mfa-pending -> authenticated', () => {
    const s = run([
      { type: 'FIREBASE_USER_ESTABLISHED', user: makeUser() },
      { type: 'MFA_CHALLENGE_RAISED' },
      { type: 'SESSION_CREATED' },
      { type: 'USER_DECRYPTED_CHANGED', userDecrypted: makeDecrypted() },
      { type: 'AUTHENTICATED_UI_READY' },
    ]);
    expect(s.phase).toBe('authenticated');
  });
});
