import * as React from 'react';
import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { AppScreenHeader } from '../../../components/AppScreenHeader';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { useMfa } from '../state/MfaContext';
import { useAuth } from '../../auth/state/AuthContext';
import { useToast } from '../../../app/state/ToastContext';
import { useModal } from '../../../app/state/ModalContext';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { RootNavigationProps } from '../../../app/navigation/types';
import { useGlobalSpinner } from '../../../app/state/GlobalSpinnerContext';
import { getUserFacingErrorMessage } from '../../../utils/errorHandling';
import { useSecureCopy } from '../../../shared/hooks/useSecureCopy';

export const MfaSetupScreen = () => {
    const navigation = useNavigation<RootNavigationProps>();
    const { setupMfa, enableMfa, isLoading } = useMfa();
    const { signOut } = useAuth();
    const { showToast } = useToast();
    const { showRecoveryCodesModal } = useModal();

    const [setupData, setSetupData] = useState<any>(null);
    const [trustDevice, setTrustDevice] = useState(true);
    const { secureCopy } = useSecureCopy();
    const [copied, setCopied] = useState(false);
    const copyFeedbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    useGlobalSpinner(!setupData, { backgroundMode: 'opaque' });

    useEffect(() => () => {
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        initializeSetup();
    }, []);

    const initializeSetup = async () => {
        try {
            const data = await setupMfa();
            setSetupData(data);
        } catch (error: any) {
            // Backend API-SEC-006: fresh primary authentication is required
            // to start MFA enrollment (FreshAuthRequiredError -> bare 401 with
            // no structured flag). Any 401 here — stale session OR
            // fresh-auth-required — is correctly handled by dropping the user
            // back to a fresh sign-in instead of the opaque "Failed to
            // initialize" + silent back.
            if (error?.status === 401) {
                await signOut();
                showToast('Please sign in again to set up two-factor authentication', 'error');
                return;
            }
            showToast('Failed to initialize MFA setup', 'error');
            navigation.goBack();
        }
    };

    const handleVerifyCode = async () => {
        try {
            // The request pipeline treats /mfa/enable as MFA-sensitive and
            // PREEMPTIVELY opens the MFA modal to collect the code before the
            // request is sent — the code entered there is what reaches the
            // backend. There is deliberately no code field on this screen:
            // the modal is the single code-collection UI.
            await enableMfa(trustDevice);
            await showRecoveryCodesModal({
                recoveryCodes: setupData?.recoveryCodes || [],
                source: 'setup',
            });
            navigation.goBack();
        } catch (error: any) {
            if (error.message?.includes('cancelled') || error.message?.includes('user cancelled')) {
                showToast('MFA setup cancelled', 'info');
            } else {
                showToast(getUserFacingErrorMessage(error, 'Failed to enable MFA'), 'error');
            }
        }
    };

    const copySecretToClipboard = () => {
        if (!setupData?.secret) {
            return;
        }

        try {
            void secureCopy(setupData.secret, { sensitivity: 'high' });
            setCopied(true);
            if (copyFeedbackTimeoutRef.current) {
                clearTimeout(copyFeedbackTimeoutRef.current);
            }
            copyFeedbackTimeoutRef.current = setTimeout(() => {
                setCopied(false);
                copyFeedbackTimeoutRef.current = null;
            }, 1400);
            showToast('Secret key copied to clipboard', 'success');
        } catch {
            showToast('Failed to copy secret key', 'error');
        }
    };

    if (!setupData) {
        return <ScreenContainer>{null}</ScreenContainer>;
    }

    return (
        <ScreenContainer testID="purrivacy.mfa.setup.screen">
            <AppScreenHeader
                eyebrow="Two-factor authentication"
                icon="two-factor-authentication"
                title="Connect your authenticator"
            />

            <View style={styles.secretContainer}>
                <CustomText style={[commonStyles.textLabel, styles.secretLabel]}>
                    Secret Key
                </CustomText>
                <View style={styles.secretRow}>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onLongPress={copySecretToClipboard}
                        delayLongPress={500}
                        style={commonStyles.flex}
                        accessibilityLabel="Secret key"
                        accessibilityHint="Long press to copy"
                    >
                        <View style={[styles.secretTextFrame, copied && styles.secretTextFrameCopied]}>
                            <CustomText
                                style={[
                                    commonStyles.textBody,
                                    styles.secretText,
                                    copied && styles.secretTextCopied,
                                ]}
                                selectable={false}
                                contextMenuHidden={true}
                            >
                                {setupData.secret}
                            </CustomText>
                        </View>
                    </TouchableOpacity>
                </View>
                <CustomText style={[commonStyles.textCaption, styles.secretHint]}>
                    Enter this exact code in your authenticator app. Each app has different instructions for adding a manual entry.
                </CustomText>
                <CustomText style={[commonStyles.textCaption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
                    OTP Auth URL: {setupData.otpauthUrl}
                </CustomText>
            </View>

            <View style={styles.trustRow}>
                <View style={styles.trustTextColumn}>
                    <CustomText style={[commonStyles.textLabel, styles.trustLabel]}>
                        Trust this device
                    </CustomText>
                    <CustomText style={[commonStyles.textCaption, styles.trustHint]}>
                        Skip MFA prompts on this device until you sign out. You can change this later in Settings.
                    </CustomText>
                </View>
                <Switch
                    testID="purrivacy.mfa.setup.trustDevice"
                    accessibilityLabel="Trust this device"
                    accessibilityRole="switch"
                    value={trustDevice}
                    onValueChange={setTrustDevice}
                    disabled={isLoading}
                />
            </View>

            <CustomText style={[commonStyles.textBody, styles.instructionTitle]}>
                Instructions:
            </CustomText>
            <View style={styles.instructionsContainer}>
                <CustomText style={[commonStyles.textCaption, styles.instruction]}>
                    1. Open your authenticator app
                </CustomText>
                <CustomText style={[commonStyles.textCaption, styles.instruction]}>
                    2. Look for "Add account" or "+" button
                </CustomText>
                <CustomText style={[commonStyles.textCaption, styles.instruction]}>
                    3. Choose "Enter a setup key" or "Manual entry"
                </CustomText>
                <CustomText style={[commonStyles.textCaption, styles.instruction]}>
                    4. Enter the secret key above
                </CustomText>
                <CustomText style={[commonStyles.textCaption, styles.instruction]}>
                    5. Save the account
                </CustomText>
            </View>

            <Button
                label="Continue to Verification"
                testID="purrivacy.mfa.setup.enable"
                onPress={handleVerifyCode}
                style={styles.continueButton}
                loading={isLoading}
                disabled={isLoading}
            />
        </ScreenContainer >
    );
};

const styles = StyleSheet.create({
    container: {
        padding: theme.spacing.md,
        gap: theme.spacing.md,
    },
    title: {
        textAlign: 'center',
        marginBottom: theme.spacing.sm,
    },
    description: {
        textAlign: 'center',
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.lg,
    },
    secretContainer: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    secretLabel: {
        marginBottom: theme.spacing.sm,
    },
    secretRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    secretTextFrame: {
        alignSelf: 'stretch',
        backgroundColor: theme.colors.surfaceMuted,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    secretTextFrameCopied: {
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.primary,
    },
    secretText: {
        fontFamily: 'monospace',
    },
    secretTextCopied: {
        color: theme.colors.primary,
    },
    secretHint: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textSecondary,
    },
    instructionTitle: {
        marginTop: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
        fontWeight: '600',
    },
    instructionsContainer: {
        backgroundColor: theme.colors.surfaceMuted,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginBottom: theme.spacing.md,
    },
    instruction: {
        marginBottom: theme.spacing.xs,
        color: theme.colors.textSecondary,
    },
    codeInput: {
        marginBottom: theme.spacing.md,
    },
    trustRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
    },
    trustTextColumn: {
        flex: 1,
    },
    trustLabel: {
        marginBottom: theme.spacing.xs,
    },
    trustHint: {
        color: theme.colors.textSecondary,
    },
    continueButton: {
        marginTop: theme.spacing.lg,
    },
    codeInputContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.lg,
    },
    singleCodeInput: {
        ...commonStyles.flex,
        minWidth: 0,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: theme.spacing.md,
    },
    verifyButton: {
        flex: 2,
    },
});
