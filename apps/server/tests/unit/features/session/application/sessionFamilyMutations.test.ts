import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadMutations = (): typeof import('../../../../../src/features/session/application/sessionFamilyMutations') => (
    require('../../../../../src/features/session/application/sessionFamilyMutations')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('sessionFamilyMutations', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    const seedFamily = (overrides: Record<string, unknown> = {}) => {
        fakeFs.store.refreshTokenFamilies = {
            'fam-1': {
                exists: true,
                data: {
                    familyId: 'fam-1',
                    userId: 'user-1',
                    userHasMfa: false,
                    mfaTrusted: false,
                    createdAt: ts(new Date('2026-01-01T00:00:00Z')),
                    lastUsedAt: ts(new Date('2026-01-01T00:00:00Z')),
                    expiresAt: ts(new Date('2026-06-01T00:00:00Z')),
                    ...overrides,
                },
            },
        };
    };

    describe('revokeSessionFamily', () => {
        it('revokes a session family and deletes associated records', async () => {
            seedFamily();
            fakeFs.store.sessions = { 's-1': { exists: true, data: { refreshTokenFamilyId: 'fam-1' } } };
            fakeFs.store.refreshTokens = { 'rt-1': { exists: true, data: { familyId: 'fam-1' } } };

            const { revokeSessionFamily } = loadMutations();
            await revokeSessionFamily('fam-1', 'user-1');

            expect(fakeFs.store.sessions['s-1'].exists).toBe(false);
            expect(fakeFs.store.refreshTokens['rt-1'].exists).toBe(false);
            expect(fakeFs.store.refreshTokenFamilies['fam-1'].exists).toBe(false);
        });

        it('returns silently when family does not exist', async () => {
            const { revokeSessionFamily } = loadMutations();
            await expect(revokeSessionFamily('nonexistent', 'user-1')).resolves.toBeUndefined();
        });

        it('throws 401 when userId does not match', async () => {
            seedFamily();
            const { revokeSessionFamily } = loadMutations();
            await expect(revokeSessionFamily('fam-1', 'user-2')).rejects.toThrow(/invalid/i);
        });
    });

    describe('getOwnedFamilyRef (via setSessionFamilyMfaTrust)', () => {
        it('throws 401 when familyId is empty', async () => {
            const { setSessionFamilyMfaTrust } = loadMutations();
            await expect(setSessionFamilyMfaTrust('', 'user-1', true)).rejects.toThrow(/not found/);
        });

        it('throws 401 when family is not found', async () => {
            const { setSessionFamilyMfaTrust } = loadMutations();
            await expect(setSessionFamilyMfaTrust('nonexistent', 'user-1', true)).rejects.toThrow(/not found/);
        });

        it('sets MFA trust for valid family', async () => {
            seedFamily({ userHasMfa: true });
            const { setSessionFamilyMfaTrust } = loadMutations();
            const result = await setSessionFamilyMfaTrust('fam-1', 'user-1', true);
            expect(result.mfaTrusted).toBe(true);
        });

        it('does not trust MFA when user does not have MFA enabled', async () => {
            seedFamily({ userHasMfa: false });
            const { setSessionFamilyMfaTrust } = loadMutations();
            const result = await setSessionFamilyMfaTrust('fam-1', 'user-1', true);
            expect(result.mfaTrusted).toBe(false);
        });
    });
});
