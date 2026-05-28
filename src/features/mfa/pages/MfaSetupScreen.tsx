import * as React from 'react';
import { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { Spinner } from '../../../components/Spinner';
import { useMfa } from '../state/MfaContext';
import { useToast } from '../../../app/state/ToastContext';
import { useModal } from '../../../app/state/ModalContext';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { RootNavigationProps } from '../../../app/navigation/types';

export const MfaSetupScreen = () => {
    const navigation = useNavigation<RootNavigationProps>();
    const { setupMfa, enableMfa, isLoading } = useMfa();
    const { showToast } = useToast();
    const { showRecoveryCodesModal } = useModal();

    const [setupData, setSetupData] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const copyFeedbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
            showToast('Failed to initialize MFA setup', 'error');
            navigation.goBack();
        }
    };

    const handleVerifyCode = async () => {
        try {
            await enableMfa();
            await showRecoveryCodesModal({
                recoveryCodes: setupData?.recoveryCodes || [],
                source: 'setup',
            });
            navigation.goBack();
        } catch (error: any) {
            if (error.message?.includes('cancelled') || error.message?.includes('user cancelled')) {
                showToast('MFA setup cancelled', 'info');
            } else {
                showToast(error.message || 'Failed to enable MFA', 'error');
            }
        }
    };

    const copySecretToClipboard = () => {
        if (!setupData?.secret) {
            return;
        }

        try {
            Clipboard.setString(setupData.secret);
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
        return (
            <ScreenContainer>
                <Spinner visible={true} />
            </ScreenContainer>
        );
    }

    return (
        <ScreenContainer>
            <CustomText style={[commonStyles.textTitle, styles.title]}>
                Setup Two-Factor Authentication
            </CustomText>
            <CustomText style={[commonStyles.textBody, styles.description]}>
                Copy the secret key below and enter it manually in your authenticator app (like Google Authenticator, Authy, etc.).
            </CustomText>

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
        borderRadius: theme.borderRadius.md,
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
        backgroundColor: theme.colors.background,
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.sm,
    },
    secretTextFrameCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.16)',
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
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        marginBottom: theme.spacing.md,
    },
    instruction: {
        marginBottom: theme.spacing.xs,
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
