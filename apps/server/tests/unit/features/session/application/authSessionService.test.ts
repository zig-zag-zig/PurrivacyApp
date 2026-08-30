import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: {
        verifyIdToken: jest.fn(),
    },
}), { virtual: true });

jest.mock('../../../../../src/features/mfa/application/verifyMfaCode', () => ({
    verifyMfaCode: jest.fn(),
}));

jest.mock('../../../../../src/features/session/application/createSession', () => ({
    createBackendSession: jest.fn(),
}));

jest.mock('../../../../../src/features/session/application/rotateRefreshToken', () => ({
    rotateBackendRefreshToken: jest.fn(),
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: { getUserMfaState: jest.fn() },
}));

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadService = (): typeof import('../../../../../src/features/session/application/AuthSessionService') => (
    require('../../../../../src/features/session/application/AuthSessionService')
);

const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;
const getVerifyMfaCode = () => require('../../../../../src/features/mfa/application/verifyMfaCode').verifyMfaCode;
const getCreateBackendSession = () => require('../../../../../src/features/session/application/createSession').createBackendSession;
const getRotateBackendRefreshToken = () => require('../../../../../src/features/session/application/rotateRefreshToken').rotateBackendRefreshToken;
const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;

describe('AuthSessionService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    describe('extractUserIdFromToken', () => {
        it('throws 401 when auth header is undefined', async () => {
            const { AuthSessionService } = loadService();
            await expect(AuthSessionService.extractUserIdFromToken(undefined)).rejects.toThrow(/not provided/);
        });

        it('throws 401 when auth header does not start with Bearer', async () => {
            const { AuthSessionService } = loadService();
            await expect(AuthSessionService.extractUserIdFromToken('Basic token')).rejects.toThrow(/not provided/);
        });

        it('throws 401 when token verification fails', async () => {
            getAuth().verifyIdToken.mockRejectedValue(new Error('Invalid'));
            const { AuthSessionService } = loadService();
            await expect(AuthSessionService.extractUserIdFromToken('Bearer bad-token')).rejects.toThrow(/Invalid bearer token/);
        });

        it('returns userId from verified token', async () => {
            getAuth().verifyIdToken.mockResolvedValue({ uid: 'user-123' });
            const { AuthSessionService } = loadService();
            const userId = await AuthSessionService.extractUserIdFromToken('Bearer valid-token');
            expect(userId).toBe('user-123');
        });
    });

    describe('createSession', () => {
        it('creates session for non-MFA user', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getCreateBackendSession().mockResolvedValue({
                accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: 'x', refreshTokenExpiresAt: 'y',
                mfaTrusted: false, mfaEnabled: false,
            });
            const { AuthSessionService } = loadService();

            const result = await AuthSessionService.createSession('user-1', { label: 'test', platform: 'jest' });

            expect(result.sessionResponse.accessToken).toBe('at');
            expect(result.sessionResponse.mfaEnabled).toBe(false);
            expect(result.newRecoveryCodes).toBeUndefined();
            expect(getCreateBackendSession()).toHaveBeenCalledWith('user-1', expect.objectContaining({
                userHasMfa: false, mfaTrusted: false, label: 'test', platform: 'jest',
            }));
        });

        it('verifies MFA code when user has MFA enabled', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
            getVerifyMfaCode().mockResolvedValue(['RECOVERY-A', 'RECOVERY-B']);
            getCreateBackendSession().mockResolvedValue({
                accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: 'x', refreshTokenExpiresAt: 'y',
                mfaTrusted: true, mfaEnabled: true,
            });
            const { AuthSessionService } = loadService();

            const result = await AuthSessionService.createSession('user-1', { mfaCode: '123456', mfaTrusted: true });

            expect(getVerifyMfaCode()).toHaveBeenCalledWith('user-1', false, '123456');
            expect(result.newRecoveryCodes).toEqual(['RECOVERY-A', 'RECOVERY-B']);
            expect(result.sessionResponse.mfaTrusted).toBe(true);
        });
    });

    describe('refreshSession', () => {
        it('delegates to rotateBackendRefreshToken', async () => {
            const expected = { accessToken: 'at2', refreshToken: 'rt2', accessTokenExpiresAt: 'a', refreshTokenExpiresAt: 'b', mfaTrusted: false, mfaEnabled: false };
            getRotateBackendRefreshToken().mockResolvedValue(expected);
            const { AuthSessionService } = loadService();

            const result = await AuthSessionService.refreshSession('old-rt', 'old-at');

            expect(getRotateBackendRefreshToken()).toHaveBeenCalledWith('old-rt', 'old-at');
            expect(result).toBe(expected);
        });
    });
});
