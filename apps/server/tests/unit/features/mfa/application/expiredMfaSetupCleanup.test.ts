import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/expiredMfaSetupCleanup') => (
    require('../../../../../src/features/mfa/application/expiredMfaSetupCleanup')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('cleanupExpiredMfaSetups', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('removes expired MFA setup documents while keeping active ones', async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 3600_000);
        const future = new Date(now.getTime() + 3600_000);

        fakeFs.store.mfaSetup = {
            'user-1': { exists: true, data: { expiresAt: ts(past) } },
            'user-2': { exists: true, data: { expiresAt: ts(future) } },
            'user-3': { exists: true, data: { expiresAt: ts(past) } },
        };

        const { cleanupExpiredMfaSetups } = loadModule();
        const count = await cleanupExpiredMfaSetups();

        expect(count).toBe(2);
        expect(fakeFs.store.mfaSetup['user-1'].exists).toBe(false);
        expect(fakeFs.store.mfaSetup['user-2'].exists).toBe(true);
        expect(fakeFs.store.mfaSetup['user-3'].exists).toBe(false);
    });

    it('returns 0 when nothing is expired', async () => {
        const future = new Date(Date.now() + 3600_000);
        fakeFs.store.mfaSetup = {
            'user-1': { exists: true, data: { expiresAt: ts(future) } },
        };

        const { cleanupExpiredMfaSetups } = loadModule();
        const count = await cleanupExpiredMfaSetups();

        expect(count).toBe(0);
        expect(fakeFs.store.mfaSetup['user-1'].exists).toBe(true);
    });

    it('sweeps more than 500 expired setups in chunked batches below the Firestore cap', async () => {
        const past = new Date(Date.now() - 3600_000);

        const setups: Record<string, { exists: boolean; data: Record<string, unknown> }> = {};
        for (let i = 0; i < 450; i++) {
            setups[`user-${i}`] = { exists: true, data: { expiresAt: ts(past) } };
        }
        // A non-expired setup must survive the sweep
        setups['user-active'] = { exists: true, data: { expiresAt: ts(new Date(Date.now() + 3600_000)) } };
        fakeFs.store.mfaSetup = setups;

        const batchSpy = jest.spyOn(fakeFs.db, 'batch');

        const { cleanupExpiredMfaSetups } = loadModule();
        const count = await cleanupExpiredMfaSetups();

        expect(count).toBe(450);
        // 450 docs -> 2 chunks (400 + 50)
        expect(batchSpy).toHaveBeenCalledTimes(2);
        expect(fakeFs.store.mfaSetup['user-active'].exists).toBe(true);
    });

    it('also purges expired MFA setup nonces', async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 3600_000);
        const future = new Date(now.getTime() + 3600_000);

        fakeFs.store.mfaSetup = {
            'user-1': { exists: true, data: { expiresAt: ts(past) } },
        };
        fakeFs.store.mfaSetupNonces = {
            'nonce-expired': { exists: true, data: { expiresAt: ts(past) } },
            'nonce-active': { exists: true, data: { expiresAt: ts(future) } },
        };

        const { cleanupExpiredMfaSetups } = loadModule();
        const count = await cleanupExpiredMfaSetups();

        expect(count).toBe(2);
        expect(fakeFs.store.mfaSetup['user-1'].exists).toBe(false);
        expect(fakeFs.store.mfaSetupNonces['nonce-expired'].exists).toBe(false);
        expect(fakeFs.store.mfaSetupNonces['nonce-active'].exists).toBe(true);
    });
});
