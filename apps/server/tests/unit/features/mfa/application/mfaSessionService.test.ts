import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { injectStepFailures } from '../../../../helpers/failureInjection';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';
import { AuthError, NotFoundError, TransitionError } from '../../../../../src/utils/errors';
import { SessionResponse } from '../../../../../src/core/types';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/mfa/application/enableMfa', () => ({
    verifyAndEnableMfa: jest.fn(),
}));

jest.mock('../../../../../src/features/mfa/application/disableMfa', () => ({
    disableMfa: jest.fn(),
}));

jest.mock('../../../../../src/features/mfa/application/verifyMfaCode', () => ({
    verifyMfaCode: jest.fn(),
}));

jest.mock('../../../../../src/features/session/application/createSession', () => ({
    createBackendSession: jest.fn(),
}));

jest.mock('../../../../../src/features/session/application/sessionFamilyMutations', () => ({
    revokeSessionFamily: jest.fn(),
    setSessionFamilyMfaTrust: jest.fn(),
}));

jest.mock('../../../../../src/features/session/application/SessionRevocationService', () => ({
    SessionRevocationService: { revokeAllUserSessions: jest.fn() },
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: { getUserMfaState: jest.fn() },
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/MfaSessionService') => (
    require('../../../../../src/features/mfa/application/MfaSessionService')
);

const getVerifyAndEnableMfa = () => require('../../../../../src/features/mfa/application/enableMfa').verifyAndEnableMfa;
const getDisableMfa = () => require('../../../../../src/features/mfa/application/disableMfa').disableMfa;
const getVerifyMfaCode = () => require('../../../../../src/features/mfa/application/verifyMfaCode').verifyMfaCode;
const getCreateBackendSession = () => require('../../../../../src/features/session/application/createSession').createBackendSession;
const getFamilyMutations = () => require('../../../../../src/features/session/application/sessionFamilyMutations');
const getRevocationService = () => require('../../../../../src/features/session/application/SessionRevocationService').SessionRevocationService;
const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;

const sessionResponse: SessionResponse = {
    accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: 'x', refreshTokenExpiresAt: 'y',
    mfaTrusted: true, mfaEnabled: true, sessionFamilyId: 'fam-new',
};

const enableDocId = CryptoUtils.sha256('mfa-enable:user-1');
const disableDocId = CryptoUtils.sha256('mfa-disable:user-1');

const getStepTargets = (): Array<{ target: Record<string, unknown>; property: string }> => ([
    { target: getCreateBackendSession() as unknown as Record<string, unknown>, property: 'createBackendSession' },
    { target: getVerifyAndEnableMfa() as unknown as Record<string, unknown>, property: 'verifyAndEnableMfa' },
    { target: getDisableMfa() as unknown as Record<string, unknown>, property: 'disableMfa' },
    { target: getRevocationService() as unknown as Record<string, unknown>, property: 'revokeAllUserSessions' },
]);

const seedCrashedEnable = async (): Promise<void> => {
    // Simulate a process crash after createSession committed but before the
    // MFA enable step completed (no compensation ran).
    const { MfaTransitionStore } = require('../../../../../src/features/mfa/application/mfaTransitionStore');
    const store = new MfaTransitionStore('mfa-enable:user-1', 'user-1');
    await store.complete('createSession', sessionResponse);
};

// injectStepFailures replaces module-namespace properties in place, so each
// test must start from fresh jest.fn() instances.
const resetMock = (obj: unknown, property: string): void => {
    (obj as Record<string, unknown>)[property] = jest.fn();
};

const resetAllMocks = (): void => {
    resetMock(getCreateBackendSession(), 'createBackendSession');
    resetMock(getFamilyMutations(), 'revokeSessionFamily');
    resetMock(getFamilyMutations(), 'setSessionFamilyMfaTrust');
    resetMock(getVerifyAndEnableMfa(), 'verifyAndEnableMfa');
    resetMock(getDisableMfa(), 'disableMfa');
    resetMock(getVerifyMfaCode(), 'verifyMfaCode');
    resetMock(getRevocationService(), 'revokeAllUserSessions');
    resetMock(getUserService(), 'getUserMfaState');
};

describe('MfaSessionService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
        resetAllMocks();
    });

    describe('enableMfaAndCreateSession', () => {
        it('creates the new session first, enables MFA, then revokes old sessions (excluding the new family)', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getVerifyAndEnableMfa().mockResolvedValue(true);
            getCreateBackendSession().mockResolvedValue(sessionResponse);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(getCreateBackendSession()).toHaveBeenCalledWith('user-1', {
                userHasMfa: true, mfaTrusted: true, deviceId: 'dev-1', sweepStaleFamilies: false,
            });
            expect(getVerifyAndEnableMfa()).toHaveBeenCalledWith('user-1', '123456', 'dev-1');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false, {
                excludeFamilyId: 'fam-new',
            });
            expect(result).toEqual(sessionResponse);
            // The transition progress is cleared on success.
            expect(fakeFs.store.mfaTransitions[enableDocId].exists).toBe(false);
        });

        it('does not sweep the current family on a wrong code (transition session survives failure)', async () => {
            // Regression: the transition's createSession must NOT sweep the
            // user's current device families — it runs before the code is
            // verified, and a wrong code would otherwise leave the user with
            // no session at all (new family revoked by compensation, current
            // family swept away), forcing a sign-out on the next attempt.
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getVerifyAndEnableMfa().mockRejectedValue(
                new AuthError('Invalid MFA code', { wrongMfaCode: true }, 403),
            );
            getCreateBackendSession().mockResolvedValue(sessionResponse);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '000000', true, 'dev-1'))
                .rejects.toMatchObject({ statusCode: 403 });

            expect(getCreateBackendSession()).toHaveBeenCalledWith('user-1', {
                userHasMfa: true, mfaTrusted: true, deviceId: 'dev-1', sweepStaleFamilies: false,
            });
            // Compensation revokes only the NEW family; the current one survives.
            expect(getFamilyMutations().revokeSessionFamily).toHaveBeenCalledWith('fam-new', 'user-1');
            // The transition progress is cleared so a retry starts fresh.
            expect(fakeFs.store.mfaTransitions[enableDocId].exists).toBe(false);
        });

        it('fails at session creation with no side effects and no compensation', async () => {
            getCreateBackendSession().mockRejectedValue(new Error('session creation failed'));
            getVerifyAndEnableMfa().mockResolvedValue(true);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({
                    details: { failedStep: 'createSession', retryable: true },
                });

            expect(getVerifyAndEnableMfa()).not.toHaveBeenCalled();
            expect(getFamilyMutations().revokeSessionFamily).not.toHaveBeenCalled();
            expect(getRevocationService().revokeAllUserSessions).not.toHaveBeenCalled();
        });

        it('fails at the MFA step: rethrows the original error, compensates by revoking the new family, and clears progress', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getVerifyAndEnableMfa().mockRejectedValue(
                new AuthError('Invalid MFA code', { wrongMfaCode: true, mfaRequired: true }, 403),
            );
            getCreateBackendSession().mockResolvedValue(sessionResponse);
            getFamilyMutations().revokeSessionFamily.mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({ statusCode: 403, details: { wrongMfaCode: true } });

            // Compensation: the orphan session family is revoked, old
            // sessions are untouched, and the progress is cleared so a retry
            // starts fresh.
            expect(getFamilyMutations().revokeSessionFamily).toHaveBeenCalledWith('fam-new', 'user-1');
            expect(getRevocationService().revokeAllUserSessions).not.toHaveBeenCalled();
            expect(fakeFs.store.mfaTransitions[enableDocId].exists).toBe(false);

            // Retry after the user supplies the correct code creates a fresh session.
            getVerifyAndEnableMfa().mockResolvedValue(true);
            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '654321', true, 'dev-1');
            expect(result).toEqual(sessionResponse);
            expect(getCreateBackendSession()).toHaveBeenCalledTimes(2);
        });

        it('fails at the revoke step: session and MFA state stay consistent, error is retryable, no compensation', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getVerifyAndEnableMfa().mockResolvedValue(true);
            getCreateBackendSession().mockResolvedValue(sessionResponse);
            const revokeMock = getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            injectStepFailures(
                getStepTargets(),
                { revokeAllUserSessions: 1 },
            );
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({
                    details: { failedStep: 'revokeOldSessions', retryable: true },
                });

            // The new session must survive — no compensation revocation.
            expect(getFamilyMutations().revokeSessionFamily).not.toHaveBeenCalled();
            // The injected failure threw before delegating, so no revocation
            // was performed by the first attempt.
            expect(revokeMock).not.toHaveBeenCalled();
        });

        it('retry after a revoke-step failure resumes: no duplicate session, no re-verification, same stored session returned', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getVerifyAndEnableMfa().mockResolvedValue(true);
            const createMock = getCreateBackendSession().mockResolvedValue(sessionResponse);
            const revokeMock = getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            injectStepFailures(
                getStepTargets(),
                { revokeAllUserSessions: 1 },
            );
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toThrow(TransitionError);

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(result).toEqual(sessionResponse);
            expect(createMock).toHaveBeenCalledTimes(1);
            expect(getVerifyAndEnableMfa()).toHaveBeenCalledTimes(1);
            // Call 1 was the injected failure; call 2 (the resume) delegated.
            expect(revokeMock).toHaveBeenCalledTimes(1);
            expect(revokeMock).toHaveBeenCalledWith('user-1', false, { excludeFamilyId: 'fam-new' });
        });

        it('resumes a crashed enable (session created, MFA already enabled) by proving current MFA possession', async () => {
            await seedCrashedEnable();
            // The crashed attempt had committed MFA before dying.
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
            getVerifyMfaCode().mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(result).toEqual(sessionResponse);
            expect(getCreateBackendSession()).not.toHaveBeenCalled();
            expect(getVerifyAndEnableMfa()).not.toHaveBeenCalled();
            expect(getVerifyMfaCode()).toHaveBeenCalledWith('user-1', true, '123456');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false, {
                excludeFamilyId: 'fam-new',
            });
        });

        it('fresh attempt on an already-enabled account keeps failing setup verification (no MFA-proof shortcut)', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
            getVerifyAndEnableMfa().mockRejectedValue(
                new NotFoundError('No MFA setup found. Please start setup again.'),
            );
            getCreateBackendSession().mockResolvedValue(sessionResponse);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({
                    statusCode: 404,
                    message: 'No MFA setup found. Please start setup again.',
                });

            expect(getVerifyMfaCode()).not.toHaveBeenCalled();
            expect(getFamilyMutations().revokeSessionFamily).toHaveBeenCalledWith('fam-new', 'user-1');
        });
    });

    describe('disableMfaAndCreateSession', () => {
        const disabledSession: SessionResponse = {
            ...sessionResponse, mfaTrusted: false, mfaEnabled: false,
        };

        it('creates the new session first, disables MFA, then revokes old sessions (excluding the new family)', async () => {
            getDisableMfa().mockResolvedValue(undefined);
            getCreateBackendSession().mockResolvedValue(disabledSession);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2');

            expect(getCreateBackendSession()).toHaveBeenCalledWith('user-1', {
                userHasMfa: false, mfaTrusted: false, deviceId: 'dev-2', sweepStaleFamilies: false,
            });
            expect(getDisableMfa()).toHaveBeenCalledWith('user-1', 'dev-2');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false, {
                excludeFamilyId: 'fam-new',
            });
            expect(result).toEqual(disabledSession);
            expect(fakeFs.store.mfaTransitions[disableDocId].exists).toBe(false);
        });

        it('fails at the disable step: rethrows the original error and compensates by revoking the new family', async () => {
            getDisableMfa().mockRejectedValue(new NotFoundError('disable failed'));
            getCreateBackendSession().mockResolvedValue(disabledSession);
            getFamilyMutations().revokeSessionFamily.mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2'))
                .rejects.toMatchObject({ statusCode: 404, message: 'disable failed' });

            expect(getFamilyMutations().revokeSessionFamily).toHaveBeenCalledWith('fam-new', 'user-1');
            expect(getRevocationService().revokeAllUserSessions).not.toHaveBeenCalled();
        });

        it('fails at the revoke step: retryable error, retry resumes and returns the same stored session', async () => {
            getDisableMfa().mockResolvedValue(undefined);
            const createMock = getCreateBackendSession().mockResolvedValue(disabledSession);
            const revokeMock = getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            injectStepFailures(
                getStepTargets(),
                { revokeAllUserSessions: 1 },
            );
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2'))
                .rejects.toMatchObject({
                    details: { failedStep: 'revokeOldSessions', retryable: true },
                });
            expect(getFamilyMutations().revokeSessionFamily).not.toHaveBeenCalled();

            const result = await MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2');

            expect(result).toEqual(disabledSession);
            expect(createMock).toHaveBeenCalledTimes(1);
            expect(getDisableMfa()).toHaveBeenCalledTimes(1);
            // Call 1 was the injected failure; call 2 (the resume) delegated.
            expect(revokeMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('manageSessionTrust', () => {
        it('delegates to setSessionFamilyMfaTrust', async () => {
            getFamilyMutations().setSessionFamilyMfaTrust.mockResolvedValue({ mfaTrusted: false });
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.manageSessionTrust('user-1', 'fam-1', false);

            expect(getFamilyMutations().setSessionFamilyMfaTrust).toHaveBeenCalledWith('fam-1', 'user-1', false);
            expect(result).toEqual({ mfaTrusted: false });
        });
    });
});
