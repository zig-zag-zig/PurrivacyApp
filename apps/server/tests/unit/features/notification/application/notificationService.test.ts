jest.mock('../../../../../src/features/notification/application/sendPushNotification', () => ({
    sendPushNotification: jest.fn(),
}));

const loadService = (): typeof import('../../../../../src/features/notification/application/NotificationService') => (
    require('../../../../../src/features/notification/application/NotificationService')
);

describe('NotificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('sendDataOnlyNotification delegates to sendPushNotification', async () => {
        const { NotificationService } = loadService();
        const { sendPushNotification } = require('../../../../../src/features/notification/application/sendPushNotification');

        await NotificationService.sendDataOnlyNotification('user-1', 'testEvent', { data: 1 }, { excludeDeviceId: 'dev-1' });

        expect(sendPushNotification).toHaveBeenCalledWith('user-1', {
            eventName: 'testEvent',
            payload: { data: 1 },
            excludeDeviceId: 'dev-1',
        });
    });

    it('sendDataOnlyNotificationSafe catches errors and logs', async () => {
        const { sendPushNotification } = require('../../../../../src/features/notification/application/sendPushNotification');
        sendPushNotification.mockRejectedValue(new Error('push failed'));

        const { NotificationService } = loadService();
        await expect(NotificationService.sendDataOnlyNotificationSafe('user-1', 'test', 'label'))
            .resolves.toBeUndefined();
    });
});
