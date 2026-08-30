const mockGetPushTokensFromDb = jest.fn();
const mockDeletePushTokensFromDb = jest.fn();
const mockBuildExpoPushMessages = jest.fn();
const mockCollectInvalidPushTokens = jest.fn();
const mockChunkPushNotifications = jest.fn();
const mockSendPushNotificationsAsync = jest.fn();

jest.mock('../../../../../src/features/notification/infrastructure/pushTokenStore', () => ({
    getPushTokensFromDb: mockGetPushTokensFromDb,
    deletePushTokensFromDb: mockDeletePushTokensFromDb,
}));

jest.mock('../../../../../src/features/notification/application/expoPushPayloads', () => ({
    buildExpoPushMessages: mockBuildExpoPushMessages,
    collectInvalidPushTokens: mockCollectInvalidPushTokens,
}));

jest.mock('expo-server-sdk', () => ({
    Expo: jest.fn().mockImplementation(() => ({
        chunkPushNotifications: mockChunkPushNotifications,
        sendPushNotificationsAsync: mockSendPushNotificationsAsync,
    })),
}));

const loadModule = (): typeof import('../../../../../src/features/notification/application/sendPushNotification') => (
    require('../../../../../src/features/notification/application/sendPushNotification')
);

describe('sendPushNotification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns early when user has no push tokens', async () => {
        mockGetPushTokensFromDb.mockResolvedValue([]);
        const { sendPushNotification } = loadModule();

        await sendPushNotification('user-1', { eventName: 'test' });

        expect(mockGetPushTokensFromDb).toHaveBeenCalledWith('user-1', { excludeDeviceId: undefined });
        expect(mockBuildExpoPushMessages).not.toHaveBeenCalled();
    });

    it('sends notifications and cleans up invalid tokens', async () => {
        mockGetPushTokensFromDb.mockResolvedValue(['token-1', 'token-2']);
        mockBuildExpoPushMessages.mockReturnValue([{ to: 'token-1' }, { to: 'token-2' }]);
        mockChunkPushNotifications.mockReturnValue([[{ to: 'token-1' }], [{ to: 'token-2' }]]);
        mockSendPushNotificationsAsync.mockResolvedValueOnce([{ status: 'ok', id: 't1' }]);
        mockSendPushNotificationsAsync.mockResolvedValueOnce([
            { status: 'error', message: 'Invalid', details: { expoPushToken: 'token-2' } },
        ]);
        mockCollectInvalidPushTokens.mockReturnValue(['token-2']);
        const { sendPushNotification } = loadModule();

        await sendPushNotification('user-1', { eventName: 'test.event', payload: { id: '1' } });

        expect(mockGetPushTokensFromDb).toHaveBeenCalledWith('user-1', { excludeDeviceId: undefined });
        expect(mockBuildExpoPushMessages).toHaveBeenCalledWith(['token-1', 'token-2'], expect.anything(), 'data');
        expect(mockDeletePushTokensFromDb).toHaveBeenCalledWith('user-1', ['token-2']);
    });

    it('excludes a device from token retrieval when specified', async () => {
        mockGetPushTokensFromDb.mockResolvedValue(['token-1']);
        mockBuildExpoPushMessages.mockReturnValue([{ to: 'token-1' }]);
        mockChunkPushNotifications.mockReturnValue([[{ to: 'token-1' }]]);
        mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok', id: 't1' }]);
        mockCollectInvalidPushTokens.mockReturnValue([]);
        const { sendPushNotification } = loadModule();

        await sendPushNotification('user-1', { eventName: 'test', excludeDeviceId: 'dev-exclude' });

        expect(mockGetPushTokensFromDb).toHaveBeenCalledWith('user-1', { excludeDeviceId: 'dev-exclude' });
    });
});
