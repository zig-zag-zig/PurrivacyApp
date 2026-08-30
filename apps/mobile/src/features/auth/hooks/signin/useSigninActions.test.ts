import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test.example/';
    process.env.EXPO_PUBLIC_AUTH_EMAIL_DOMAIN = 'test.example';
});

// The hook file imports securityService, whose real import chain pulls in
// expo/firebase/react-native modules that cannot run in Node. The pure
// functions under test are DI-based and never touch the real service.
vi.mock('../../../security/services/securityService', () => ({ securityService: {} }));
// usernameIdentity -> config/env -> expo-constants (cannot run in Node).
vi.mock('expo-constants', () => ({ default: {} }));

import {
    runBiometricUnlock,
    runPasswordSignin,
    runUnlockSignOut,
    validateSigninForm,
} from './useSigninActions';
import type { User } from 'firebase/auth';
import type { LastSignedInUser } from '../../../../types/types';

const user = { uid: 'uid-2' } as User;
const lastSignedInUser: LastSignedInUser = { uid: 'uid-1', username: 'alice' };

describe('validateSigninForm', () => {
    it('requires a password', () => {
        expect(validateSigninForm('alice', '')).toEqual({
            errors: { password: 'Password is required' },
            submittedUsername: 'alice',
        });
    });

    it('reports an invalid username', () => {
        const { errors } = validateSigninForm('ab', 'hunter2!');
        expect(errors.username).toBeTruthy();
    });

    it('sanitizes the submitted username (e.g. uppercase trimmed)', () => {
        expect(validateSigninForm('  Alice ', 'hunter2!')).toEqual({
            errors: {},
            submittedUsername: 'alice',
        });
    });
});

describe('runPasswordSignin', () => {
    const baseDeps = () => ({
        username: 'alice',
        password: 'hunter2!',
        signin: vi.fn().mockResolvedValue(user),
        showToast: vi.fn(),
        lastSignedInUser,
        clearDek: vi.fn().mockResolvedValue(undefined),
        onStarted: vi.fn(),
        onFinished: vi.fn(),
        onUsernameChanged: vi.fn(),
        onValidationErrors: vi.fn(),
        log: vi.fn(),
    });

    it('starts, validates, and finishes without signing in on validation errors', async () => {
        const deps = { ...baseDeps(), password: '' };

        await runPasswordSignin(deps as any);

        expect(deps.onStarted).toHaveBeenCalledTimes(1);
        expect(deps.onValidationErrors).toHaveBeenCalledWith({ password: 'Password is required' });
        expect(deps.onFinished).toHaveBeenCalledTimes(1);
        expect(deps.signin).not.toHaveBeenCalled();
    });

    it('normalizes the username before submitting when it differs', async () => {
        const deps = baseDeps();
        deps.username = '  Alice ';

        await runPasswordSignin(deps as any);

        expect(deps.onUsernameChanged).toHaveBeenCalledWith('alice');
        expect(deps.signin).toHaveBeenCalledWith('alice', 'hunter2!', false);
    });

    it('toasts and finishes when signin returns no user', async () => {
        const deps = { ...baseDeps(), signin: vi.fn().mockResolvedValue(null) };

        await runPasswordSignin(deps as any);

        expect(deps.showToast).toHaveBeenCalledWith('Failed to sign in. Please check your credentials and try again.', 'error');
        expect(deps.onFinished).toHaveBeenCalledTimes(1);
    });

    it('logs and toasts when signin throws', async () => {
        const deps = { ...baseDeps(), signin: vi.fn().mockRejectedValue(new Error('boom')) };

        await runPasswordSignin(deps as any);

        expect(deps.log).toHaveBeenCalledWith('sign-in failed', { error: expect.any(Error) });
        expect(deps.showToast).toHaveBeenCalledTimes(1);
        expect(deps.onFinished).toHaveBeenCalledTimes(1);
    });

    it('clears the previous user DEK when signing in as a different user', async () => {
        const deps = baseDeps();

        await runPasswordSignin(deps as any);

        expect(deps.clearDek).toHaveBeenCalledWith('uid-1');
    });

    it('does not clear the DEK for the same user or when no previous user exists', async () => {
        const sameUser = { uid: 'uid-1' } as User;
        const deps = baseDeps();
        deps.signin = vi.fn().mockResolvedValue(sameUser);

        await runPasswordSignin(deps as any);
        expect(deps.clearDek).not.toHaveBeenCalled();

        const noPrevious = { ...baseDeps(), lastSignedInUser: null };
        await runPasswordSignin(noPrevious as any);
        expect(noPrevious.clearDek).not.toHaveBeenCalled();
    });
});

describe('runBiometricUnlock', () => {
    const baseDeps = () => ({
        username: 'alice',
        signin: vi.fn().mockResolvedValue(user),
        showToast: vi.fn(),
        isBiometricAuthCancelled: vi.fn().mockReturnValue(false),
        onStarted: vi.fn(),
        onFinished: vi.fn(),
        suppress: vi.fn(),
        log: vi.fn(),
    });

    it('starts the attempt with an empty password and biometric flag', async () => {
        const deps = baseDeps();

        await runBiometricUnlock(deps as any);

        expect(deps.onStarted).toHaveBeenCalledTimes(1);
        expect(deps.signin).toHaveBeenCalledWith('alice', '', true);
    });

    it('toasts and finishes when the unlock returns no user', async () => {
        const deps = { ...baseDeps(), signin: vi.fn().mockResolvedValue(null) };

        await runBiometricUnlock(deps as any);

        expect(deps.showToast).toHaveBeenCalledWith('Biometric unlock failed. Try again or sign in with password.', 'error');
        expect(deps.onFinished).toHaveBeenCalledTimes(1);
    });

    it('suppresses the username without toasting when the attempt is cancelled', async () => {
        const deps = { ...baseDeps(), signin: vi.fn().mockRejectedValue(new Error('cancelled')), isBiometricAuthCancelled: vi.fn().mockReturnValue(true) };

        await runBiometricUnlock(deps as any);

        expect(deps.suppress).toHaveBeenCalledWith('alice');
        expect(deps.onFinished).toHaveBeenCalledTimes(1);
        expect(deps.showToast).not.toHaveBeenCalled();
    });

    it('suppresses without toasting when MFA was cancelled', async () => {
        const deps = { ...baseDeps(), signin: vi.fn().mockRejectedValue({ mfaCancelled: true }) };

        await runBiometricUnlock(deps as any);

        expect(deps.suppress).toHaveBeenCalledWith('alice');
        expect(deps.showToast).not.toHaveBeenCalled();
    });

    it('suppresses, logs, and toasts info on other failures', async () => {
        const deps = { ...baseDeps(), signin: vi.fn().mockRejectedValue(new Error('boom')) };

        await runBiometricUnlock(deps as any);

        expect(deps.suppress).toHaveBeenCalledWith('alice');
        expect(deps.log).toHaveBeenCalledWith('biometric unlock failed', { error: expect.any(Error) });
        expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'info');
    });
});

describe('runUnlockSignOut', () => {
    it('calls the signed-out handler on success', async () => {
        const deps = {
            signOut: vi.fn().mockResolvedValue(undefined),
            onSignedOut: vi.fn(),
            onError: vi.fn(),
            log: vi.fn(),
        };

        await runUnlockSignOut(deps as any);

        expect(deps.onSignedOut).toHaveBeenCalledTimes(1);
        expect(deps.onError).not.toHaveBeenCalled();
    });

    it('logs, surfaces the error toast, and finishes on failure', async () => {
        const deps = {
            signOut: vi.fn().mockRejectedValue(new Error('boom')),
            onSignedOut: vi.fn(),
            onError: vi.fn(),
            onFinished: vi.fn(),
            log: vi.fn(),
        };

        await runUnlockSignOut(deps as any);

        expect(deps.log).toHaveBeenCalledWith('unlock sign-out failed', { error: expect.any(Error) });
        expect(deps.onError).toHaveBeenCalledTimes(1);
        expect(deps.onFinished).toHaveBeenCalledTimes(1);
        expect(deps.onSignedOut).not.toHaveBeenCalled();
    });
});
