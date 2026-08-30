import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';
import { RECOVERY_CODE_COUNT, AUTO_REGENERATE_THRESHOLD } from '../../../../../src/core/constants';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: {
        getUserMfaState: jest.fn(),
        queueMfaEnabledUpdate: jest.fn(),
    },
}));

const loadRecoveryCodes = (): typeof import('../../../../../src/features/mfa/application/mfaRecoveryCodes') => (
    require('../../../../../src/features/mfa/application/mfaRecoveryCodes')
);

const loadUserService = () => (
    require('../../../../../src/features/user/application/UserService') as { UserService: { getUserMfaState: jest.Mock } }
).UserService;

// getMfaSecurityRef uses: db.collection('users').doc(userId).collection('security').doc('mfa')
// In fake firestore this maps to store key: users/user-1/security
const MFA_SECURITY_STORE_KEY = (userId: string) => `users/${userId}/security`;

const setMfaSecurity = (userId: string, data: Record<string, unknown>) => {
    const key = MFA_SECURITY_STORE_KEY(userId);
    fakeFs.store[key] = {
        mfa: { exists: true, data },
    };
};

const getMfaSecurityData = (userId: string) => {
    return fakeFs.store[MFA_SECURITY_STORE_KEY(userId)]?.mfa?.data;
};

describe('mfaRecoveryCodes', () => {
    beforeEach(() => {
        fakeFs.reset();
        loadUserService().getUserMfaState.mockReset();
    });

    it('regenerateMfaRecoveryCodes throws when MFA is not enabled', async () => {
        const { regenerateMfaRecoveryCodes } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });

        await expect(regenerateMfaRecoveryCodes('user-1')).rejects.toThrow(/not enabled/);
    });

    it('regenerateMfaRecoveryCodes throws when mfaSecurity doc is missing', async () => {
        const { regenerateMfaRecoveryCodes } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });

        await expect(regenerateMfaRecoveryCodes('user-1')).rejects.toThrow(/not enabled/);
    });

    it('regenerateMfaRecoveryCodes returns new codes and updates store', async () => {
        const { regenerateMfaRecoveryCodes } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });

        setMfaSecurity('user-1', {
            mfaRecoveryCodes: ['old-hash-1', 'old-hash-2'],
            mfaSecret: 'encrypted',
            mfaSecretIv: 'iv',
            mfaSecretTag: 'tag',
        });

        const codes = await regenerateMfaRecoveryCodes('user-1');

        expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
        for (const code of codes) {
            expect(code).toMatch(/^[A-Z0-9]{12}$/);
        }

        const stored = getMfaSecurityData('user-1')?.mfaRecoveryCodes;
        expect(stored).toHaveLength(RECOVERY_CODE_COUNT);
        for (const hash of stored) {
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        }
    });

    it('getRemainingMfaRecoveryCodes returns 0 when MFA is not enabled', async () => {
        const { getRemainingMfaRecoveryCodes } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });

        expect(await getRemainingMfaRecoveryCodes('user-1')).toBe(0);
    });

    it('getRemainingMfaRecoveryCodes returns count of stored codes', async () => {
        const { getRemainingMfaRecoveryCodes } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });

        setMfaSecurity('user-1', { mfaRecoveryCodes: ['hash-1', 'hash-2', 'hash-3'] });

        expect(await getRemainingMfaRecoveryCodes('user-1')).toBe(3);
    });

    it('verifyAndConsumeRecoveryCode returns invalid when MFA is not enabled', async () => {
        const { verifyAndConsumeRecoveryCode } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });

        const result = await verifyAndConsumeRecoveryCode('user-1', 'ABCDEF123456');
        expect(result).toEqual({ valid: false });
    });

    it('verifyAndConsumeRecoveryCode returns invalid for wrong code', async () => {
        const { verifyAndConsumeRecoveryCode } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });

        setMfaSecurity('user-1', {
            mfaRecoveryCodes: [CryptoUtils.sha256('ABCDEF123456')],
        });

        const result = await verifyAndConsumeRecoveryCode('user-1', 'XXXXXXXXXXXX');
        expect(result).toEqual({ valid: false });
    });

    it('verifyAndConsumeRecoveryCode consumes valid code and removes it from store', async () => {
        const { verifyAndConsumeRecoveryCode } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });

        const codes = CryptoUtils.generateRecoveryCodes(RECOVERY_CODE_COUNT);
        const hashedCodes = codes.map(CryptoUtils.sha256);
        setMfaSecurity('user-1', { mfaRecoveryCodes: [...hashedCodes] });

        const result = await verifyAndConsumeRecoveryCode('user-1', codes[0]);

        expect(result.valid).toBe(true);
        expect(result.newRecoveryCodes).toBeUndefined();
        expect(getMfaSecurityData('user-1')?.mfaRecoveryCodes).toHaveLength(RECOVERY_CODE_COUNT - 1);
    });

    it('verifyAndConsumeRecoveryCode auto-regenerates at threshold', async () => {
        const { verifyAndConsumeRecoveryCode } = loadRecoveryCodes();
        loadUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });

        const initialCount = AUTO_REGENERATE_THRESHOLD + 1;
        const codes = CryptoUtils.generateRecoveryCodes(initialCount);
        const hashedCodes = codes.map(CryptoUtils.sha256);
        setMfaSecurity('user-1', { mfaRecoveryCodes: [...hashedCodes] });

        const result = await verifyAndConsumeRecoveryCode('user-1', codes[0]);

        expect(result.valid).toBe(true);
        expect(result.newRecoveryCodes).toBeDefined();
        expect(result.newRecoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
        expect(getMfaSecurityData('user-1')?.mfaRecoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
    });
});
