import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: { revokeRefreshTokens: jest.fn() },
}), { virtual: true });

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadService = (): typeof import('../../../../../src/features/session/application/SessionRevocationService') => (
    require('../../../../../src/features/session/application/SessionRevocationService')
);
const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;
const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;

describe('SessionRevocationService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    it('deletes all sessions only when revokeFbToken is false', async () => {
        fakeFs.store.sessions = {
            's-1': { exists: true, data: { userId: 'user-1' } },
            's-2': { exists: true, data: { userId: 'user-1' } },
        };
        fakeFs.store.refreshTokens = { 'rt-1': { exists: true, data: { userId: 'user-1' } } };
        fakeFs.store.refreshTokenFamilies = { 'fam-1': { exists: true, data: { userId: 'user-1' } } };

        const { SessionRevocationService } = loadService();
        await SessionRevocationService.revokeAllUserSessions('user-1', false);

        expect(fakeFs.store.sessions['s-1'].exists).toBe(false);
        expect(fakeFs.store.sessions['s-2'].exists).toBe(false);
        expect(getAuth().revokeRefreshTokens).not.toHaveBeenCalled();
        expect(getNotificationService().sendDataOnlyNotificationSafe).not.toHaveBeenCalled();
    });

    it('revokes Firebase tokens and sends notification when revokeFbToken is true', async () => {
        getAuth().revokeRefreshTokens.mockResolvedValue(undefined);
        getNotificationService().sendDataOnlyNotificationSafe.mockResolvedValue(undefined);

        const { SessionRevocationService } = loadService();
        await SessionRevocationService.revokeAllUserSessions('user-1', true);

        expect(getAuth().revokeRefreshTokens).toHaveBeenCalledWith('user-1');
        expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith('user-1', 'sessionRevoked', 'session revoked');
    });

    it('keeps the excluded family (and its records) alive', async () => {
        fakeFs.store.sessions = {
            's-old': { exists: true, data: { userId: 'user-1', refreshTokenFamilyId: 'fam-old' } },
            's-new': { exists: true, data: { userId: 'user-1', refreshTokenFamilyId: 'fam-new' } },
        };
        fakeFs.store.refreshTokens = {
            'rt-old': { exists: true, data: { userId: 'user-1', familyId: 'fam-old' } },
            'rt-new': { exists: true, data: { userId: 'user-1', familyId: 'fam-new' } },
        };
        fakeFs.store.refreshTokenFamilies = {
            'fam-old': { exists: true, data: { userId: 'user-1', familyId: 'fam-old' } },
            'fam-new': { exists: true, data: { userId: 'user-1', familyId: 'fam-new' } },
        };

        const { SessionRevocationService } = loadService();
        await SessionRevocationService.revokeAllUserSessions('user-1', false, { excludeFamilyId: 'fam-new' });

        expect(fakeFs.store.sessions['s-old'].exists).toBe(false);
        expect(fakeFs.store.refreshTokens['rt-old'].exists).toBe(false);
        expect(fakeFs.store.refreshTokenFamilies['fam-old'].exists).toBe(false);

        expect(fakeFs.store.sessions['s-new'].exists).toBe(true);
        expect(fakeFs.store.refreshTokens['rt-new'].exists).toBe(true);
        expect(fakeFs.store.refreshTokenFamilies['fam-new'].exists).toBe(true);
    });

    it('retries Firebase token revocation once and never throws after records are deleted', async () => {
        getAuth().revokeRefreshTokens
            .mockRejectedValueOnce(new Error('Firebase error'))
            .mockResolvedValue(undefined);
        getNotificationService().sendDataOnlyNotificationSafe.mockResolvedValue(undefined);

        const { SessionRevocationService } = loadService();
        await expect(SessionRevocationService.revokeAllUserSessions('user-1', true))
            .resolves.toBeUndefined();

        expect(getAuth().revokeRefreshTokens).toHaveBeenCalledTimes(2);
        expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledTimes(1);
    });

    it('does not throw when Firebase token revocation fails on both attempts', async () => {
        getAuth().revokeRefreshTokens.mockRejectedValue(new Error('Firebase error'));
        getNotificationService().sendDataOnlyNotificationSafe.mockResolvedValue(undefined);

        const { SessionRevocationService } = loadService();
        await expect(SessionRevocationService.revokeAllUserSessions('user-1', true))
            .resolves.toBeUndefined();

        expect(getAuth().revokeRefreshTokens).toHaveBeenCalledTimes(2);
    });

    it('does not throw when the notification fails', async () => {
        getAuth().revokeRefreshTokens.mockResolvedValue(undefined);
        getNotificationService().sendDataOnlyNotificationSafe.mockRejectedValue(new Error('push failed'));

        const { SessionRevocationService } = loadService();
        await expect(SessionRevocationService.revokeAllUserSessions('user-1', true))
            .resolves.toBeUndefined();

        expect(getAuth().revokeRefreshTokens).toHaveBeenCalledTimes(1);
    });
});
