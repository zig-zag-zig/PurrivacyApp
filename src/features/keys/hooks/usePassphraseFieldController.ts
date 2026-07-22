import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import {
    subscribePassphraseBannerDismiss,
    suppressNextPassphraseBannerDismiss,
} from '../../../services/passphraseBannerEvents';
import { useAuth } from '../../auth/state/AuthContext';
import {
    DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
} from '../../security/services/passphraseGeneratorSettings';
import type { PassphraseGeneratorSettings } from '../../security/services/passphraseGeneratorSettings';
import { usePassphraseBannerOverlay } from '../components/PassphraseBannerOverlay';
import { useSecureCopy } from '../../../shared/hooks/useSecureCopy';
import { usePassphraseStorageState } from './passphrase/usePassphraseStorageState';
import { usePassphraseGeneratorSettings } from './passphrase/usePassphraseGeneratorSettings';
import { usePassphraseBannerLifecycle } from './passphrase/usePassphraseBannerLifecycle';

export type PassphraseBannerMode = 'stored' | 'generate' | 'none';

type UsePassphraseFieldControllerParams = {
    bannerMode?: PassphraseBannerMode;
    doNotUseAutofill?: boolean;
    fingerprint?: string;
    onGeneratedPassphrase?: (passphrase: string) => void;
    onPassphraseChange?: (passphrase: string) => void;
    testID?: string;
    value?: string;
    storedPassphraseValue?: string | null;
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

export function usePassphraseFieldController({
    bannerMode: explicitBannerMode,
    doNotUseAutofill,
    fingerprint,
    onGeneratedPassphrase,
    onPassphraseChange,
    testID,
    value,
    storedPassphraseValue,
}: UsePassphraseFieldControllerParams): UsePassphraseFieldControllerResult {
    const { user } = useAuth();
    const { secureCopy } = useSecureCopy();
    const { hidePassphraseBanner, showPassphraseBanner } = usePassphraseBannerOverlay();
    const fieldId = useId();

    const bannerMode: PassphraseBannerMode = explicitBannerMode ?? (doNotUseAutofill ? 'none' : 'stored');

    // ── Shared state & refs (owned by facade) ───────────────────────────
    const [passphrase, setPassphrase] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<TextInput | null>(null);
    const inputAnchorRef = useRef<View | null>(null);
    const currentValueRef = useRef('');
    const onGeneratedPassphraseRef = useRef(onGeneratedPassphrase);
    const commitPassphraseRef = useRef<(nextPassphrase: string) => void>(() => undefined);
    const previousFingerprintRef = useRef<string | undefined>(undefined);
    const userEditedRef = useRef(false);
    const storedDefaultAppliedRef = useRef(false);
    const generatorSettingsRef = useRef<PassphraseGeneratorSettings>(
        DEFAULT_PASSPHRASE_GENERATOR_SETTINGS,
    );

    const currentValue = value !== undefined ? value : passphrase;
    currentValueRef.current = currentValue;
    onGeneratedPassphraseRef.current = onGeneratedPassphrase;

    // ── commitPassphrase (shared) ───────────────────────────────────────
    const commitPassphrase = useCallback((nextPassphrase: string) => {
        if (value === undefined) {
            setPassphrase(nextPassphrase);
        }
        onPassphraseChange?.(nextPassphrase);
    }, [onPassphraseChange, value]);

    useEffect(() => {
        commitPassphraseRef.current = commitPassphrase;
    }, [commitPassphrase]);

    // ═══ Sub-module A: passphrase storage state ═════════════════════════
    const {
        storedPassphrase,
        storageEnabled,
        loadStoredPassphrase,
    } = usePassphraseStorageState({
        bannerMode,
        fingerprint,
        user,
        storedPassphraseValue,
        commitPassphraseRef,
        currentValueRef,
        userEditedRef,
        storedDefaultAppliedRef,
        previousFingerprintRef,
    });

    // ═══ Sub-module B: generator settings (called before banner module
    //      because banner lifecycle needs showGeneratorSettingsModal etc.) ══
    const {
        generatorSettings,
        generatedPassphrase,
        showGeneratorSettingsModal,
        setShowGeneratorSettingsModal,
        generatorSettingsOpeningRef,
        settingsOpenTimeoutRef,
        regeneratePassphrase,
        loadGeneratorSettings,
        updateGeneratorSettings,
        adjustGeneratorLength,
    } = usePassphraseGeneratorSettings({
        bannerMode,
        onGeneratedPassphrase,
        commitPassphraseRef,
        onGeneratedPassphraseRef,
        generatorSettingsRef,
    });

    generatorSettingsRef.current = generatorSettings;

    // ── bannerToken (computed after storage + generator modules so we can
    //      use storedPassphrase / generatedPassphrase, matching the original) ─
    const bannerToken = useMemo(() => {
        if (bannerMode === 'stored') {
            return `stored:${fieldId}:${fingerprint ?? ''}:${storedPassphrase ?? ''}:${currentValue}`;
        }

        if (bannerMode === 'generate') {
            return `generate:${fieldId}:${fingerprint ?? ''}:${generatedPassphrase}`;
        }

        return 'none';
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bannerMode, currentValue, fieldId, fingerprint, generatedPassphrase, storedPassphrase]);

    // ═══ Sub-module C: banner lifecycle ═════════════════════════════════
    const {
        showBanner,
        isBannerReady,
        isBannerPinned,
        bannerInteractionRef,
        closingBannerRef,
        showBannerRef,
        activeBannerTokenRef,
        latestBannerTokenRef,
        dismissedBannerTokenRef,
        bannerAutoHiddenRef,
        bannerAutoDismissTimeoutRef,
        bannerFocusSettleTimeoutRef,
        scheduleBannerAfterFocusScroll,
        clearBannerFocusSettleTimeout,
        markBannerInteraction,
        setIsBannerPinned,
        setShowBanner,
        setIsBannerReady,
    } = usePassphraseBannerLifecycle({
        bannerMode,
        isFocused,
        showGeneratorSettingsModal,
        storedPassphrase,
        generatedPassphrase,
        currentValue,
        bannerToken,
        storageEnabled,
    });

    // ═══ Cross-cutting: closeGeneratorSettings (banner + generator) ═════
    const closeGeneratorSettings = useCallback(() => {
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
            settingsOpenTimeoutRef.current = null;
        }
        generatorSettingsOpeningRef.current = false;
        setShowGeneratorSettingsModal(false);
        setIsBannerPinned(true);
    }, [settingsOpenTimeoutRef, generatorSettingsOpeningRef, setShowGeneratorSettingsModal, setIsBannerPinned]);

    // ═══ Cross-cutting: dismissBanner (generator + banner) ══════════════
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
        closeGeneratorSettings();
        setIsBannerReady(false);
        setTimeout(() => {
            closingBannerRef.current = false;
        }, 180);
    }, [
        clearBannerFocusSettleTimeout,
        showGeneratorSettingsModal,
        settingsOpenTimeoutRef,
        activeBannerTokenRef,
        dismissedBannerTokenRef,
        bannerAutoDismissTimeoutRef,
        closingBannerRef,
        showBannerRef,
        generatorSettingsOpeningRef,
        setIsBannerPinned,
        setShowBanner,
        setIsBannerReady,
        closeGeneratorSettings,
    ]);

    // ═══ Cross-cutting: autoHideBanner ══════════════════════════════════
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
    }, [
        activeBannerTokenRef,
        dismissedBannerTokenRef,
        bannerAutoDismissTimeoutRef,
        bannerAutoHiddenRef,
        showBannerRef,
        setShowBanner,
        setIsBannerPinned,
    ]);

    // ═══ Fingerprint-change effect ══════════════════════════════════════
    useEffect(() => {
        if (previousFingerprintRef.current !== fingerprint) {
            const hadPreviousFingerprint = previousFingerprintRef.current !== undefined;
            setShowBanner(false);
            setIsBannerReady(false);
            // storedPassphrase is cleared in the storage module's internal effect
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearBannerFocusSettleTimeout, commitPassphrase, fingerprint, setShowGeneratorSettingsModal, setIsBannerPinned, setIsBannerReady, setShowBanner, value]);

    // ═══ Event handlers ═════════════════════════════════════════════════
    const handleFocus = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bannerMode, loadStoredPassphrase, regeneratePassphrase, scheduleBannerAfterFocusScroll, setIsBannerPinned, generatedPassphrase]);

    const handleBlur = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearBannerFocusSettleTimeout, generatorSettingsOpeningRef, showGeneratorSettingsModal, bannerInteractionRef, setIsBannerPinned, setIsBannerReady]);

    const handleChangeText = (text: string) => {
        userEditedRef.current = true;
        commitPassphrase(text);
        if (
            bannerMode === 'stored'
            && isFocused
            && storedPassphrase
            && text !== storedPassphrase
        ) {
            dismissedBannerTokenRef.current = null;
            if (!isBannerReady) {
                setIsBannerReady(true);
            }
        }
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
        void secureCopy(generatedPassphrase);
    }, [generatedPassphrase, markBannerInteraction, secureCopy]);

    const handleInputWrapperRef = useCallback((node: View | null) => {
        inputAnchorRef.current = node;
    }, []);

    // ═══ Cross-cutting: openGeneratorSettings (bridges generator + banner) ══
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
    }, [markBannerInteraction, settingsOpenTimeoutRef, generatorSettingsOpeningRef, setIsBannerPinned, setShowGeneratorSettingsModal]);

    // ═══ Banner dismiss subscription ════════════════════════════════════
    useEffect(() => {
        return subscribePassphraseBannerDismiss(() => {
            if (showGeneratorSettingsModal) return;
            const passphraseInputStillFocused = inputRef.current?.isFocused?.() ?? false;
            dismissBanner(passphraseInputStillFocused);
        });
    }, [dismissBanner, inputRef, showGeneratorSettingsModal]);

    // ═══ Banner auto-dismiss timer ══════════════════════════════════════
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

    // ═══ Banner rendering effect (bridges banner + generator + autofill) ══
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
            mode: bannerMode as 'stored' | 'generate',
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
        bannerAutoHiddenRef,
    ]);

    // ═══ Cleanup on unmount ═════════════════════════════════════════════
    useEffect(() => () => {
        hidePassphraseBanner(latestBannerTokenRef.current);
        clearBannerFocusSettleTimeout();
        if (settingsOpenTimeoutRef.current) {
            clearTimeout(settingsOpenTimeoutRef.current);
        }
        if (bannerAutoDismissTimeoutRef.current) {
            clearTimeout(bannerAutoDismissTimeoutRef.current);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearBannerFocusSettleTimeout, hidePassphraseBanner, settingsOpenTimeoutRef, bannerAutoDismissTimeoutRef, latestBannerTokenRef]);

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
