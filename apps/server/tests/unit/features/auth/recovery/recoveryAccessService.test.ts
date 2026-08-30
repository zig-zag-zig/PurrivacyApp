import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { createSaltedEncryptedPayload } from '../../../../helpers/testFixtures';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: {
        getUserByEmail: jest.fn(),
        createCustomToken: jest.fn(),
    },
}));

const loadModule = (): typeof import('../../../../../src/features/auth/recovery/RecoveryAccessService') => (
    require('../../../../../src/features/auth/recovery/RecoveryAccessService')
);

const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;

const seedUser = (userId: string, data: Record<string, unknown>) => {
    fakeFs.store.users = {
        [userId]: { exists: true, data },
    };
};

describe('RecoveryAccessService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    describe('getChallenge', () => {
        it('returns a fake salt for a non-existent user', async () => {
            getAuth().getUserByEmail.mockRejectedValue(new Error('not found'));
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.getChallenge('alice');

            expect(result.recoveryVerifierSalt).toEqual(expect.any(String));
            expect(result.recoveryVerifierSalt.length).toBeGreaterThan(0);
        });

        it('returns a fake salt when user exists but has no recoveryVerifierSalt field', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', { mfaEnabled: false });
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.getChallenge('alice');

            expect(result.recoveryVerifierSalt).toEqual(expect.any(String));
        });

        it('returns a keyed fake salt that is not derivable from public inputs', async () => {
            getAuth().getUserByEmail.mockRejectedValue(new Error('not found'));
            const { RecoveryAccessService } = loadModule();
            const { env } = require('../../../../../src/config/env');
            const { createHash, createHmac } = require('crypto');

            const result = await RecoveryAccessService.getChallenge('alice');

            const unkeyed = createHash('sha256').update('recovery:alice').digest('hex').slice(0, 32);
            const expected = createHmac('sha256', env.recoveryEnumerationPepper)
                .update('alice')
                .digest('hex')
                .slice(0, 32);
            expect(result.recoveryVerifierSalt).not.toBe(unkeyed);
            expect(result.recoveryVerifierSalt).toBe(expected);
        });

        it('returns a stable fake salt per username', async () => {
            getAuth().getUserByEmail.mockRejectedValue(new Error('not found'));
            const { RecoveryAccessService } = loadModule();

            const first = await RecoveryAccessService.getChallenge('alice');
            const second = await RecoveryAccessService.getChallenge('alice');
            const other = await RecoveryAccessService.getChallenge('bob');

            expect(first.recoveryVerifierSalt).toBe(second.recoveryVerifierSalt);
            expect(first.recoveryVerifierSalt).not.toBe(other.recoveryVerifierSalt);
        });

        it('returns actual recoveryVerifierSalt when user has one', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', { recoveryVerifierSalt: 'salt-value-123' });
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.getChallenge('alice');

            expect(result.recoveryVerifierSalt).toBe('salt-value-123');
        });
    });

    describe('createRecoveryToken', () => {
        it('throws BadRequestError when recovery verifier is not a 64-char hex string', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'short')).rejects.toThrow(/Invalid recovery/);
            await expect(RecoveryAccessService.createRecoveryToken('alice', 123)).rejects.toThrow(/Invalid recovery/);
        });

        it('throws BadRequestError when user is not found', async () => {
            getAuth().getUserByEmail.mockRejectedValue(new Error('not found'));
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'a'.repeat(64))).rejects.toThrow(/Invalid recovery/);
        });

        it('throws BadRequestError when user doc does not exist', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'a'.repeat(64))).rejects.toThrow(/Invalid recovery/);
        });

        it('throws BadRequestError when recovery verifier hash does not match', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', {
                dekSeed: createSaltedEncryptedPayload('hash-mismatch'),
                recoveryVerifierHash: 'wrong-hash',
            });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'a'.repeat(64))).rejects.toThrow(/Invalid recovery/);
        });

        it('returns userId, encrypted user data, and a custom token on successful recovery', async () => {
            const verifier = '1'.repeat(64);
            const { createHash } = require('crypto');
            const expectedHash = createHash('sha256').update(verifier).digest('hex');
            const dekSeed = createSaltedEncryptedPayload('success');

            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', {
                dekSeed,
                recoveryVerifierHash: expectedHash,
            });
            getAuth().createCustomToken.mockResolvedValue('custom-token-abc');
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.createRecoveryToken('alice', verifier);

            expect(result.userId).toBe('user-1');
            expect(result.tempToken).toBe('custom-token-abc');
            expect(result.userEncrypted).toHaveProperty('dekSeed');
            expect(result.userEncrypted.dekSeed.encryptedData).toBe(dekSeed.encryptedData);
        });

        it('accepts a v1-peppered recovery verifier hash', async () => {
            const verifier = '1'.repeat(64);
            const { createHash, createHmac } = require('crypto');
            const { env } = require('../../../../../src/config/env');
            const clientHash = createHash('sha256').update(verifier).digest('hex');
            const stored = `v1:${createHmac('sha256', env.recoveryVerifierPepper).update(clientHash).digest('hex')}`;
            const dekSeed = createSaltedEncryptedPayload('v1-success');

            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', { dekSeed, recoveryVerifierHash: stored });
            getAuth().createCustomToken.mockResolvedValue('custom-token-abc');
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.createRecoveryToken('alice', verifier);

            expect(result.userId).toBe('user-1');
            expect(result.userEncrypted.dekSeed.encryptedData).toBe(dekSeed.encryptedData);
        });

        it('rejects a v1 hash peppered with a different value', async () => {
            const verifier = '1'.repeat(64);
            const { createHash, createHmac } = require('crypto');
            const clientHash = createHash('sha256').update(verifier).digest('hex');
            const stored = `v1:${createHmac('sha256', '0'.repeat(64)).update(clientHash).digest('hex')}`;

            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', {
                dekSeed: createSaltedEncryptedPayload('wrong-pepper'),
                recoveryVerifierHash: stored,
            });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', verifier)).rejects.toThrow(/Invalid recovery/);
        });
    });
});
