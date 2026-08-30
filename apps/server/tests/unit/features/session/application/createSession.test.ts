import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { createRefreshTokenFamily } from '../../../../helpers/testFixtures';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

const loadModule = (): typeof import('../../../../../src/features/session/application/createSession') => (
    require('../../../../../src/features/session/application/createSession')
);

describe('createBackendSession', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('creates a refresh token family, refresh token, access token, and builds a response', async () => {
        const { createBackendSession } = loadModule();

        const result = await createBackendSession('user-1', {
            label: 'Test Device',
            platform: 'node',
            userHasMfa: false,
        });

        expect(result.accessToken).toEqual(expect.any(String));
        expect(result.refreshToken).toEqual(expect.any(String));
        expect(result.accessTokenExpiresAt).toEqual(expect.any(String));
        expect(result.refreshTokenExpiresAt).toEqual(expect.any(String));
        expect(result.mfaEnabled).toBe(false);
        expect(result.mfaTrusted).toBe(false);

        // Verify family and token docs were stored
        const families = Object.entries(fakeFs.store.refreshTokenFamilies ?? {}).filter(([, d]) => d.exists);
        expect(families).toHaveLength(1);
        const [, familyDoc] = families[0];
        expect(familyDoc.data!.userId).toBe('user-1');
        expect(familyDoc.data!.label).toBe('Test Device');

        const tokens = Object.entries(fakeFs.store.refreshTokens ?? {}).filter(([, d]) => d.exists);
        expect(tokens).toHaveLength(1);

        const sessions = Object.entries(fakeFs.store.sessions ?? {}).filter(([, d]) => d.exists);
        expect(sessions).toHaveLength(1);
    });

    it('creates session with MFA enabled and trusted', async () => {
        const { createBackendSession } = loadModule();

        const result = await createBackendSession('user-1', {
            userHasMfa: true,
            mfaTrusted: true,
        });

        expect(result.mfaEnabled).toBe(true);
        expect(result.mfaTrusted).toBe(true);
    });

    it('marks MFA verified at session creation time when user has MFA', async () => {
        const { createBackendSession } = loadModule();

        await createBackendSession('user-1', { userHasMfa: true, mfaTrusted: false });

        const families = Object.entries(fakeFs.store.refreshTokenFamilies ?? {}).filter(([, d]) => d.exists);
        const [, familyDoc] = families[0];
        expect(familyDoc.data!.mfaVerifiedAt).toBeTruthy();
    });

    it('does not mark MFA verified when user does not have MFA', async () => {
        const { createBackendSession } = loadModule();

        await createBackendSession('user-1', { userHasMfa: false });

        const families = Object.entries(fakeFs.store.refreshTokenFamilies ?? {}).filter(([, d]) => d.exists);
        const [, familyDoc] = families[0];
        expect(familyDoc.data!.mfaVerifiedAt).toBeNull();
    });

    it('cleans up stale device families when deviceId is provided', async () => {
        // Seed a stale family for the same device
        fakeFs.store.refreshTokenFamilies = {
            'stale-fam': { exists: true, data: { familyId: 'stale-fam', userId: 'user-1', deviceId: 'dev-1' } },
        };

        const { createBackendSession } = loadModule();

        await createBackendSession('user-1', {
            userHasMfa: false,
            deviceId: 'dev-1',
        });

        // The stale family should be deleted
        expect(fakeFs.store.refreshTokenFamilies['stale-fam'].exists).toBe(false);
    });

    it('keeps stale device families when sweepStaleFamilies is false (MFA transitions)', async () => {
        // MFA state transitions create their session BEFORE the code is
        // verified; sweeping the current family there would leave the user
        // sessionless after a wrong code. The old family must survive until
        // the transition's revokeOldSessions step (or a failed attempt).
        fakeFs.store.refreshTokenFamilies = {
            'current-fam': { exists: true, data: { familyId: 'current-fam', userId: 'user-1', deviceId: 'dev-1' } },
        };

        const { createBackendSession } = loadModule();

        await createBackendSession('user-1', {
            userHasMfa: false,
            deviceId: 'dev-1',
            sweepStaleFamilies: false,
        });

        expect(fakeFs.store.refreshTokenFamilies['current-fam'].exists).toBe(true);
    });
});
