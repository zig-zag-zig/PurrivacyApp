import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { InputField } from '../../../components/InputField';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { useAuth } from '../state/AuthContext';
import { RootNavigationProps } from '../../../app/navigation/types';
import { theme } from '../../../styles/theme';
import { useToast } from '../../../app/state/ToastContext';
import { securityService } from '../../security/services/securityService';
import { User } from 'firebase/auth';
import { BiometricAuthService } from '../../security/services/biometricAuthService';
import { sanitizeUsernameInput, USERNAME_MAX_LENGTH, validateUsername } from '../domain/usernameIdentity';
import { shouldShowUnlockScreen } from '../domain/authUiState';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { logger } from '../../../utils/logger';
const AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS = 15000;
const autoBiometricSuppressedUsernames = new Set<string>();
const autoBiometricUsernameKey = (value: string) => value.trim().toLowerCase();

export const SigninScreen = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const { isAuthLoading, isLocalSessionLocked, authCompleted, initializeBiometricState, lastSignedInUser, setLastUsedBiometricSignIn, appStateIsBackground, signin, signOut, user, canGoDirectlyToBiometricAuth } = useAuth();
    const [showBiometricButton, setShowBiometricButton] = useState(false);
    const navigation = useNavigation<RootNavigationProps>();
    const { showToast } = useToast();
    const [alreadyPrompted, setAlreadyPrompted] = React.useState<boolean>(false);
    const [autoBiometricSuppressed, setAutoBiometricSuppressed] = useState(false);
    const [loadingAction, setLoadingAction] = useState<'password' | 'biometric' | 'signout' | null>(null);
    const backgroundTimeRef = useRef<number | null>(null);
    const signInInFlightRef = useRef(false);
    const usernamesThatDidNotLastUseBiometrics = useRef<Set<string>>(new Set());
    const usernamePrefillHandledRef = useRef(false);
    const isFocused = useIsFocused();

    const suppressAutoBiometricForUsername = (value: string) => {
        const key = autoBiometricUsernameKey(value);
        if (validateUsername(key)) return;
        autoBiometricSuppressedUsernames.add(key);
        setAutoBiometricSuppressed(true);
    };

    useEffect(() => {
        if (isFocused && lastSignedInUser?.username) {
            usernamePrefillHandledRef.current = true;
            setUsername(lastSignedInUser.username);
        }
    }, [isFocused, lastSignedInUser?.username]);

    useFocusEffect(
        useCallback(() => {
            return () => {
                if (AppState.currentState !== 'active') return;

                setShowBiometricButton(false);
                usernamePrefillHandledRef.current = false;
                setUsername('');
                setPassword('');
                setFormErrors({});
                setAlreadyPrompted(false);
            };
        }, [])
    );

    const didLastUseBiometrics = async (username: string) => {
        if (validateUsername(username)) return false;

        const alreadyTried = usernamesThatDidNotLastUseBiometrics.current.has(username);
        if (!alreadyTried) {
            const result = await BiometricAuthService.getLastUsedBiometricSignIn(username);
            if (!result) {
                usernamesThatDidNotLastUseBiometrics.current.add(username);
            }
            return result;
        }

        return false;
    }

    useEffect(() => {
        const set = async () => {
            const suppressed = autoBiometricSuppressedUsernames.has(autoBiometricUsernameKey(username));
            setAutoBiometricSuppressed(suppressed);
            const lastUsedBiometric = await didLastUseBiometrics(username);
            setLastUsedBiometricSignIn(lastUsedBiometric);
            if (await BiometricAuthService.biometricsDisabledInPhoneSettings(username) === true) {
                setShowBiometricButton(false);
                initializeBiometricState();
            }
            void suppressed;
        }

        set();
    }, [username])

    useEffect(() => {
        if (!isAuthLoading) {
            signInInFlightRef.current = false;
            setLoadingAction(null);
        }
    }, [isAuthLoading]);

    useEffect(() => {
        if (appStateIsBackground && backgroundTimeRef.current === null) {
            backgroundTimeRef.current = Date.now();
        } else if (backgroundTimeRef.current !== null) {
            const timeInBackground = Date.now() - backgroundTimeRef.current;
            if (timeInBackground >= AUTO_BIOMETRIC_RESET_AFTER_BACKGROUND_MS) {
                setAlreadyPrompted(false);
                const key = autoBiometricUsernameKey(username);
                if (!validateUsername(key)) {
                    autoBiometricSuppressedUsernames.delete(key);
                    setAutoBiometricSuppressed(false);
                }
            }
            backgroundTimeRef.current = null;
        }
    }, [appStateIsBackground, username]);

    useEffect(() => {
        const checkIfCanGoDirectlyToBiometricUnlock = async () => {
            if (!authCompleted || user) {
                return;
            }
            const key = autoBiometricUsernameKey(username);
            if (
                canGoDirectlyToBiometricAuth
                && !alreadyPrompted
                && !autoBiometricSuppressed
                && !autoBiometricSuppressedUsernames.has(key)
                && showBiometricButton
            ) {
                await onBiometricUnlock();
            }
        }

        checkIfCanGoDirectlyToBiometricUnlock();
    }, [authCompleted, canGoDirectlyToBiometricAuth, username, alreadyPrompted, autoBiometricSuppressed, showBiometricButton, user]);

    useEffect(() => {
        const checkBiometricButton = async () => {
            if (user) {
                setShowBiometricButton(false);
                return;
            }

            try {
                if (!lastSignedInUser || lastSignedInUser.username !== username) {
                    setShowBiometricButton(false);
                    return;
                }

                const hasBiometricDek = await securityService.hasBiometricDek(lastSignedInUser.uid);
                if (!hasBiometricDek) {
                    setShowBiometricButton(false);
                    return;
                }
                setShowBiometricButton(true);
            } catch (error) {
                logger.warn("failed to check biometric unlock availability", { error });
                setShowBiometricButton(false);
            }
        };

        checkBiometricButton();
    }, [username, lastSignedInUser, user]);

    const onSignin = async () => {
        if (isAuthLoading || signInInFlightRef.current) return;
        signInInFlightRef.current = true;
        setLoadingAction('password');

        let result: User | null = null;
        const errors: { [key: string]: string } = {};
        const submittedUsername = sanitizeUsernameInput(username);
        if (submittedUsername !== username) {
            setUsername(submittedUsername);
        }
        const usernameError = validateUsername(submittedUsername);
        if (usernameError) errors.username = usernameError;
        if (!password) errors.password = 'Password is required';

        setFormErrors(errors);
        if (Object.keys(errors).length > 0) {
            signInInFlightRef.current = false;
            setLoadingAction(null);
            return;
        }

        try {
            result = await signin(submittedUsername, password, false);

            if (!result) {
                showToast('Failed to sign in. Please check your credentials and try again.', 'error');
                signInInFlightRef.current = false;
                setLoadingAction(null);
            }
        } catch (error: any) {
            signInInFlightRef.current = false;
            setLoadingAction(null);
            logger.warn('sign-in failed', { error });
            showToast(getUserFacingErrorMessage(error, 'Failed to sign in. Please try again.'), 'error');
        } finally {
            if (result && lastSignedInUser && lastSignedInUser.uid !== result.uid) {
                await securityService.clearDek(lastSignedInUser.uid);
            }
        }
    };

    const onBiometricUnlock = async () => {
        if (isAuthLoading || signInInFlightRef.current) return;
        signInInFlightRef.current = true;
        setLoadingAction('biometric');
        setAlreadyPrompted(true);
        suppressAutoBiometricForUsername(username);

        try {
            const resultUser = await signin(username, '', true);

            if (!resultUser) {
                showToast('Biometric unlock failed. Try again or sign in with password.', 'error');
                signInInFlightRef.current = false;
                setLoadingAction(null);
            }
        } catch (err: any) {
            signInInFlightRef.current = false;
            setLoadingAction(null);
            if (securityService.isBiometricAuthCancelled(err) || err?.mfaCancelled) {
                suppressAutoBiometricForUsername(username);
                return;
            }
            suppressAutoBiometricForUsername(username);
            logger.warn('biometric unlock failed', { error: err });
            showToast(getUserFacingErrorMessage(err, 'Biometric unlock failed'), 'info');
        }
    };

    const onUnlockSignOut = async () => {
        if (isAuthLoading || signInInFlightRef.current) return;
        signInInFlightRef.current = true;
        setLoadingAction('signout');

        try {
            await signOut();
            setUsername('');
            setPassword('');
            setFormErrors({});
            navigation.navigate('Signin');
        } catch (error: any) {
            logger.warn('unlock sign-out failed', { error });
            showToast(getUserFacingErrorMessage(error, 'Failed to sign out'), 'error');
            signInInFlightRef.current = false;
            setLoadingAction(null);
        }
    };

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
                    hidden={!isUnlockFlow}
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
