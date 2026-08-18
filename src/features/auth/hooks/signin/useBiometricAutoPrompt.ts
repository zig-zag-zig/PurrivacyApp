import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { BiometricAuthService } from '../../../security/services/biometricAuthService';
import { securityService } from '../../../security/services/securityService';
import { logger } from '../../../../utils/logger';
import { validateUsername } from '../../domain/usernameIdentity';
import type { LastSignedInUser } from '../../../../types/types';
import {
    autoBiometricUsernameKey,
    isAutoBiometricSuppressed,
    resetAutoBiometricSuppression,
    suppressAutoBiometricUsername,
} from './autoBiometricSuppression';

export const AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS = 15000;

export type UnlockHandler = () => Promise<void>;
export type UnlockHandlerRef = { current: UnlockHandler | null };

/**
 * Resolves whether the given username last used biometric unlock, memoizing
 * negative answers in a per-screen ref so repeated lookups are skipped.
 */
export const didLastUseBiometrics = async (
    username: string,
    negativeCache: Set<string>,
    lookupLastUsed: (username: string) => Promise<boolean>,
): Promise<boolean> => {
    if (validateUsername(username)) return false;

    const alreadyTried = negativeCache.has(username);
    if (!alreadyTried) {
        const result = await lookupLastUsed(username);
        if (!result) {
            negativeCache.add(username);
        }
        return result;
    }

    return false;
};

/**
 * Username-change refresh: syncs the suppressed state from the module-scoped
 * registry, resolves the "last used biometric" flag, and hides the biometric
 * button (re-initializing biometric state) when biometrics are disabled in
 * the phone settings.
 */
export interface RefreshBiometricPromptSuppressionDeps {
    username: string;
    onSuppressedChange: (suppressed: boolean) => void;
    negativeCache: Set<string>;
    lookupLastUsed: (username: string) => Promise<boolean>;
    onLastUsedChange: (lastUsed: boolean) => void;
    isDisabledInPhoneSettings: (username: string) => Promise<boolean | null>;
    onBiometricsDisabled: () => void;
}

export const refreshBiometricPromptSuppression = async (deps: RefreshBiometricPromptSuppressionDeps): Promise<void> => {
    const suppressed = isAutoBiometricSuppressed(deps.username);
    deps.onSuppressedChange(suppressed);
    const lastUsedBiometric = await didLastUseBiometrics(deps.username, deps.negativeCache, deps.lookupLastUsed);
    deps.onLastUsedChange(lastUsedBiometric);
    if ((await deps.isDisabledInPhoneSettings(deps.username)) === true) {
        deps.onBiometricsDisabled();
    }
};

/**
 * Background-reset timing: records the moment the app went to background and,
 * on the transition out of background, fires the reset callback when the
 * elapsed background time reaches the threshold. The recorded timestamp is
 * always cleared after evaluation.
 */
export const applyBackgroundResetTiming = (
    appStateIsBackground: boolean,
    backgroundTimeRef: { current: number | null },
    now: number,
    onReset: () => void,
): void => {
    if (appStateIsBackground && backgroundTimeRef.current === null) {
        backgroundTimeRef.current = now;
    } else if (backgroundTimeRef.current !== null) {
        const timeInBackground = now - backgroundTimeRef.current;
        if (timeInBackground >= AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS) {
            onReset();
        }
        backgroundTimeRef.current = null;
    }
};

/**
 * Auto-prompt gate: the app may go straight into a biometric unlock attempt
 * only after auth bootstrap completed, no user is present, the biometric
 * path is available, and the prompt/suppression guards are all clear.
 */
export const shouldAutoPromptBiometricUnlock = (deps: {
    authCompleted: boolean;
    user: User | null;
    canGoDirectlyToBiometricAuth: boolean;
    alreadyPrompted: boolean;
    autoBiometricSuppressed: boolean;
    isUsernameSuppressed: boolean;
    showBiometricButton: boolean;
}): boolean => {
    if (!deps.authCompleted || deps.user) {
        return false;
    }
    return (
        deps.canGoDirectlyToBiometricAuth
        && !deps.alreadyPrompted
        && !deps.autoBiometricSuppressed
        && !deps.isUsernameSuppressed
        && deps.showBiometricButton
    );
};

/**
 * Biometric-button visibility: hidden once a user is signed in, when there is
 * no matching last signed-in user, or when the user has no biometric DEK.
 */
export const resolveBiometricButtonVisibility = async (deps: {
    user: User | null;
    lastSignedInUser: LastSignedInUser | null;
    username: string;
    hasBiometricDek: (uid: string) => Promise<boolean>;
}): Promise<boolean> => {
    if (deps.user) {
        return false;
    }
    if (!deps.lastSignedInUser || deps.lastSignedInUser.username !== deps.username) {
        return false;
    }
    try {
        return await deps.hasBiometricDek(deps.lastSignedInUser.uid);
    } catch (error) {
        logger.warn('failed to check biometric unlock availability', { error });
        return false;
    }
};

export interface BiometricAutoPromptOptions {
    username: string;
    appStateIsBackground: boolean;
    authCompleted: boolean;
    canGoDirectlyToBiometricAuth: boolean;
    user: User | null;
    lastSignedInUser: LastSignedInUser | null;
    setLastUsedBiometricSignIn: (value: boolean) => void;
    initializeBiometricState: () => Promise<unknown>;
    /**
     * Component-owned ref that receives the biometric unlock handler from
     * useSigninActions; the auto-prompt effect invokes it without creating a
     * construction-time dependency between the two hooks.
     */
    unlockHandlerRef: UnlockHandlerRef;
}

export const useBiometricAutoPrompt = (options: BiometricAutoPromptOptions) => {
    const {
        username,
        appStateIsBackground,
        authCompleted,
        canGoDirectlyToBiometricAuth,
        user,
        lastSignedInUser,
        setLastUsedBiometricSignIn,
        initializeBiometricState,
        unlockHandlerRef,
    } = options;

    const [alreadyPrompted, setAlreadyPrompted] = useState(false);
    const [autoBiometricSuppressed, setAutoBiometricSuppressed] = useState(false);
    const [showBiometricButton, setShowBiometricButton] = useState(false);
    const backgroundTimeRef = useRef<number | null>(null);
    const usernamesThatDidNotLastUseBiometrics = useRef<Set<string>>(new Set());

    const suppress = useCallback((value: string): void => {
        if (suppressAutoBiometricUsername(value)) {
            setAutoBiometricSuppressed(true);
        }
    }, []);

    const markPrompted = useCallback((): void => {
        setAlreadyPrompted(true);
    }, []);

    const resetForBlur = useCallback((): void => {
        setShowBiometricButton(false);
        setAlreadyPrompted(false);
    }, []);

    // Username-change refresh (suppression registry, last-used flag, phone
    // settings check).
    useEffect(() => {
        void refreshBiometricPromptSuppression({
            username,
            onSuppressedChange: setAutoBiometricSuppressed,
            negativeCache: usernamesThatDidNotLastUseBiometrics.current,
            lookupLastUsed: (value) => BiometricAuthService.getLastUsedBiometricSignIn(value),
            onLastUsedChange: setLastUsedBiometricSignIn,
            isDisabledInPhoneSettings: (value) => BiometricAuthService.biometricsDisabledInPhoneSettings(value),
            onBiometricsDisabled: () => {
                setShowBiometricButton(false);
                void initializeBiometricState();
            },
        });
    }, [username, setLastUsedBiometricSignIn, initializeBiometricState]);

    // Background-reset timing (15s threshold).
    useEffect(() => {
        applyBackgroundResetTiming(appStateIsBackground, backgroundTimeRef, Date.now(), () => {
            setAlreadyPrompted(false);
            const key = autoBiometricUsernameKey(username);
            if (!validateUsername(key)) {
                resetAutoBiometricSuppression(username);
                setAutoBiometricSuppressed(false);
            }
        });
    }, [appStateIsBackground, username]);

    // Biometric-button availability.
    useEffect(() => {
        void resolveBiometricButtonVisibility({
            user,
            lastSignedInUser,
            username,
            hasBiometricDek: (uid) => securityService.hasBiometricDek(uid),
        }).then(setShowBiometricButton);
    }, [username, lastSignedInUser, user]);

    // Straight-to-unlock auto prompt once bootstrap completed.
    useEffect(() => {
        const checkIfCanGoDirectlyToBiometricUnlock = async () => {
            if (
                shouldAutoPromptBiometricUnlock({
                    authCompleted,
                    user,
                    canGoDirectlyToBiometricAuth,
                    alreadyPrompted,
                    autoBiometricSuppressed,
                    isUsernameSuppressed: isAutoBiometricSuppressed(username),
                    showBiometricButton,
                })
            ) {
                await unlockHandlerRef.current?.();
            }
        };

        void checkIfCanGoDirectlyToBiometricUnlock();
    }, [authCompleted, canGoDirectlyToBiometricAuth, username, alreadyPrompted, autoBiometricSuppressed, showBiometricButton, user]);

    return { showBiometricButton, suppress, markPrompted, resetForBlur };
};
