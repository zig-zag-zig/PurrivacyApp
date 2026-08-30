import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

const loadDeletion = (): typeof import('../../../../../src/features/session/application/sessionDeletion') => (
    require('../../../../../src/features/session/application/sessionDeletion')
);

describe('sessionDeletion', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('deleteAccessSession removes the session document by hashed token', async () => {
        const { deleteAccessSession } = loadDeletion();
        const accessToken = 'test-access-token-123';
        const hash = CryptoUtils.sha256(accessToken);

        // Seed a session
        fakeFs.store.sessions = {
            [hash]: { exists: true, data: { userId: 'user-1', accessTokenHash: hash } },
        };

        await deleteAccessSession(accessToken);

        expect(fakeFs.store.sessions[hash].exists).toBe(false);
    });

    it('deleteAllUserSessions removes sessions, refresh tokens, and families for a user', async () => {
        const { deleteAllUserSessions } = loadDeletion();

        // Seed data for user-1 and user-2
        fakeFs.store.sessions = {
            'sess-1': { exists: true, data: { userId: 'user-1' } },
            'sess-2': { exists: true, data: { userId: 'user-2' } },
            'sess-3': { exists: true, data: { userId: 'user-1' } },
        };
        fakeFs.store.refreshTokens = {
            'rt-1': { exists: true, data: { userId: 'user-1' } },
            'rt-2': { exists: true, data: { userId: 'user-2' } },
        };
        fakeFs.store.refreshTokenFamilies = {
            'fam-1': { exists: true, data: { userId: 'user-1' } },
            'fam-2': { exists: true, data: { userId: 'user-2' } },
        };

        await deleteAllUserSessions('user-1');

        // user-1 records should be deleted
        expect(fakeFs.store.sessions['sess-1'].exists).toBe(false);
        expect(fakeFs.store.sessions['sess-3'].exists).toBe(false);
        expect(fakeFs.store.refreshTokens['rt-1'].exists).toBe(false);
        expect(fakeFs.store.refreshTokenFamilies['fam-1'].exists).toBe(false);

        // user-2 records should remain
        expect(fakeFs.store.sessions['sess-2'].exists).toBe(true);
        expect(fakeFs.store.refreshTokens['rt-2'].exists).toBe(true);
        expect(fakeFs.store.refreshTokenFamilies['fam-2'].exists).toBe(true);
    });

    it('deleteAllUserSessions sweeps more than 500 records in chunked batches below the Firestore cap', async () => {
        const { deleteAllUserSessions } = loadDeletion();

        const sessions: Record<string, { exists: boolean; data: Record<string, unknown> }> = {};
        for (let i = 0; i < 450; i++) {
            sessions[`sess-${i}`] = { exists: true, data: { userId: 'user-1' } };
        }
        sessions['sess-other-user'] = { exists: true, data: { userId: 'user-2' } };

        const tokens: Record<string, { exists: boolean; data: Record<string, unknown> }> = {};
        for (let i = 0; i < 300; i++) {
            tokens[`rt-${i}`] = { exists: true, data: { userId: 'user-1' } };
        }

        const families: Record<string, { exists: boolean; data: Record<string, unknown> }> = {};
        for (let i = 0; i < 100; i++) {
            families[`fam-${i}`] = { exists: true, data: { userId: 'user-1' } };
        }
        families['fam-other-user'] = { exists: true, data: { userId: 'user-2' } };

        fakeFs.store.sessions = sessions;
        fakeFs.store.refreshTokens = tokens;
        fakeFs.store.refreshTokenFamilies = families;

        const batchSpy = jest.spyOn(fakeFs.db, 'batch');

        const count = await deleteAllUserSessions('user-1');

        expect(count).toBe(850);

        // 450 sessions -> 2 chunks (400 + 50), 300 tokens -> 1 chunk, 100 families -> 1 chunk
        expect(batchSpy).toHaveBeenCalledTimes(4);

        const remainingSessions = Object.values(fakeFs.store.sessions).filter(doc => doc.exists);
        expect(remainingSessions).toHaveLength(1);
        expect(fakeFs.store.sessions['sess-other-user'].exists).toBe(true);
        expect(fakeFs.store.refreshTokenFamilies['fam-other-user'].exists).toBe(true);
    });

    it('deleteAllUserSessions keeps the excluded family and its records', async () => {
        const { deleteAllUserSessions } = loadDeletion();

        fakeFs.store.sessions = {
            'sess-old': { exists: true, data: { userId: 'user-1', refreshTokenFamilyId: 'fam-old' } },
            'sess-new': { exists: true, data: { userId: 'user-1', refreshTokenFamilyId: 'fam-new' } },
            'sess-other-user': { exists: true, data: { userId: 'user-2', refreshTokenFamilyId: 'fam-other' } },
        };
        fakeFs.store.refreshTokens = {
            'rt-old': { exists: true, data: { userId: 'user-1', familyId: 'fam-old' } },
            'rt-new': { exists: true, data: { userId: 'user-1', familyId: 'fam-new' } },
        };
        fakeFs.store.refreshTokenFamilies = {
            'fam-old': { exists: true, data: { userId: 'user-1', familyId: 'fam-old' } },
            'fam-new': { exists: true, data: { userId: 'user-1', familyId: 'fam-new' } },
        };

        const count = await deleteAllUserSessions('user-1', { excludeFamilyId: 'fam-new' });

        expect(count).toBe(3);
        expect(fakeFs.store.sessions['sess-old'].exists).toBe(false);
        expect(fakeFs.store.refreshTokens['rt-old'].exists).toBe(false);
        expect(fakeFs.store.refreshTokenFamilies['fam-old'].exists).toBe(false);
        // The excluded family survives untouched.
        expect(fakeFs.store.sessions['sess-new'].exists).toBe(true);
        expect(fakeFs.store.refreshTokens['rt-new'].exists).toBe(true);
        expect(fakeFs.store.refreshTokenFamilies['fam-new'].exists).toBe(true);
        // Other users are never touched.
        expect(fakeFs.store.sessions['sess-other-user'].exists).toBe(true);
    });
});
