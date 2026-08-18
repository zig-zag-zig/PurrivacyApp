import type { RecoveryChallengeResponse, RecoveryTokenResponse } from '../../types/types';
import type { ApiRequestFn } from '../core/apiRequestFactory';

export function createRecoveryApi(request: ApiRequestFn) {
  return {
    getRecoveryChallenge(username: string): Promise<RecoveryChallengeResponse> {
      return request('/auth/recovery/challenge', 'POST', { username }, false) as Promise<RecoveryChallengeResponse>;
    },

    createRecoveryToken(
      username: string,
      recoveryVerifier: string,
    ): Promise<RecoveryTokenResponse> {
      return request('/auth/recovery/token', 'POST', { username, recoveryVerifier }, false) as Promise<RecoveryTokenResponse>;
    },
  };
}
