import { useNavigation } from '@react-navigation/native';
import { validateMnemonic } from 'bip39';
import { updatePassword } from 'firebase/auth';
import React, { useState } from 'react';
import { View } from 'react-native';
import { ApiClient } from '../../../api/client';
import { RootNavigationProps } from '../../../app/navigation/types';
import { useToast } from '../../../app/state/ToastContext';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { theme } from '../../../styles/theme';
import { PasswordForm } from '../components/PasswordForm';
import {
    normalizeUsername,
    sanitizeUsernameInput,
    USERNAME_MAX_LENGTH,
    validateUsername,
} from '../domain/usernameIdentity';
import { AuthService } from '../services/authService';
import { useAuth } from '../state/AuthContext';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../../../config/inputLimits';

export const RecoverAccountScreen = () => {
    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();
    const { signOut, setLoginWithReauthenticateWithCredential, signInWithFirebaseCustomToken } = useAuth();
    const [username, setUsername] = useState('');
    const [seedPhrase, setSeedPhrase] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

    const handleRecover = async () => {
        const errors: { [key: string]: string } = {};
        const normalizedSeedPhrase = AuthService.normalizeSeedPhrase(seedPhrase);
        if (normalizedSeedPhrase !== seedPhrase) {
            setSeedPhrase(normalizedSeedPhrase);
        }
        const submittedUsername = sanitizeUsernameInput(username);
        if (submittedUsername !== username) {
            setUsername(submittedUsername);
        }
        const usernameError = validateUsername(submittedUsername);
        if (usernameError) errors.username = usernameError;
        if (!normalizedSeedPhrase) errors.seedPhrase = 'Please enter your recovery seed phrase';
        else if (!validateMnemonic(normalizedSeedPhrase)) errors.seedPhrase = 'Enter a valid 12- or 24-word recovery seed phrase.';
        if (!newPassword) errors.newPassword = 'Password is required';
        else if (newPassword.length < ACCOUNT_PASSWORD_MIN_LENGTH) errors.newPassword = `Minimum ${ACCOUNT_PASSWORD_MIN_LENGTH} characters`;
        if (!confirmPassword) errors.confirmPassword = 'Please confirm password';
        else if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords must match';

        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsLoading(true);
        setLoginWithReauthenticateWithCredential(true);
        try {
            const normalizedUsername = normalizeUsername(submittedUsername);
            const challenge = await ApiClient.getRecoveryChallenge(normalizedUsername);
            const recoveryVerifier = await AuthService.deriveRecoveryVerifier(normalizedSeedPhrase, challenge.recoveryVerifierSalt);
            const recovery = await ApiClient.createRecoveryToken(normalizedUsername, recoveryVerifier);
            const user = await signInWithFirebaseCustomToken(recovery.tempToken, false);

            if (user.uid !== recovery.userId) {
                throw new Error('Recovery token did not match account');
            }

            await AuthService.resetPasswordWithSeed(user.uid, recovery.userEncrypted, newPassword, normalizedSeedPhrase);
            await updatePassword(user, newPassword);
            await ApiClient.revokeAllSessions();
            showToast('Account recovered. Sign in with your new password.', 'success');
            await signOut();
            navigation.navigate('Signin');
        } catch (error: any) {
            logger.warn('account recovery failed', { error });
            showToast(getUserFacingErrorMessage(error, 'Failed to recover account'), 'error');
        } finally {
            setLoginWithReauthenticateWithCredential(false);
            setIsLoading(false);
        }
    };

    const handleUsernameChange = (text: string) => {
        setUsername(sanitizeUsernameInput(text));
        if (formErrors.username) {
            setFormErrors((prev) => {
                const next = { ...prev };
                delete next.username;
                return next;
            });
        }
    };

    return (
        <ScreenContainer>
            <View style={{ gap: theme.spacing.md }}>
                <InputField
                    label="Username"
                    value={username}
                    onChangeText={handleUsernameChange}
                    autoCapitalize="none"
                    autoComplete="username"
                    enableAutofill
                    autoCorrect={false}
                    maxLength={USERNAME_MAX_LENGTH}
                    textContentType="username"
                    error={formErrors.username}
                    trimOnBlur
                />

                <InputField
                    label="Recovery Seed Phrase"
                    value={seedPhrase}
                    onChangeText={setSeedPhrase}
                    multiline
                    largeText
                    secureTextEntry
                    showToggleSecureText
                    error={formErrors.seedPhrase}
                    normalizeOnBlur={AuthService.normalizeSeedPhrase}
                />

                <PasswordForm
                    newPassword={newPassword}
                    confirmPassword={confirmPassword}
                    onNewPasswordChange={setNewPassword}
                    onConfirmPasswordChange={setConfirmPassword}
                    onSubmit={handleRecover}
                    isLoading={isLoading}
                    formErrors={formErrors}
                />
            </View>
        </ScreenContainer>
    );
};
