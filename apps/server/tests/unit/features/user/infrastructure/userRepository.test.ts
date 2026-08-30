import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

const loadRepo = (): typeof import('../../../../../src/features/user/infrastructure/UserRepository') => (
    require('../../../../../src/features/user/infrastructure/UserRepository')
);

describe('UserRepository', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    describe('getUserRef', () => {
        it('returns a document reference for the given userId', () => {
            const { getUserRef } = loadRepo();
            const ref = getUserRef('user-1');
            expect(ref.id).toBe('user-1');
        });
    });

    describe('getUserDoc', () => {
        it('throws NotFoundError when user does not exist', async () => {
            const { getUserDoc } = loadRepo();
            await expect(getUserDoc('nonexistent')).rejects.toThrow('User not found');
        });

        it('returns doc when user exists', async () => {
            fakeFs.store.users = {
                'user-1': { exists: true, data: { mfaEnabled: true } },
            };
            const { getUserDoc } = loadRepo();
            const doc = await getUserDoc('user-1');
            expect(doc.exists).toBe(true);
            expect(doc.get('mfaEnabled')).toBe(true);
        });
    });

    describe('getUserWithFieldMask', () => {
        it('throws NotFoundError when user does not exist', async () => {
            const { getUserWithFieldMask } = loadRepo();
            await expect(getUserWithFieldMask('nonexistent', ['mfaEnabled'])).rejects.toThrow('User not found');
        });

        it('returns doc with field access via get()', async () => {
            fakeFs.store.users = {
                'user-1': { exists: true, data: { mfaEnabled: true, recoveryVerifierSalt: 'salt' } },
            };
            const { getUserWithFieldMask } = loadRepo();
            const doc = await getUserWithFieldMask('user-1', ['mfaEnabled']);
            expect(doc.exists).toBe(true);
            expect(doc.get('mfaEnabled')).toBe(true);
        });
    });
});
