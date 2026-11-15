import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

import { useAuth } from '../../auth/state/AuthContext';
import { securityService } from '../services/securityService';

export type SecretReauthLoading = 'account' | 'biometric' | null;

/**
 * Fresh-identity authorization shared by secret-reveal / protected-note flows.
 *
 * Accepts the account password (Firebase re-authentication) or biometrics
 * (strong, device-credential fallback disabled by
 * `authenticateForSecretReveal`). The unlocked vault alone is not enough.
 */
export function useSecretReauthorization(promptMessage: string) {
    const { user, isBiometricAvailable, isBiometricEnabled, setLoginWithReauthenticateWithCredential } = useAuth();
    const [accountPassword, setAccountPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState<SecretReauthLoading>(null);

    const canUseBiometrics = isBiometricAvailable
        && isBiometricEnabled
        && securityService.hasStandaloneBiometricAuth();

    const reset = () => {
        setAccountPassword('');
        setError('');
        setLoading(null);
    };

    const authenticateWithPassword = async (): Promise<boolean> => {
        if (!accountPassword) {
            setError('Account password is required');
            return false;
        }
        if (!user?.email) {
            setError('Sign in again before opening this note');
            return false;
        }

        setError('');
        setLoading('account');
        setLoginWithReauthenticateWithCredential(true);

        try {
            const credential = EmailAuthProvider.credential(user.email, accountPassword);
            await reauthenticateWithCredential(user, credential);
            setAccountPassword('');
            return true;
        } catch (reauthError: any) {
            if (reauthError?.code === 'auth/invalid-credential' || reauthError?.code === 'auth/wrong-password') {
                setError('Incorrect account password');
            } else {
                setError('Could not verify account password');
            }
            return false;
        } finally {
            setLoginWithReauthenticateWithCredential(false);
            setLoading(null);
        }
    };

    const authenticateWithBiometric = async (): Promise<boolean> => {
        if (!canUseBiometrics) return false;

        setError('');
        setLoading('biometric');
        try {
            const authenticated = await securityService.authenticateForSecretReveal(promptMessage);
            if (!authenticated) {
                setError('Biometric authentication unavailable');
                return false;
            }
            return true;
        } catch (biometricError: any) {
            if (!securityService.isBiometricAuthCancelled(biometricError)) {
                setError('Biometric authentication failed');
            }
            return false;
        } finally {
            setLoading(null);
        }
    };

    return {
        accountPassword,
        setAccountPassword,
        error,
        setError,
        loading,
        canUseBiometrics,
        authenticateWithPassword,
        authenticateWithBiometric,
        reset,
    };
}