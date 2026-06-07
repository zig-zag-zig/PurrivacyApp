import * as Clipboard from 'expo-clipboard';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Keyboard,
    Modal,
    Pressable,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from 'react-native';

import { AutofillDisabledView } from '../../../components/AutofillDisabledView';
import { InputField } from '../../../components/InputField';
import { CustomText } from '../../../components/CustomText';
import {
    PASSPHRASE_MAX_LENGTH,
    PASSPHRASE_MIN_LENGTH,
} from '../../../config/inputLimits';
import { commonStyles } from '../../../styles/commonStyles';
import { theme } from '../../../styles/theme';
import { logger } from '../../../utils/logger';
import {
    subscribePassphraseBannerDismiss,
    suppressNextPassphraseBannerDismiss,
} from '../../../services/passphraseBannerEvents';
import { useAuth } from '../../auth/state/AuthContext';
import { securityService } from '../../security/services/securityService';
import {
    DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    normalizePassphraseGeneratorSettings,
} from '../../security/services/passphraseGeneratorSettings';
import type { PassphraseGeneratorSettings } from '../../security/services/passphraseGeneratorSettings';
import { usePassphraseBannerOverlay } from './PassphraseBannerOverlay';

type PassphraseBannerMode = 'stored' | 'generate' | 'none';

export interface PassphraseFieldProps {
    fingerprint?: string;
    name?: string;
    onPassphraseChange?: (passphrase: string) => void;
    onGeneratedPassphrase?: (passphrase: string) => void;
    hidden?: boolean;
    doNotUseAutofill?: boolean;
    bannerMode?: PassphraseBannerMode;
    label?: string;
    error?: string;
    value?: string;
    helperText?: string;
    labelTopBackgroundColor?: string;
    labelBottomBackgroundColor?: string;
    testID?: string;
}

const BANNER_AUTO_DISMISS_MS = 3000;
const GENERATOR_SETTINGS_OPEN_DELAY_MS = 120;
const BANNER_FOCUS_SETTLE_MS = 820;

export const PassphraseField: React.FC<PassphraseFieldProps> = ({
    fingerprint,
    onPassphraseChange,
    onGeneratedPassphrase,
    value,
    error,
    hidden,
    doNotUseAutofill,
    bannerMode: explicitBannerMode,
    label,
    helperText,
    labelTopBackgroundColor,
    labelBottomBackgroundColor,
    testID,
}) => {
    const { user } = useAuth();
    const { hidePassphraseBanner, showPassphraseBanner } = usePassphraseBannerOverlay();
    const fieldId = useId();
    const bannerMode: PassphraseBannerMode = explicitBannerMode ?? (doNotUseAutofill ? 'none' : 'stored');
    const [passphrase, setPassphrase] = useState('');
    const [storedPassphrase, setStoredPassphrase] = useState<string | null>(null);
    const [storageEnabled, setStorageEnabled] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [showBanner, setShowBanner] = useState(false);
    const [isBannerReady, setIsBannerReady] = useState(false);
    const [generatorSettings, setGeneratorSettings] = useState<PassphraseGeneratorSettings>(
        DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    );
    const [generatedPassphrase, setGeneratedPassphrase] = useState('');
    const [showGeneratorSettingsModal, setShowGeneratorSettingsModal] = useState(false);
    const [isBannerPinned, setIsBannerPinned] = useState(false);
    const inputRef = useRef<TextInput | null>(null);
    const inputAnchorRef = useRef<View | null>(null);
    const currentValueRef = useRef('');
    const onGeneratedPassphraseRef = useRef(onGeneratedPassphrase);
    const commitPassphraseRef = useRef<(nextPassphrase: string) => void>(() => undefined);
    const generatorSettingsRef = useRef<PassphraseGeneratorSettings>(
        DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    );
    const previousFingerprintRef = useRef<string | undefined>(undefined);
    const bannerInteractionRef = useRef(false);
    const storedDefaultAppliedRef = useRef(false);
    const userEditedRef = useRef(false);
    const closingBannerRef = useRef(false);
    const generatorSettingsOpeningRef = useRef(false);
    const settingsOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bannerAutoDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bannerFocusSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bannerAutoHiddenRef = useRef(false);
    const showBannerRef = useRef(false);
    const activeBannerTokenRef = useRef('none');
    const latestBannerTokenRef = useRef('none');
    const dismissedBannerTokenRef = useRef<string | null>(null);

    const currentValue = value !== undefined ? value : passphrase;
    currentValueRef.current = currentValue;
    onGeneratedPassphraseRef.current = onGeneratedPassphrase;
    generatorSettingsRef.current = generatorSettings;
    showBannerRef.current = showBanner;

    const bannerToken = useMemo(() => {
        if (bannerMode === 'stored') {
            return `stored:${fieldId}:${fingerprint ?? ''}:${storedPassphrase ?? ''}:${currentValue}`;
        }

        if (bannerMode === 'generate') {
            return `generate:${fieldId}:${fingerprint ?? ''}:${generatedPassphrase}`;
        }

        return 'none';
    }, [bannerMode, currentValue, fieldId, fingerprint, generatedPassphrase, storedPassphrase]);
    activeBannerTokenRef.current = bannerToken;
    latestBannerTokenRef.current = bannerToken;

    const markBannerInteraction = useCallback(() => {
        bannerInteractionRef.current = true;
        setIsBannerPinned(true);
        suppressNextPassphraseBannerDismiss();
        setTimeout(() => {
            bannerInteractionRef.current = false;
        }, 250);
    }, []);

    const clearBannerFocusSettleTimeout = useCallback(() => {
        if (bannerFocusSettleTimeoutRef.current) {
            clearTimeout(bannerFocusSettleTimeoutRef.current);
            bannerFocusSettleTimeoutRef.current = null;
        }
    }, []);

    const scheduleBannerAfterFocusScroll = useCallback(() => {
        clearBannerFocusSettleTimeout();
        setIsBannerReady(false);
        bannerFocusSettleTimeoutRef.current = setTimeout(() => {
            bannerFocusSettleTimeoutRef.current = null;
            setIsBannerReady(true);
        }, BANNER_FOCUS_SETTLE_MS);
    }, [clearBannerFocusSettleTimeout]);

    const commitPassphrase = useCallback((nextPassphrase: string) => {
        if (value === undefined) {
            setPassphrase(nextPassphrase);
        }
        onPassphraseChange?.(nextPassphrase);
    }, [onPassphraseChange, value]);

    useEffect(() => {
        commitPassphraseRef.current = commitPassphrase;
    }, [commitPassphrase]);

    const loadStoredPassphrase = useCallback(async () => {
        if (bannerMode !== 'stored' || !fingerprint || !user?.uid) {
            setStorageEnabled(false);
            setStoredPassphrase(null);
            return;
        }

        try {
            const enabled = await securityService.isPassphraseStorageEnabled(user.uid);
            setStorageEnabled(enabled);

            if (!enabled) {
                setStoredPassphrase(null);
                return;
            }

            const stored = await securityService.getPassphrase(user.uid, fingerprint);
            setStoredPassphrase(stored);

            if (
                stored
                && !storedDefaultAppliedRef.current
                && !userEditedRef.current
                && currentValueRef.current.length === 0
            ) {
                commitPassphrase(stored);
            }
            storedDefaultAppliedRef.current = true;
        } catch (loadError) {
            logger.warn('passphrase autofill load failed', { error: loadError });
            setStoredPassphrase(null);
        }
    }, [bannerMode, commitPassphrase, fingerprint, user?.uid]);

    const regeneratePassphrase = useCallback(async (
        settings: PassphraseGeneratorSettings = generatorSettingsRef.current,
        applyToField = false,
    ) => {
        try {
            const generated = await securityService.generatePassphrase(settings);
            setGeneratedPassphrase(generated);

            if (applyToField) {
                onGeneratedPassphraseRef.current?.(generated);
                if (!onGeneratedPassphraseRef.current) {
                    commitPassphraseRef.current(generated);
                }
            }
        } catch (generationError) {
            logger.warn('passphrase generation failed', { error: generationError });
        }
    }, []);

    const loadGeneratorSettings = useCallback(async () => {
        if (bannerMode !== 'generate') return;

        try {
            const settings = await securityService.getPassphraseGeneratorSettings();
            setGeneratorSettings(settings);
            await regeneratePassphrase(settings);
        } catch (settingsError) {
            logger.warn('passphrase generator settings load failed', { error: settingsError });
        }
    }, [bannerMode, regeneratePassphrase]);

    useEffect(() => {
        if (previousFingerprintRef.current !== fingerprint) {
            const hadPreviousFingerprint = previousFingerprintRef.current !== undefined;
            setShowBanner(false);
            setIsBannerReady(false);
            setStoredPassphrase(null);
            setShowGeneratorSettingsModal(false);
            setIsBannerPinned(false);
            clearBannerFocusSettleTimeout();
            storedDefaultAppliedRef.current = false;
            userEditedRef.current = false;

            if (hadPreviousFingerprint && value === undefined) {
                commitPassphrase('');
            }
            previousFingerprintRef.current = fingerprint;
        }
    }, [clearBannerFocusSettleTimeout, commitPassphrase, fingerprint, value]);

    useFocusEffect(
        useCallback(() => {
            if (bannerMode !== 'stored') return undefined;
            void loadStoredPassphrase();
            return undefined;
        }, [bannerMode, loadStoredPassphrase]),
    );

    useFocusEffect(
        useCallback(() => {
            if (bannerMode !== 'generate') return undefined;
            void loadGeneratorSettings();
            return undefined;
        }, [bannerMode, loadGeneratorSettings]),
    );

    useEffect(() => {
        if (bannerMode === 'stored') {
            void loadStoredPassphrase();
        }
    }, [bannerMode, loadStoredPassphrase]);

    useEffect(() => {
        if (bannerMode === 'generate') {
            void loadGeneratorSettings();
        }
    }, [bannerMode, loadGeneratorSettings]);

    useEffect(() => {
        if (bannerMode !== 'stored' || !fingerprint || !user?.uid) return undefined;

        return securityService.subscribePassphraseStoreChanges(change => {
            if (change.userId !== user.uid) return;
            if (typeof change.storageEnabled === 'boolean') {
                setStorageEnabled(change.storageEnabled);
            }
            if (!change.fingerprint) {
                if (change.storageEnabled === false) {
                    setStoredPassphrase(null);
                }
                return;
            }
            if (change.fingerprint !== fingerprint) return;

            setStoredPassphrase(change.passphrase);
            if (!change.passphrase) return;

            if (
                !userEditedRef.current
                && (currentValueRef.current.length === 0 || currentValueRef.current === storedPassphrase)
            ) {
                commitPassphrase(change.passphrase);
                storedDefaultAppliedRef.current = true;
            }
        });
    }, [bannerMode, commitPassphrase, fingerprint, storedPassphrase, user?.uid]);

    useEffect(() => {
        const shouldShowStoredBanner = bannerMode === 'stored'
            && isFocused
            && isBannerReady
            && storageEnabled
            && Boolean(storedPassphrase)
            && currentValue !== storedPassphrase;
        const shouldShowGenerateBanner = bannerMode === 'generate'
            && ((isFocused && isBannerReady) || showGeneratorSettingsModal || isBannerPinned);
        const shouldShow = shouldShowStoredBanner || shouldShowGenerateBanner;
        const wasDismissed = dismissedBannerTokenRef.current === bannerToken;
        const nextShowBanner = shouldShow && (!wasDismissed || showGeneratorSettingsModal);

        if (nextShowBanner) {
            bannerAutoHiddenRef.current = false;
            if (!showBanner) {
                setShowBanner(true);
            }
            return;
        }

        if (showBanner) {
            setShowBanner(false);
        }
    }, [
        bannerMode,
        bannerToken,
        currentValue,
        isBannerPinned,
        isBannerReady,
        isFocused,
        showBanner,
        showGeneratorSettingsModal,
        storageEnabled,
        storedPassphrase,
    ]);

    const dismissBanner = useCallback((dismissKeyboard = true) => {
        if (!showBannerRef.current && !showGeneratorSettingsModal) return;

        dismissedBannerTokenRef.current = activeBannerTokenRef.current;
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
            settingsOpenTimeoutRef.current = null;
        }
        clearBannerFocusSettleTimeout();
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }

        closingBannerRef.current = true;
        showBannerRef.current = false;
        generatorSettingsOpeningRef.current = false;
        if (dismissKeyboard) {
            Keyboard.dismiss();
        }
        setShowBanner(false);
        setIsBannerPinned(false);
        setShowGeneratorSettingsModal(false);
        setIsBannerReady(false);
        setTimeout(() => {
            closingBannerRef.current = false;
        }, 180);
    }, [clearBannerFocusSettleTimeout, showGeneratorSettingsModal]);

    const autoHideBanner = useCallback(() => {
        dismissedBannerTokenRef.current = activeBannerTokenRef.current;
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }
        bannerAutoHiddenRef.current = true;
        showBannerRef.current = false;
        setShowBanner(false);
        setIsBannerPinned(false);
    }, []);

    useEffect(() => subscribePassphraseBannerDismiss(() => {
        if (showGeneratorSettingsModal) return;
        const passphraseInputStillFocused = inputRef.current?.isFocused?.() ?? false;
        dismissBanner(passphraseInputStillFocused);
    }), [dismissBanner, showGeneratorSettingsModal]);

    useEffect(() => () => {
        hidePassphraseBanner(latestBannerTokenRef.current);
        clearBannerFocusSettleTimeout();
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
        }
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
        }
    }, [clearBannerFocusSettleTimeout, hidePassphraseBanner]);

    useEffect(() => {
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }

        if (!showBanner || showGeneratorSettingsModal) return undefined;

        bannerAutoDismissTimeoutRef.current = setTimeout(() => {
            autoHideBanner();
        }, BANNER_AUTO_DISMISS_MS);

        return () => {
            if (bannerAutoDismissTimeoutRef.current) {
                clearTimeout(bannerAutoDismissTimeoutRef.current);
                bannerAutoDismissTimeoutRef.current = null;
            }
        };
    }, [autoHideBanner, bannerToken, showBanner, showGeneratorSettingsModal]);

    const handleFocus = () => {
        suppressNextPassphraseBannerDismiss();
        dismissedBannerTokenRef.current = null;
        closingBannerRef.current = false;
        setIsFocused(true);
        setIsBannerPinned(false);
        scheduleBannerAfterFocusScroll();

        if (bannerMode === 'stored') {
            void loadStoredPassphrase();
        }
        if (bannerMode === 'generate' && !generatedPassphrase) {
            void regeneratePassphrase();
        }
    };

    const handleBlur = () => {
        if (generatorSettingsOpeningRef.current || showGeneratorSettingsModal) {
            setIsFocused(false);
            return;
        }

        if (bannerInteractionRef.current) {
            setIsFocused(false);
            setIsBannerPinned(true);
            return;
        }

        clearBannerFocusSettleTimeout();
        setIsBannerReady(false);
        setIsFocused(false);
        setIsBannerPinned(false);
    };

    const handleChangeText = (text: string) => {
        userEditedRef.current = true;
        commitPassphrase(text);
    };

    const handleAutofill = useCallback(() => {
        if (!storedPassphrase) return;
        suppressNextPassphraseBannerDismiss();
        commitPassphrase(storedPassphrase);
        dismissBanner();
    }, [commitPassphrase, dismissBanner, storedPassphrase]);

    const applyGeneratedPassphrase = useCallback(() => {
        if (!generatedPassphrase) return;
        userEditedRef.current = true;
        onGeneratedPassphrase?.(generatedPassphrase);
        if (!onGeneratedPassphrase) {
            commitPassphrase(generatedPassphrase);
        }
    }, [commitPassphrase, generatedPassphrase, onGeneratedPassphrase]);

    const handleGeneratedBannerPress = useCallback(() => {
        suppressNextPassphraseBannerDismiss();
        applyGeneratedPassphrase();
        dismissBanner();
    }, [applyGeneratedPassphrase, dismissBanner]);

    const handleCopyGeneratedPassphrase = useCallback(() => {
        if (!generatedPassphrase) return;
        markBannerInteraction();
        void Clipboard.setStringAsync(generatedPassphrase);
    }, [generatedPassphrase, markBannerInteraction]);

    const openGeneratorSettings = useCallback(() => {
        markBannerInteraction();
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
        }
        generatorSettingsOpeningRef.current = true;
        setIsBannerPinned(true);
        Keyboard.dismiss();
        settingsOpenTimeoutRef.current = setTimeout(() => {
            settingsOpenTimeoutRef.current = null;
            setShowGeneratorSettingsModal(true);
        }, GENERATOR_SETTINGS_OPEN_DELAY_MS);
    }, [markBannerInteraction]);

    useEffect(() => {
        if (!showBanner || bannerMode === 'none' || bannerAutoHiddenRef.current) {
            hidePassphraseBanner(bannerToken);
            return undefined;
        }

        showPassphraseBanner({
            anchorRef: inputAnchorRef,
            generatedPassphrase,
            id: bannerToken,
            keyboardFallbackEnabled: isFocused && !showGeneratorSettingsModal,
            mode: bannerMode,
            onCopy: handleCopyGeneratedPassphrase,
            onOpenSettings: openGeneratorSettings,
            onUse: bannerMode === 'stored' ? handleAutofill : handleGeneratedBannerPress,
            testID,
        });

        return () => {
            hidePassphraseBanner(bannerToken);
        };
    }, [
        bannerMode,
        bannerToken,
        generatedPassphrase,
        handleAutofill,
        handleCopyGeneratedPassphrase,
        handleGeneratedBannerPress,
        hidePassphraseBanner,
        openGeneratorSettings,
        showBanner,
        showGeneratorSettingsModal,
        showPassphraseBanner,
        testID,
    ]);

    const updateGeneratorSettings = async (nextSettings: PassphraseGeneratorSettings) => {
        const normalized = normalizePassphraseGeneratorSettings(nextSettings);
        setGeneratorSettings(normalized);
        try {
            const saved = await securityService.setPassphraseGeneratorSettings(normalized);
            setGeneratorSettings(saved);
            await regeneratePassphrase(saved, true);
        } catch (settingsError) {
            logger.warn('passphrase generator settings save failed', { error: settingsError });
        }
    };

    const adjustGeneratorLength = (delta: number) => {
        void updateGeneratorSettings({
            ...generatorSettings,
            length: generatorSettings.length + delta,
        });
    };

    const closeGeneratorSettings = () => {
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
            settingsOpenTimeoutRef.current = null;
        }
        generatorSettingsOpeningRef.current = false;
        setShowGeneratorSettingsModal(false);
        setIsBannerPinned(true);
    };

    if (hidden) return null;

    return (
        <AutofillDisabledView style={styles.container}>
            <InputField
                ref={inputRef}
                value={currentValue}
                onChangeText={handleChangeText}
                onFocus={handleFocus}
                onBlur={handleBlur}
                secureTextEntry
                showToggleSecureText
                label={label}
                labelTopBackgroundColor={labelTopBackgroundColor}
                labelBottomBackgroundColor={labelBottomBackgroundColor}
                error={error}
                hidden={hidden}
                helperText={helperText}
                maxLength={PASSPHRASE_MAX_LENGTH}
                onInputWrapperRef={(node) => {
                    inputAnchorRef.current = node;
                }}
                onInputTouchStart={suppressNextPassphraseBannerDismiss}
                testID={testID}
            />
            <PassphraseGeneratorSettingsModal
                visible={showGeneratorSettingsModal}
                settings={generatorSettings}
                onClose={closeGeneratorSettings}
                onInteract={markBannerInteraction}
                onAdjustLength={adjustGeneratorLength}
                onSettingsChange={updateGeneratorSettings}
            />
        </AutofillDisabledView>
    );
};

const PassphraseGeneratorSettingsModal = ({
    visible,
    settings,
    onClose,
    onInteract,
    onAdjustLength,
    onSettingsChange,
}: {
    visible: boolean;
    settings: PassphraseGeneratorSettings;
    onClose: () => void;
    onInteract: () => void;
    onAdjustLength: (delta: number) => void;
    onSettingsChange: (settings: PassphraseGeneratorSettings) => void | Promise<void>;
}) => {
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

const GeneratorSwitch = ({
    label,
    value,
    onValueChange,
}: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
}) => (
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
    container: {
        marginBottom: theme.spacing.sm,
    },
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
