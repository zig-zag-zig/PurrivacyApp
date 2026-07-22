import { useState, useEffect, useCallback } from 'react';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { getUsername } from '../domain/authUtils';
import { logger } from '../../../utils/logger';
export const useBiometricState = (
    user: { username?: string } | null,
    authCompleted: boolean,
    appStateIsBackground: boolean,
    fbUser: { username?: string } | null,
    lastUsedBiometricSignIn: boolean,
    isLocalSessionLocked: boolean,
) => {
    const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
    const [canGoDirectlyToBiometricAuth, setCanGoDirectlyToBiometricAuth] = useState(false);

    useEffect(() => {
        // Only allow automatic biometric unlock once initial auth bootstrap finished.
        const canGoDirectly =
            authCompleted
            && !appStateIsBackground
            && user === null
            && fbUser === null
            && isLocalSessionLocked
            && lastUsedBiometricSignIn;
        setCanGoDirectlyToBiometricAuth(canGoDirectly);
    }, [authCompleted, appStateIsBackground, fbUser, isLocalSessionLocked, lastUsedBiometricSignIn, user]);

    const initializeBiometricState = useCallback(async () => {
        try {
            const username = getUsername();
            const { available, enabled } = await BiometricAuthService.getBiometricState(username);
            setIsBiometricAvailable(available);
            setIsBiometricEnabled(enabled);
            return { available, enabled };
        } catch (error) {
            logger.warn('failed to initialize biometric state', { error });
            setIsBiometricAvailable(false);
            setIsBiometricEnabled(false);
            return { available: false, enabled: false };
        }
    }, [setIsBiometricAvailable, setIsBiometricEnabled]);

    const toggleBiometric = useCallback(async (enabled: boolean) => {
        const username = getUsername();
        await BiometricAuthService.toggleBiometric(username, enabled);
        await initializeBiometricState();
    }, [initializeBiometricState]);

    const promptBiometric = useCallback(async (username: string): Promise<void> => {
        try {
            await BiometricAuthService.promptBiometric(username);
            await initializeBiometricState();
        } catch (error) {
            logger.warn("failed to prompt biometric unlock", { error });
        }
    }, [initializeBiometricState]);

    return {
        isBiometricAvailable,
        isBiometricEnabled,
        canGoDirectlyToBiometricAuth,
        initializeBiometricState,
        toggleBiometric,
        promptBiometric,
        setIsBiometricAvailable,
        setIsBiometricEnabled,
    };
};
