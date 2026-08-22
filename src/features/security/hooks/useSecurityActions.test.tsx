import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create } from 'react-test-renderer';

import { ApiRequestError } from '../../../api/apiError';

const mocks = vi.hoisted(() => ({
    deleteApi: vi.fn(),
    deleteCurrentAccount: vi.fn(),
    reauthenticate: vi.fn(),
    setLoginWithReauthenticateWithCredential: vi.fn(),
    user: {
        uid: 'user-1',
        email: 'user@example.test',
    },
}));

vi.mock('firebase/auth', () => ({
    EmailAuthProvider: { credential: vi.fn(() => ({ credential: true })) },
    reauthenticateWithCredential: mocks.reauthenticate,
    updatePassword: vi.fn(),
}));
vi.mock('../../auth/services/authService', () => ({
    AuthService: { changePassword: vi.fn() },
}));
vi.mock('../../auth/state/AuthContext', () => ({
    useAuth: () => ({
        deleteCurrentAccount: mocks.deleteCurrentAccount,
        setLoginWithReauthenticateWithCredential: mocks.setLoginWithReauthenticateWithCredential,
    }),
}));
vi.mock('../../../api/client', () => ({
    ApiClient: {
        delete: mocks.deleteApi,
        revokeAllSessions: vi.fn(),
    },
}));
vi.mock('../../auth/domain/authUtils', () => ({
    getUser: () => mocks.user,
}));
vi.mock('../../../utils/logger', () => ({
    logger: { warn: vi.fn() },
}));

import { useSecurityActions } from './useSecurityActions';

const mountHook = () => {
    let current: ReturnType<typeof useSecurityActions> | null = null;
    const Harness = () => {
        current = useSecurityActions();
        return null;
    };
    act(() => {
        create(<Harness />);
    });
    return () => current!;
};

describe('useSecurityActions account deletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.reauthenticate.mockResolvedValue(undefined);
        mocks.deleteCurrentAccount.mockResolvedValue(undefined);
    });

    it('treats a retryable backend cleanup error as success when user documents were deleted', async () => {
        mocks.deleteApi.mockRejectedValue(new ApiRequestError(
            'cleanup incomplete',
            500,
            {
                retryable: true,
                completedSteps: ['revokeSessions', 'deleteUserDocuments'],
                remainingSteps: ['deleteEncryptedKeys'],
            },
        ));
        const getHook = mountHook();

        let result: Awaited<ReturnType<ReturnType<typeof useSecurityActions>['handleSecurityAction']>> | undefined;
        await act(async () => {
            result = await getHook().handleSecurityAction('delete', 'password');
        });

        expect(result).toEqual({
            success: true,
            requiresSignout: false,
            cleanupWarning: 'Account data was deleted, but some backend cleanup steps could not be completed. The issue was logged.',
        });
        expect(mocks.deleteCurrentAccount).toHaveBeenCalledWith(mocks.user);
    });

    it('warns when the only remaining backend step is the Firebase identity deletion', async () => {
        mocks.deleteApi.mockRejectedValue(new ApiRequestError(
            'cleanup incomplete',
            500,
            {
                retryable: true,
                completedSteps: [
                    'revokeSessions',
                    'deleteUserDocuments',
                    'deleteEncryptedKeys',
                    'deletePushTokens',
                ],
                remainingSteps: ['deleteFirebaseUser'],
            },
        ));
        const getHook = mountHook();

        let result: Awaited<ReturnType<ReturnType<typeof useSecurityActions>['handleSecurityAction']>> | undefined;
        await act(async () => {
            result = await getHook().handleSecurityAction('delete', 'password');
        });

        expect(result).toEqual({
            success: true,
            requiresSignout: false,
            cleanupWarning: 'Account data was deleted, but the Firebase identity could not be removed. The issue was logged.',
        });
        expect(mocks.deleteCurrentAccount).toHaveBeenCalledWith(mocks.user);
    });

    it('reports success when the backend deletion committed but client cleanup fails', async () => {
        mocks.deleteApi.mockResolvedValue(undefined);
        mocks.deleteCurrentAccount.mockRejectedValue(new Error('firebase cleanup failed'));
        const getHook = mountHook();

        let result: Awaited<ReturnType<ReturnType<typeof useSecurityActions>['handleSecurityAction']>> | undefined;
        await act(async () => {
            result = await getHook().handleSecurityAction('delete', 'password');
        });

        expect(result).toEqual({
            success: true,
            requiresSignout: false,
            cleanupWarning: 'Account data was deleted, but Firebase or local identity cleanup failed. The issue was logged.',
        });
        expect(mocks.deleteCurrentAccount).toHaveBeenCalledWith(mocks.user);
    });

    it('still reports failure when the backend never deleted the user documents', async () => {
        mocks.deleteApi.mockRejectedValue(new ApiRequestError(
            'deletion failed',
            500,
            {
                retryable: true,
                completedSteps: ['revokeSessions'],
                remainingSteps: ['deleteUserDocuments'],
            },
        ));
        const getHook = mountHook();

        await expect(act(async () => {
            await getHook().handleSecurityAction('delete', 'password');
        })).rejects.toThrow('deletion failed');
        expect(mocks.deleteCurrentAccount).not.toHaveBeenCalled();
    });
});
