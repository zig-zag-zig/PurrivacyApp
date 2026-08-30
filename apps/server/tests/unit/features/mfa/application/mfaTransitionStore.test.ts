import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

const loadStore = (): typeof import('../../../../../src/features/mfa/application/mfaTransitionStore') => (
    require('../../../../../src/features/mfa/application/mfaTransitionStore')
);

const TRANSITION_KEY = 'mfa-enable:user-1';
const DOC_ID = CryptoUtils.sha256(TRANSITION_KEY);

describe('MfaTransitionStore', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    it('returns null when no progress exists', async () => {
        const { MfaTransitionStore } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');

        expect(await store.read()).toBeNull();
    });

    it('persists completed steps and decrypts stored results', async () => {
        const { MfaTransitionStore } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');

        await store.complete('createSession', { accessToken: 'at', sessionFamilyId: 'fam-new' });
        await store.complete('applyMfaEnable');

        const progress = await store.read();
        expect(progress).not.toBeNull();
        expect(Object.keys(progress!.steps).sort()).toEqual(['applyMfaEnable', 'createSession']);
        expect(progress!.steps.createSession.result).toEqual({ accessToken: 'at', sessionFamilyId: 'fam-new' });
        expect(progress!.steps.applyMfaEnable.result).toBeUndefined();

        // The stored document holds encrypted data, never plaintext tokens.
        const stored = fakeFs.store.mfaTransitions[DOC_ID].data;
        expect(stored.steps.createSession.result).toEqual({
            encryptedData: expect.any(String),
            iv: expect.any(String),
            tag: expect.any(String),
        });
        expect(JSON.stringify(stored)).not.toContain('fam-new');
    });

    it('returns null when the document belongs to another user', async () => {
        const { MfaTransitionStore } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');
        await store.complete('createSession', { accessToken: 'at' });

        const other = new MfaTransitionStore(TRANSITION_KEY, 'user-2');
        expect(await other.read()).toBeNull();
    });

    it('returns null once the transition has expired', async () => {
        const { MfaTransitionStore } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');
        await store.complete('createSession', { accessToken: 'at' });

        // Backdate the expiry beyond the TTL.
        const doc = fakeFs.store.mfaTransitions[DOC_ID].data;
        doc.expiresAt = Date.now() - 1000;

        expect(await store.read()).toBeNull();
    });

    it('returns null when a stored result cannot be decrypted', async () => {
        const { MfaTransitionStore } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');
        await store.complete('createSession', { accessToken: 'at' });

        const doc = fakeFs.store.mfaTransitions[DOC_ID].data;
        doc.steps.createSession.result.iv = 'corrupted-corrupted';

        expect(await store.read()).toBeNull();
    });

    it('clear removes the stored document', async () => {
        const { MfaTransitionStore } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');
        await store.complete('createSession', { accessToken: 'at' });

        await store.clear();

        expect(fakeFs.store.mfaTransitions[DOC_ID].exists).toBe(false);
        expect(await store.read()).toBeNull();
    });

    it('keeps the original TTL for resumed transitions', async () => {
        const { MfaTransitionStore, MFA_TRANSITION_TTL_MS } = loadStore();
        const store = new MfaTransitionStore(TRANSITION_KEY, 'user-1');
        await store.complete('createSession', { accessToken: 'at' });

        const firstExpiry = fakeFs.store.mfaTransitions[DOC_ID].data.expiresAt;
        expect(firstExpiry).toBeGreaterThan(Date.now());
        expect(firstExpiry).toBeLessThanOrEqual(Date.now() + MFA_TRANSITION_TTL_MS);

        // Resuming with more completed steps must not extend the deadline.
        const resume = new MfaTransitionStore(TRANSITION_KEY, 'user-1');
        await resume.complete('applyMfaEnable');
        expect(fakeFs.store.mfaTransitions[DOC_ID].data.expiresAt).toBe(firstExpiry);
    });
});
