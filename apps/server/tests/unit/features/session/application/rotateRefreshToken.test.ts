import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadRotate = (): typeof import('../../../../../src/features/session/application/rotateRefreshToken') => (
    require('../../../../../src/features/session/application/rotateRefreshToken')
);

const loadTokenUtils = (): typeof import('../../../../../src/features/session/application/sessionTokenUtils') => (
    require('../../../../../src/features/session/application/sessionTokenUtils')
);

const REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

// Create a Firestore Timestamp-like object that survives JSON.stringify
const ts = (date: Date) => ({
    toDate: () => date,
});

describe('rotateRefreshToken', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('throws 401 when refresh token is empty', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        await expect(rotateBackendRefreshToken('')).rejects.toThrow(/not provided/);
    });

    it('throws 401 when token does not exist in store', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        const tokenUtils = loadTokenUtils();
        const token = tokenUtils.generateRefreshToken();
        await expect(rotateBackendRefreshToken(token.rawToken)).rejects.toThrow(/Invalid refresh token/);
    });

    it('throws 401 when refresh token has been reused (usedAt set)', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        const tokenUtils = loadTokenUtils();
        const token = tokenUtils.generateRefreshToken();
        const now = new Date();

        fakeFs.store.refreshTokens = {
            [token.tokenId]: {
                exists: true,
                data: {
                    tokenId: token.tokenId,
                    familyId: 'fam-1',
                    userId: 'user-1',
                    tokenHash: token.tokenHash,
                    createdAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                    usedAt: ts(new Date()),
                },
            },
        };

        fakeFs.store.refreshTokenFamilies = {
            'fam-1': {
                exists: true,
                data: {
                    familyId: 'fam-1',
                    userId: 'user-1',
                    userHasMfa: false,
                    mfaTrusted: false,
                    createdAt: ts(now),
                    lastUsedAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                },
            },
        };

        await expect(rotateBackendRefreshToken(token.rawToken)).rejects.toThrow(/reused/);
        expect(fakeFs.store.refreshTokenFamilies['fam-1']?.data.revokedAt).toBeDefined();
    });

    it('throws 401 when family is revoked', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        const tokenUtils = loadTokenUtils();
        const token = tokenUtils.generateRefreshToken();
        const now = new Date();

        fakeFs.store.refreshTokens = {
            [token.tokenId]: {
                exists: true,
                data: {
                    tokenId: token.tokenId,
                    familyId: 'fam-1',
                    userId: 'user-1',
                    tokenHash: token.tokenHash,
                    createdAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                },
            },
        };

        fakeFs.store.refreshTokenFamilies = {
            'fam-1': {
                exists: true,
                data: {
                    familyId: 'fam-1',
                    userId: 'user-1',
                    userHasMfa: false,
                    mfaTrusted: false,
                    createdAt: ts(now),
                    lastUsedAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                    revokedAt: ts(new Date()),
                },
            },
        };

        await expect(rotateBackendRefreshToken(token.rawToken)).rejects.toThrow(/revoked/);
    });

    it('throws 401 when refresh token is expired', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        const tokenUtils = loadTokenUtils();
        const token = tokenUtils.generateRefreshToken();
        const pastDate = new Date(Date.now() - 1000);

        fakeFs.store.refreshTokens = {
            [token.tokenId]: {
                exists: true,
                data: {
                    tokenId: token.tokenId,
                    familyId: 'fam-1',
                    userId: 'user-1',
                    tokenHash: token.tokenHash,
                    createdAt: ts(pastDate),
                    expiresAt: ts(pastDate),
                },
            },
        };

        fakeFs.store.refreshTokenFamilies = {
            'fam-1': {
                exists: true,
                data: {
                    familyId: 'fam-1',
                    userId: 'user-1',
                    userHasMfa: false,
                    mfaTrusted: false,
                    createdAt: ts(pastDate),
                    lastUsedAt: ts(pastDate),
                    expiresAt: ts(pastDate),
                },
            },
        };

        await expect(rotateBackendRefreshToken(token.rawToken)).rejects.toThrow(/expired/);
    });

    it('throws 403 when MFA is required on untrusted family', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        const tokenUtils = loadTokenUtils();
        const token = tokenUtils.generateRefreshToken();
        const now = new Date();

        fakeFs.store.refreshTokens = {
            [token.tokenId]: {
                exists: true,
                data: {
                    tokenId: token.tokenId,
                    familyId: 'fam-1',
                    userId: 'user-1',
                    tokenHash: token.tokenHash,
                    createdAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                },
            },
        };

        fakeFs.store.refreshTokenFamilies = {
            'fam-1': {
                exists: true,
                data: {
                    familyId: 'fam-1',
                    userId: 'user-1',
                    userHasMfa: true,
                    mfaTrusted: false,
                    mfaVerifiedAt: null,
                    createdAt: ts(now),
                    lastUsedAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                },
            },
        };

        await expect(rotateBackendRefreshToken(token.rawToken)).rejects.toThrow(/MFA required/);
    });

    it('successfully rotates and returns new tokens', async () => {
        const { rotateBackendRefreshToken } = loadRotate();
        const tokenUtils = loadTokenUtils();
        const oldToken = tokenUtils.generateRefreshToken();
        const now = new Date();

        fakeFs.store.refreshTokens = {
            [oldToken.tokenId]: {
                exists: true,
                data: {
                    tokenId: oldToken.tokenId,
                    familyId: 'fam-1',
                    userId: 'user-1',
                    tokenHash: oldToken.tokenHash,
                    createdAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                },
            },
        };

        fakeFs.store.refreshTokenFamilies = {
            'fam-1': {
                exists: true,
                data: {
                    familyId: 'fam-1',
                    userId: 'user-1',
                    userHasMfa: false,
                    mfaTrusted: false,
                    createdAt: ts(now),
                    lastUsedAt: ts(now),
                    expiresAt: ts(new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)),
                },
            },
        };

        const result = await rotateBackendRefreshToken(oldToken.rawToken);

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.accessTokenExpiresAt).toBeDefined();
        expect(result.refreshTokenExpiresAt).toBeDefined();

        // Old token should be marked as used
        expect(fakeFs.store.refreshTokens[oldToken.tokenId]?.data.usedAt).toBeDefined();

        // New token should exist in store
        const newTokenKeys = Object.keys(fakeFs.store.refreshTokens);
        expect(newTokenKeys.length).toBe(2);

        // A session should be created
        expect(Object.keys(fakeFs.store.sessions).length).toBe(1);
    });
});
