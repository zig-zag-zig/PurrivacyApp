import { createLogger } from '../../../utils/logger';
import { sendPushNotification } from './sendPushNotification';

const logger = createLogger('notification.service');

/**
 * Public facade for notification use cases.
 */
export class NotificationService {
    static async sendDataOnlyNotification(
        userId: string,
        eventName: string,
        payload?: Record<string, unknown>,
        options?: { excludeDeviceId?: string },
    ): Promise<void> {
        await sendPushNotification(userId, {
            eventName,
            payload,
            excludeDeviceId: options?.excludeDeviceId,
        });
    }

    /**
     * Send a data notification, catching and logging any errors.
     * Use for non-critical notifications where failure should not block the caller.
     */
    static async sendDataOnlyNotificationSafe(
        userId: string,
        eventName: string,
        logLabel: string,
        payload?: Record<string, unknown>,
        options?: { excludeDeviceId?: string },
    ): Promise<void> {
        try {
            await NotificationService.sendDataOnlyNotification(userId, eventName, payload, options);
        } catch (error) {
            logger.warn(`${logLabel} notification failed`, { userId, error });
        }
    }
}
