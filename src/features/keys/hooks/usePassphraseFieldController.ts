import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import {
    subscribePassphraseBannerDismiss,
    suppressNextPassphraseBannerDismiss,
} from '../../../services/passphraseBannerEvents';
import { logger } from '../../../utils/logger';
import { useAuth } from '../../auth/state/AuthContext';
import { securityService } from '../../security/services/securityService';
import {
    DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    normalizePassphraseGeneratorSettings,
} from '../../security/services/passphraseGeneratorSettings';
import type { PassphraseGeneratorSettings } from '../../security/services/passphraseGeneratorSettings';
import { usePassphraseBannerOverlay } from '../components/PassphraseBannerOverlay';

export type PassphraseBannerMode = 'stored' | 'generate' | 'none';

type UsePassphraseFieldControllerParams = {
    bannerMode?: PassphraseBannerMode;
    doNotUseAutofill?: boolean;
    fingerprint?: string;
    onGeneratedPassphrase?: (passphrase: string) => void;
    onPassphraseChange?: (passphrase: string) => void;
    testID?: string;
    value?: string;
};

type UsePassphraseFieldControllerResult = {
    currentValue: string;
    generatorSettings: PassphraseGeneratorSettings;
    handleBlur: () => void;
    handleChangeText: (text: string) => void;
    handleFocus: () => void;
    handleInputWrapperRef: (node: View | null) => void;
    inputRef: RefObject<TextInput | null>;
    markBannerInteraction: () => void;
    onInputTouchStart: () => void;
    showGeneratorSettingsModal: boolean;
    adjustGeneratorLength: (delta: number) => void;
    closeGeneratorSettings: () => void;
    updateGeneratorSettings: (settings: PassphraseGeneratorSettings) => Promise<void>;
};

const BANNER_AUTO_DISMISS_MS = 3000;
const GENERATOR_SETTINGS_OPEN_DELAY_MS = 120;
const BANNER_FOCUS_SETTLE_MS = 820;

export function usePassphraseFieldController({
    bannerMode: explicitBannerMode,
    doNotUseAutofill,
    fingerprint,
    onGeneratedPassphrase,
    onPassphraseChange,
    testID,
    value,
}: UsePassphraseFieldControllerParams): UsePassphraseFieldControllerResult {
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
        isFocused,
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

    const handleInputWrapperRef = useCallback((node: View | null) => {
        inputAnchorRef.current = node;
    }, []);

    return {
        currentValue,
        generatorSettings,
        handleBlur,
        handleChangeText,
        handleFocus,
        handleInputWrapperRef,
        inputRef,
        markBannerInteraction,
        onInputTouchStart: suppressNextPassphraseBannerDismiss,
        showGeneratorSettingsModal,
        adjustGeneratorLength,
        closeGeneratorSettings,
        updateGeneratorSettings,
    };
}
