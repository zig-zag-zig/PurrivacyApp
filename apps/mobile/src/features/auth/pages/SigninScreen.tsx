import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
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
        <ScreenContainer contentContainerStyle={styles.screenContent}>
            <View style={styles.brandRow}>
                <View style={styles.mark}>
                    <Icon name="shield-lock-outline" size={22} color={theme.colors.primaryStrong} />
                </View>
                <CustomText style={styles.brand}>PURRIVACY</CustomText>
            </View>

            <View style={styles.formCard}>
                <CustomText style={styles.formTitle}>
                    {isUnlockFlow ? 'Unlock vault' : 'Sign in'}
                </CustomText>

                <View style={styles.formFields}>
                    {isUnlockFlow ? (
                        <View
                            style={styles.unlockIdentity}
                            accessibilityRole="text"
                            accessibilityLabel={`Username ${username}`}
                        >
                            <View style={styles.identityIcon}>
                                <Icon name="account-outline" size={20} color={theme.colors.secondary} />
                            </View>
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
                            labelTopBackgroundColor={theme.colors.surface}
                            labelBottomBackgroundColor={theme.colors.surfaceElevated}
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
                        labelTopBackgroundColor={theme.colors.surface}
                        labelBottomBackgroundColor={theme.colors.surfaceElevated}
                    />
                </View>

                <Button
                    testID="purrivacy.signin.submit"
                    label={isUnlockFlow ? 'Unlock with password' : 'Sign in securely'}
                    onPress={onSignin}
                    disabled={signinBusy || !canSubmitSignin}
                    loading={loadingAction === 'password'}
                    icon={<Icon name="arrow-right" size={20} color={theme.colors.onPrimary} />}
                />

                <Button
                    hidden={!isUnlockFlow || !showBiometricButton}
                    label="Unlock with biometrics"
                    onPress={onBiometricUnlock}
                    disabled={signinBusy || !showBiometricButton}
                    loading={loadingAction === 'biometric'}
                    icon={<Icon name="fingerprint" size={21} color={theme.colors.onPrimary} />}
                />

                <Button
                    hidden={!isUnlockFlow}
                    label="Sign out"
                    onPress={onUnlockSignOut}
                    variant="secondary"
                    disabled={signinBusy}
                    loading={loadingAction === 'signout'}
                />
            </View>

            {!isUnlockFlow ? (
                <View style={styles.secondaryActions}>
                    <Button
                        label="Recover account"
                        testID="purrivacy.signin.recover"
                        onPress={() => navigation.navigate('RecoverAccount')}
                        variant="secondary"
                        disabled={signinBusy}
                        style={styles.secondaryButton}
                    />
                    <Button
                        testID="purrivacy.signin.signup"
                        label="Create account"
                        onPress={() => navigation.navigate('Signup')}
                        variant="secondary"
                        disabled={signinBusy}
                        style={styles.secondaryButton}
                    />
                </View>
            ) : null}

            <View style={styles.privacyNote}>
                <Icon name="lock-check-outline" size={17} color={theme.colors.secondary} />
                <CustomText style={styles.privacyText}>Encrypted before sync. Controlled by you.</CustomText>
            </View>
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    screenContent: {
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.xxl,
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.lg,
    },
    mark: {
        width: 40,
        height: 40,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primaryMuted,
        borderWidth: 1,
        borderColor: `${theme.colors.primary}77`,
    },
    brand: {
        color: theme.colors.secondary,
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '800',
        letterSpacing: 2.2,
    },
    formCard: {
        gap: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.lg,
        ...theme.elevation.high,
    },
    formTitle: {
        color: theme.colors.text,
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '800',
        marginBottom: theme.spacing.xs,
    },
    formFields: {
        gap: theme.spacing.md,
    },
    unlockIdentity: {
        minHeight: 54,
        paddingHorizontal: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    identityIcon: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.secondaryMuted,
    },
    unlockIdentityValue: {
        color: theme.colors.text,
        fontSize: 17,
        fontWeight: '700',
        lineHeight: 22,
        flex: 1,
    },
    secondaryActions: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
    },
    secondaryButton: {
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
    },
    privacyNote: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.sm,
    },
    privacyText: {
        color: theme.colors.textMuted,
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '600',
    },
});
