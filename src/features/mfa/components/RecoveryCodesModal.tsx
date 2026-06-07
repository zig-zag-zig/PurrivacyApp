import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { useToast } from '../../../app/state/ToastContext';
import { theme } from '../../../styles/theme';
import { commonStyles } from '../../../styles/commonStyles';
import { Button } from '../../../components/Button';
import { CustomText } from '../../../components/CustomText';
import { ModalToastHost } from '../../../components/ModalToastHost';
import * as Clipboard from 'expo-clipboard';
import Icon from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '../../../components/ScreenContainer';

export type RecoveryCodesModalOptions = {
    recoveryCodes: string[];
    source: 'setup' | 'regenerate' | 'auto-generated';
};

interface RecoveryCodesModalProps extends RecoveryCodesModalOptions {
    onComplete: () => void;
}

export const RecoveryCodesModal: React.FC<RecoveryCodesModalProps> = ({
    onComplete,
    recoveryCodes,
    source,
}) => {
    const [copied, setCopied] = useState(false);
    const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false);
    const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { showToast } = useToast();

    useEffect(() => () => {
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
    }, []);

    const copyAllCodes = () => {
        const allCodes = recoveryCodes.join('\n');
        void Clipboard.setStringAsync(allCodes);
        setCopied(true);
        setCopyFeedbackVisible(true);
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
        copyFeedbackTimeoutRef.current = setTimeout(() => {
            setCopyFeedbackVisible(false);
            copyFeedbackTimeoutRef.current = null;
        }, 1600);
        showToast('All recovery codes copied to clipboard', 'success');
    };

    const getSourceDescription = () => {
        switch (source) {
            case 'setup':
                return 'You are setting up Two-Factor Authentication.';
            case 'regenerate':
                return 'You have regenerated new recovery codes.';
            default:
                return 'New recovery codes have been automatically generated.';
        }
    };

    const handleClose = () => {
        if (!copied) {
            showToast('You must copy the recovery codes before closing', 'error');
            return;
        }
        onComplete();
    };

    return (
        <Modal
            transparent={false}
            animationType="slide"
            onRequestClose={() => { }}
        >
            <View style={styles.modalFullscreen}>
                <ScreenContainer>
                    <CustomText style={styles.modalMessageText}>
                        {getSourceDescription()} Save these codes in a secure location. Each code can be used once if you lose access to your authenticator app.
                    </CustomText>

                    <TouchableOpacity
                        style={[styles.codesGrid, copyFeedbackVisible && styles.codesGridCopied]}
                        activeOpacity={0.7}
                        onLongPress={copyAllCodes}
                        delayLongPress={500}
                        accessibilityLabel="Recovery codes"
                        accessibilityHint="Long press to copy all recovery codes"
                    >
                        {recoveryCodes.map((code, index) => (
                            <React.Fragment key={index}>
                                <View style={[styles.codeItem, copyFeedbackVisible && styles.codeItemCopied]}>
                                    <View style={styles.codeIndexContainer}>
                                        <CustomText style={styles.codeIndex}>
                                            {index + 1}
                                        </CustomText>
                                    </View>
                                    <CustomText
                                        style={styles.codeText}
                                        selectable={false}
                                        contextMenuHidden={true}
                                    >
                                        {code}
                                    </CustomText>
                                </View>
                            </React.Fragment>
                        ))}
                    </TouchableOpacity>

                    <CustomText style={[commonStyles.textCaption, { textAlign: 'center', color: theme.colors.textSecondary, marginBottom: theme.spacing.lg }]}>
                        Each code can be used only once. You can use them in any order.
                    </CustomText>

                    <Button
                        label={copied ? 'Done' : 'Copy codes'}
                        onPress={copied ? handleClose : copyAllCodes}
                        style={styles.closeModalButton}
                        icon={
                            <Icon
                                name={copied ? 'check' : 'content-copy'}
                                size={18}
                                color={theme.colors.onPrimary}
                            />
                        }
                    />
                </ScreenContainer>
            </View>
            <ModalToastHost />
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalFullscreen: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    modalMessageText: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: theme.spacing.lg,
        color: theme.colors.textSecondary,
    },
    codesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.lg,
        borderRadius: theme.borderRadius.md,
    },
    codesGridCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
    codeItem: {
        width: '48%',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    codeItemCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
    codeIndexContainer: {
        width: 28,
        height: 28,
        borderRadius: 999,
        backgroundColor: theme.colors.primary + '22',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.sm,
    },
    codeIndex: {
        fontSize: 12,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    codeText: {
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: 'monospace',
        color: theme.colors.text,
        flex: 1,
    },
    closeModalButton: {
        marginTop: theme.spacing.md,
    },
});
