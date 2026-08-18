import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { EventService, isAppEventName } from '../../services/eventService';
import * as Device from 'expo-device';
import { logger } from '../../utils/logger';
import {
    normalizeMfaStatePayload,
    parseClearMfaCodePayload,
    parseCloseMfaModalPayload,
    parseNewRecoveryCodesPayload,
    parseNotificationData,
    parsePassphraseDeletedPayload,
    parsePassphraseStorageChangedPayload,
    parsePassphraseSyncedPayload,
} from './notificationEventParsing';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

/**
 * Dispatches a remote-notification event. The event name must be known and
 * every payload is validated by the per-event guards in
 * `notificationEventParsing`; malformed payloads are dropped.
 */
const emitNotificationEvent = (eventName: unknown, payload: unknown): void => {
    if (typeof eventName !== 'string' || !isAppEventName(eventName)) {
        return;
    }

    switch (eventName) {
        case 'clearMfaCode': {
            const parsed = parseClearMfaCodePayload(payload);
            if (parsed) {
                EventService.addEvent('clearMfaCode', parsed);
            }
            return;
        }
        case 'closeMfaModal': {
            const parsed = parseCloseMfaModalPayload(payload);
            if (parsed) {
                EventService.addEvent('closeMfaModal', parsed);
            }
            return;
        }
        case 'mfaState': {
            const parsed = normalizeMfaStatePayload(payload);
            if (parsed) {
                EventService.addEvent('mfaState', parsed);
            }
            return;
        }
        case 'newRecoveryCodes': {
            const parsed = parseNewRecoveryCodesPayload(payload);
            if (parsed) {
                EventService.addEvent('newRecoveryCodes', parsed);
            }
            return;
        }
        case 'passphraseStorageChanged': {
            const parsed = parsePassphraseStorageChangedPayload(payload);
            if (parsed) {
                EventService.addEvent('passphraseStorageChanged', parsed);
            }
            return;
        }
        case 'passphraseSynced': {
            const parsed = parsePassphraseSyncedPayload(payload);
            if (parsed) {
                EventService.addEvent('passphraseSynced', parsed);
            }
            return;
        }
        case 'passphraseDeleted': {
            const parsed = parsePassphraseDeletedPayload(payload);
            if (parsed) {
                EventService.addEvent('passphraseDeleted', parsed);
            }
            return;
        }
        case 'devTempKeys':
        case 'signOut':
        case 'user':
            // Payload-less events by contract; any push payload is dropped.
            EventService.addEvent(eventName, undefined);
            return;
    }
};

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: { data: unknown, error: unknown }) => {
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
