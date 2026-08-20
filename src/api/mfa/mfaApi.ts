import { getApiRuntime } from '../runtime';
import type {
  MfaSetupNonceResponse,
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
    mintMfaSetupNonce(): Promise<MfaSetupNonceResponse> {
      // Fresh-auth nonce required before MFA setup (backend API-SEC-006).
      // No mfaCode at this point — the session was recently authenticated.
      return request('/auth/session/mfa-setup-nonce', 'POST', {}, true) as Promise<MfaSetupNonceResponse>;
    },

    setupMfa(nonce: string): Promise<MfaSetupResponse> {
      return request('/mfa/setup', 'POST', { nonce }) as Promise<MfaSetupResponse>;
    },

    async enableMfa(mfaCode: string, mfaTrusted: boolean): Promise<SessionResponse> {
      const response = await request(
        '/mfa/enable',
        'POST',
        { mfaCode, mfaTrusted },
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
