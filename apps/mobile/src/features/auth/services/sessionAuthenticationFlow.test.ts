import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks for external / native dependencies that would fail in Node.
// ---------------------------------------------------------------------------
vi.mock('react-native', () => ({}));
vi.mock('firebase/auth', () => ({}));
vi.mock('react', () => ({ default: {} }));
vi.mock('../../../api/client', () => ({
  ApiClient: {
    savePushToken: vi.fn(),
  },
}));
vi.mock('../../../services/eventService', () => ({
  EventService: {
    addEvent: vi.fn(),
    resetForTesting: vi.fn(),
  },
}));
vi.mock('../../security/services/activityService', () => ({
  resetSessionTimer: vi.fn(),
}));

vi.mock('../../security/services/securityService', () => ({
  securityService: { setLocalSessionLocked: vi.fn(async () => {}) },
}));

vi.mock('../domain/authUtils', () => ({
  getUserId: () => 'user',
}));

vi.mock('../../../api/session/sessionSwap', () => ({
  hasRecentSessionSwap: () => false,
  recordSessionSwap: vi.fn(),
}));

import type { RefObject } from 'react';
import type { User } from 'firebase/auth';

import { EventService } from '../../../services/eventService';
import type { UserDecrypted } from '../../../types/types';
import {
  completeAuthenticatedUi,
  finishAuthenticatedSession,
} from './sessionAuthenticationFlow';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../utils/logger', () => ({ logger: loggerMock }));

// ---------- helpers ----------

const fakeUser = { uid: 'user-1' } as unknown as User;

type Setter<T> = (value: T) => void;
type StubSetters = {
  setIsAuthLoading: Setter<boolean>;
  setIsCheckingInactivity: Setter<boolean>;
  setAuthCompleted: Setter<boolean>;
  setIsBiometricAvailable: Setter<boolean>;
  setIsBiometricEnabled: Setter<boolean>;
  calls: Record<string, unknown[]>;
};

const stubSetters = (): StubSetters => {
  const calls: Record<string, unknown[]> = {};
  const setter = <T,>(name: string): Setter<T> => (value: T) => {
    (calls[name] ??= []).push(value);
  };
  return {
    setIsAuthLoading: setter<boolean>('setIsAuthLoading'),
    setIsCheckingInactivity: setter<boolean>('setIsCheckingInactivity'),
    setAuthCompleted: setter<boolean>('setAuthCompleted'),
    setIsBiometricAvailable: setter<boolean>('setIsBiometricAvailable'),
    setIsBiometricEnabled: setter<boolean>('setIsBiometricEnabled'),
    calls,
  };
};

const ref = (value: boolean) =>
  ({ current: value } as RefObject<boolean>);

const nullRef = () =>
  ({ current: null } as RefObject<string | null>);

// ---------- completeAuthenticatedUi ----------
describe('completeAuthenticatedUi', () => {
  it('sets all three flags to terminal values', () => {
    const s = stubSetters();
    completeAuthenticatedUi({
      setIsAuthLoading: s.setIsAuthLoading,
      setIsCheckingInactivity: s.setIsCheckingInactivity,
      setAuthCompleted: s.setAuthCompleted,
    });
    expect(s.calls['setIsAuthLoading']).toEqual([false]);
    expect(s.calls['setIsCheckingInactivity']).toEqual([false]);
    expect(s.calls['setAuthCompleted']).toEqual([true]);
  });
});

// ---------------------------------------------------------------------------
// finishAuthenticatedSession scenarios
// ---------------------------------------------------------------------------
describe('finishAuthenticatedSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    EventService.resetForTesting();
  });

  it('short-circuits when currentUser is null', async () => {
    const s = stubSetters();
    const lock = vi.fn();

    await finishAuthenticatedSession({
      currentUser: null,
      shouldPromptBiometric: false,
      lock,
      runLoadUserRef: ref(true),
      pendingPasswordRef: nullRef(),
      loadUser: vi.fn(),
      promptBiometricWhenDekIsReady: vi.fn(),
      initializeBiometricState: vi.fn(),
      registerForPushNotificationsAsync: vi.fn(),
      setIsBiometricAvailable: s.setIsBiometricAvailable,
      setIsBiometricEnabled: s.setIsBiometricEnabled,
      setIsAuthLoading: s.setIsAuthLoading,
      setIsCheckingInactivity: s.setIsCheckingInactivity,
      setAuthCompleted: s.setAuthCompleted,
    });

    expect(lock).not.toHaveBeenCalled();
    expect(s.calls['setIsBiometricAvailable']).toEqual([false]);
    expect(s.calls['setIsBiometricEnabled']).toEqual([false]);
  });

  it('completes UI when loadUser returns user data', async () => {
    const s = stubSetters();
    const lock = vi.fn();
    const loadUser = vi.fn().mockResolvedValue({
      keys: [],
      dekPassword: {},
      dekSeed: {},
    } as unknown as UserDecrypted);

    await finishAuthenticatedSession({
      currentUser: fakeUser,
      shouldPromptBiometric: false,
      lock,
      runLoadUserRef: ref(true),
      pendingPasswordRef: nullRef(),
      loadUser,
      promptBiometricWhenDekIsReady: vi.fn(),
      initializeBiometricState: vi.fn(),
      registerForPushNotificationsAsync: vi.fn(),
      setIsBiometricAvailable: s.setIsBiometricAvailable,
      setIsBiometricEnabled: s.setIsBiometricEnabled,
      setIsAuthLoading: s.setIsAuthLoading,
      setIsCheckingInactivity: s.setIsCheckingInactivity,
      setAuthCompleted: s.setAuthCompleted,
    });

    expect(lock).not.toHaveBeenCalled();
    expect(s.calls['setIsAuthLoading']).toEqual([false]);
    expect(s.calls['setIsCheckingInactivity']).toEqual([false]);
    expect(s.calls['setAuthCompleted']).toEqual([true]);
  });

  it('locks when loadUser returns null', async () => {
    const s = stubSetters();
    const lock = vi.fn();
    const loadUser = vi.fn().mockResolvedValue(null);

    const mfaEvent = vi.spyOn(EventService, 'addEvent');

    await finishAuthenticatedSession({
      currentUser: fakeUser,
      shouldPromptBiometric: false,
      lock,
      runLoadUserRef: ref(true),
      pendingPasswordRef: nullRef(),
      loadUser,
      promptBiometricWhenDekIsReady: vi.fn(),
      initializeBiometricState: vi.fn(),
      registerForPushNotificationsAsync: vi.fn(),
      setIsBiometricAvailable: s.setIsBiometricAvailable,
      setIsBiometricEnabled: s.setIsBiometricEnabled,
      setIsAuthLoading: s.setIsAuthLoading,
      setIsCheckingInactivity: s.setIsCheckingInactivity,
      setAuthCompleted: s.setAuthCompleted,
    });

    expect(mfaEvent).toHaveBeenCalledWith('closeMfaModal', { force: true });
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('defers UI when pending password present and no load requested', async () => {
    const s = stubSetters();
    const lock = vi.fn();
    const pendingRef = { current: 'some-password' } as RefObject<string | null>;

    await finishAuthenticatedSession({
      currentUser: fakeUser,
      shouldPromptBiometric: false,
      lock,
      runLoadUserRef: ref(false),
      pendingPasswordRef: pendingRef,
      loadUser: vi.fn(),
      promptBiometricWhenDekIsReady: vi.fn(),
      initializeBiometricState: vi.fn(),
      registerForPushNotificationsAsync: vi.fn(),
      setIsBiometricAvailable: s.setIsBiometricAvailable,
      setIsBiometricEnabled: s.setIsBiometricEnabled,
      setIsAuthLoading: s.setIsAuthLoading,
      setIsCheckingInactivity: s.setIsCheckingInactivity,
      setAuthCompleted: s.setAuthCompleted,
    });

    expect(s.calls['setIsAuthLoading']).toBeUndefined();
    expect(s.calls['setAuthCompleted']).toBeUndefined();
  });
});
