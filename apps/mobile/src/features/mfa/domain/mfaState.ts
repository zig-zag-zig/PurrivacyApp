import type { MfaState } from '../../../types/types';

export function normalizeMfaState(payload: any): MfaState | null {
  const mfaState = payload?.mfaState ?? payload;
  if (typeof mfaState?.mfaEnabled !== 'boolean' || typeof mfaState?.mfaTrusted !== 'boolean') {
    return null;
  }

  return {
    mfaEnabled: mfaState.mfaEnabled,
    mfaTrusted: mfaState.mfaTrusted,
  };
}

export function nextMfaState(current: MfaState, next: MfaState): MfaState {
  if (current.mfaEnabled === next.mfaEnabled && current.mfaTrusted === next.mfaTrusted) {
    return current;
  }

  return next;
}
