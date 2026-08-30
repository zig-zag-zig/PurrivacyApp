import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

const loadValidate = (): typeof import('../../../../../src/features/session/application/validateSession') => (
    require('../../../../../src/features/session/application/validateSession')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('validateSession', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    const futureDate = (offsetMs = 3600_000) => new Date(Date.now() + offsetMs);
    const pastDate = (offsetMs = -3600_000) => new Date(Date.now() + offsetMs);

    const seedSession = (hash: string, overrides: Record<string, unknown> = {}) => {
        fakeFs.store.sessions = {
            [hash]: {
                exists: true,
                data: {
                    accessTokenHash: hash,
                    userId: 'user-1',
                    refreshTokenFamilyId: 'fam-1',
                    createdAt: ts(new Date()),
                    expiresAt: ts(futureDate()),
                    ...overrides,
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
                    createdAt: ts(new Date()),
                    expiresAt: ts(futureDate()),
                },
            },
        };
    };

    it('returns session data for valid token', async () => {
        const token = 'valid-access-token';
        const hash = CryptoUtils.sha256(token);
        seedSession(hash);

        const { validateBackendSession } = loadValidate();
        const session = await validateBackendSession(token);

        expect(session.userId).toBe('user-1');
        expect(session.refreshTokenFamilyId).toBe('fam-1');
    });

    it('throws 401 when session doc does not exist', async () => {
        const { validateBackendSession } = loadValidate();
        await expect(validateBackendSession('nonexistent')).rejects.toThrow(/not found/);
    });

    it('throws 401 when session data is missing', async () => {
        const token = 'valid-access-token';
        const hash = CryptoUtils.sha256(token);
        fakeFs.store.sessions = { [hash]: { exists: true, data: undefined } };

        const { validateBackendSession } = loadValidate();
        await expect(validateBackendSession(token)).rejects.toThrow(/data missing/);
    });

    it('throws 401 and deletes when session is expired', async () => {
        const token = 'expired-token';
        const hash = CryptoUtils.sha256(token);
        seedSession(hash, { expiresAt: ts(pastDate()) });

        const { validateBackendSession } = loadValidate();
        await expect(validateBackendSession(token)).rejects.toThrow(/expired/);
        expect(fakeFs.store.sessions[hash].exists).toBe(false);
    });

    it('throws 401 when refresh token family is revoked', async () => {
        const token = 'revoked-token';
        const hash = CryptoUtils.sha256(token);
        seedSession(hash);
        fakeFs.store.refreshTokenFamilies['fam-1'].data.revokedAt = ts(new Date());

        const { validateBackendSession } = loadValidate();
        await expect(validateBackendSession(token)).rejects.toThrow(/revoked/);
        expect(fakeFs.store.sessions[hash].exists).toBe(false);
    });
});
