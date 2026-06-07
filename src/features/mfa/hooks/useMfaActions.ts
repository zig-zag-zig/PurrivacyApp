import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiClient } from '../../../api/client';
import { getRecoveryCodesModalHandler } from '../../../api/modalHandler';
import { useToast } from '../../../app/state/ToastContext';
import type {
  MfaSetupResponse,
  MfaState,
  RecoveryCodeRegenerateResponse,
  RecoveryCodeRemainingResponse,
  SessionResponse,
} from '../../../types/types';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';

type MfaActions = {
  setupMfa: () => Promise<MfaSetupResponse>;
  enableMfa: () => Promise<void>;
  disableMfa: () => Promise<void>;
  setSessionTrust: (mfaTrusted: boolean) => Promise<void>;
  regenerateRecoveryCodes: () => Promise<string[]>;
  getRemainingRecoveryCodes: () => Promise<RecoveryCodeRemainingResponse>;
  isLoading: boolean;
  error: string | null;
};

const runMfaAction = async <T,>(
  setIsLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
  defaultMessage: string,
  operationName: string,
  action: () => Promise<T>,
): Promise<T> => {
  try {
    setIsLoading(true);
    setError(null);
    return await action();
  } catch (error: any) {
    logger.warn(operationName, { error });
    setError(getUserFacingErrorMessage(error, defaultMessage));
    throw error;
  } finally {
    setIsLoading(false);
  }
};

export function useMfaActions(
  setMfaState: Dispatch<SetStateAction<MfaState>>,
): MfaActions {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const setupMfa = async (): Promise<MfaSetupResponse> => runMfaAction(
    setIsLoading,
    setError,
    'Failed to setup MFA',
    'failed to setup mfa',
    () => ApiClient.setupMfa(),
  );

  const enableMfa = async (): Promise<void> => runMfaAction(
    setIsLoading,
    setError,
    'Failed to enable MFA',
    'failed to enable mfa',
    async () => {
      const response = await ApiClient.enableMfa();

      setMfaState(prev => {
        if (prev.mfaEnabled === true && prev.mfaTrusted === response.mfaTrusted) {
          return prev;
        }
        return { mfaEnabled: true, mfaTrusted: response.mfaTrusted };
      });

      showToast('MFA enabled successfully', 'success');
    },
  );

  const disableMfa = async (): Promise<void> => runMfaAction(
    setIsLoading,
    setError,
    'Failed to disable MFA',
    'failed to disable mfa',
    async () => {
      const response: SessionResponse = await ApiClient.disableMfa();

      setMfaState(prev => {
        if (prev.mfaEnabled === false && prev.mfaTrusted === response.mfaTrusted) {
          return prev;
        }
        return { mfaEnabled: false, mfaTrusted: response.mfaTrusted };
      });

      showToast('MFA disabled successfully', 'success');
    },
  );

  const setSessionTrust = async (mfaTrusted: boolean): Promise<void> => runMfaAction(
    setIsLoading,
    setError,
    'Failed to manage session trust',
    'failed to manage session trust',
    async () => {
      const response = await ApiClient.trustSession(mfaTrusted);

      setMfaState(prev => {
        if (prev.mfaTrusted === response.mfaTrusted) {
          return prev;
        }
        return {
          ...prev,
          mfaTrusted: response.mfaTrusted,
        };
      });

      showToast(
        response.mfaTrusted ? 'Session trusted successfully' : 'Session trust revoked',
        'success',
      );
    },
  );

  const regenerateRecoveryCodes = async (): Promise<string[]> => runMfaAction(
    setIsLoading,
    setError,
    'Failed to regenerate recovery codes',
    'failed to regenerate recovery codes',
    async () => {
      const response: RecoveryCodeRegenerateResponse = await ApiClient.regenerateRecoveryCodes();

      showToast('Recovery codes regenerated successfully', 'success');

      const handler = getRecoveryCodesModalHandler();
      if (handler) {
        await handler({
          recoveryCodes: response.recoveryCodes,
          source: 'regenerate',
        });
      } else {
        logger.warn('recovery codes modal handler not available');
      }

      return response.recoveryCodes;
    },
  );

  const getRemainingRecoveryCodes = async (): Promise<RecoveryCodeRemainingResponse> => runMfaAction(
    setIsLoading,
    setError,
    'Failed to get remaining recovery codes',
    'failed to get remaining recovery codes',
    () => ApiClient.getRemainingRecoveryCodes(),
  );

  return {
    setupMfa,
    enableMfa,
    disableMfa,
    setSessionTrust,
    regenerateRecoveryCodes,
    getRemainingRecoveryCodes,
    isLoading,
    error,
  };
}
