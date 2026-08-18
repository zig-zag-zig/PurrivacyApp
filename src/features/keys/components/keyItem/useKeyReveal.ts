import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

import { useAuth } from '../../../auth/state/AuthContext';
import { securityService } from '../../../security/services/securityService';
import { useCopyFeedback } from '../../../../shared/hooks/useCopyFeedback';
import { useSecureCopy } from '../../../../shared/hooks/useSecureCopy';
import { useToast } from '../../../../app/state/ToastContext';
import type { KeyPair } from '../../../../types/types';
import type { PrivateKeyRevealLoading } from '../PrivateKeyRevealPanel';

/**
 * Reveal authorization for the private key (APP-ARCH-002).
 *
 * Owns the biometric/account-password authorization policy, the reveal
 * state machine, and the highest-secret copy confirmation flow
 * (APP-SEC-005). Behavior is a verbatim extraction from KeyItem.tsx.
 */
export function useKeyReveal(pgpKey: KeyPair, expanded: boolean | undefined) {
    const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
    const [copyConfirmVisible, setCopyConfirmVisible] = useState(false);
    const [accountPassword, setAccountPassword] = useState('');
    const [revealError, setRevealError] = useState('');
    const [revealLoading, setRevealLoading] = useState<PrivateKeyRevealLoading>(null);
    const privateKeyCopyFeedback = useCopyFeedback();
    const { showToast } = useToast();
    const {
        user,
        isBiometricAvailable,
        isBiometricEnabled,
        setLoginWithReauthenticateWithCredential,
    } = useAuth();
    const { secureCopy } = useSecureCopy();

    const canRevealWithBiometrics = isBiometricAvailable && isBiometricEnabled && securityService.hasStandaloneBiometricAuth();

    const clearPrivateKeyReveal = () => {
        setPrivateKeyVisible(false);
        setAccountPassword('');
        setRevealError('');
        setRevealLoading(null);
    };

    useEffect(() => {
        clearPrivateKeyReveal();
    }, [pgpKey.fingerprint]);

    useEffect(() => {
        if (!expanded) {
            clearPrivateKeyReveal();
        }
    }, [expanded]);

    const handlePrivateKeyRevealSuccess = () => {
        setPrivateKeyVisible(true);
        setRevealError('');
        setAccountPassword('');
    };

    const handleRevealWithAccountPassword = async () => {
        if (!pgpKey.privateKey) return;
        if (!accountPassword) {
            setRevealError('Account password is required');
            return;
        }
        if (!user?.email) {
            setRevealError('Sign in again before revealing private keys');
            return;
        }

        setRevealError('');
        setRevealLoading('account');
        setLoginWithReauthenticateWithCredential(true);

        try {
            const credential = EmailAuthProvider.credential(user.email, accountPassword);
            await reauthenticateWithCredential(user, credential);
            handlePrivateKeyRevealSuccess();
        } catch (error: any) {
            if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password') {
                setRevealError('Incorrect account password');
            } else {
                setRevealError('Could not verify account password');
            }
        } finally {
            setLoginWithReauthenticateWithCredential(false);
            setRevealLoading(null);
        }
    };

    const handleRevealWithBiometric = async () => {
        if (!pgpKey.privateKey || !canRevealWithBiometrics) return;

        setRevealError('');
        setRevealLoading('biometric');

        try {
            const authenticated = await securityService.authenticateForSecretReveal('Unlock private key');
            if (authenticated) {
                handlePrivateKeyRevealSuccess();
            } else {
                setRevealError('Biometric unlock is unavailable');
            }
        } catch (error: any) {
            if (!securityService.isBiometricAuthCancelled(error)) {
                setRevealError('Biometric unlock failed');
            }
        } finally {
            setRevealLoading(null);
        }
    };

    const handleCopyPrivateKey = () => {
        if (!privateKeyVisible || !pgpKey.privateKey) return;
        Keyboard.dismiss();
        // Highest-secret copy requires explicit confirmation (APP-SEC-005).
        setCopyConfirmVisible(true);
    };

    const confirmCopyPrivateKey = () => {
        setCopyConfirmVisible(false);
        if (!pgpKey.privateKey) return;
        void secureCopy(pgpKey.privateKey, { sensitivity: 'high' });
        privateKeyCopyFeedback.markCopied();
        showToast('Private key copied', 'success');
    };

    return {
        accountPassword,
        canRevealWithBiometrics,
        clearPrivateKeyReveal,
        confirmCopyPrivateKey,
        copyConfirmVisible,
        handleCopyPrivateKey,
        handleRevealWithAccountPassword,
        handleRevealWithBiometric,
        privateKeyCopyFeedback,
        privateKeyVisible,
        revealError,
        revealLoading,
        setAccountPassword,
        setCopyConfirmVisible,
    };
}

export type UseKeyRevealResult = ReturnType<typeof useKeyReveal>;
