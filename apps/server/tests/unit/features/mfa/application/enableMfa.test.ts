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

jest.mock('../../../../../src/config/env', () => ({
    env: { mfaKek: 'test-mfa-kek' },
}));

// Mock decryptSecret to not hit real crypto on bad data
jest.mock('../../../../../src/utils/cryptoUtils', () => {
    const actual = jest.requireActual('../../../../../src/utils/cryptoUtils');
    return {
        ...actual,
        CryptoUtils: {
            ...actual.CryptoUtils,
            decryptSecret: jest.fn(),
        },
    };
});

jest.mock('../../../../../src/features/mfa/application/mfaTotp', () => ({
    verifyMfaTotp: jest.fn(),
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/enableMfa') => (
    require('../../../../../src/features/mfa/application/enableMfa')
);

const getCryptoUtils = () => require('../../../../../src/utils/cryptoUtils').CryptoUtils;
const getVerifyTotp = () => require('../../../../../src/features/mfa/application/mfaTotp').verifyMfaTotp;
const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;
const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;

const ts = (date: Date) => ({ toDate: () => date });

describe('enableMfa', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    const seedSetup = (userId: string, overrides: Record<string, unknown> = {}) => {
        fakeFs.store.mfaSetup = {
            [userId]: {
                exists: true,
                data: {
                    encryptedSecret: 'encrypted-secret',
                    iv: 'abcdef0123456789abcdef01',
                    tag: 'abcdef0123456789abcdef0123456789',
                    hashedRecoveryCodes: ['hash1', 'hash2'],
                    createdAt: ts(new Date()),
                    expiresAt: ts(new Date(Date.now() + 5 * 60 * 1000)),
                    ...overrides,
                },
            },
        };
    };

    const seedSecuritySubcollection = (userId: string) => {
        const path = `users/${userId}/security`;
        fakeFs.store[path] = {};
    };

    it('throws NotFoundError when MFA setup document does not exist', async () => {
        const { verifyAndEnableMfa } = loadModule();
        await expect(verifyAndEnableMfa('user-1', '123456')).rejects.toThrow('No MFA setup found');
    });

    it('throws MfaSetupExpiredError when setup document is expired', async () => {
        seedSetup('user-1', { expiresAt: ts(new Date(Date.now() - 60 * 1000)) });
        const { verifyAndEnableMfa } = loadModule();
        await expect(verifyAndEnableMfa('user-1', '123456')).rejects.toThrow(/expired/i);
    });

    it('throws BadRequestError for non-6-digit codes', async () => {
        seedSetup('user-1');
        const { verifyAndEnableMfa } = loadModule();
        await expect(verifyAndEnableMfa('user-1', 'abc123')).rejects.toThrow('Invalid code format');
    });

    it('throws AuthError when TOTP verification fails', async () => {
        seedSetup('user-1');
        getCryptoUtils().decryptSecret.mockReturnValue('fake-decrypted-secret');
        getVerifyTotp().mockReturnValue(false);
        const { verifyAndEnableMfa } = loadModule();
        await expect(verifyAndEnableMfa('user-1', '654321')).rejects.toThrow('Invalid MFA code');
    });

    it('enables MFA when TOTP verification succeeds', async () => {
        seedSetup('user-1');
        seedSecuritySubcollection('user-1');
        getCryptoUtils().decryptSecret.mockReturnValue('fake-decrypted-secret');
        getVerifyTotp().mockReturnValue(true);
        const { verifyAndEnableMfa } = loadModule();

        const result = await verifyAndEnableMfa('user-1', '123456', 'dev-mfa');

        expect(result).toBe(true);
        expect(getUserService().queueMfaEnabledUpdate).toHaveBeenCalledWith(
            expect.anything(), 'user-1', true,
        );
        expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
            'user-1', 'mfaState', 'mfa enable',
            { mfaEnabled: true, mfaTrusted: false },
            { excludeDeviceId: 'dev-mfa' },
        );
        expect(fakeFs.store.mfaSetup['user-1'].exists).toBe(false);
    });
});
