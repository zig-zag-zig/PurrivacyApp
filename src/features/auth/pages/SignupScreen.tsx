import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { validateMnemonic } from 'bip39';
import { Button } from '../../../components/Button';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useAuth } from '../state/AuthContext';
import { RootNavigationProps } from '../../../app/navigation/types';
import { AuthService } from '../services/authService';
import { UserAuthService } from '../services/userAuthService';
import { theme } from '../../../styles/theme';
import { useToast } from '../../../app/state/ToastContext';
import { sanitizeUsernameInput, USERNAME_MAX_LENGTH, validateUsername } from '../domain/usernameIdentity';
import { ERROR_MESSAGES } from '../../../utils/errorHandling';
import { ACCOUNT_PASSWORD_MIN_LENGTH } from '../../../config/inputLimits';
import { commitAutofill, isNativeSignupRestartAvailable, persistPendingSignup, restartActivity } from '../../../native/autofillCommit';
import { pendingSignupSession } from '../services/pendingSignupSession';

export const SignupScreen = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
    const { isAuthLoading } = useAuth();
    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();

    useFocusEffect(
        useCallback(() => {
            return () => {
                setUsername('');
                setPassword('');
                setConfirmPassword('');
                setFormErrors({});
            };
        }, [])
    );

    const routeParams = (useRoute() as any).params;
    useEffect(() => {
        if (routeParams?.username) {
            setUsername(sanitizeUsernameInput(routeParams.username));
        }
    }, []);

    const handleSignup = async () => {
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

        setIsCheckingAvailability(true);
        try {
            const taken = await UserAuthService.isUsernameTaken(submittedUsername);
            if (taken) {
                showToast(ERROR_MESSAGES.SIGN_UP_FAILED, 'error');
                return;
            }
        } catch {
            showToast(ERROR_MESSAGES.NETWORK_ERROR, 'error');
            return;
        } finally {
            setIsCheckingAvailability(false);
        }

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

        const signupPayload = { seed: generatedSeed, username: submittedUsername, password };

        if (isNativeSignupRestartAvailable()) {
            // The activity restart triggers the Android password-manager save
            // dialog. Secrets survive via the Keystore-encrypted envelope
            // (APP-SEC-001) and the in-process session as a fallback.
            pendingSignupSession.set(signupPayload);
            commitAutofill();
            const persisted = await persistPendingSignup(signupPayload);
            if (persisted) {
                restartActivity();
                return;
            }
            // Envelope failed: do not restart into a lost signup; verify in place.
            navigation.navigate('SignupSeedVerification');
            return;
        }

        pendingSignupSession.set(signupPayload);
        commitAutofill();
        navigation.navigate('SignupSeedVerification');
    };

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
                    autoComplete="new-password"
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
                    autoComplete="new-password"
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
                    loading={isCheckingAvailability || isAuthLoading}
                    disabled={isCheckingAvailability || isAuthLoading}
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
