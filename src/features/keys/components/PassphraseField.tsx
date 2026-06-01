import Clipboard from '@react-native-clipboard/clipboard';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Keyboard,
    KeyboardEvent,
    LayoutChangeEvent,
    Modal,
    Pressable,
    StyleSheet,
    Switch,
    TextInput,
    View,
} from 'react-native';

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

type PassphraseBannerMode = 'stored' | 'generate' | 'none';
type BannerPlacement = 'above' | 'below';

interface PassphraseFieldProps {
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
}

const BANNER_GAP = 14;
const POINTER_SIZE = 14;
const COMPACT_BANNER_HEIGHT = 48;
const GENERATOR_BANNER_HEIGHT = 64;
const BANNER_AUTO_DISMISS_MS = 3000;
const GENERATOR_SETTINGS_OPEN_DELAY_MS = 120;

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
}) => {
    const { user } = useAuth();
    const bannerMode: PassphraseBannerMode = explicitBannerMode ?? (doNotUseAutofill ? 'none' : 'stored');
    const [passphrase, setPassphrase] = useState('');
    const [storedPassphrase, setStoredPassphrase] = useState<string | null>(null);
    const [storageEnabled, setStorageEnabled] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [showBanner, setShowBanner] = useState(false);
    const [bannerPlacement, setBannerPlacement] = useState<BannerPlacement>('below');
    const [fieldHeight, setFieldHeight] = useState(0);
    const [inputLayout, setInputLayout] = useState({ y: 0, height: 0 });
    const [generatorSettings, setGeneratorSettings] = useState<PassphraseGeneratorSettings>(
        DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    );
    const [generatedPassphrase, setGeneratedPassphrase] = useState('');
    const [showGeneratorSettingsModal, setShowGeneratorSettingsModal] = useState(false);
    const [isBannerPinned, setIsBannerPinned] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const fieldRef = useRef<View | null>(null);
    const bannerRef = useRef<View | null>(null);
    const inputRef = useRef<TextInput | null>(null);
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
    const keyboardVisibleBottomRef = useRef<number | null>(null);
    const closingBannerRef = useRef(false);
    const generatorSettingsOpeningRef = useRef(false);
    const settingsOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bannerAutoDismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bannerAutoHiddenRef = useRef(false);
    const activeBannerTokenRef = useRef('none');
    const dismissedBannerTokenRef = useRef<string | null>(null);

    const currentValue = value !== undefined ? value : passphrase;
    currentValueRef.current = currentValue;
    onGeneratedPassphraseRef.current = onGeneratedPassphrase;
    generatorSettingsRef.current = generatorSettings;

    const bannerToken = useMemo(() => {
        if (bannerMode === 'stored') {
            return `stored:${fingerprint ?? ''}:${storedPassphrase ?? ''}:${currentValue}`;
        }

        if (bannerMode === 'generate') {
            return `generate:${fingerprint ?? ''}:${generatedPassphrase}`;
        }

        return 'none';
    }, [bannerMode, currentValue, fingerprint, generatedPassphrase, storedPassphrase]);
    activeBannerTokenRef.current = bannerToken;

    const estimatedBannerHeight = useMemo(() => {
        if (bannerMode === 'generate') {
            return GENERATOR_BANNER_HEIGHT;
        }
        return COMPACT_BANNER_HEIGHT;
    }, [bannerMode]);

    const markBannerInteraction = useCallback(() => {
        bannerInteractionRef.current = true;
        setIsBannerPinned(true);
        suppressNextPassphraseBannerDismiss();
        setTimeout(() => {
            bannerInteractionRef.current = false;
        }, 250);
    }, []);

    const commitPassphrase = useCallback((nextPassphrase: string) => {
        if (value === undefined) {
            setPassphrase(nextPassphrase);
        }
        onPassphraseChange?.(nextPassphrase);
    }, [onPassphraseChange, value]);

    useEffect(() => {
        commitPassphraseRef.current = commitPassphrase;
    }, [commitPassphrase]);

    const updateBannerPlacement = useCallback((force = false) => {
        if ((closingBannerRef.current && !force) || (!force && !showBanner)) return;

        requestAnimationFrame(() => {
            fieldRef.current?.measureInWindow((_x, y, _width, height) => {
                setFieldHeight(height);
                const inputTop = y + inputLayout.y;
                const inputHeight = inputLayout.height || height;
                const inputBottom = inputTop + inputHeight;
                const windowHeight = Dimensions.get('window').height;
                const visibleBottom = keyboardVisibleBottomRef.current ?? windowHeight;
                const spaceBelow = visibleBottom - inputBottom;
                const spaceAbove = inputTop;
                const shouldPlaceAbove = spaceBelow < estimatedBannerHeight + theme.spacing.lg
                    && spaceAbove > spaceBelow;
                setBannerPlacement(shouldPlaceAbove ? 'above' : 'below');
            });
        });
    }, [estimatedBannerHeight, inputLayout.height, inputLayout.y, showBanner]);

    useEffect(() => {
        const handleKeyboardShow = (event: KeyboardEvent) => {
            keyboardVisibleBottomRef.current = event.endCoordinates.screenY;
            updateBannerPlacement();
        };
        const handleKeyboardHide = () => {
            keyboardVisibleBottomRef.current = null;
            updateBannerPlacement();
        };

        const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
        const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, [updateBannerPlacement]);

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
            setStoredPassphrase(null);
            setShowGeneratorSettingsModal(false);
            setIsBannerPinned(false);
            storedDefaultAppliedRef.current = false;
            userEditedRef.current = false;

            if (hadPreviousFingerprint && value === undefined) {
                commitPassphrase('');
            }
            previousFingerprintRef.current = fingerprint;
        }
    }, [commitPassphrase, fingerprint, value]);

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

    const restoreAutoHiddenBanner = useCallback(() => {
        if (!bannerAutoHiddenRef.current) return;

        bannerAutoHiddenRef.current = false;
        bannerRef.current?.setNativeProps({ style: { display: 'flex' } });
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
        }).start();
        updateBannerPlacement(true);
    }, [fadeAnim, updateBannerPlacement]);

    useEffect(() => {
        const shouldShowStoredBanner = bannerMode === 'stored'
            && isFocused
            && storageEnabled
            && Boolean(storedPassphrase)
            && currentValue !== storedPassphrase;
        const shouldShowGenerateBanner = bannerMode === 'generate'
            && (isFocused || showGeneratorSettingsModal || isBannerPinned);
        const shouldShow = shouldShowStoredBanner || shouldShowGenerateBanner;
        const wasDismissed = dismissedBannerTokenRef.current === bannerToken;
        const nextShowBanner = shouldShow && (!wasDismissed || showGeneratorSettingsModal);

        if (nextShowBanner) {
            if (showBanner) {
                restoreAutoHiddenBanner();
            } else {
                setShowBanner(true);
            }
            return;
        }

        if (showBanner) {
            setShowBanner(false);
        }
    }, [bannerMode, bannerToken, currentValue, isBannerPinned, isFocused, restoreAutoHiddenBanner, showBanner, showGeneratorSettingsModal, storageEnabled, storedPassphrase]);

    useEffect(() => {
        if (showBanner) {
            bannerAutoHiddenRef.current = false;
            bannerRef.current?.setNativeProps({ style: { display: 'flex' } });
        }

        Animated.timing(fadeAnim, {
            toValue: showBanner ? 1 : 0,
            duration: showBanner ? 180 : 120,
            useNativeDriver: true,
        }).start();

        if (showBanner) {
            closingBannerRef.current = false;
            updateBannerPlacement(true);
        }
    }, [fadeAnim, showBanner, updateBannerPlacement]);

    const handleFieldLayout = (event: LayoutChangeEvent) => {
        setFieldHeight(event.nativeEvent.layout.height);
        if (!closingBannerRef.current) {
            updateBannerPlacement(true);
        }
    };

    const handleInputLayout = (layout: { y: number; height: number }) => {
        setInputLayout(layout);
        if (!closingBannerRef.current) {
            updateBannerPlacement(true);
        }
    };

    const dismissBanner = useCallback(() => {
        dismissedBannerTokenRef.current = activeBannerTokenRef.current;
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
            settingsOpenTimeoutRef.current = null;
        }
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }

        closingBannerRef.current = true;
        generatorSettingsOpeningRef.current = false;
        setShowBanner(false);
        setIsBannerPinned(false);
        setShowGeneratorSettingsModal(false);
        setIsFocused(false);
        inputRef.current?.blur();
        setTimeout(() => {
            closingBannerRef.current = false;
        }, 180);
    }, []);

    const autoHideBanner = useCallback(() => {
        dismissedBannerTokenRef.current = activeBannerTokenRef.current;
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
            bannerAutoDismissTimeoutRef.current = null;
        }
        bannerAutoHiddenRef.current = true;
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 120,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished && bannerAutoHiddenRef.current) {
                bannerRef.current?.setNativeProps({ style: { display: 'none' } });
            }
        });
    }, [fadeAnim]);

    useEffect(() => subscribePassphraseBannerDismiss(() => {
        if (showGeneratorSettingsModal) return;
        dismissBanner();
    }), [dismissBanner, showGeneratorSettingsModal]);

    useEffect(() => () => {
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
        }
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
        }
    }, []);

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
        updateBannerPlacement(true);

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

        setIsFocused(false);
        setIsBannerPinned(false);
    };

    const handleChangeText = (text: string) => {
        userEditedRef.current = true;
        commitPassphrase(text);
    };

    const handleAutofill = () => {
        if (!storedPassphrase) return;
        commitPassphrase(storedPassphrase);
        dismissBanner();
    };

    const applyGeneratedPassphrase = () => {
        if (!generatedPassphrase) return;
        userEditedRef.current = true;
        onGeneratedPassphrase?.(generatedPassphrase);
        if (!onGeneratedPassphrase) {
            commitPassphrase(generatedPassphrase);
        }
    };

    const handleGeneratedBannerPress = () => {
        applyGeneratedPassphrase();
        dismissBanner();
    };

    const handleCopyGeneratedPassphrase = () => {
        if (!generatedPassphrase) return;
        markBannerInteraction();
        Clipboard.setString(generatedPassphrase);
    };

    const openGeneratorSettings = () => {
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
    };

    const updateGeneratorSettings = async (nextSettings: PassphraseGeneratorSettings) => {
        const normalized = normalizePassphraseGeneratorSettings(nextSettings);
        setGeneratorSettings(normalized);
        try {
            const saved = await securityService.setPassphraseGeneratorSettings(normalized);
            setGeneratorSettings(saved);
            await regeneratePassphrase(saved, true);
            updateBannerPlacement(true);
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

    const inputTopOffset = inputLayout.y;
    const inputHeight = inputLayout.height || 44;
    const inputBottomOffset = inputTopOffset + inputHeight;
    const bannerPositionStyle = bannerPlacement === 'above'
        ? { bottom: Math.max(0, fieldHeight - inputTopOffset + BANNER_GAP) }
        : { top: inputBottomOffset + BANNER_GAP };

    return (
        <View
            style={[styles.container, showBanner && styles.containerWithBanner]}
            ref={fieldRef}
            onLayout={handleFieldLayout}
            collapsable={false}
        >
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
                onInputLayout={handleInputLayout}
                onInputTouchStart={suppressNextPassphraseBannerDismiss}
            />

            <Animated.View
                ref={bannerRef}
                pointerEvents={showBanner ? 'auto' : 'none'}
                style={[
                    styles.banner,
                    bannerPlacement === 'above' ? styles.bannerAbove : styles.bannerBelow,
                    bannerPositionStyle,
                    { opacity: fadeAnim },
                ]}
            >
                <View
                    style={[
                        styles.bannerPointer,
                        bannerPlacement === 'above' ? styles.bannerPointerAbove : styles.bannerPointerBelow,
                    ]}
                />

                {bannerMode === 'stored' ? (
                    <Pressable
                        onPress={handleAutofill}
                        style={styles.autofillContent}
                        accessibilityRole="button"
                        accessibilityLabel="Autofill passphrase"
                    >
                        <View style={styles.autofillIcon}>
                            <Icon name="vpn-key" size={18} color={theme.colors.text} />
                        </View>
                        <CustomText style={styles.autofillText} numberOfLines={1}>
                            Autofill passphrase
                        </CustomText>
                    </Pressable>
                ) : null}

                {bannerMode === 'generate' ? (
                    <Pressable
                        onPress={handleGeneratedBannerPress}
                        style={styles.generatorContent}
                        accessibilityRole="button"
                        accessibilityLabel="Use generated passphrase"
                    >
                        <View style={styles.generatedTextColumn}>
                            <CustomText style={styles.generatorTitle} numberOfLines={1}>
                                Generated passphrase
                            </CustomText>
                            <CustomText
                                style={styles.generatedPassphrase}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                            >
                                {generatedPassphrase || 'Generating...'}
                            </CustomText>
                        </View>

                        <View style={styles.generatorActions}>
                            <Pressable
                                onPressIn={markBannerInteraction}
                                onPress={(event) => {
                                    event.stopPropagation();
                                    openGeneratorSettings();
                                }}
                                style={styles.bannerIconButton}
                                accessibilityRole="button"
                                accessibilityLabel="Generated passphrase settings"
                                hitSlop={8}
                            >
                                <Icon name="edit" size={18} color={theme.colors.primary} />
                            </Pressable>
                            <Pressable
                                onPressIn={markBannerInteraction}
                                onPress={(event) => {
                                    event.stopPropagation();
                                    handleCopyGeneratedPassphrase();
                                }}
                                style={styles.bannerIconButton}
                                accessibilityRole="button"
                                accessibilityLabel="Copy generated passphrase"
                                hitSlop={8}
                            >
                                <Icon name="content-copy" size={18} color={theme.colors.primary} />
                            </Pressable>
                        </View>
                    </Pressable>
                ) : null}
            </Animated.View>
            <PassphraseGeneratorSettingsModal
                visible={showGeneratorSettingsModal}
                settings={generatorSettings}
                onClose={closeGeneratorSettings}
                onInteract={markBannerInteraction}
                onAdjustLength={adjustGeneratorLength}
                onSettingsChange={updateGeneratorSettings}
            />
        </View>
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
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        styles.modalBackdrop,
                        { opacity: overlayOpacity },
                    ]}
                />
                <Pressable
                    style={[StyleSheet.absoluteFill, styles.modalBackdropTarget]}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close generated passphrase settings"
                />
                <Animated.View
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
        position: 'relative',
        zIndex: 1,
    },
    containerWithBanner: {
        zIndex: 40,
    },
    banner: {
        backgroundColor: 'rgba(55, 29, 72, 0.98)',
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        elevation: 12,
        left: 0,
        position: 'absolute',
        right: 0,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
        zIndex: 1000,
    },
    bannerAbove: {},
    bannerBelow: {},
    bannerPointer: {
        backgroundColor: 'rgba(55, 29, 72, 0.98)',
        borderColor: theme.colors.primary,
        height: POINTER_SIZE,
        left: '50%',
        marginLeft: -(POINTER_SIZE / 2),
        position: 'absolute',
        transform: [{ rotate: '45deg' }],
        width: POINTER_SIZE,
    },
    bannerPointerBelow: {
        borderLeftWidth: 1,
        borderTopWidth: 1,
        top: -(POINTER_SIZE / 2 + 1),
    },
    bannerPointerAbove: {
        borderBottomWidth: 1,
        borderRightWidth: 1,
        bottom: -(POINTER_SIZE / 2 + 1),
    },
    autofillContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: COMPACT_BANNER_HEIGHT,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    autofillIcon: {
        alignItems: 'center',
        backgroundColor: 'rgba(18, 18, 18, 0.32)',
        borderRadius: 999,
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
    autofillText: {
        color: theme.colors.text,
        flex: 1,
        fontSize: theme.typography.body.fontSize,
        fontWeight: '700',
        lineHeight: 20,
    },
    generatorContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: GENERATOR_BANNER_HEIGHT,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
    },
    generatedTextColumn: {
        flex: 1,
        minWidth: 0,
    },
    generatorTitle: {
        color: theme.colors.primary,
        fontSize: theme.typography.caption.fontSize,
        fontWeight: '700',
        lineHeight: 16,
    },
    generatedPassphrase: {
        color: theme.colors.text,
        fontSize: theme.typography.label.fontSize,
        lineHeight: 18,
        marginTop: 2,
    },
    generatorActions: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        justifyContent: 'flex-end',
        flexShrink: 0,
    },
    bannerIconButton: {
        alignItems: 'center',
        borderRadius: 999,
        height: 34,
        justifyContent: 'center',
        width: 34,
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
        justifyContent: 'space-between',
        gap: theme.spacing.md,
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
