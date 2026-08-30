import Icon from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Modal,
    Pressable,
    StyleSheet,
    Switch,
    View,
} from 'react-native';

import { CustomText } from '../../../components/CustomText';
import {
    PASSPHRASE_MAX_LENGTH,
    PASSPHRASE_MIN_LENGTH,
} from '../../../config/inputLimits';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import type { PassphraseGeneratorSettings } from '../../security/services/passphraseGeneratorSettings';

type PassphraseGeneratorSettingsModalProps = {
    visible: boolean;
    settings: PassphraseGeneratorSettings;
    onClose: () => void;
    onInteract: () => void;
    onAdjustLength: (delta: number) => void;
    onSettingsChange: (settings: PassphraseGeneratorSettings) => void | Promise<void>;
};

export const PassphraseGeneratorSettingsModal = ({
    visible,
    settings,
    onClose,
    onInteract,
    onAdjustLength,
    onSettingsChange,
}: PassphraseGeneratorSettingsModalProps) => {
    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const dialogOpacity = useRef(new Animated.Value(0)).current;
    const dialogScale = useRef(new Animated.Value(0.96)).current;

    useEffect(() => {
        if (!visible) return;

        overlayOpacity.setValue(0);
        dialogOpacity.setValue(0);
        dialogScale.setValue(0.96);
        Animated.parallel([
            Animated.timing(overlayOpacity, {
                toValue: 1,
                duration: 150,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(dialogOpacity, {
                toValue: 1,
                duration: 170,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.spring(dialogScale, {
                toValue: 1,
                damping: 18,
                stiffness: 220,
                mass: 0.8,
                useNativeDriver: true,
            }),
        ]).start();
    }, [dialogOpacity, dialogScale, overlayOpacity, visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <Pressable
                    style={[StyleSheet.absoluteFill, styles.modalBackdropTarget]}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close generated passphrase settings"
                >
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            styles.modalBackdrop,
                            { opacity: overlayOpacity },
                        ]}
                    />
                </Pressable>
                <Animated.View
                    onStartShouldSetResponder={() => true}
                    onTouchStart={onInteract}
                    style={[
                        styles.settingsDialog,
                        {
                            opacity: dialogOpacity,
                            transform: [{ scale: dialogScale }],
                        },
                    ]}
                >
                    <View style={styles.settingsHeader}>
                        <CustomText style={styles.settingsTitle}>Generator</CustomText>
                        <Pressable
                            onPress={onClose}
                            style={styles.modalCloseButton}
                            accessibilityRole="button"
                            accessibilityLabel="Close generated passphrase settings"
                            hitSlop={8}
                        >
                            <Icon name="close" size={20} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>

                    <View style={styles.lengthRow}>
                        <CustomText style={styles.settingLabel}>Length</CustomText>
                        <View style={styles.stepper}>
                            <Pressable
                                onPress={() => onAdjustLength(-1)}
                                style={[
                                    styles.stepperButton,
                                    settings.length <= PASSPHRASE_MIN_LENGTH && styles.stepperButtonDisabled,
                                ]}
                                disabled={settings.length <= PASSPHRASE_MIN_LENGTH}
                                accessibilityRole="button"
                                accessibilityLabel="Shorter generated passphrase"
                            >
                                <Icon name="remove" size={18} color={theme.colors.primary} />
                            </Pressable>
                            <CustomText style={styles.lengthValue} numberOfLines={1}>
                                {settings.length} chars
                            </CustomText>
                            <Pressable
                                onPress={() => onAdjustLength(1)}
                                style={[
                                    styles.stepperButton,
                                    settings.length >= PASSPHRASE_MAX_LENGTH && styles.stepperButtonDisabled,
                                ]}
                                disabled={settings.length >= PASSPHRASE_MAX_LENGTH}
                                accessibilityRole="button"
                                accessibilityLabel="Longer generated passphrase"
                            >
                                <Icon name="add" size={18} color={theme.colors.primary} />
                            </Pressable>
                        </View>
                    </View>

                    <GeneratorSwitch
                        label="Capital letters"
                        value={settings.includeUppercase}
                        onValueChange={includeUppercase => {
                            void onSettingsChange({ ...settings, includeUppercase });
                        }}
                    />
                    <GeneratorSwitch
                        label="Numbers"
                        value={settings.includeNumbers}
                        onValueChange={includeNumbers => {
                            void onSettingsChange({ ...settings, includeNumbers });
                        }}
                    />
                    <GeneratorSwitch
                        label="Special signs"
                        value={settings.includeSymbols}
                        onValueChange={includeSymbols => {
                            void onSettingsChange({ ...settings, includeSymbols });
                        }}
                    />
                </Animated.View>
            </View>
        </Modal>
    );
};

type GeneratorSwitchProps = {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
};

const GeneratorSwitch = ({
    label,
    value,
    onValueChange,
}: GeneratorSwitchProps) => (
    <View style={styles.switchRow}>
        <CustomText style={styles.settingLabel}>{label}</CustomText>
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: theme.colors.divider, true: theme.colors.primary }}
            thumbColor={theme.colors.surface}
        />
    </View>
);

const styles = StyleSheet.create({
    modalOverlay: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
        padding: theme.spacing.lg,
    },
    modalBackdrop: {
        backgroundColor: 'rgba(0,0,0,0.62)',
    },
    modalBackdropTarget: {
        zIndex: 1,
    },
    settingsDialog: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        gap: theme.spacing.md,
        maxWidth: 380,
        padding: theme.spacing.lg,
        position: 'relative',
        width: '100%',
        zIndex: 2,
        ...theme.elevation.high,
    },
    settingsHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    settingsTitle: {
        ...commonStyles.textTitle,
        fontWeight: '700',
    },
    modalCloseButton: {
        alignItems: 'center',
        borderRadius: 999,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    lengthRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        justifyContent: 'space-between',
    },
    settingLabel: {
        color: theme.colors.text,
        fontSize: theme.typography.label.fontSize,
        fontWeight: '600',
    },
    stepper: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.xs,
    },
    stepperButton: {
        alignItems: 'center',
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.sm,
        borderWidth: 1,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    stepperButtonDisabled: {
        opacity: 0.45,
    },
    lengthValue: {
        color: theme.colors.text,
        fontSize: theme.typography.label.fontSize,
        minWidth: 72,
        textAlign: 'center',
    },
    switchRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 34,
    },
});
