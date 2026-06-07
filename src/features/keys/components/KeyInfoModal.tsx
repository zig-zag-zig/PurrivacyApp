import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { CustomText } from '../../../components/CustomText';
import { KeyPair } from '../../../types/types';
import { theme } from '../../../styles/theme';
import * as Clipboard from 'expo-clipboard';
import { useToast } from '../../../app/state/ToastContext';
import { SUCCESS_MESSAGES } from '../../../utils/errorHandling';
import { ModalToastHost } from '../../../components/ModalToastHost';

interface KeyInfoModalProps {
    visible: boolean;
    keyPair: KeyPair | null;
    onClose: () => void;
}

export const KeyInfoModal: React.FC<KeyInfoModalProps> = ({
    visible,
    keyPair,
    onClose,
}) => {
    const { showToast } = useToast();
    const [copied, setCopied] = useState(false);
    const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (copyFeedbackTimeoutRef.current) {
            clearTimeout(copyFeedbackTimeoutRef.current);
        }
    }, []);

    const handleCopyPublicKey = () => {
        const publicKey = keyPair?.publicKey;
        if (publicKey) {
            void Clipboard.setStringAsync(publicKey);
            setCopied(true);
            if (copyFeedbackTimeoutRef.current) {
                clearTimeout(copyFeedbackTimeoutRef.current);
            }
            copyFeedbackTimeoutRef.current = setTimeout(() => {
                setCopied(false);
                copyFeedbackTimeoutRef.current = null;
            }, 1600);
            showToast(SUCCESS_MESSAGES.PUBLIC_KEY_COPIED, 'success');
        }
    };

    if (!keyPair) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.centeringContainer}>
                    <View style={styles.modalContent}>
                        <ScrollView style={styles.contentScroll}>
                            <View style={styles.section}>
                                <CustomText style={styles.sectionTitle}>User ID</CustomText>
                                <CustomText style={styles.sectionValue}>{keyPair.userId.trim() || '—'}</CustomText>
                            </View>

                            <View style={styles.section}>
                                <CustomText style={styles.sectionTitle}>Fingerprint</CustomText>
                                <CustomText style={styles.sectionValue}>{keyPair.fingerprint.trim() || '—'}</CustomText>
                            </View>

                            <View style={styles.section}>
                                <CustomText style={styles.sectionTitle}>Algorithm</CustomText>
                                <CustomText style={styles.sectionValue}>{keyPair.algorithm.trim() || '—'}</CustomText>
                            </View>

                            {keyPair.bitStrength && (
                                <View style={styles.section}>
                                    <CustomText style={styles.sectionTitle}>Bit Strength</CustomText>
                                    <CustomText style={styles.sectionValue}>{keyPair.bitStrength} bits</CustomText>
                                </View>
                            )}

                            {keyPair.curve && (
                                <View style={styles.section}>
                                    <CustomText style={styles.sectionTitle}>Curve</CustomText>
                                    <CustomText style={styles.sectionValue}>{keyPair.curve.trim()}</CustomText>
                                </View>
                            )}

                            <View style={styles.section}>
                                <CustomText style={styles.sectionTitle}>Expiry</CustomText>
                                <CustomText style={styles.sectionValue}>{keyPair.expiry.trim() || 'Never'}</CustomText>
                            </View>

                            <View style={styles.section}>
                                <CustomText style={styles.sectionTitle}>Public Key</CustomText>
                                <TouchableOpacity onLongPress={handleCopyPublicKey} delayLongPress={500} activeOpacity={0.7}>
                                    <CustomText
                                        selectable={false}
                                        contextMenuHidden={true}
                                        style={[styles.publicKey, copied && styles.publicKeyCopied]}
                                    >
                                        {keyPair.publicKey || '—'}
                                    </CustomText>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </View>
            <ModalToastHost />
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    centeringContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        width: '100%',
        maxHeight: '80%',
        padding: theme.spacing.lg,
    },
    contentScroll: {
        flexGrow: 1,
        marginBottom: theme.spacing.md,
    },
    section: {
        marginBottom: theme.spacing.md,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    sectionValue: {
        fontSize: 16,
        color: theme.colors.text,
        lineHeight: 22,
    },
    publicKey: {
        fontSize: 12,
        fontFamily: 'monospace',
        backgroundColor: theme.colors.background,
        padding: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        marginTop: 4,
        color: theme.colors.text,
    },
    publicKeyCopied: {
        backgroundColor: 'rgba(187, 134, 252, 0.12)',
    },
});
