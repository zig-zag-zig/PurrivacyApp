import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { storage } from '../utils/storage';
import { logger } from '../utils/logger';

export const useRegisterForPushNotifications = () => {

        const registerForPushNotificationsAsync = async (savePushToken: (pushToken: string) => Promise<void>) => {
        if (!Device.isDevice) {
            logger.warn('push notifications require a physical device');
            return;
        }

        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId) throw new Error('Project ID not found');

        try {
            const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            await savePushToken(token);
            await storage.setItem('expoPushToken', token);
        } catch (error) {
            logger.warn('failed to register push notifications', { error });
        }
    };

    return {
        registerForPushNotificationsAsync,
    };
}
