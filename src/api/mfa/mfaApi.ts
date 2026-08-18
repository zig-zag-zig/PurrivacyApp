import { getApiRuntime } from '../runtime';
import type {
  MfaSetupResponse,
  RecoveryCodeRegenerateResponse,
  RecoveryCodeRemainingResponse,
  SessionResponse,
} from '../../types/types';
import type { ApiRequestFn } from '../core/apiRequestFactory';

type StoreSessionResponse = (response: SessionResponse) => Promise<void>;

export function createMfaApi(request: ApiRequestFn, storeSessionResponse: StoreSessionResponse) {
  const storeResponseIfPresent = async (response: SessionResponse): Promise<void> => {
    if (response.accessToken) {
      await storeSessionResponse(response);
    }
  };

  return {
    setupMfa(): Promise<MfaSetupResponse> {
      return request('/mfa/setup', 'POST') as Promise<MfaSetupResponse>;
    },

    async enableMfa(): Promise<SessionResponse> {
      const response = await request(
        '/mfa/enable',
        'POST',
        undefined,
        true,
        { includeDeviceId: true },
      ) as SessionResponse;

      await storeResponseIfPresent(response);
      return response;
    },

    async disableMfa(): Promise<SessionResponse> {
      const response = await request(
        '/mfa/disable',
        'POST',
        undefined,
        true,
        { includeDeviceId: true },
      ) as SessionResponse;

      await storeResponseIfPresent(response);
      return response;
    },

    async trustSession(mfaTrusted: boolean): Promise<{ mfaTrusted: boolean }> {
      const response = await request(
        '/mfa/session/trust',
        'POST',
        { mfaTrusted },
        true,
      ) as { mfaTrusted: boolean };

      if (typeof response.mfaTrusted === 'boolean') {
        const runtime = getApiRuntime();
        await runtime.sessionStore.updateStoredSessionMfaTrust(runtime.identity.getUserId(), response.mfaTrusted);
      }

      return response;
    },

    regenerateRecoveryCodes(): Promise<RecoveryCodeRegenerateResponse> {
      return request('/mfa/recovery-codes/regenerate', 'POST', {}, true) as Promise<RecoveryCodeRegenerateResponse>;
    },

    getRemainingRecoveryCodes(): Promise<RecoveryCodeRemainingResponse> {
      return request('/mfa/recovery-codes/remaining', 'GET', undefined, true) as Promise<RecoveryCodeRemainingResponse>;
    },
  };
}
