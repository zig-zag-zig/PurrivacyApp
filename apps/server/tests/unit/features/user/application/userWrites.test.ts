import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { createSaltedEncryptedPayload } from '../../../../helpers/testFixtures';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: { deleteUser: jest.fn() },
}));

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

jest.mock('../../../../../src/features/user/infrastructure/UserKeyRepository', () => ({
    deleteUserEncryptedKeys: jest.fn(),
    initializeUserEncryptedKeyRecords: jest.fn(),
}));

jest.mock('../../../../../src/features/notification/infrastructure/pushTokenStore', () => ({
    deleteUserPushTokensFromDb: jest.fn(),
}));

jest.mock('../../../../../src/features/session/application/SessionRevocationService', () => ({
    SessionRevocationService: { revokeAllUserSessions: jest.fn() },
}));

const loadModule = (): typeof import('../../../../../src/features/user/application/userWrites') => (
    require('../../../../../src/features/user/application/userWrites')
);

const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;
const getUserKeyRepo = () => require('../../../../../src/features/user/infrastructure/UserKeyRepository');
const getPushTokenStore = () => require('../../../../../src/features/notification/infrastructure/pushTokenStore');
const getRevocationService = () => require('../../../../../src/features/session/application/SessionRevocationService').SessionRevocationService;
const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;

describe('userWrites', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    const validDekPassword = createSaltedEncryptedPayload('dek');

    describe('createUser', () => {
        const validPayload = {
            dekPassword: validDekPassword,
            dekSeed: createSaltedEncryptedPayload('seed'),
            keys: [],
            recoveryVerifierSalt: '1'.repeat(32),
            recoveryVerifierHash: '2'.repeat(64),
        };

        it('throws ConflictError when user already exists', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: {} } };
            const { createUser } = loadModule();
            await expect(createUser(validPayload, 'user-1')).rejects.toThrow('User already exists');
        });

        it('creates a user, initializes keys, and sends notification', async () => {
            getUserKeyRepo().initializeUserEncryptedKeyRecords.mockResolvedValue(undefined);
            const { createUser } = loadModule();

            const result = await createUser(validPayload, 'user-1');

            expect(result).toEqual({ success: true });
            expect(fakeFs.store.users['user-1'].exists).toBe(true);
            expect(fakeFs.store.users['user-1'].data.dekPassword).toEqual(validDekPassword);
            expect(fakeFs.store.users['user-1'].data.recoveryVerifierHash).toMatch(/^v1:[0-9a-f]{64}$/i);
            expect(getUserKeyRepo().initializeUserEncryptedKeyRecords).toHaveBeenCalledWith('user-1', []);
            expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1', 'user', 'user update',
            );
        });
    });

    describe('changeDekPassword', () => {
        it('updates dekPassword and sends notification', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: false } } };
            const { changeDekPassword } = loadModule();

            const result = await changeDekPassword('user-1', validDekPassword);

            expect(result).toEqual({ success: true });
            expect(fakeFs.store.users['user-1'].data.dekPassword).toEqual(validDekPassword);
            expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1', 'user', 'user update',
            );
        });
    });

    describe('deleteUser', () => {
        it('revokes sessions first, then deletes user, security subcollection, keys, push tokens, and the Firebase identity last', async () => {
            const securityPath = 'users/user-1/security';
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: true } } };
            fakeFs.store[securityPath] = { mfa: { exists: true, data: { mfaSecret: 's' } } };
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            getAuth().deleteUser.mockResolvedValue(undefined);

            const { deleteUser } = loadModule();

            await deleteUser('user-1');

            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', true);
            expect(fakeFs.store.users['user-1'].exists).toBe(false);
            expect(fakeFs.store[securityPath].mfa.exists).toBe(false);
            expect(getUserKeyRepo().deleteUserEncryptedKeys).toHaveBeenCalledWith('user-1');
            expect(getPushTokenStore().deleteUserPushTokensFromDb).toHaveBeenCalledWith('user-1');
            // The Firebase identity is removed last, after every data step.
            expect(getAuth().deleteUser).toHaveBeenCalledWith('user-1');
            expect(getAuth().deleteUser.mock.invocationCallOrder[0])
                .toBeGreaterThan(getRevocationService().revokeAllUserSessions.mock.invocationCallOrder[0]);
            expect(getAuth().deleteUser.mock.invocationCallOrder[0])
                .toBeGreaterThan(getUserKeyRepo().deleteUserEncryptedKeys.mock.invocationCallOrder[0]);
            expect(getAuth().deleteUser.mock.invocationCallOrder[0])
                .toBeGreaterThan(getPushTokenStore().deleteUserPushTokensFromDb.mock.invocationCallOrder[0]);
        });

        it('treats a missing Firebase identity as success (idempotent retry)', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: true } } };
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            getAuth().deleteUser.mockRejectedValue(Object.assign(new Error('The user does not exist.'), { code: 'auth/user-not-found' }));

            const { deleteUser } = loadModule();

            await expect(deleteUser('user-1')).resolves.toBeUndefined();

            expect(fakeFs.store.users['user-1'].exists).toBe(false);
            expect(getUserKeyRepo().deleteUserEncryptedKeys).toHaveBeenCalledWith('user-1');
            expect(getPushTokenStore().deleteUserPushTokensFromDb).toHaveBeenCalledWith('user-1');
            expect(getAuth().deleteUser).toHaveBeenCalledWith('user-1');
        });

        it('throws a structured retryable error when the Firebase identity deletion fails', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: true } } };
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            getAuth().deleteUser.mockRejectedValue(new Error('identity deletion failed'));

            const { deleteUser } = loadModule();

            await expect(deleteUser('user-1')).rejects.toMatchObject({
                statusCode: 500,
                details: {
                    failedStep: 'deleteFirebaseUser',
                    retryable: true,
                    completedSteps: [
                        'revokeSessions',
                        'deleteUserDocuments',
                        'deleteEncryptedKeys',
                        'deletePushTokens',
                    ],
                    remainingSteps: ['deleteFirebaseUser'],
                },
            });

            // A retry completes the remaining step and is idempotent.
            getAuth().deleteUser.mockResolvedValue(undefined);
            await deleteUser('user-1');

            expect(fakeFs.store.users['user-1'].exists).toBe(false);
            expect(getAuth().deleteUser).toHaveBeenCalledTimes(2);
        });

        it('throws a structured retryable error on partial failure identifying the remaining steps', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: true } } };
            getRevocationService().revokeAllUserSessions
                .mockRejectedValueOnce(new Error('revocation failed'))
                .mockResolvedValue(undefined);
            getAuth().deleteUser.mockResolvedValue(undefined);

            const { deleteUser } = loadModule();

            await expect(deleteUser('user-1')).rejects.toMatchObject({
                statusCode: 500,
                details: {
                    failedStep: 'revokeSessions',
                    retryable: true,
                    remainingSteps: [
                        'revokeSessions',
                        'deleteUserDocuments',
                        'deleteEncryptedKeys',
                        'deletePushTokens',
                        'deleteFirebaseUser',
                    ],
                },
            });

            // Nothing was deleted by the failed attempt.
            expect(fakeFs.store.users['user-1'].exists).toBe(true);
            expect(getUserKeyRepo().deleteUserEncryptedKeys).not.toHaveBeenCalled();
            expect(getAuth().deleteUser).not.toHaveBeenCalled();

            // A retry completes the remaining steps.
            await deleteUser('user-1');

            expect(fakeFs.store.users['user-1'].exists).toBe(false);
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledTimes(2);
            expect(getUserKeyRepo().deleteUserEncryptedKeys).toHaveBeenCalledWith('user-1');
            expect(getPushTokenStore().deleteUserPushTokensFromDb).toHaveBeenCalledWith('user-1');
            expect(getAuth().deleteUser).toHaveBeenCalledWith('user-1');
        });
    });
});
