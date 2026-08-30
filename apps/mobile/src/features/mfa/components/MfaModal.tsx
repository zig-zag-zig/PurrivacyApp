import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
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

import type { MfaModalOptions } from '../../../shared/modals/types';

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
    allowRecoveryCode,
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
    // Remembers the box the user tapped while the keyboard is re-shown, so
    // the highlight survives the blur() → focus() cycle Android needs to
    // bring the IME back after it was dismissed.
    const pendingFocusIndexRef = useRef<number | null>(null);
    // Set on touches that land inside the TOTP box area, so the modal-level
    // outside-tap handler knows the touch was on a box and skips blurring.
    const totpTouchInsideRef = useRef(false);
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
        pendingFocusIndexRef.current = null;
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
            pendingFocusIndexRef.current = TOTP_LENGTH - 1;
            setTotpCode(pastedCode);
            setFocusedIndex(TOTP_LENGTH - 1);
            focusInput();
        }
    }, [focusInput, pasteFromClipboard]);

    // Recovery codes are only offered where they can actually be used: they
    // do not exist during MFA enrollment, so the enable step is TOTP-only to
    // prove the authenticator setup with a real code.
    const showRecoveryCodeOption = allowRecoveryCode === undefined
        ? (isSensitive || isLoginFlow)
        : allowRecoveryCode;

    // Tap outside the TOTP boxes: drop focus like a regular input field
    // (clears the box highlight and dismisses the keyboard).
    const handleContentTouchStart = useCallback(() => {
        if (totpTouchInsideRef.current) {
            totpTouchInsideRef.current = false;
            return;
        }
        if (isRecoveryCode) {
            return;
        }
        pendingFocusIndexRef.current = null;
        setFocusedIndex(null);
        totpInputRef.current?.blur();
    }, [isRecoveryCode, setFocusedIndex, totpInputRef]);

    return (
        <Modal
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalContainer}>
                <ScreenContainer
                    testID="purrivacy.mfa.modal"
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        styles.modalContent,
                        { paddingTop: Math.max(theme.spacing.xl, insets.top + theme.spacing.lg) },
                    ]}
                >
                    <View onTouchStart={handleContentTouchStart} style={styles.contentTouchArea}>
                        <View style={styles.modalHeader}>
                            <View style={styles.headerIconFrame}>
                                <Icon
                                    name={isRecoveryCode ? 'key-outline' : 'shield-key-outline'}
                                    size={28}
                                    color={theme.colors.primaryStrong}
                                />
                            </View>
                            <CustomText style={styles.modalTitle}>
                                {isRecoveryCode ? 'Recovery code' : 'Two-factor verification'}
                            </CustomText>
                            <CustomText style={styles.mfaModalMessage}>
                                {message || (isRecoveryCode
                                    ? 'Enter your 12‑character alphanumeric recovery code'
                                    : 'Enter the 6‑digit code from your authenticator app')}
                            </CustomText>
                        </View>

                        <View style={styles.inputCard}>
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
                                    testID="purrivacy.mfa.code.input"
                                    onChangeText={(text) =>
                                        handleTotpChangeText(
                                            text,
                                            totpCode,
                                            focusedIndex ?? 0,
                                            setTotpCode,
                                            setFocusedIndex,
                                        )
                                    }
                                    onFocus={() => {
                                        setFocusedIndex((index) => {
                                            if (index !== null) {
                                                return index;
                                            }
                                            const pending = pendingFocusIndexRef.current;
                                            pendingFocusIndexRef.current = null;
                                            return pending ?? 0;
                                        });
                                    }}
                                    onBlur={() => {
                                        // A blur() during the keyboard-reopen
                                        // cycle must not clear the highlight;
                                        // otherwise the tapped box's border
                                        // flickers off and on.
                                        if (pendingFocusIndexRef.current !== null) {
                                            return;
                                        }
                                        setFocusedIndex(null);
                                    }}
                                    onBoxPress={(index) => {
                                        pendingFocusIndexRef.current = index;
                                        setFocusedIndex(index);
                                        focusInput();
                                    }}
                                    onLongPress={handlePaste}
                                    onTouchStart={() => {
                                        totpTouchInsideRef.current = true;
                                    }}
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
                        </View>
                    </View>
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
    contentTouchArea: {
        flex: 1,
    },
    modalHeader: {
        alignItems: 'center',
        marginBottom: theme.spacing.lg,
        paddingHorizontal: theme.spacing.md,
    },
    headerIconFrame: {
        width: 56,
        height: 56,
        borderRadius: theme.borderRadius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primaryMuted,
        borderWidth: 1,
        borderColor: `${theme.colors.primary}66`,
        marginBottom: theme.spacing.md,
    },
    modalTitle: {
        color: theme.colors.text,
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '800',
        textAlign: 'center',
    },
    mfaModalMessage: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        marginTop: theme.spacing.sm,
        flexWrap: 'wrap',
        flexShrink: 1,
    },
    inputCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.lg,
        ...theme.elevation.high,
    },
    secondaryButton: {
        marginTop: theme.spacing.md,
    },
});
