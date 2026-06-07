import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { validateMnemonic } from 'bip39';
import { Button } from '../../../components/Button';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { SeedVerification } from '../components/SeedVerification';
import { useAuth } from '../state/AuthContext';
import { RootNavigationProps } from '../../../app/navigation/types';
import { AuthService } from '../services/authService';
import { theme } from '../../../styles/theme';
import { useToast } from '../../../app/state/ToastContext';
import { sanitizeUsernameInput, USERNAME_MAX_LENGTH, validateUsername } from '../domain/usernameIdentity';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../../../config/inputLimits';

export const SignupScreen = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [step, setStep] = useState<'form' | 'seed'>('form');
    const [seed, setSeed] = useState('');
    const { signUp, isAuthLoading } = useAuth();
    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();

    useFocusEffect(
        useCallback(() => {
            return () => {
                setUsername('');
                setPassword('');
                setConfirmPassword('');
                setFormErrors({});
                setStep('form');
                setSeed('');
            };
        }, [])
    );

    const handleSignup = () => {
        const errors: { [key: string]: string } = {};
        const submittedUsername = sanitizeUsernameInput(username);
        if (submittedUsername !== username) {
            setUsername(submittedUsername);
        }
        const usernameError = validateUsername(submittedUsername);
        if (usernameError) errors.username = usernameError;
        if (!password) errors.password = 'Password is required';
        else if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) errors.password = `Minimum ${ACCOUNT_PASSWORD_MIN_LENGTH} characters`;
        if (!confirmPassword) errors.confirmPassword = 'Please confirm password';
        else if (password !== confirmPassword) errors.confirmPassword = 'Passwords must match';

        setFormErrors(errors);
        if (Object.keys(errors).length > 0) return;

        let generatedSeed;
        let attempts = 0;

        do {
            generatedSeed = AuthService.generateSeed();
            attempts++;
            if (attempts > 3) {
                showToast('Failed to generate valid recovery phrase', 'error');
                return;
            }
        } while (!validateMnemonic(generatedSeed));

        setSeed(generatedSeed);
        setStep('seed');
    };

    const handleSeedVerified = async () => {
        try {
            await signUp(sanitizeUsernameInput(username), password, seed);
        } catch (error: any) {
            logger.warn('sign-up failed', { error });
            showToast(getUserFacingErrorMessage(error, 'Failed to sign up'), 'error');
            setStep('form');
        }
    };

    if (step === 'seed') {
        return (
            <SeedVerification
                seed={seed}
                onVerified={handleSeedVerified}
                isLoading={isAuthLoading}
            />
        );
    }

    const onUsernameChange = (text: string) => {
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
        <ScreenContainer testID="purrivacy.signup.screen">
            <View style={{ gap: theme.spacing.md }}>
                <InputField
                    label="Username"
                    testID="purrivacy.signup.username"
                    value={username}
                    onChangeText={onUsernameChange}
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
                    label="Password"
                    testID="purrivacy.signup.password"
                    value={password}
                    onChangeText={setPassword}
                    autoComplete="password"
                    enableAutofill
                    secureTextEntry
                    showToggleSecureText
                    textContentType="newPassword"
                    error={formErrors.password}
                />
                <InputField
                    label="Confirm Password"
                    testID="purrivacy.signup.confirmPassword"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    autoComplete="password"
                    enableAutofill
                    secureTextEntry
                    showToggleSecureText
                    textContentType="newPassword"
                    error={formErrors.confirmPassword}
                />

                <Button
                    label="Sign Up"
                    testID="purrivacy.signup.submit"
                    onPress={handleSignup}
                />

                <Button
                    label="Sign In"
                    testID="purrivacy.signup.signin"
                    onPress={() => navigation.navigate('Signin')}
                    variant="secondary"
                />
            </View>
        </ScreenContainer>
    );
};
