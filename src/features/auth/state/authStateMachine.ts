/**
 * Explicit auth state machine (APP-ARCH-001).
 *
 * Pure reducer: no runtime imports, no side effects, Node-testable.
 * All auth flow transitions that previously lived as scattered `useState`
 * setters in AuthContext / useAuthActions / useFirebaseAuth /
 * useAuthSessionLifecycle are expressed here as (state, event) -> state.
 *
 * Design notes:
 * - Phases model the *user-visible* auth lifecycle. Flag-level events
 *   (LOADING_*, CHECKING_INACTIVITY, ...) model intermediate UI state and
 *   never change the phase.
 * - Flows that can be cancelled/fail (MFA, sign-out, deletion, unlock)
 *   record `priorPhase` on entry so cancellation/failure returns to the
 *   correct prior state.
 * - Secrets-bearing fields (pendingPassword, userDecrypted) are cleared by
 *   every terminal transition (lock, sign-out, deletion, user lost) and are
 *   guarded so stale async results cannot re-hydrate them after a lock or
 *   sign-out boundary.
 * - Re-entrant events are no-ops (same state reference) or well-defined.
 */

import type { User } from 'firebase/auth';

import type { LastSignedInUser, UserDecrypted } from '../../../types/types';

export type AuthPhase =
  | 'bootstrapping'
  | 'signed-out'
  | 'firebase-authenticated'
  | 'mfa-pending'
  | 'unlocking'
  | 'authenticated'
  | 'locally-locked'
  | 'signing-out'
  | 'deleting';

export type AuthMachineState = {
  /** The auth lifecycle phase. */
  phase: AuthPhase;
  /** Firebase user surfaced to the UI once a backend session exists. */
  user: User | null;
  /** Most recent Firebase auth user (listener / sign-in / sign-up), before session creation. */
  fbUser: User | null;
  /** Backend session has been established. */
  sessionAuthenticated: boolean;
  /** Local session lock marker (UI lock screen). */
  isLocalSessionLocked: boolean;
  /** Initial bootstrap (auth-state resolution) finished. */
  authCompleted: boolean;
  /** Any auth operation is in flight. */
  isAuthLoading: boolean;
  /** Inactivity check in flight. */
  isCheckingInactivity: boolean;
  /** App is backgrounded. */
  appStateIsBackground: boolean;
  /** Last signed-in user (shown on the unlock/sign-in screen). */
  lastSignedInUser: LastSignedInUser | null;
  /** Whether the last sign-in used biometrics (drives auto-biometric unlock). */
  lastUsedBiometricSignIn: boolean;
  /** In-process password awaiting DEK unlock; cleared on lock/sign-out/delete. */
  pendingPassword: string | null;
  /** Decrypted user data; cleared on lock/sign-out/delete. */
  userDecrypted: UserDecrypted | null;
  /** Phase to restore when a cancellable/failable flow ends. */
  priorPhase: AuthPhase | null;
  /** Last failure message (debugging; not exposed through the context). */
  error: string | null;
};

export type AuthEvent =
  // ── bootstrap / firebase session ────────────────────────────────────────
  | { type: 'BOOTSTRAP_COMPLETED' }
  | { type: 'FIREBASE_USER_ESTABLISHED'; user: User }
  | { type: 'FIREBASE_USER_LOST' }
  | { type: 'LOCAL_LOCK_DETECTED'; lastSignedInUser: LastSignedInUser }
  // ── backend session / MFA ───────────────────────────────────────────────
  | { type: 'SESSION_CREATED' }
  | { type: 'SESSION_AUTH_LOST' }
  | { type: 'MFA_CHALLENGE_RAISED' }
  | { type: 'MFA_CHALLENGE_CANCELLED' }
  // ── local unlock ────────────────────────────────────────────────────────
  | { type: 'UNLOCK_REQUESTED' }
  | { type: 'UNLOCK_SUCCEEDED' }
  | { type: 'UNLOCK_FAILED'; error: string }
  // ── local lock ──────────────────────────────────────────────────────────
  | { type: 'LOCK_REQUESTED' }
  | { type: 'LOCK_COMPLETED' }
  | { type: 'LOCAL_LOCK_CLEARED' }
  // ── sign-out ────────────────────────────────────────────────────────────
  | { type: 'SIGN_OUT_STARTED' }
  | { type: 'SIGN_OUT_COMPLETED' }
  | { type: 'SIGN_OUT_FAILED'; error: string }
  // ── account deletion ────────────────────────────────────────────────────
  | { type: 'DELETION_STARTED' }
  | { type: 'DELETION_COMPLETED' }
  | { type: 'DELETION_FAILED'; error: string }
  // ── error / cleanup ─────────────────────────────────────────────────────
  | { type: 'PARTIAL_AUTH_CLEARED' }
  | { type: 'AUTH_ERROR'; error: string }
  | { type: 'AUTH_UI_SETTLED' }
  | { type: 'AUTHENTICATED_UI_READY' }
  // ── flag-level UI state ─────────────────────────────────────────────────
  | { type: 'LOADING_STARTED' }
  | { type: 'LOADING_FINISHED' }
  | { type: 'CHECKING_INACTIVITY'; checking: boolean }
  | { type: 'APP_STATE_CHANGED'; isBackground: boolean }
  | { type: 'LAST_SIGNED_IN_USER_CHANGED'; user: LastSignedInUser | null }
  | { type: 'BIOMETRIC_SIGN_IN_MARKED'; used: boolean }
  | { type: 'PENDING_PASSWORD_CHANGED'; password: string | null }
  | { type: 'USER_DECRYPTED_CHANGED'; userDecrypted: UserDecrypted | null }
  | { type: 'USER_CHANGED'; user: User }
  | { type: 'USER_CLEARED' }
  | { type: 'FIREBASE_USER_CLEARED' };

export type AuthDispatch = (event: AuthEvent) => void;

export const AUTH_PHASES: readonly AuthPhase[] = [
  'bootstrapping',
  'signed-out',
  'firebase-authenticated',
  'mfa-pending',
  'unlocking',
  'authenticated',
  'locally-locked',
  'signing-out',
  'deleting',
];

export const createInitialAuthState = (): AuthMachineState => ({
  phase: 'bootstrapping',
  user: null,
  fbUser: null,
  sessionAuthenticated: false,
  isLocalSessionLocked: false,
  authCompleted: false,
  isAuthLoading: false,
  isCheckingInactivity: false,
  appStateIsBackground: false,
  lastSignedInUser: null,
  lastUsedBiometricSignIn: false,
  pendingPassword: null,
  userDecrypted: null,
  priorPhase: null,
  error: null,
});

/**
 * Phases where an in-process pending password may legitimately exist.
 * Anywhere else it is treated as a stale secret and dropped.
 */
const PENDING_PASSWORD_ALLOWED_PHASES: readonly AuthPhase[] = [
  'bootstrapping',
  'signed-out',
  'firebase-authenticated',
  'mfa-pending',
  'unlocking',
];

/**
 * Phases where decrypted user data may be committed. In locked, signing-out,
 * deleting or signed-out phases, stale async load results must never
 * re-hydrate secrets. (Signed-out never receives a legitimate non-null commit:
 * fresh sign-ins establish the firebase user before decryption completes.)
 */
const DECRYPTED_ALLOWED_PHASES: readonly AuthPhase[] = [
  'firebase-authenticated',
  'mfa-pending',
  'unlocking',
  'authenticated',
];

/** Terminal transition: no Firebase user, no session, nothing decrypted. */
const toSignedOut = (state: AuthMachineState, options?: { keepAuthCompleted?: boolean }): AuthMachineState => ({
  ...state,
  phase: 'signed-out',
  user: null,
  fbUser: null,
  sessionAuthenticated: false,
  isLocalSessionLocked: false,
  authCompleted: options?.keepAuthCompleted ? state.authCompleted : true,
  isAuthLoading: false,
  isCheckingInactivity: false,
  pendingPassword: null,
  userDecrypted: null,
  priorPhase: null,
  error: null,
});

/** Terminal transition: local session locked, secrets cleared. */
const toLocallyLocked = (state: AuthMachineState): AuthMachineState => ({
  ...state,
  phase: 'locally-locked',
  user: null,
  fbUser: null,
  sessionAuthenticated: false,
  isLocalSessionLocked: true,
  authCompleted: true,
  isAuthLoading: false,
  isCheckingInactivity: false,
  pendingPassword: null,
  userDecrypted: null,
  priorPhase: null,
  error: null,
});

export function authReducer(state: AuthMachineState, event: AuthEvent): AuthMachineState {
  switch (event.type) {
    // ── bootstrap / firebase session ──────────────────────────────────────
    case 'BOOTSTRAP_COMPLETED':
    case 'FIREBASE_USER_LOST':
      if (state.phase === 'signed-out') {
        // Re-entrant: listener re-emits "no user" after flows already settled.
        return state;
      }
      return toSignedOut(state);

    case 'FIREBASE_USER_ESTABLISHED': {
      if (state.phase === 'locally-locked' || state.phase === 'unlocking') {
        // The unlock flow owns the lock state: a Firebase user signal during
        // it (auth listener firing right after the password check) must NOT
        // clear the lock — that would flip the unlock screen to the regular
        // sign-in form before the backend session exists. UNLOCK_SUCCEEDED
        // clears the lock at session completion.
        return {
          ...state,
          fbUser: event.user,
          user: state.sessionAuthenticated ? event.user : state.user,
          error: null,
        };
      }
      return {
        ...state,
        phase: state.phase === 'bootstrapping' || state.phase === 'signed-out'
          ? 'firebase-authenticated'
          : state.phase,
        fbUser: event.user,
        user: state.sessionAuthenticated ? event.user : state.user,
        isLocalSessionLocked: false,
        error: null,
      };
    }

    case 'LOCAL_LOCK_DETECTED':
      return {
        ...toLocallyLocked(state),
        lastSignedInUser: event.lastSignedInUser,
      };

    // ── backend session / MFA ─────────────────────────────────────────────
    case 'SESSION_CREATED': {
      if (state.sessionAuthenticated && state.phase !== 'mfa-pending') {
        return state; // re-entrant
      }
      if (state.phase === 'unlocking') {
        // Keep the unlock flow's phase AND lock: the unlock screen must stay
        // until the session fully completes (UNLOCK_SUCCEEDED, dispatched at
        // completion, transitions the phase and clears the lock).
        return {
          ...state,
          sessionAuthenticated: true,
          user: state.fbUser ?? state.user,
          priorPhase: null,
          error: null,
        };
      }
      const nextPhase = state.phase === 'mfa-pending'
        || state.phase === 'locally-locked'
        || state.phase === 'bootstrapping'
        ? 'firebase-authenticated'
        : state.phase;
      return {
        ...state,
        phase: nextPhase,
        sessionAuthenticated: true,
        user: state.fbUser ?? state.user,
        isLocalSessionLocked: false,
        priorPhase: null,
        error: null,
      };
    }

    case 'SESSION_AUTH_LOST':
      if (!state.sessionAuthenticated) {
        return state; // re-entrant
      }
      return { ...state, sessionAuthenticated: false };

    case 'MFA_CHALLENGE_RAISED':
      if (state.phase === 'mfa-pending') {
        return state; // re-entrant
      }
      return {
        ...state,
        phase: 'mfa-pending',
        priorPhase: state.phase,
        sessionAuthenticated: false,
        isAuthLoading: false,
        error: null,
      };

    case 'MFA_CHALLENGE_CANCELLED':
      if (state.phase !== 'mfa-pending') {
        return state; // well-defined no-op outside the MFA flow
      }
      return {
        ...state,
        phase: state.priorPhase ?? 'firebase-authenticated',
        priorPhase: null,
        isAuthLoading: false,
        error: null,
      };

    // ── local unlock ──────────────────────────────────────────────────────
    case 'UNLOCK_REQUESTED':
      if (state.phase === 'unlocking') {
        return state; // re-entrant
      }
      if (state.phase !== 'locally-locked') {
        return state; // well-defined no-op: nothing to unlock
      }
      return { ...state, phase: 'unlocking', error: null };

    case 'UNLOCK_SUCCEEDED':
      if (state.phase !== 'unlocking' && state.phase !== 'locally-locked') {
        return state; // re-entrant / already progressed
      }
      return {
        ...state,
        phase: state.fbUser ? 'firebase-authenticated' : state.phase,
        isLocalSessionLocked: false,
        error: null,
      };

    case 'UNLOCK_FAILED':
      if (state.phase !== 'unlocking') {
        return state; // well-defined no-op
      }
      return {
        ...toLocallyLocked(state),
        error: event.error,
      };

    // ── local lock ────────────────────────────────────────────────────────
    case 'LOCK_REQUESTED':
      if (state.isAuthLoading && state.error === null) {
        return state; // re-entrant while already locking
      }
      return { ...state, isAuthLoading: true, error: null };

    case 'LOCK_COMPLETED':
      if (state.phase === 'locally-locked') {
        return state; // re-entrant
      }
      return toLocallyLocked(state);

    case 'LOCAL_LOCK_CLEARED':
      if (!state.isLocalSessionLocked) {
        return state; // re-entrant
      }
      return { ...state, isLocalSessionLocked: false };

    // ── sign-out ──────────────────────────────────────────────────────────
    case 'SIGN_OUT_STARTED':
      if (state.phase === 'signing-out') {
        return state; // re-entrant
      }
      return {
        ...state,
        phase: 'signing-out',
        priorPhase: state.phase === 'deleting' ? state.priorPhase : state.phase,
        isAuthLoading: true,
        error: null,
      };

    case 'SIGN_OUT_COMPLETED':
      if (state.phase === 'signed-out') {
        return state; // re-entrant
      }
      return toSignedOut(state);

    case 'SIGN_OUT_FAILED':
      if (state.phase !== 'signing-out') {
        return state; // well-defined no-op
      }
      return {
        ...state,
        phase: state.priorPhase ?? 'signed-out',
        priorPhase: null,
        isAuthLoading: false,
        error: event.error,
      };

    // ── account deletion ──────────────────────────────────────────────────
    case 'DELETION_STARTED':
      if (state.phase === 'deleting') {
        return state; // re-entrant
      }
      return {
        ...state,
        phase: 'deleting',
        priorPhase: state.phase === 'signing-out' ? state.priorPhase : state.phase,
        isAuthLoading: true,
        error: null,
      };

    case 'DELETION_COMPLETED':
      if (state.phase === 'signed-out') {
        return state; // re-entrant
      }
      return toSignedOut(state);

    case 'DELETION_FAILED':
      if (state.phase !== 'deleting') {
        return state; // well-defined no-op
      }
      return {
        ...state,
        phase: state.priorPhase ?? 'signed-out',
        priorPhase: null,
        isAuthLoading: false,
        error: event.error,
      };

    // ── error / cleanup ───────────────────────────────────────────────────
    case 'PARTIAL_AUTH_CLEARED':
      if (state.phase === 'signing-out' || state.phase === 'deleting') {
        // Those flows own their terminal transition.
        return {
          ...state,
          user: null,
          fbUser: null,
          sessionAuthenticated: false,
          isLocalSessionLocked: false,
          isAuthLoading: false,
          isCheckingInactivity: false,
          pendingPassword: null,
          userDecrypted: null,
          error: null,
        };
      }
      return toSignedOut(state, { keepAuthCompleted: true });

    case 'AUTH_ERROR':
      if (state.error === event.error) {
        return state; // re-entrant
      }
      return { ...state, error: event.error };

    case 'AUTH_UI_SETTLED': {
      if (state.phase === 'bootstrapping') {
        // No firebase user known and no flow in progress: settle as signed-out.
        return toSignedOut(state);
      }
      if (state.authCompleted && !state.isAuthLoading && !state.isCheckingInactivity) {
        return state; // re-entrant
      }
      return {
        ...state,
        authCompleted: true,
        isAuthLoading: false,
        isCheckingInactivity: false,
        error: null,
      };
    }

    case 'AUTHENTICATED_UI_READY': {
      if (state.phase === 'authenticated') {
        return state; // re-entrant
      }
      // Invariant: 'authenticated' requires a firebase user, a backend
      // session, the UI user and decrypted data. Locally-locked, signing-out
      // and deleting phases can never reach 'authenticated'.
      if (state.phase !== 'firebase-authenticated' && state.phase !== 'unlocking') {
        return state; // well-defined no-op
      }
      if (!state.fbUser || !state.sessionAuthenticated || !state.user || !state.userDecrypted) {
        return state; // not ready yet (no-op)
      }
      return {
        ...state,
        phase: 'authenticated',
        authCompleted: true,
        isAuthLoading: false,
        isCheckingInactivity: false,
        pendingPassword: null,
        priorPhase: null,
        error: null,
      };
    }

    // ── flag-level UI state ───────────────────────────────────────────────
    case 'LOADING_STARTED':
      if (state.isAuthLoading) {
        return state; // re-entrant
      }
      return { ...state, isAuthLoading: true, error: null };

    case 'LOADING_FINISHED':
      if (!state.isAuthLoading) {
        return state; // re-entrant
      }
      return { ...state, isAuthLoading: false };

    case 'CHECKING_INACTIVITY':
      if (state.isCheckingInactivity === event.checking) {
        return state; // re-entrant
      }
      return { ...state, isCheckingInactivity: event.checking };

    case 'APP_STATE_CHANGED':
      if (state.appStateIsBackground === event.isBackground) {
        return state; // re-entrant
      }
      return { ...state, appStateIsBackground: event.isBackground };

    case 'LAST_SIGNED_IN_USER_CHANGED': {
      if (state.lastSignedInUser === event.user
        || (state.lastSignedInUser?.uid === event.user?.uid
          && state.lastSignedInUser?.username === event.user?.username)) {
        return state; // re-entrant / unchanged
      }
      return { ...state, lastSignedInUser: event.user };
    }

    case 'BIOMETRIC_SIGN_IN_MARKED':
      if (state.lastUsedBiometricSignIn === event.used) {
        return state; // re-entrant
      }
      return { ...state, lastUsedBiometricSignIn: event.used };

    case 'PENDING_PASSWORD_CHANGED': {
      if (!event.password) {
        return state.pendingPassword === null ? state : { ...state, pendingPassword: null };
      }
      if (!PENDING_PASSWORD_ALLOWED_PHASES.includes(state.phase)) {
        // Stale secret must not survive a lock/sign-out/deletion boundary.
        return state;
      }
      if (state.pendingPassword === event.password) {
        return state; // re-entrant
      }
      return { ...state, pendingPassword: event.password };
    }

    case 'USER_DECRYPTED_CHANGED': {
      if (!event.userDecrypted) {
        return state.userDecrypted === null ? state : { ...state, userDecrypted: null };
      }
      if (!DECRYPTED_ALLOWED_PHASES.includes(state.phase)) {
        // Late loadUser resolves must never re-hydrate decrypted state after
        // a lock / sign-out / deletion boundary.
        return state;
      }
      if (state.userDecrypted === event.userDecrypted) {
        return state; // re-entrant
      }
      return { ...state, userDecrypted: event.userDecrypted };
    }

    case 'USER_CHANGED':
      return { ...state, user: event.user, error: null };

    case 'USER_CLEARED':
      if (state.user === null) {
        return state; // re-entrant
      }
      return { ...state, user: null };

    case 'FIREBASE_USER_CLEARED':
      if (state.fbUser === null) {
        return state; // re-entrant
      }
      return { ...state, fbUser: null };
  }
}
