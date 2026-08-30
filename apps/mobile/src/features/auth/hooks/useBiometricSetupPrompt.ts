import { RefObject, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';

import { logger } from '../../../utils/logger';
import { securityService } from '../../security/services/securityService';
import { getUsernameFromUser } from '../domain/usernameIdentity';

type UseBiometricSetupPromptResult = {
  shouldPromptBiometricRef: RefObject<boolean>;
  clearPendingBiometricPromptRetry: () => void;
  promptBiometricWhenDekIsReady: (currentUser: User, attempt?: number) => Promise<void>;
};

export const useBiometricSetupPrompt = (
  promptBiometric: (username: string) => Promise<void>,
): UseBiometricSetupPromptResult => {
  const shouldPromptBiometricRef = useRef(false);
  const biometricPromptRetryRef = useRef<NodeJS.Timeout | null>(null);

  const clearPendingBiometricPromptRetry = useCallback(() => {
    if (biometricPromptRetryRef.current) {
      clearTimeout(biometricPromptRetryRef.current);
      biometricPromptRetryRef.current = null;
    }
  }, []);

  const promptBiometricWhenDekIsReady = useCallback(async (
    currentUser: User,
    attempt = 0,
  ): Promise<void> => {
    if (!shouldPromptBiometricRef.current) {
      return;
    }

    const username = getUsernameFromUser(currentUser);
    if (!username) {
      shouldPromptBiometricRef.current = false;
      return;
    }

    const maxAttempts = 60;
    const retryDelayMs = 500;
    const dekReady = await securityService.hasDek(currentUser.uid);

    if (!dekReady) {
      if (attempt >= maxAttempts) {
        shouldPromptBiometricRef.current = false;
        return;
      }

      clearPendingBiometricPromptRetry();
      biometricPromptRetryRef.current = setTimeout(() => {
        promptBiometricWhenDekIsReady(currentUser, attempt + 1).catch((error) => {
          logger.warn('failed while waiting to prompt biometric setup', { error });
        });
      }, retryDelayMs);
      return;
    }

    clearPendingBiometricPromptRetry();
    shouldPromptBiometricRef.current = false;
    await promptBiometric(username);
  }, [clearPendingBiometricPromptRetry, promptBiometric]);

  return {
    shouldPromptBiometricRef,
    clearPendingBiometricPromptRetry,
    promptBiometricWhenDekIsReady,
  };
};

