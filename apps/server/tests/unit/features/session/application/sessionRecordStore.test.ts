import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { createRefreshTokenFamily } from '../../../../helpers/testFixtures';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

const loadModule = (): typeof import('../../../../../src/features/session/application/sessionRecordStore') => (
    require('../../../../../src/features/session/application/sessionRecordStore')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('sessionRecordStore', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    describe('createAccessTokenForFamily', () => {
        it('creates a session document with the access token hash as its id', async () => {
            const { createAccessTokenForFamily } = loadModule();
            const family = createRefreshTokenFamily({ familyId: 'fam-1', userId: 'user-1', userHasMfa: true });
            const result = await createAccessTokenForFamily(family);

            expect(result.accessToken).toEqual(expect.any(String));
            expect(result.accessTokenExpiresAt).toBeInstanceOf(Date);

            const storedDocs = Object.entries(fakeFs.store.sessions ?? {}).filter(([, d]) => d.exists);
            expect(storedDocs).toHaveLength(1);
            const [, sessionDoc] = storedDocs[0];
            expect(sessionDoc.data!.userId).toBe('user-1');
            expect(sessionDoc.data!.refreshTokenFamilyId).toBe('fam-1');
            expect(sessionDoc.data!.userHasMfa).toBe(true);
        });
    });

    describe('getValidActiveAccessSession', () => {
        it('returns null for missing access token', async () => {
            const { getValidActiveAccessSession } = loadModule();
            const family = createRefreshTokenFamily();

            await fakeFs.db.runTransaction(async (tx) => {
                const result = await getValidActiveAccessSession(
                    tx as unknown as FirebaseFirestore.Transaction,
                    undefined, family, new Date(),
                );
                expect(result).toBeNull();
            });
        });

        it('returns null when session doc does not exist', async () => {
            const { getValidActiveAccessSession } = loadModule();
            const family = createRefreshTokenFamily({ familyId: 'fam-2' });

            await fakeFs.db.runTransaction(async (tx) => {
                const result = await getValidActiveAccessSession(
                    tx as unknown as FirebaseFirestore.Transaction,
                    'some-access-token', family, new Date(),
                );
                expect(result).toBeNull();
            });
        });

        it('returns null when session is expired', async () => {
            const { getValidActiveAccessSession } = loadModule();
            const token = 'expired-token';
            const hash = CryptoUtils.sha256(token);
            const family = createRefreshTokenFamily({ familyId: 'fam-3', userId: 'user-1' });
            const pastDate = new Date(Date.now() - 3600_000);

            fakeFs.store.sessions = {
                [hash]: { exists: true, data: { accessTokenHash: hash, userId: 'user-1', refreshTokenFamilyId: 'fam-3', createdAt: ts(pastDate), expiresAt: ts(pastDate) } },
            };

            await fakeFs.db.runTransaction(async (tx) => {
                const result = await getValidActiveAccessSession(
                    tx as unknown as FirebaseFirestore.Transaction,
                    token, family, new Date(),
                );
                expect(result).toBeNull();
            });
        });

        it('returns the session for a valid active access token', async () => {
            const { getValidActiveAccessSession } = loadModule();
            const token = 'valid-token';
            const hash = CryptoUtils.sha256(token);
            const futureDate = new Date(Date.now() + 3600_000);
            const now = new Date();
            const family = createRefreshTokenFamily({ familyId: 'fam-4', userId: 'user-1' });

            fakeFs.store.sessions = {
                [hash]: { exists: true, data: { accessTokenHash: hash, userId: 'user-1', refreshTokenFamilyId: 'fam-4', createdAt: ts(now), expiresAt: ts(futureDate) } },
            };

            const result = await fakeFs.db.runTransaction(async (tx) => {
                return getValidActiveAccessSession(
                    tx as unknown as FirebaseFirestore.Transaction,
                    token, family, new Date(),
                );
            });
            expect(result).not.toBeNull();
            expect(result!.userId).toBe('user-1');
            expect(result!.refreshTokenFamilyId).toBe('fam-4');
        });
    });

    describe('deleteFamilyRecords', () => {
        it('deletes the family document first, then its sessions and tokens', async () => {
            const { deleteFamilyRecords } = loadModule();

            fakeFs.store.sessions = { 's-1': { exists: true, data: { refreshTokenFamilyId: 'fam-del' } } };
            fakeFs.store.refreshTokens = { 'rt-1': { exists: true, data: { familyId: 'fam-del' } } };
            fakeFs.store.refreshTokenFamilies = { 'fam-del': { exists: true, data: { familyId: 'fam-del' } } };

            const familyRef = fakeFs.db.collection('refreshTokenFamilies').doc('fam-del');
            const count = await deleteFamilyRecords('fam-del', familyRef);

            expect(count).toBe(3);
            expect(fakeFs.store.refreshTokenFamilies['fam-del'].exists).toBe(false);
            expect(fakeFs.store.sessions['s-1'].exists).toBe(false);
            expect(fakeFs.store.refreshTokens['rt-1'].exists).toBe(false);
        });

        it('does not delete records belonging to other families', async () => {
            const { deleteFamilyRecords } = loadModule();

            fakeFs.store.sessions = {
                's-1': { exists: true, data: { refreshTokenFamilyId: 'fam-del' } },
                's-other': { exists: true, data: { refreshTokenFamilyId: 'fam-keep' } },
            };
            fakeFs.store.refreshTokens = {
                'rt-1': { exists: true, data: { familyId: 'fam-del' } },
                'rt-other': { exists: true, data: { familyId: 'fam-keep' } },
            };
            fakeFs.store.refreshTokenFamilies = {
                'fam-del': { exists: true, data: { familyId: 'fam-del' } },
                'fam-keep': { exists: true, data: { familyId: 'fam-keep' } },
            };

            const familyRef = fakeFs.db.collection('refreshTokenFamilies').doc('fam-del');
            await deleteFamilyRecords('fam-del', familyRef);

            expect(fakeFs.store.refreshTokenFamilies['fam-del'].exists).toBe(false);
            expect(fakeFs.store.sessions['s-other'].exists).toBe(true);
            expect(fakeFs.store.refreshTokens['rt-other'].exists).toBe(true);
        });
    });

    describe('deleteStaleDeviceFamilies', () => {
        it('deletes old families for the same device but keeps the new one', async () => {
            const { deleteStaleDeviceFamilies } = loadModule();

            fakeFs.store.refreshTokenFamilies = {
                'old-fam': { exists: true, data: { familyId: 'old-fam', userId: 'user-1', deviceId: 'dev-1' } },
                'new-fam': { exists: true, data: { familyId: 'new-fam', userId: 'user-1', deviceId: 'dev-1' } },
                'other-user-fam': { exists: true, data: { familyId: 'other', userId: 'user-2', deviceId: 'dev-1' } },
            };

            const count = await deleteStaleDeviceFamilies('user-1', 'dev-1', 'new-fam');

            expect(count).toBe(1);
            expect(fakeFs.store.refreshTokenFamilies['old-fam'].exists).toBe(false);
            expect(fakeFs.store.refreshTokenFamilies['new-fam'].exists).toBe(true);
            expect(fakeFs.store.refreshTokenFamilies['other-user-fam'].exists).toBe(true);
        });

        it('also removes the stale family sessions and tokens', async () => {
            const { deleteStaleDeviceFamilies } = loadModule();

            fakeFs.store.refreshTokenFamilies = {
                'old-fam': { exists: true, data: { familyId: 'old-fam', userId: 'user-1', deviceId: 'dev-1' } },
            };
            fakeFs.store.sessions = {
                's-1': { exists: true, data: { refreshTokenFamilyId: 'old-fam' } },
            };
            fakeFs.store.refreshTokens = {
                'rt-1': { exists: true, data: { familyId: 'old-fam' } },
            };

            await deleteStaleDeviceFamilies('user-1', 'dev-1', 'new-fam');

            expect(fakeFs.store.sessions['s-1'].exists).toBe(false);
            expect(fakeFs.store.refreshTokens['rt-1'].exists).toBe(false);
        });
    });
});
