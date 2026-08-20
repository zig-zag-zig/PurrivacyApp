import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { getUserFacingErrorMessage } from '../../../../utils/errorHandling';
import { logger } from '../../../../utils/logger';
import { securityService } from '../../../security/services/securityService';
import { sanitizeUsernameInput, validateUsername } from '../../domain/usernameIdentity';
import type { LastSignedInUser } from '../../../../types/types';
import type { RootNavigationProps } from '../../../../app/navigation/types';
import type { UnlockHandlerRef } from './useBiometricAutoPrompt';

export interface SigninFormValidation {
    errors: { [key: string]: string };
    submittedUsername: string;
}

export const validateSigninForm = (username: string, password: string): SigninFormValidation => {
    const errors: { [key: string]: string } = {};
    const submittedUsername = sanitizeUsernameInput(username);
    const usernameError = validateUsername(submittedUsername);
    if (usernameError) errors.username = usernameError;
    if (!password) errors.password = 'Password is required';
    return { errors, submittedUsername };
};

/**
 * Password sign-in orchestration: validation, the signin command, failure
 * toasts, and the cross-user DEK cleanup in `finally`.
 */
export const runPasswordSignin = async (deps: {
    username: string;
    password: string;
    signin: (username: string, password: string, isBiometricSignIn: boolean) => Promise<User | null>;
    showToast: (message: unknown, type: 'error' | 'success' | 'info') => void;
    lastSignedInUser: LastSignedInUser | null;
    clearDek: (uid: string) => Promise<void>;
    onStarted: () => void;
    onFinished: () => void;
    onUsernameChanged: (username: string) => void;
    onValidationErrors: (errors: { [key: string]: string }) => void;
    log: (message: string, extra?: { error: unknown }) => void;
}): Promise<void> => {
    deps.onStarted();

    const { errors, submittedUsername } = validateSigninForm(deps.username, deps.password);
    if (submittedUsername !== deps.username) {
        deps.onUsernameChanged(submittedUsername);
    }
    deps.onValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
        deps.onFinished();
        return;
    }

    let result: User | null = null;
    try {
        result = await deps.signin(submittedUsername, deps.password, false);

        if (!result) {
            deps.showToast('Failed to sign in. Please check your credentials and try again.', 'error');
            deps.onFinished();
        }
    } catch (error: any) {
        deps.onFinished();
        deps.log('sign-in failed', { error });
        deps.showToast(getUserFacingErrorMessage(error, 'Failed to sign in. Please try again.'), 'error');
    } finally {
        if (result && deps.lastSignedInUser && deps.lastSignedInUser.uid !== result.uid) {
            await deps.clearDek(deps.lastSignedInUser.uid);
        }
    }
};

/**
 * Biometric unlock orchestration: prompt suppression is recorded up front
 * and on every failure path; cancelled attempts (including MFA dismissal)
 * skip the error toast.
 */
export const runBiometricUnlock = async (deps: {
    username: string;
    signin: (username: string, password: string, isBiometricSignIn: boolean) => Promise<User | null>;
    showToast: (message: unknown, type: 'error' | 'success' | 'info') => void;
    isBiometricAuthCancelled: (error: unknown) => boolean;
    onStarted: () => void;
    onFinished: () => void;
    suppress: (username: string) => void;
    log: (message: string, extra?: { error: unknown }) => void;
}): Promise<void> => {
    deps.onStarted();

    try {
        const resultUser = await deps.signin(deps.username, '', true);

        if (!resultUser) {
            deps.showToast('Biometric unlock failed. Try again or sign in with password.', 'error');
            deps.onFinished();
        }
    } catch (err: any) {
        deps.onFinished();
        if (deps.isBiometricAuthCancelled(err) || err?.mfaCancelled) {
            deps.suppress(deps.username);
            return;
        }
        deps.suppress(deps.username);
        deps.log('biometric unlock failed', { error: err });
        deps.showToast(getUserFacingErrorMessage(err, 'Biometric unlock failed'), 'info');
    }
};

/**
 * Unlock-screen sign-out: clears the form and returns to the signin flow on
 * success; surfaces the error toast on failure.
 */
export const runUnlockSignOut = async (deps: {
    signOut: () => Promise<void>;
    onSignedOut: () => void;
    onError: (message: string) => void;
    onFinished: () => void;
    log: (message: string, extra?: { error: unknown }) => void;
}): Promise<void> => {
    try {
        await deps.signOut();
        deps.onSignedOut();
    } catch (error: any) {
        deps.log('unlock sign-out failed', { error });
        deps.onError(getUserFacingErrorMessage(error, 'Failed to sign out'));
        deps.onFinished();
    }
};

export interface SigninActionsOptions {
    isAuthLoading: boolean;
    username: string;
    password: string;
    setUsername: (value: string) => void;
    setPassword: (value: string) => void;
    setFormErrors: (errors: { [key: string]: string }) => void;
    signin: (username: string, password: string, isBiometricSignIn: boolean) => Promise<User | null>;
    signOut: () => Promise<void>;
    navigation: RootNavigationProps;
    showToast: (message: unknown, type: 'error' | 'success' | 'info') => void;
    lastSignedInUser: LastSignedInUser | null;
    markPrompted: () => void;
    suppressBiometric: (username: string) => void;
    unlockHandlerRef: UnlockHandlerRef;
}

export const useSigninActions = (options: SigninActionsOptions) => {
    const {
        isAuthLoading,
        username,
        password,
        setUsername,
        setPassword,
        setFormErrors,
        signin,
        signOut,
        navigation,
        showToast,
        lastSignedInUser,
        markPrompted,
        suppressBiometric,
        unlockHandlerRef,
    } = options;

    const [loadingAction, setLoadingAction] = useState<'password' | 'biometric' | 'signout' | null>(null);
    const signInInFlightRef = useRef(false);

    // Clear the in-flight guard once auth loading settles.
    useEffect(() => {
        if (!isAuthLoading) {
            signInInFlightRef.current = false;
            setLoadingAction(null);
        }
    }, [isAuthLoading]);

    const onSignin = async () => {
        if (isAuthLoading || signInInFlightRef.current) return;
        await runPasswordSignin({
            username,
            password,
            signin,
            showToast,
            lastSignedInUser,
            clearDek: (uid) => securityService.clearDek(uid),
            onStarted: () => {
                signInInFlightRef.current = true;
                setLoadingAction('password');
            },
            onFinished: () => {
                signInInFlightRef.current = false;
                setLoadingAction(null);
            },
            onUsernameChanged: setUsername,
            onValidationErrors: setFormErrors,
            log: (message, extra) => logger.warn(message, extra),
        });
    };

    const onBiometricUnlock = async () => {
        if (isAuthLoading || signInInFlightRef.current) return;
        await runBiometricUnlock({
            username,
            signin,
            showToast,
            isBiometricAuthCancelled: (error) => securityService.isBiometricAuthCancelled(error),
            onStarted: () => {
                signInInFlightRef.current = true;
                setLoadingAction('biometric');
                markPrompted();
                suppressBiometric(username);
            },
            onFinished: () => {
                signInInFlightRef.current = false;
                setLoadingAction(null);
            },
            suppress: suppressBiometric,
            log: (message, extra) => logger.warn(message, extra),
        });
    };

    const onUnlockSignOut = async () => {
        if (isAuthLoading || signInInFlightRef.current) return;
        signInInFlightRef.current = true;
        setLoadingAction('signout');

        await runUnlockSignOut({
            signOut,
            onSignedOut: () => {
                setUsername('');
                setPassword('');
                setFormErrors({});
                navigation.navigate('Signin');
            },
            onError: (message) => showToast(message, 'error'),
            onFinished: () => {
                signInInFlightRef.current = false;
                setLoadingAction(null);
            },
            log: (message, extra) => logger.warn(message, extra),
        });
    };

    // Expose the latest biometric unlock handler to the auto-prompt effect.
    // Written during render so the effect (which runs after commit) always
    // reads the committed render's closure, matching the original behavior
    // of calling onBiometricUnlock from the render whose deps re-ran it.
    unlockHandlerRef.current = onBiometricUnlock;

    return { loadingAction, onSignin, onBiometricUnlock, onUnlockSignOut };
};
