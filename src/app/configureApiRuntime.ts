import { configureApiRuntime } from '../api/runtime';
import { getUserId, getUser } from '../features/auth/domain/authUtils';
import { securityService } from '../features/security/services/securityService';
import { setPassphraseBackendSync } from '../features/security/services/passphraseStore';
import { ApiClient } from '../api/client';
import { MfaErrorHandler } from '../features/mfa/api/mfaErrorHandler';
import { MfaUtils } from '../features/mfa/domain/mfaUtils';

export function configureAppApiRuntime(): void {
  // Passphrase-storage toggle syncs to the backend (the endpoint exists and
  // the consent copy promises cross-device sync). Injected here to break the
  // passphraseStore <-> ApiClient <-> securityService dependency cycle.
  setPassphraseBackendSync({
    setPassphraseStorage: (enabled) => ApiClient.setPassphraseStorage(enabled),
  });

  configureApiRuntime({
    identity: { getUserId, getUser },
    sessionStore: {
      getStoredSession: securityService.getStoredSession.bind(securityService),
      storeSession: securityService.storeSession.bind(securityService),
      clearStoredSession: securityService.clearStoredSession.bind(securityService),
      updateStoredSessionMfaState:
        securityService.updateStoredSessionMfaState.bind(securityService),
      updateStoredSessionMfaTrust:
        securityService.updateStoredSessionMfaTrust.bind(securityService),
    },
    mfa: {
      getIsInMfaHandler: () => MfaUtils.getIsInMfaHandler(),
      handleRateLimitError: (...args) =>
        MfaErrorHandler.handleRateLimitError(...args),
      handleSensitiveMfaError: (...args) =>
        MfaErrorHandler.handleSensitiveMfaError(...args),
      handleSessionMfaError: (...args) =>
        MfaErrorHandler.handleSessionMfaError(...args),
      handleMissingHeadersError: (...args) =>
        MfaErrorHandler.handleMissingHeadersError(...args),
    },
  });
}
