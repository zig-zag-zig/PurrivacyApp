import { LastSignedInUser } from '../../../types/types';
import { logger } from '../../../utils/logger';
import {
    deleteSecureStoreItem,
    handleSecureStorageResponse,
} from '../domain/secureStorageUtils';
import { SecureStorageModule } from './biometricSecureStorage';

const LAST_SIGNED_IN_USER_KEY = 'LastSignedInUser';

const clearLastSignedInUser = async (): Promise<void> => {
    try {
        await deleteSecureStoreItem('sensitive', LAST_SIGNED_IN_USER_KEY);
    } catch (error) {
        logger.warn('failed to clear last signed-in user from secure storage', { error });
    }
};

const readLastSignedInUser = async (): Promise<LastSignedInUser | null> => {
    try {
        const response = await SecureStorageModule.getSensitiveValue(LAST_SIGNED_IN_USER_KEY);
        return await handleSecureStorageResponse(
            response,
            'get last signed in user',
            async (value) => {
                const parsed = JSON.parse(value);
                if (!parsed?.uid || typeof parsed.uid !== 'string') {
                    throw new Error('Invalid last signed-in user');
                }

                const lastSignedInUser: LastSignedInUser = {
                    uid: parsed.uid,
                    username: typeof parsed.username === 'string' ? parsed.username : null,
                };

                if (Object.keys(parsed).some((key) => key !== 'uid' && key !== 'username')) {
                    await SecureStorageModule.setSensitiveValue(
                        LAST_SIGNED_IN_USER_KEY,
                        JSON.stringify(lastSignedInUser),
                    );
                }

                return lastSignedInUser;
            },
            async () => {
                await clearLastSignedInUser();
                return null;
            },
        );
    } catch (error) {
        logger.warn('failed to get last signed-in user from secure storage', { error });
        await clearLastSignedInUser();
        return null;
    }
};

const writeLastSignedInUser = async (user: LastSignedInUser): Promise<LastSignedInUser> => {
    try {
        const lastSignedInUser: LastSignedInUser = {
            uid: user.uid,
            username: user.username ?? null,
        };
        const response = await SecureStorageModule.setSensitiveValue(
            LAST_SIGNED_IN_USER_KEY,
            JSON.stringify(lastSignedInUser),
        );
        const error = await handleSecureStorageResponse(
            response,
            'set last signed in user',
            undefined,
            (code, message) => ({ code, message }),
        );
        if (error) {
            throw new Error(`Failed to set last signed in user: ${error.message}`);
        }
        return lastSignedInUser;
    } catch (error) {
        logger.warn('failed to set last signed-in user in secure storage', { error });
        throw error;
    }
};

export const getOrSetLastSignedInUserInSecureStorage = async (
    operation: 'GET' | 'SET' | 'CLEAR',
    user?: LastSignedInUser,
): Promise<LastSignedInUser | null> => {
    if (operation === 'GET') {
        return readLastSignedInUser();
    }

    if (operation === 'CLEAR') {
        await clearLastSignedInUser();
        return null;
    }

    if (!user) {
        throw new Error('User is required when setting LastSignedInUser in secure storage');
    }

    return writeLastSignedInUser(user);
};
