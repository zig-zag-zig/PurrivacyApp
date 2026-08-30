import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: { queueMfaEnabledUpdate: jest.fn() },
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/disableMfa') => (
    require('../../../../../src/features/mfa/application/disableMfa')
);

const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;
const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;

describe('disableMfa', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    it('removes the MFA security document and disables the MFA flag via batch write', async () => {
        const { disableMfa } = loadModule();
        fakeFs.store.users = {
            'user-1': { exists: true, data: { mfaEnabled: true } },
        };

        await disableMfa('user-1');

        expect(getUserService().queueMfaEnabledUpdate).toHaveBeenCalledWith(
            expect.anything(), 'user-1', false,
        );

        // The batch commits, which should delete the security/mfa subcollection doc
        const mfaDoc = fakeFs.store['users/user-1/security']?.['mfa'];
        expect(mfaDoc?.exists).toBeFalsy();

        expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
            'user-1', 'mfaState', 'mfa disable', { mfaEnabled: false, mfaTrusted: false }, { excludeDeviceId: undefined },
        );
    });

    it('passes through the optional deviceId for notification exclusion', async () => {
        const { disableMfa } = loadModule();
        await disableMfa('user-1', 'dev-1');

        expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
            'user-1', 'mfaState', 'mfa disable', { mfaEnabled: false, mfaTrusted: false }, { excludeDeviceId: 'dev-1' },
        );
    });
});
