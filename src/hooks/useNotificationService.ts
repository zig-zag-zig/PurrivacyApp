import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { EventPayload, EventService } from '../services/eventService';
import * as Device from 'expo-device';
import { logger } from '../utils/logger';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

const normalizeMfaStatePayload = (payload: any): EventPayload | undefined => {
  const mfaState = payload?.mfaState ?? payload;
  if (typeof mfaState?.mfaEnabled !== 'boolean' || typeof mfaState?.mfaTrusted !== 'boolean') {
    return undefined;
  }

  return {
    mfaState: {
      mfaEnabled: mfaState.mfaEnabled,
      mfaTrusted: mfaState.mfaTrusted,
    },
    source: 'remoteNotification',
  };
};

const emitNotificationEvent = (eventName: unknown, payload: unknown): void => {
  if (typeof eventName !== 'string' || eventName.trim().length === 0) {
    return;
  }

  if (eventName === 'mfaState') {
    const normalizedPayload = normalizeMfaStatePayload(payload);
    if (normalizedPayload) {
      EventService.addEvent(eventName, normalizedPayload);
    }
    return;
  }

  EventService.addEvent(eventName, payload as EventPayload);
};

const parseNotificationData = (data: any): any => {
  const innerData = data?.data || {};
  const payloadString = innerData.dataString || innerData.body;
  if (!payloadString) {
    return innerData;
  }

  try {
    return JSON.parse(payloadString);
  } catch {
    return innerData;
  }
};

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: { data: any, error: any }) => {
  if (error) {
    logger.warn('background notification task failed', { error });
    return;
  }

  const eventData = parseNotificationData(data);
  emitNotificationEvent(eventData.eventName, eventData.payload);
});

export const useNotificationService = ({ enabled }: { enabled: boolean }) => {
  const createNotificationChannel = async () => {
    if (Device.osName === 'Android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  };

  useEffect(() => {
    if (!enabled) return;

    // Register background task
    const registerTask = () => {
      try {
        Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK)
          .catch(error => logger.warn('notification task registration failed', { error }));
      } catch (error) {
        logger.warn('background notification task registration failed', { error });
      }
    };

    createNotificationChannel();

    // Foreground listener
    const foregroundListener = Notifications.addNotificationReceivedListener(notification => {
      const { data } = notification.request.content;
      emitNotificationEvent(data?.eventName, data?.payload);
    });

    registerTask();

    return () => {
      foregroundListener.remove();
    };
  }, [enabled]);
};
