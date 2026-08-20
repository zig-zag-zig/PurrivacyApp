import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useAuth } from '../state/AuthContext';
import { RootNavigationProps } from '../../../app/navigation/types';
import { theme } from '../../../styles/theme';
import { useToast } from '../../../app/state/ToastContext';
import { sanitizeUsernameInput, USERNAME_MAX_LENGTH } from '../domain/usernameIdentity';
import { shouldShowUnlockScreen } from '../domain/authUiState';
import { usePendingSignupResume } from '../hooks/signin/usePendingSignupResume';
import { useUsernamePrefill } from '../hooks/signin/useUsernamePrefill';
import { useBiometricAutoPrompt } from '../hooks/signin/useBiometricAutoPrompt';
import { useSigninActions } from '../hooks/signin/useSigninActions';

export const SigninScreen = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const { isAuthLoading, isLocalSessionLocked, authCompleted, initializeBiometricState, lastSignedInUser, setLastUsedBiometricSignIn, appStateIsBackground, signin, signOut, user, canGoDirectlyToBiometricAuth } = useAuth();
    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();
    const usernamePrefillHandledRef = useRef(false);
    const usernameRef = useRef<any>(null);
    const isFocused = useIsFocused();
    const unlockHandlerRef = useRef<(() => Promise<void>) | null>(null);

    usePendingSignupResume(navigation);
    useUsernamePrefill(isFocused, lastSignedInUser, setUsername, usernamePrefillHandledRef);

    const autoPrompt = useBiometricAutoPrompt({
        username,
        appStateIsBackground,
        authCompleted,
        canGoDirectlyToBiometricAuth,
        user,
        lastSignedInUser,
        setLastUsedBiometricSignIn,
        initializeBiometricState,
        unlockHandlerRef,
    });

    const { showBiometricButton } = autoPrompt;

    const { loadingAction, onSignin, onBiometricUnlock, onUnlockSignOut } = useSigninActions({
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
        markPrompted: autoPrompt.markPrompted,
        suppressBiometric: autoPrompt.suppress,
        unlockHandlerRef,
    });

    useFocusEffect(
        useCallback(() => {
            return () => {
                if (AppState.currentState !== 'active') return;

                autoPrompt.resetForBlur();
                usernamePrefillHandledRef.current = false;
                setUsername('');
                setPassword('');
                setFormErrors({});
            };
        }, [autoPrompt.resetForBlur])
    );

    const onUsernameChange = (text: string) => {
        usernamePrefillHandledRef.current = true;
        setUsername(sanitizeUsernameInput(text));
        if (formErrors.username) {
            setFormErrors((prev) => {
                const next = { ...prev };
                delete next.username;
                return next;
            });
        }
    };

    const onPasswordChange = (text: string) => {
        setPassword(text);
        if (formErrors.password) {
            setFormErrors((prev) => {
                const next = { ...prev };
                delete next.password;
                return next;
            });
        }
    };

    const signinBusy = isAuthLoading || loadingAction !== null;
    const canSubmitSignin = username.trim().length > 0 && password.length > 0;
    const isUnlockFlow = shouldShowUnlockScreen(isLocalSessionLocked, lastSignedInUser);

    return (
        <ScreenContainer>
            <View
                style={{ gap: theme.spacing.md }}
            >
                {isUnlockFlow ? (
                    <View
                        style={styles.unlockIdentity}
                        accessibilityRole="text"
                        accessibilityLabel={`Username ${username}`}
                    >
                        <CustomText style={styles.unlockIdentityValue} numberOfLines={1}>
                            {username}
                        </CustomText>
                    </View>
                ) : (
                    <InputField
                        ref={usernameRef}
                        testID="purrivacy.signin.username"
                        label="Username"
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
                )}
                <InputField
                    testID="purrivacy.signin.password"
                    label="Password"
                    value={password}
                    onChangeText={onPasswordChange}
                    autoComplete="current-password"
                    enableAutofill
                    secureTextEntry
                    showToggleSecureText
                    textContentType="password"
                    error={formErrors.password}
                />

                <Button
                    testID="purrivacy.signin.submit"
                    label={isUnlockFlow ? 'Unlock with password' : 'Sign In'}
                    onPress={onSignin}
                    disabled={signinBusy || !canSubmitSignin}
                    loading={loadingAction === 'password'}
                />

                <Button
                    hidden={!isUnlockFlow || !showBiometricButton}
                    label="Unlock with biometrics"
                    onPress={onBiometricUnlock}
                    disabled={signinBusy || !showBiometricButton}
                    loading={loadingAction === 'biometric'}
                />

                <Button
                    hidden={!isUnlockFlow}
                    label="Sign Out"
                    onPress={onUnlockSignOut}
                    variant="secondary"
                    disabled={signinBusy}
                    loading={loadingAction === 'signout'}
                />

                <Button
                    hidden={isUnlockFlow}
                    label="Recover Account"
                    testID="purrivacy.signin.recover"
                    onPress={() => navigation.navigate('RecoverAccount')}
                    variant="secondary"
                    disabled={signinBusy}
                />

                <Button
                    testID="purrivacy.signin.signup"
                    hidden={isUnlockFlow}
                    label="Sign Up"
                    onPress={() => navigation.navigate('Signup')}
                    variant="secondary"
                    disabled={signinBusy}
                />
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    unlockIdentity: {
        paddingBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingTop: theme.spacing.lg,
    },
    unlockIdentityValue: {
        color: theme.colors.text,
        fontSize: 24,
        fontWeight: '700',
        lineHeight: 30,
    },
});
