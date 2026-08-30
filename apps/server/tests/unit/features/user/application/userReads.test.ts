import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadReads = (): typeof import('../../../../../src/features/user/application/userReads') => (
    require('../../../../../src/features/user/application/userReads')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('userReads', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    const seedUser = (userId: string, data: Record<string, unknown>) => {
        fakeFs.store.users = {
            [userId]: { exists: true, data },
        };
    };

    describe('getUserMfaState', () => {
        it('returns mfaEnabled false', async () => {
            seedUser('user-1', { mfaEnabled: false });
            const { getUserMfaState } = loadReads();
            expect(await getUserMfaState('user-1')).toEqual({ mfaEnabled: false });
        });

        it('returns mfaEnabled true', async () => {
            seedUser('user-1', { mfaEnabled: true });
            const { getUserMfaState } = loadReads();
            expect(await getUserMfaState('user-1')).toEqual({ mfaEnabled: true });
        });

        it('throws when user not found', async () => {
            const { getUserMfaState } = loadReads();
            await expect(getUserMfaState('nonexistent')).rejects.toThrow('User not found');
        });
    });

    // getEncryptedUser requires RTDB mock (reads encrypted keys) — tested in integration
});
