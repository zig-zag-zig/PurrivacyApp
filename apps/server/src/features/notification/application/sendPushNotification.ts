import { Expo } from 'expo-server-sdk';
import { createLogger } from '../../../utils/logger';
import {
    deletePushTokensFromDb,
    getPushTokensFromDb,
} from '../infrastructure/pushTokenStore';
import { buildExpoPushMessages, collectInvalidPushTokens } from './expoPushPayloads';
import { getNotificationKind } from './notificationOptions';
import { SendNotificationOptions } from './notificationTypes';

const expo = new Expo();
const logger = createLogger('features.notification.push');

export const sendPushNotification = async (
    userId: string,
    options: SendNotificationOptions,
): Promise<void> => {
    try {
        const kind = getNotificationKind(options);
        const pushTokens = await getPushTokensFromDb(userId, {
            excludeDeviceId: options.excludeDeviceId,
        });

        if (pushTokens.length === 0) {
            return;
        }

        const messagePayloads = buildExpoPushMessages(pushTokens, options, kind);
        const chunks = expo.chunkPushNotifications(messagePayloads);
        const tickets = (await Promise.all(
            chunks.map((chunk) => expo.sendPushNotificationsAsync(chunk)),
        )).flat();
        const invalidTokens = collectInvalidPushTokens(pushTokens, tickets);

        if (invalidTokens.length > 0) {
            await deletePushTokensFromDb(userId, invalidTokens);
            logger.warn('deleted invalid push tokens', { userId, count: invalidTokens.length });
        }
    } catch (error) {
        logger.error('failed to send notification', {
            userId,
            eventName: options.eventName,
            visible: Boolean(options.title || options.body),
            error,
        });
        throw error;
    }
};
