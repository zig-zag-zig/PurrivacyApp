import {
    deletePushTokensFromDb,
    savePushTokenToDb,
} from '../../notification/infrastructure/pushTokenStore';

export const saveUserPushToken = async (
    userId: string,
    deviceId: string,
    pushToken: string,
): Promise<void> => {
    await savePushTokenToDb(userId, deviceId, pushToken);
};

export const deleteUserPushToken = async (
    userId: string,
    pushToken: string,
): Promise<void> => {
    await deletePushTokensFromDb(userId, [pushToken]);
};

