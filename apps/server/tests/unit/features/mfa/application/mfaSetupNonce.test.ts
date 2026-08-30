import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import {
    FreshAuthRequiredError,
    MfaSetupNonceError,
} from '../../../../../src/features/mfa/application/mfaErrors';
import { AuthError } from '../../../../../src/utils/errors';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: { getUserMfaState: jest.fn() },
}));

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotificationSafe: jest.fn() },
}));

jest.mock('../../../../../src/features/mfa/application/verifyMfaCode', () => ({
    verifyMfaCode: jest.fn(),
}));

jest.mock('../../../../../src/utils/cryptoUtils', () => ({
    CryptoUtils: {
        randomHex: jest.fn(),
        randomBase64Url: jest.fn(),
        // Static class methods are not enumerable, so list them explicitly.
        sha256: jest.requireActual('../../../../../src/utils/cryptoUtils').CryptoUtils.sha256,
    },
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/mfaSetupNonce') => (
    require('../../../../../src/features/mfa/application/mfaSetupNonce')
);

const getSha256 = () => jest.requireActual('../../../../../src/utils/cryptoUtils').CryptoUtils.sha256;
const getCryptoUtils = () => require('../../../../../src/utils/cryptoUtils').CryptoUtils;
const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;
const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;
const getVerifyMfaCode = () => require('../../../../../src/features/mfa/application/verifyMfaCode').verifyMfaCode;

const ts = (date: Date) => ({ toDate: () => date });

const USER_ID = 'user-1';
const FAMILY_ID = 'family-1';
const VALID_NONCE = 'n'.repeat(43);

const seedFreshFamily = (overrides: Record<string, unknown> = {}) => {
    fakeFs.store.refreshTokenFamilies = {
        [FAMILY_ID]: {
            exists: true,
            data: {
                userId: USER_ID,
                createdAt: ts(new Date()),
                ...overrides,
            },
        },
    };
};

const seedStaleFamily = (overrides: Record<string, unknown> = {}) => {
    seedFreshFamily({
        createdAt: ts(new Date(Date.now() - 60 * 60 * 1000)),
        ...overrides,
    });
};

const seedNonce = (overrides: Record<string, unknown> = {}) => {
    fakeFs.store.mfaSetupNonces = {
        [getSha256()(VALID_NONCE)]: {
            exists: true,
            data: {
                userId: USER_ID,
                sessionFamilyId: FAMILY_ID,
                createdAt: ts(new Date(Date.now() - 60 * 1000)),
                expiresAt: ts(new Date(Date.now() + 60 * 1000)),
                consumedAt: null,
                ...overrides,
            },
        },
    };
};

describe('mintMfaSetupNonce', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
        getCryptoUtils().randomBase64Url.mockReturnValue('mocked-nonce-value');
        getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
        getVerifyMfaCode().mockResolvedValue(undefined);
    });

    it('mints a nonce for a fresh session family without MFA proof', async () => {
        seedFreshFamily();
        const { mintMfaSetupNonce, MFA_SETUP_NONCE_TTL_MS } = loadModule();

        const result = await mintMfaSetupNonce(USER_ID, FAMILY_ID);

        expect(result.nonce).toBe('mocked-nonce-value');
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(
            Date.now() + MFA_SETUP_NONCE_TTL_MS - 1000,
        );
        expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(
            Date.now() + MFA_SETUP_NONCE_TTL_MS + 1000,
        );
        expect(getVerifyMfaCode()).not.toHaveBeenCalled();

        const stored = fakeFs.store.mfaSetupNonces[getSha256()('mocked-nonce-value')];
        expect(stored.exists).toBe(true);
        expect(stored.data).toMatchObject({
            userId: USER_ID,
            sessionFamilyId: FAMILY_ID,
            consumedAt: null,
        });
    });

    it('sends a best-effort push notification when a nonce is minted', async () => {
        seedFreshFamily();
        const { mintMfaSetupNonce } = loadModule();

        await mintMfaSetupNonce(USER_ID, FAMILY_ID);

        expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
            USER_ID,
            'mfaEnrollmentStarted',
            'mfa enrollment started',
            { mfaEnrollmentStarted: true },
        );
    });

    it('rejects stale families when MFA is not enabled (fresh auth required)', async () => {
        seedStaleFamily();
        const { mintMfaSetupNonce } = loadModule();

        await expect(mintMfaSetupNonce(USER_ID, FAMILY_ID)).rejects.toThrow(FreshAuthRequiredError);
        expect(fakeFs.store.mfaSetupNonces).toBeUndefined();
    });

    it('mints a nonce for a stale family when MFA is enabled and a valid code is given', async () => {
        seedStaleFamily();
        getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
        getVerifyMfaCode().mockResolvedValue(undefined);
        const { mintMfaSetupNonce } = loadModule();

        const result = await mintMfaSetupNonce(USER_ID, FAMILY_ID, '123456');

        expect(result.nonce).toBe('mocked-nonce-value');
        expect(getVerifyMfaCode()).toHaveBeenCalledWith(USER_ID, true, '123456');
    });

    it('propagates MFA code verification failures for stale families', async () => {
        seedStaleFamily();
        getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
        getVerifyMfaCode().mockRejectedValue(
            new AuthError('Invalid MFA code', { wrongMfaCode: true }, 403),
        );
        const { mintMfaSetupNonce } = loadModule();

        await expect(mintMfaSetupNonce(USER_ID, FAMILY_ID, '000000')).rejects.toThrow(AuthError);
        expect(fakeFs.store.mfaSetupNonces).toBeUndefined();
    });

    it('rejects a missing session family', async () => {
        const { mintMfaSetupNonce } = loadModule();

        await expect(mintMfaSetupNonce(USER_ID, FAMILY_ID)).rejects.toThrow(AuthError);
    });

    it('rejects a session family owned by another user', async () => {
        seedFreshFamily({ userId: 'other-user' });
        const { mintMfaSetupNonce } = loadModule();

        await expect(mintMfaSetupNonce(USER_ID, FAMILY_ID)).rejects.toThrow(AuthError);
    });

    it('treats a family without createdAt as stale', async () => {
        seedFreshFamily({ createdAt: undefined });
        const { mintMfaSetupNonce } = loadModule();

        await expect(mintMfaSetupNonce(USER_ID, FAMILY_ID)).rejects.toThrow(FreshAuthRequiredError);
    });
});

describe('consumeMfaSetupNonce', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    it('consumes a valid nonce atomically', async () => {
        seedNonce();
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, VALID_NONCE)).resolves.toBeUndefined();

        const stored = fakeFs.store.mfaSetupNonces[getSha256()(VALID_NONCE)];
        expect(stored.exists).toBe(true);
        expect(stored.data.consumedAt).not.toBeNull();
    });

    it('rejects a replayed (already consumed) nonce', async () => {
        seedNonce({ consumedAt: new Date() });
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, VALID_NONCE)).rejects.toThrow(MfaSetupNonceError);

        const stored = fakeFs.store.mfaSetupNonces[getSha256()(VALID_NONCE)];
        expect(stored.data.consumedAt).not.toBeNull();
    });

    it('rejects an expired nonce without consuming it', async () => {
        seedNonce({ expiresAt: ts(new Date(Date.now() - 60 * 1000)) });
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, VALID_NONCE)).rejects.toThrow(MfaSetupNonceError);

        const stored = fakeFs.store.mfaSetupNonces[getSha256()(VALID_NONCE)];
        expect(stored.exists).toBe(true);
        expect(stored.data.consumedAt).toBeNull();
    });

    it('rejects a nonce bound to another user', async () => {
        seedNonce({ userId: 'other-user' });
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, VALID_NONCE)).rejects.toThrow(MfaSetupNonceError);
    });

    it('rejects a nonce bound to another session family', async () => {
        seedNonce({ sessionFamilyId: 'family-2' });
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, VALID_NONCE)).rejects.toThrow(MfaSetupNonceError);
    });

    it('rejects an unknown nonce', async () => {
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, VALID_NONCE)).rejects.toThrow(MfaSetupNonceError);
    });

    it('rejects malformed nonces without touching the database', async () => {
        seedNonce();
        const batchSpy = jest.spyOn(fakeFs.db, 'runTransaction');
        const { consumeMfaSetupNonce } = loadModule();

        await expect(consumeMfaSetupNonce(USER_ID, FAMILY_ID, 'short')).rejects.toThrow(MfaSetupNonceError);
        expect(batchSpy).not.toHaveBeenCalled();
    });
});
