import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { useToast } from '../../../app/state/ToastContext';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { ModalToastHost } from '../../../components/ModalToastHost';
import { TotpInput } from './TotpInput';
import { RecoveryCodeInput } from './RecoveryCodeInput';
import { useTotpInput } from '../hooks/useTotpInput';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { theme } from '../../../styles/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type MfaModalOptions = {
    isSensitive?: boolean;
    isLoginFlow?: boolean;
    message?: string;
};

interface MfaModalProps extends MfaModalOptions {
    onClose: () => void;
    onComplete: (code: string) => void;
    triggerClear: boolean;
    setTriggerClear: React.Dispatch<React.SetStateAction<boolean>>;
}

const TOTP_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 12;

export const MfaModal: React.FC<MfaModalProps> = ({
    onClose,
    onComplete,
    isLoginFlow,
    isSensitive,
    message,
    triggerClear,
    setTriggerClear,
}) => {
    const insets = useSafeAreaInsets();
    const [totpCode, setTotpCode] = useState<string[]>(Array(TOTP_LENGTH).fill(''));
    const [recoveryCode, setRecoveryCode] = useState('');
    const [isRecoveryCode, setIsRecoveryCode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const { showToast } = useToast();
    const {
        totpInputRef,
        pasteFromClipboard,
        handleTotpChangeText,
        focusInput,
        focusOnFirstBox,
    } = useTotpInput();

    // Clear code and reset state
    const clearCode = useCallback(() => {
        setTotpCode(Array(TOTP_LENGTH).fill(''));
        setRecoveryCode('');
        setLoading(false);
        if (!isRecoveryCode) {
            setFocusedIndex(0);
            focusOnFirstBox();
        }
    }, [isRecoveryCode, focusOnFirstBox]);

    // Handle trigger clear from context
    useEffect(() => {
        if (triggerClear) {
            clearCode();
            setTriggerClear(false);
        }
    }, [triggerClear, clearCode, setTriggerClear]);

    // Focus management on code type toggle
    useEffect(() => {
        if (!isRecoveryCode) {
            setFocusedIndex(0);
            focusOnFirstBox();
        }
    }, [isRecoveryCode, focusOnFirstBox]);

    // Handle TOTP submission
    const handleSubmitTotp = useCallback((fullCode: string) => {
        setLoading(true);
        onComplete(fullCode);
    }, [onComplete]);

    // Auto-submit TOTP when all digits are filled
    useEffect(() => {
        if (totpCode.every(c => c !== '') && !loading && !isRecoveryCode) {
            handleSubmitTotp(totpCode.join(''));
        }
    }, [totpCode, loading, isRecoveryCode, handleSubmitTotp]);

    // Handle recovery code submission
    const handleSubmitRecoveryCode = useCallback(() => {
        if (recoveryCode.length === RECOVERY_CODE_LENGTH) {
            setLoading(true);
            onComplete(recoveryCode);
        } else {
            showToast('Recovery code must be 12 characters', 'error');
        }
    }, [recoveryCode, onComplete, showToast]);

    // Toggle between TOTP and recovery code input
    const toggleRecoveryCode = useCallback(() => {
        setIsRecoveryCode(!isRecoveryCode);
        clearCode();
        setFocusedIndex(null);
    }, [isRecoveryCode, clearCode]);

    // Paste from clipboard
    const handlePaste = useCallback(async () => {
        const pastedCode = await pasteFromClipboard();
        if (pastedCode.length > 0) {
            setTotpCode(pastedCode);
            setFocusedIndex(TOTP_LENGTH - 1);
            focusInput();
        }
    }, [focusInput, pasteFromClipboard]);

    const showRecoveryCodeOption = isSensitive || isLoginFlow;

    return (
        <Modal
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <ScreenContainer
                    contentContainerStyle={[
                        styles.modalContent,
                        { paddingTop: Math.max(theme.spacing.xl, insets.top + theme.spacing.lg) },
                    ]}
                >
                    <CustomText style={styles.mfaModalMessage}>
                        {message || (isRecoveryCode
                            ? 'Enter your 12‑character alphanumeric recovery code'
                            : 'Enter the 6‑digit code from your authenticator app')}
                    </CustomText>

                    {isRecoveryCode ? (
                        <RecoveryCodeInput
                            value={recoveryCode}
                            onChange={setRecoveryCode}
                            onSubmit={handleSubmitRecoveryCode}
                            loading={loading}
                        />
                    ) : (
                        <TotpInput
                            code={totpCode}
                            focusedIndex={focusedIndex}
                            loading={loading}
                            inputRef={totpInputRef}
                            onChangeText={(text) =>
                                handleTotpChangeText(text, setTotpCode, setFocusedIndex)
                            }
                            onFocus={() => setFocusedIndex((index) => index ?? 0)}
                            onBlur={() => setFocusedIndex(null)}
                            onBoxPress={(index) => {
                                setFocusedIndex(index);
                                focusInput();
                            }}
                            onLongPress={handlePaste}
                        />
                    )}

                    {showRecoveryCodeOption && (
                        <Button
                            label={isRecoveryCode ? 'TOTP Code' : 'Recovery Code'}
                            onPress={toggleRecoveryCode}
                            variant="secondary"
                            style={styles.secondaryButton}
                            disabled={loading}
                        />
                    )}
                </ScreenContainer>
            </View>
            <ModalToastHost />
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    modalContent: {
        paddingBottom: theme.spacing.xl,
    },
    mfaModalMessage: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: theme.spacing.lg,
        color: theme.colors.textSecondary,
        flexWrap: 'wrap',
        flexShrink: 1,
    },
    secondaryButton: {
        marginBottom: theme.spacing.lg,
    },
});
