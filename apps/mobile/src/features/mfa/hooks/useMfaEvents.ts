import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from 'firebase/auth';

import { getRecoveryCodesModalHandler } from '../../../api/modalHandler';
import { ApiClient } from '../../../api/client';
import { EventService } from '../../../services/eventService';
import type { MfaState } from '../../../types/types';
import { logger } from '../../../utils/logger';
import { nextMfaState, normalizeMfaState } from '../domain/mfaState';

export function useMfaEvents(
  user: User | null,
  setMfaState: Dispatch<SetStateAction<MfaState>>,
): void {
  useEffect(() => {
    const handleEvent = (eventName: string, payload?: Record<string, any>) => {
      if (eventName === 'newRecoveryCodes' && payload?.recoveryCodes) {
        EventService.consumeEvent('newRecoveryCodes');
        const handler = getRecoveryCodesModalHandler();
        if (handler) {
          handler({
            recoveryCodes: payload.recoveryCodes,
            source: 'auto-generated',
          });
        } else {
          logger.warn('recovery codes modal handler not available');
        }
        return;
      }

      if (eventName !== 'mfaState') {
        return;
      }

      const incomingMfaState = normalizeMfaState(payload);
      if (!incomingMfaState) {
        return;
      }

      if (payload?.source === 'remoteNotification' && !user) {
        return;
      }

      EventService.consumeEvent('mfaState');
      setMfaState(prev => nextMfaState(prev, incomingMfaState));

      if (payload?.source === 'remoteNotification') {
        ApiClient.syncRemoteMfaState(incomingMfaState).catch(error => {
          logger.warn('failed to sync remote mfa state', { error });
        });
      }
    };

    EventService.getPendingEvents().forEach((payload, eventName) => {
      handleEvent(eventName, payload);
    });

    const unsubscribe = EventService.addListener(handleEvent);

    return () => {
      unsubscribe();
    };
  }, [setMfaState, user]);
}
