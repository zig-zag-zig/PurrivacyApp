import { EventService } from '../../../services/eventService';
import { SessionResponse, StoredSession } from '../../../types/types';
import { logger } from '../../../utils/logger';
import {
    deleteSecureStoreItem,
    handleSecureStorageResponse,
    SESSION_PREFIX,
} from '../domain/secureStorageUtils';
import { SecureStorageModule } from './biometricSecureStorage';

const sessionStorageKey = (userId: string): string => `${SESSION_PREFIX}${userId}`;

const clearStoredSessionItem = async (userId: string): Promise<void> => {
    try {
        await deleteSecureStoreItem('sensitive', sessionStorageKey(userId));
    } catch (error) {
        logger.warn('failed to clear stored session from secure storage', { error });
    }
};

const persistStoredSession = async (
    userId: string,
    session: StoredSession,
    operation: string,
): Promise<void> => {
    const response = await SecureStorageModule.setSensitiveValue(
        sessionStorageKey(userId),
        JSON.stringify(session),
    );
    const error = await handleSecureStorageResponse(
        response,
        operation,
        undefined,
        (code, message) => ({ code, message }),
    );
    if (error) {
        throw new Error(error.message || `${operation} failed`);
    }
};

export const storeSession = async (session: SessionResponse, userId: string): Promise<void> => {
    try {
        const storedSession: StoredSession = {
            refreshToken: session.refreshToken,
            refreshTokenExpiresAt: new Date(session.refreshTokenExpiresAt),
            mfaTrusted: session.mfaTrusted,
            mfaEnabled: session.mfaEnabled,
        };
        await persistStoredSession(userId, storedSession, 'store session');
        EventService.addEvent('mfaState', {
            mfaState: {
                mfaTrusted: storedSession.mfaTrusted,
                mfaEnabled: storedSession.mfaEnabled,
            },
        });
    } catch (error) {
        logger.warn('failed to store session in secure storage', { error });
        throw error;
    }
};

export const clearStoredSession = async (userId: string): Promise<void> => {
    try {
        await clearStoredSessionItem(userId);
        EventService.addEvent('mfaState', { mfaState: { mfaTrusted: false, mfaEnabled: false } });
    } catch (error) {
        logger.warn('failed to clear session from secure storage', { error });
    }
};

export const getStoredSession = async (userId: string): Promise<StoredSession | null> => {
    try {
        const response = await SecureStorageModule.getSensitiveValue(sessionStorageKey(userId));

        return await handleSecureStorageResponse(
            response,
            'get session',
            async (value) => {
                const parsed = JSON.parse(value);
                const session: StoredSession = {
                    refreshToken: parsed.refreshToken,
                    refreshTokenExpiresAt: new Date(parsed.refreshTokenExpiresAt),
                    mfaTrusted: parsed.mfaTrusted === true,
                    mfaEnabled: parsed.mfaEnabled,
                };

                if (!session.refreshToken) {
                    logger.warn('stored session is missing refresh token');
                    await clearStoredSessionItem(userId);
                    return null;
                }

                if (session.refreshTokenExpiresAt < new Date()) {
                    logger.warn('stored session refresh token is past local expiry');
                    await clearStoredSessionItem(userId);
                    return null;
                }

                return session;
            },
            (code, message) => {
                logger.warn('secure storage did not return stored session', { code, message });
                return null;
            },
        );
    } catch (error) {
        logger.warn('failed to get stored session from secure storage', { error });
        return null;
    }
};

export const updateStoredSessionMfaTrust = async (
    userId: string,
    mfaTrusted: boolean,
): Promise<void> => {
    try {
        const session = await getStoredSession(userId);
        if (!session) {
            return;
        }

        const updatedSession: StoredSession = {
            ...session,
            mfaTrusted,
        };

        await persistStoredSession(userId, updatedSession, 'update session MFA trust');
        EventService.addEvent('mfaState', {
            mfaState: {
                mfaTrusted: updatedSession.mfaTrusted,
                mfaEnabled: updatedSession.mfaEnabled,
            },
        });
    } catch (error) {
        logger.warn('failed to update stored session MFA trust', { error });
    }
};

export const updateStoredSessionMfaState = async (
    userId: string,
    mfaEnabled: boolean,
    mfaTrusted: boolean,
): Promise<void> => {
    try {
        const session = await getStoredSession(userId);
        if (!session) {
            return;
        }

        const updatedSession: StoredSession = {
            ...session,
            mfaEnabled,
            mfaTrusted: mfaEnabled && mfaTrusted,
        };

        await persistStoredSession(userId, updatedSession, 'update session MFA state');
    } catch (error) {
        logger.warn('failed to update stored session MFA state', { error });
    }
};
